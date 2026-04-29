/**
 * PO LLM Parser — Phase CSI-X2 (Apr 2026)
 *
 * Stage 2 of the paste-text → structured PO line items pipeline.
 *
 * Triggered by the controller when the regex parser's coverage or
 * confidence falls below the PO_TEXT_PARSER lookup-driven threshold.
 *
 * Design — prompt caching strategy
 * ─────────────────────────────────
 * Render order is `tools` → `system` → `messages`. The product list is the
 * bulk of input tokens AND it is reused unchanged for every parse the same
 * BDM/entity does inside a 1-hour window. So we put it FIRST in the system
 * array with a `cache_control` breakpoint on it. The volatile parts (raw
 * paste body, the regex-tier residuals to reparse) go in the user message
 * AFTER the cached prefix.
 *
 * Cache key contract:
 *   1. Products are sorted by _id ascending and serialized line-by-line so
 *      the byte stream is identical across calls with the same product slice.
 *   2. Instruction block is a frozen string constant — no timestamps, no
 *      per-request IDs. (Per `shared/prompt-caching.md` silent invalidator
 *      audit.)
 *   3. The model is fixed at `claude-haiku-4-5-20251001`. Switching models
 *      mid-flow would invalidate the cache.
 *
 * Output schema — strict tool call
 * ─────────────────────────────────
 * We force the model to call `submit_parsed_lines` with `strict: true` so
 * the response shape is guaranteed valid JSON. The tool is NOT executed
 * server-side — we just read its `input` field. This pattern is more
 * portable across SDK versions than `output_config.format`.
 *
 * Cost model
 * ──────────
 * Haiku 4.5: $0.80/MTok input, $4/MTok output. With ~500 products
 * (~25K tokens) cached + a 200-token paste + 300-token tool-call response:
 *   Cache write (first call):   25 200 × 1.25 / 1M × $0.80 = $0.025
 *                              + 300 × $4/1M = $0.0012  → ≈ ₱1.50 first call
 *   Cache read (subsequent):    25 000 × 0.10 / 1M × $0.80 = $0.002
 *                              + 200 × $0.80/1M + 300 × $4/M ≈ $0.0033 → ≈ ₱0.20
 * Sub-2s latency on Haiku 4.5 with cache hits.
 *
 * @module poLlmParser
 */

const Anthropic = require('@anthropic-ai/sdk');

