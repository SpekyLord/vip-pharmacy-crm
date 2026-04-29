/**
 * PO Text Parser — Phase CSI-X2 (Apr 2026)
 *
 * Stage 1 of the paste-text → structured PO line items pipeline.
 *
 * Cheap regex parser. Tokenizes Messenger / email order text into
 * candidate { qty, raw_line } pairs, then fuzzy-matches each candidate
 * against an entity-scoped ProductMaster slice (brand_name +
 * dosage_strength + generic_name). Returns:
 *
 *   { matched:    [{ product_id, qty_ordered, confidence, raw_line, matched_label, source: 'regex' }],
 *     ambiguous:  [{ raw_line, candidates: [{product_id, label, score}] }],
 *     unmatched:  [{ raw_line, reason }],
 *     coverage:   <0..1> ratio of recognized lines to total candidate lines,
 *     low_confidence_count }
 *
 * The controller decides whether to escalate to the LLM fallback when
 * coverage / max-line confidence is below the configured threshold.
 *
 * Patterns recognized (case-insensitive, trim-tolerant):
 *   "1. Amoxicillin 500mg x 50 boxes"
 *   "Amoxicillin 500mg - 50 bxs"
 *   "2x Brand 500mg 30 tabs"
 *   "Cefuroxime 500mg, 100 caps"
 *   "- Biogesic 500mg / 100 pcs"
 *   "Biogesic 500mg qty 50"
 *
 * Conflict policy with the structured form (locked Apr 28 2026): the
 * structured form is the source of truth. Parser output never auto-posts;
 * it pre-fills the form for human confirmation. See plan
 * `~/.claude/plans/phase-csi-x2-po-text-parser.md`.
 */

// ─────────────────────────────────────────────────────────────────────────
// Tokenization
// ─────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'with', 'to', 'in', 'on',
  'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules',
  'box', 'boxes', 'bx', 'bxs', 'pcs', 'piece', 'pieces', 'pc', 'unit', 'units',
  'btl', 'bottle', 'bottles', 'amp', 'ampule', 'amps', 'vial', 'vials',
  'syrup', 'susp', 'suspension', 'inj', 'injection', 'sachet', 'sachets'
]);

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return normalize(s)
    .split(/\s+/)
    .filter(t => t && !STOPWORDS.has(t));
}

// ─────────────────────────────────────────────────────────────────────────
// Line splitting
// ─────────────────────────────────────────────────────────────────────────

// Strips list markers ("1.", "1)", "-", "*", "•") and leading/trailing whitespace.
function stripLeadMarker(line) {
  return line
    .replace(/^[\s]*[•*\-–—]\s+/, '')
    .replace(/^\s*\d+[\.\)]\s+/, '')
    .trim();
}

