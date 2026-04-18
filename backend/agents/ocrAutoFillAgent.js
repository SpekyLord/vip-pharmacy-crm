/**
 * OCR Auto-Fill Agent (#2) — Claude API fallback for low-confidence OR parsing
 *
 * Triggered on-demand (not cron) when expenseClassifier returns LOW confidence.
 * Sends raw OCR text + extracted fields to Claude → gets refined classification.
 *
 * Integration point: ocrProcessor.js Layer 2, after classifyExpense() returns LOW.
 *
 * Usage:
 *   const { classifyWithClaude } = require('./ocrAutoFillAgent');
 *   const result = await classifyWithClaude(rawOcrText, extractedFields);
 */
const { askClaude } = require('./claudeClient');
const { KEYWORD_RULES } = require('../erp/services/expenseClassifier');

// Build COA reference table for the prompt
const COA_TABLE = KEYWORD_RULES.map(r => `${r.coa_code} — ${r.coa_name} (${r.category})`).join('\n');

const SYSTEM_PROMPT = `You are an expense extraction & classification assistant for VIP (VIOS INTEGRATED PROJECTS INC.), a Philippine pharmaceutical distribution company.

Given OCR-extracted text from an Official Receipt (OR) or gas station receipt, identify any of these fields you can read:
  supplier_name        — establishment / vendor name
  expense_category     — correct expense category
  coa_code             — Chart of Accounts code
  amount               — grand total (₱)
  total_amount         — same as amount (gas receipts often label it differently)
  vat_amount           — VAT (12% VAT in PH; compute as amount × 12/112 if not visible)
  or_number            — OR / Series / Invoice number
  date                 — receipt date (any format, prefer YYYY-MM-DD)
  station_name         — gas station name (GAS_RECEIPT only)
  liters               — fuel quantity in liters (GAS_RECEIPT only)
  price_per_liter      — ₱/L (GAS_RECEIPT only)
  fuel_type            — UNLEADED | DIESEL | PREMIUM | XCS | V-POWER (GAS_RECEIPT only)

Reading hints:
- Phone OCR sometimes splits long numbers across lines — recombine carefully.
- Some receipts use a dash as the decimal separator: "2143-23" means 2143.23.
- Common couriers/stations in PH: AP Cargo, JRS, LBC, J&T, Shell, Petron, Caltexn, Phoenix, Seaoil.

Available COA codes:
${COA_TABLE}
6900 — Miscellaneous Expense (MISCELLANEOUS)

Respond ONLY with valid JSON. No explanation. Example:
{"supplier_name":"Shell Iloilo","expense_category":"FUEL","coa_code":"6200","amount":1500.00,"vat_amount":160.71,"or_number":"OR-12345","date":"2026-03-15","station_name":"Shell Iloilo","liters":18.5,"price_per_liter":81.08,"fuel_type":"UNLEADED","confidence":"HIGH"}

If you cannot determine a field, omit it or set it to null. Always include confidence: "HIGH" or "MEDIUM".`;

/**
 * Classify expense (and/or fill missing fields) using Claude.
 *
 * Phase H4: also handles field completion when regex extracted values are missing
 * or LOW confidence even if classification was HIGH.
 *
 * @param {string} rawOcrText - Full OCR text from Vision API
 * @param {Object} extractedFields - Fields from regex parser (may be incomplete)
 * @param {Object} [context] - { doc_type, missing_fields, mode }
 *   - doc_type: 'OR' | 'GAS_RECEIPT' (informs prompt)
 *   - missing_fields: string[] of field names the regex couldn't extract reliably
 *   - mode: 'CLASSIFY' (default — full classification) | 'FIELD_COMPLETION' (focus on missing fields)
 * @returns {Object} Refined classification + filled fields with confidence
 */
async function classifyWithClaude(rawOcrText, extractedFields = {}, context = {}) {
  const existingInfo = Object.entries(extractedFields)
    .filter(([, v]) => v?.value != null)
    .map(([k, v]) => `${k}: ${v.value} (confidence: ${v.confidence || 'unknown'})`)
    .join('\n');

  const docType = context.doc_type || 'OR';
  const missing = Array.isArray(context.missing_fields) ? context.missing_fields : [];
  const mode = context.mode || 'CLASSIFY';

  const focusBlock = missing.length > 0
    ? `\nFOCUS — these fields are missing or low confidence; please extract them carefully:\n${missing.map(f => `  - ${f}`).join('\n')}\n`
    : '';

  const modeNote = mode === 'FIELD_COMPLETION'
    ? '\nThe vendor/category is already known with HIGH confidence. Your priority is filling in the missing fields above. Use the OCR text to read them carefully — numbers may be split across lines or use dashes as decimal separators (e.g., "2143-23" = 2143.23).'
    : '';

  const prompt = `Document type: ${docType}
OCR Text from receipt:
---
${(rawOcrText || '').slice(0, 3000)}
---

Regex parser extracted (some may be wrong or missing):
${existingInfo || '(nothing extracted)'}
${focusBlock}${modeNote}

Return JSON only.`;

  try {
    const { text, usage, cost } = await askClaude({
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 400,
      agent: 'ocr_auto_fill'
    });

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[OcrAutoFill] Claude response not JSON:', text.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      // Classification fields (OR/GAS_RECEIPT)
      supplier_name: parsed.supplier_name || parsed.station_name || null,
      expense_category: parsed.expense_category || 'MISCELLANEOUS',
      coa_code: parsed.coa_code || '6900',
      coa_name: parsed.expense_category || 'Miscellaneous Expense',
      // Field-completion fields — surfaced so ocrProcessor can fill missing ones
      amount: parsed.amount ?? null,
      total_amount: parsed.total_amount ?? parsed.amount ?? null,
      vat_amount: parsed.vat_amount ?? null,
      or_number: parsed.or_number ?? null,
      date: parsed.date ?? null,
      // GAS_RECEIPT specifics
      station_name: parsed.station_name ?? parsed.supplier_name ?? null,
      liters: parsed.liters ?? null,
      price_per_liter: parsed.price_per_liter ?? null,
      fuel_type: parsed.fuel_type ?? null,
      // Result quality
      confidence: parsed.confidence || 'MEDIUM',
      match_method: 'CLAUDE_AI',
      ai_usage: usage,
      ai_cost: cost
    };
  } catch (err) {
    console.error('[OcrAutoFill] Claude classification failed:', err.message);
    return null;
  }
}

// On-demand agent — no scheduled run(), but expose for scheduler compatibility
async function run() {
  console.log('[OcrAutoFill] This agent runs on-demand, not on schedule. Use classifyWithClaude() directly.');
}

module.exports = { run, classifyWithClaude };
