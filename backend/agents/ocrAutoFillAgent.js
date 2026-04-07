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

const SYSTEM_PROMPT = `You are an expense classification assistant for VIP (VIOS INTEGRATED PROJECTS INC.), a Philippine pharmaceutical distribution company.

Given OCR-extracted text from an Official Receipt (OR) or gas receipt, identify:
1. supplier_name — the establishment/vendor name
2. expense_category — the correct expense category
3. coa_code — the Chart of Accounts code
4. amount — total amount (if extractable)
5. vat_amount — VAT amount (12% VAT, compute as amount × 12/112 if not visible)
6. or_number — OR/receipt number

Available COA codes:
${COA_TABLE}
6900 — Miscellaneous Expense (MISCELLANEOUS)

Respond ONLY with valid JSON. No explanation. Example:
{"supplier_name":"Shell Iloilo","expense_category":"FUEL","coa_code":"6200","amount":1500.00,"vat_amount":160.71,"or_number":"OR-12345","confidence":"HIGH"}

If you cannot determine a field, set it to null. Always include confidence: "HIGH" or "MEDIUM".`;

/**
 * Classify expense using Claude when regex parser has LOW confidence.
 *
 * @param {string} rawOcrText - Full OCR text from Vision API
 * @param {Object} extractedFields - Fields from regex parser (may be incomplete)
 * @returns {Object} Refined classification with higher confidence
 */
async function classifyWithClaude(rawOcrText, extractedFields = {}) {
  const existingInfo = Object.entries(extractedFields)
    .filter(([, v]) => v?.value != null)
    .map(([k, v]) => `${k}: ${v.value} (confidence: ${v.confidence || 'unknown'})`)
    .join('\n');

  const prompt = `OCR Text from receipt:
---
${(rawOcrText || '').slice(0, 3000)}
---

Regex parser extracted (some may be wrong or missing):
${existingInfo || '(nothing extracted)'}

Classify this expense. Return JSON only.`;

  try {
    const { text, usage, cost } = await askClaude({
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 300,
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
      supplier_name: parsed.supplier_name || null,
      expense_category: parsed.expense_category || 'MISCELLANEOUS',
      coa_code: parsed.coa_code || '6900',
      coa_name: parsed.expense_category || 'Miscellaneous Expense',
      amount: parsed.amount || null,
      vat_amount: parsed.vat_amount || null,
      or_number: parsed.or_number || null,
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