function splitLines(text) {
  if (!text) return [];
  return String(text)
    .split(/\r?\n/)
    .map(l => stripLeadMarker(l))
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────
// Quantity extraction
// ─────────────────────────────────────────────────────────────────────────

// Looks for the qty token in the line. Returns { qty, qty_match, qty_index }
// or null if no recognizable qty was found.
//
// Patterns tried in order:
//   "<text> x <qty> <unit>"          → "Amoxicillin 500mg x 50 boxes"
//   "<text> - <qty> <unit>"          → "Amoxicillin 500mg - 50 bxs"
//   "<text> , <qty> <unit>"          → "Cefuroxime 500mg, 100 caps"
//   "<text> / <qty> <unit>"          → "Biogesic 500mg / 100 pcs"
//   "<qty> x <text>"                 → "2x Brand 500mg 30 tabs" (qty=2, but
//                                       trailing 30 may also be qty — pick the
//                                       larger trailing number as a heuristic
//                                       since "2x Biogesic 500mg 30 tabs"
//                                       almost always means "30 tablets of
//                                       2x-strength Biogesic" or similar.
//                                       Fall back to LLM when ambiguous.)
//   "<text> qty <qty>"               → "Biogesic 500mg qty 50"
//   "<text> <qty> <unit>"            → "Cefuroxime 500mg 100 caps"
function extractQty(line) {
  const lc = line.toLowerCase();

  // 1. Trailing "qty N" / "quantity N"
  let m = lc.match(/\b(?:qty|quantity)\s*[:=]?\s*(\d{1,5})\b/);
  if (m) return { qty: Number(m[1]), qty_text: m[0], confidence: 0.95 };

  // 2. "<text> x N <unit>?"  — leading number before x means strength multiplier
  //    so we only treat trailing "x N" as qty.
  m = lc.match(/\bx\s*(\d{1,5})\s*(?:tabs?|tablets?|caps?|capsules?|boxes?|bx|bxs|pcs|pieces?|btls?|bottles?|amps?|vials?|sachets?|units?)?\s*$/);
  if (m) return { qty: Number(m[1]), qty_text: m[0], confidence: 0.9 };

  // 3. "<text> - N <unit>" (dash separator)
  m = lc.match(/[-–—]\s*(\d{1,5})\s*(tabs?|tablets?|caps?|capsules?|boxes?|bx|bxs|pcs|pieces?|btls?|bottles?|amps?|vials?|sachets?|units?)\b/);
  if (m) return { qty: Number(m[1]), qty_text: m[0], confidence: 0.9 };

  // 4. "<text>, N <unit>" or "<text> / N <unit>"
  m = lc.match(/[,\/]\s*(\d{1,5})\s*(tabs?|tablets?|caps?|capsules?|boxes?|bx|bxs|pcs|pieces?|btls?|bottles?|amps?|vials?|sachets?|units?)\b/);
  if (m) return { qty: Number(m[1]), qty_text: m[0], confidence: 0.85 };

  // 5. "<text> N <unit>"  (whitespace separator — broadest)
  m = lc.match(/\b(\d{1,5})\s*(tabs?|tablets?|caps?|capsules?|boxes?|bx|bxs|pcs|pieces?|btls?|bottles?|amps?|vials?|sachets?|units?)\b/);
  if (m) return { qty: Number(m[1]), qty_text: m[0], confidence: 0.75 };

  // 6. Bare trailing integer (last resort — high false-positive risk because
  //    "500mg" tail digits could be confused; but this regex is anchored to
  //    end of line so most strength patterns are excluded).
  m = lc.match(/\b(\d{1,5})\s*$/);
  if (m) return { qty: Number(m[1]), qty_text: m[0], confidence: 0.6 };

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Fuzzy product match
// ─────────────────────────────────────────────────────────────────────────

// Build a normalized search index over a product list. Each product gets:
//   tokens: Set of tokens from brand_name + dosage_strength + generic_name
//   strength_token: the dosage_strength token (e.g. "500mg") if present
function buildProductIndex(products) {
  return products.map(p => {
    const brand = String(p.brand_name || '').trim();
    const generic = String(p.generic_name || '').trim();
    const dosage = String(p.dosage_strength || '').trim();
    const label = `${brand} ${dosage}`.trim() || brand || generic;
    const tokenSet = new Set([...tokens(brand), ...tokens(generic), ...tokens(dosage)]);
    // Pull strength token: e.g. "500mg" / "5g" / "10mg/ml"
    const strengthMatch = dosage.toLowerCase().match(/(\d+(?:\.\d+)?\s*(?:mg|g|mcg|ml|iu|%))/);
    return {
      _id: p._id,
      label,
      brand: brand.toLowerCase(),
      generic: generic.toLowerCase(),
      dosage: dosage.toLowerCase(),
      tokens: tokenSet,
      strength_token: strengthMatch ? strengthMatch[1].replace(/\s+/g, '') : null
    };
  });
}

// Score one candidate line against a single product entry. Returns 0..1.
//
// Scoring weights:
//   brand exact substring match (case-ins.)         +0.55
//   generic exact substring match (case-ins.)       +0.25
//   strength token match (e.g. "500mg")             +0.20
//   token jaccard overlap                            +0..0.20 (proportional)
//
// Cap at 1.0.
function scoreLineAgainstProduct(lineTokens, lineLc, product) {
  let score = 0;
  if (product.brand && lineLc.includes(product.brand)) score += 0.55;
  if (product.generic && lineLc.includes(product.generic)) score += 0.25;
  if (product.strength_token) {
    // Strip whitespace so "500 mg" still matches "500mg"
    const lineCompact = lineLc.replace(/\s+/g, '');
    if (lineCompact.includes(product.strength_token)) score += 0.20;
  }
  if (product.tokens.size && lineTokens.length) {
    const inter = lineTokens.filter(t => product.tokens.has(t)).length;
    const union = new Set([...lineTokens, ...product.tokens]).size;
    if (union > 0) score += 0.20 * (inter / union);
  }
  return Math.min(1.0, score);
}

// Score one line against all products. Returns top matches (≥ MIN_KEEP)
// sorted descending by score.
function rankProducts(line, productIndex, opts = {}) {
  const minKeep = opts.minKeep != null ? opts.minKeep : 0.25;
  const lineLc = line.toLowerCase();
  const lineTokens = tokens(line);
  const ranked = productIndex
    .map(p => ({ product_id: p._id, label: p.label, score: scoreLineAgainstProduct(lineTokens, lineLc, p) }))
    .filter(r => r.score >= minKeep)
    .sort((a, b) => b.score - a.score);
  return ranked;
}

// ─────────────────────────────────────────────────────────────────────────
// Public API — parse a pasted body against a product slice
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse a pasted Messenger / email body into structured candidate lines.
 *
 * @param {string} text  Raw paste body
 * @param {Array}  products  ProductMaster slice for this entity. Each item:
 *                           { _id, brand_name, generic_name, dosage_strength }
 * @param {Object} opts
 * @param {number} [opts.matchThreshold=0.65]   Min product score to count as
 *                                              "matched" (auto-fills the line).
 * @param {number} [opts.ambiguousThreshold=0.4] Min score to count as
 *                                              "ambiguous" (Needs review).
 * @returns {{ matched: Array, ambiguous: Array, unmatched: Array,
 *             coverage: number, low_confidence_count: number,
 *             total_lines: number, used_llm: false }}
 */
function parsePoTextRegex(text, products = [], opts = {}) {
  const matchThreshold = opts.matchThreshold != null ? opts.matchThreshold : 0.65;
  const ambiguousThreshold = opts.ambiguousThreshold != null ? opts.ambiguousThreshold : 0.4;

  const lines = splitLines(text);
  const productIndex = buildProductIndex(Array.isArray(products) ? products : []);

  const matched = [];
  const ambiguous = [];
  const unmatched = [];

  for (const raw_line of lines) {
    const qtyInfo = extractQty(raw_line);
    if (!qtyInfo || qtyInfo.qty <= 0) {
      // No qty — likely a header / greeting / signature line. Skip silently
      // (do NOT count toward unmatched; those should be drug lines that
      // simply did not match a product).
      continue;
    }

    const ranked = rankProducts(raw_line, productIndex);
    const top = ranked[0];

    if (top && top.score >= matchThreshold) {
      // Combined confidence: product score weighted with qty confidence
      const combined = Math.min(1.0, 0.7 * top.score + 0.3 * qtyInfo.confidence);
      matched.push({
        product_id: top.product_id,
        qty_ordered: qtyInfo.qty,
        confidence: Number(combined.toFixed(3)),
        raw_line,
        matched_label: top.label,
        source: 'regex'
      });
    } else if (top && top.score >= ambiguousThreshold) {
      ambiguous.push({
        raw_line,
        qty_ordered: qtyInfo.qty,
        candidates: ranked.slice(0, 5).map(r => ({
          product_id: r.product_id,
          label: r.label,
          score: Number(r.score.toFixed(3))
        }))
      });
    } else {
      unmatched.push({
        raw_line,
        qty_ordered: qtyInfo.qty,
        reason: top ? `best match score ${top.score.toFixed(2)} below threshold` : 'no product candidates'
      });
    }
  }

  const totalCandidates = matched.length + ambiguous.length + unmatched.length;
  const coverage = totalCandidates ? matched.length / totalCandidates : 0;
  const lowConfidenceCount = matched.filter(m => m.confidence < 0.75).length;

  return {
    matched,
    ambiguous,
    unmatched,
    coverage: Number(coverage.toFixed(3)),
    low_confidence_count: lowConfidenceCount,
    total_lines: totalCandidates,
    used_llm: false
  };
}

module.exports = {
  parsePoTextRegex,
  // Exported for unit tests + LLM parser reuse
  splitLines,
  extractQty,
  buildProductIndex,
  rankProducts
};