// Lazily instantiated singleton — same pattern as backend/agents/claudeClient.js.
let _client = null;
function getAnthropicClient() {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// ─────────────────────────────────────────────────────────────────────────
// System prompt — frozen instruction block (must not change per-request)
// ─────────────────────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `You are a pharmaceutical purchase-order text parser for VIP Pharmacy's hospital sales workflow.

Your job: read a raw, free-form order text (typed by a hospital procurement officer in Messenger or email) and extract structured line items. For each line item, you must pick the best matching product from the catalog provided below.

Hard rules:
1. Only return line items where you can identify a product from the catalog. If a line names a product not in the catalog, mark it ambiguous with confidence 0 and do NOT guess from outside the catalog.
2. Quantity must be a positive integer. If you cannot extract a clear quantity, mark the line ambiguous.
3. Confidence is a 0..1 score. Use these calibration anchors:
   - 0.95+: product brand + dosage match exactly, qty is unambiguous (e.g. "Amoxicillin 500mg x 50 boxes")
   - 0.80–0.94: product matches but with minor abbreviation or typo (e.g. "amox 500 - 50 bx")
   - 0.60–0.79: brand matches but dosage is implicit or qty unit is unclear
   - <0.60: ambiguous; surface to human review
4. Quantity is by the unit the customer writes (boxes, packs, tablets, etc.) — do NOT convert. The pharmacist confirms unit interpretation manually.
5. Output language is English; preserve the original raw line so a reviewer can compare.
6. NEVER fabricate products. If unsure, prefer to leave a line out rather than match the wrong product — false matches are more costly than missed matches in this workflow.
7. Skip non-order lines (greetings, signatures, "thank you", phone numbers, addresses).

Hospital procurement orders typically follow one of these shapes:
   "1. Amoxicillin 500mg x 50 boxes"
   "Biogesic 500mg - 100 tabs"
   "Cefuroxime 500mg, 30 caps"
   "qty 50 of Brand 250mg"
   "2x Brand 500mg 30 tabs"

Always call the submit_parsed_lines tool exactly once with your best parse. Never reply with prose.`;

// ─────────────────────────────────────────────────────────────────────────
// Output tool — strict schema, forced via tool_choice
// ─────────────────────────────────────────────────────────────────────────
const OUTPUT_TOOL = {
  name: 'submit_parsed_lines',
  description: 'Submit the parsed hospital purchase order line items.',
  input_schema: {
    type: 'object',
    properties: {
      matched: {
        type: 'array',
        description: 'Line items confidently matched to a catalog product.',
        items: {
          type: 'object',
          properties: {
            product_id: {
              type: 'string',
              description: 'The _id of the matched product from the catalog provided in the system prompt. Must match exactly.'
            },
            qty_ordered: {
              type: 'integer',
              description: 'Quantity ordered, positive integer.',
              minimum: 1
            },
            confidence: {
              type: 'number',
              description: 'Confidence in this match, 0..1. See calibration anchors in system prompt.',
              minimum: 0,
              maximum: 1
            },
            raw_line: {
              type: 'string',
              description: 'The original line from the input text, verbatim.'
            },
            notes: {
              type: 'string',
              description: 'Optional reviewer note: abbreviations resolved, ambiguity flagged, etc.'
            }
          },
          required: ['product_id', 'qty_ordered', 'confidence', 'raw_line']
        }
      },
      ambiguous: {
        type: 'array',
        description: 'Line items that look like orders but could not be matched confidently.',
        items: {
          type: 'object',
          properties: {
            raw_line: { type: 'string' },
            qty_ordered: { type: 'integer', minimum: 0 },
            reason: {
              type: 'string',
              description: 'Why this line is ambiguous (multiple matches, unclear product, etc.)'
            }
          },
          required: ['raw_line', 'reason']
        }
      }
    },
    required: ['matched', 'ambiguous']
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Build the cached system block — products sorted by _id for byte stability
// ─────────────────────────────────────────────────────────────────────────
function buildSystemBlocks(products) {
  // Deterministic sort: _id ascending
  const sorted = [...products].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const lines = sorted.map(p => {
    const brand = String(p.brand_name || '').trim();
    const generic = String(p.generic_name || '').trim();
    const dosage = String(p.dosage_strength || '').trim();
    // Compact line: id | brand | dosage | (generic)
    const genericPart = generic && generic.toLowerCase() !== brand.toLowerCase() ? ` | ${generic}` : '';
    return `${p._id} | ${brand} ${dosage}${genericPart}`.trim();
  });
  const catalog = `PRODUCT CATALOG (${sorted.length} items, format: <product_id> | <brand_name> <dosage_strength> | <generic_name>):\n${lines.join('\n')}`;

  // Two blocks. Instructions first (small, stable). Catalog second (large,
  // stable, the actual cache target). Cache breakpoint goes on the LAST
  // block so it spans both — per `shared/prompt-caching.md` "Large system
  // prompt shared across many requests" pattern.
  return [
    { type: 'text', text: SYSTEM_INSTRUCTION },
    {
      type: 'text',
      text: catalog,
      cache_control: { type: 'ephemeral', ttl: '1h' }
    }
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// Public — parse pasted text via Claude Haiku 4.5
// ─────────────────────────────────────────────────────────────────────────

/**
 * Run the LLM parser on a paste body + product slice.
 *
 * @param {Object} args
 * @param {string} args.text                Raw paste body to parse.
 * @param {Array}  args.products            Product slice for this entity.
 * @param {Array}  [args.regex_residual]    Optional list of {raw_line, reason}
 *                                          objects from the regex pass that
 *                                          could not be auto-matched. Helps
 *                                          the model focus.
 * @param {string} [args.model]             Override default model.
 * @param {number} [args.max_tokens=2048]   Tool-call response cap.
 * @returns {Promise<{ matched: Array, ambiguous: Array, used_llm: true,
 *                     usage: { input, output, cache_read, cache_write },
 *                     model: string, latency_ms: number }>}
 */
async function parsePoTextLlm({ text, products = [], regex_residual = [], model = DEFAULT_MODEL, max_tokens = 2048 }) {
  if (!text || typeof text !== 'string') throw new Error('parsePoTextLlm: text is required');

  const client = getAnthropicClient();
  const productIdSet = new Set(products.map(p => String(p._id)));

  // User content — volatile pieces, AFTER the cached prefix
  const userParts = [`PASTE TEXT TO PARSE:\n${text}`];
  if (regex_residual && regex_residual.length) {
    const residualLines = regex_residual.map(r => `- ${r.raw_line}${r.reason ? `  (${r.reason})` : ''}`).join('\n');
    userParts.push(`\nThe regex pre-pass already handled the obvious lines. Pay particular attention to these residuals it could not match confidently:\n${residualLines}`);
  }
  const userContent = userParts.join('\n');

  const t0 = Date.now();
  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens,
      system: buildSystemBlocks(products),
      messages: [{ role: 'user', content: userContent }],
      tools: [OUTPUT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_parsed_lines' }
    });
  } catch (err) {
    // Surface auth/rate-limit cleanly; controller will fall back to regex-only
    const wrapped = new Error(`LLM parser failed: ${err.message || err}`);
    wrapped.cause = err;
    wrapped.status = err.status || err.response?.status;
    throw wrapped;
  }
  const latencyMs = Date.now() - t0;

  // Find the tool_use block — guaranteed by tool_choice
  const toolBlock = (response.content || []).find(b => b.type === 'tool_use' && b.name === 'submit_parsed_lines');
  if (!toolBlock) {
    throw new Error('LLM parser: model did not call submit_parsed_lines tool');
  }
  const parsed = toolBlock.input || {};

  // Defensive validation — drop matched lines pointing at unknown product_ids
  const matched = Array.isArray(parsed.matched) ? parsed.matched : [];
  const ambiguous = Array.isArray(parsed.ambiguous) ? parsed.ambiguous : [];

  const cleanMatched = matched
    .filter(m => m && m.product_id && productIdSet.has(String(m.product_id)))
    .map(m => ({
      product_id: String(m.product_id),
      qty_ordered: Math.max(1, Math.floor(Number(m.qty_ordered) || 0)),
      confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0)),
      raw_line: String(m.raw_line || ''),
      notes: m.notes ? String(m.notes) : undefined,
      source: 'llm'
    }))
    .filter(m => m.qty_ordered > 0);

  // Anything the model returned with a product_id NOT in the catalog gets
  // re-classified as ambiguous (defensive — per system rule #6 the model
  // should not have done this, but if it did, surface it for review).
  const hallucinated = matched
    .filter(m => m && m.product_id && !productIdSet.has(String(m.product_id)))
    .map(m => ({
      raw_line: String(m.raw_line || ''),
      qty_ordered: Math.max(0, Math.floor(Number(m.qty_ordered) || 0)),
      reason: 'LLM returned a product_id not in the catalog'
    }));

  const cleanAmbiguous = [
    ...ambiguous
      .filter(a => a && a.raw_line)
      .map(a => ({
        raw_line: String(a.raw_line),
        qty_ordered: Math.max(0, Math.floor(Number(a.qty_ordered) || 0)),
        reason: String(a.reason || 'unspecified')
      })),
    ...hallucinated
  ];

  const usage = response.usage || {};
  return {
    matched: cleanMatched,
    ambiguous: cleanAmbiguous,
    used_llm: true,
    usage: {
      input: usage.input_tokens || 0,
      output: usage.output_tokens || 0,
      cache_read: usage.cache_read_input_tokens || 0,
      cache_write: usage.cache_creation_input_tokens || 0
    },
    model,
    latency_ms: latencyMs,
    stop_reason: response.stop_reason
  };
}

module.exports = {
  parsePoTextLlm,
  // Exported for tests + healthcheck
  SYSTEM_INSTRUCTION,
  OUTPUT_TOOL,
  buildSystemBlocks,
  DEFAULT_MODEL
};
