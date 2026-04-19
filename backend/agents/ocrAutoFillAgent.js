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
const { enforceSpendCap } = require('../erp/services/spendCapService');

// Build COA reference table for the prompt
const COA_TABLE = KEYWORD_RULES.map(r => `${r.coa_code} — ${r.coa_name} (${r.category})`).join('\n');

const EXPENSE_SYSTEM_PROMPT = `You are an expense extraction & classification assistant for VIP (VIOS INTEGRATED PROJECTS INC.), a Philippine pharmaceutical distribution company.

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

// Phase H6 — Sales OCR. Parallel prompt for sales-side documents. VIP and its
// subsidiaries issue these; there is no vendor and no COA — the relevant party
// is the customer (hospital / medical center). Fields are per-doc-type but one
// prompt covers all five because Claude can pick which ones are visible.
const SALES_SYSTEM_PROMPT = `You are a sales-document extraction assistant for VIP (VIOS INTEGRATED PROJECTS INC.) and its subsidiaries (MG AND CO., etc.), Philippine pharmaceutical distribution companies.

You will receive OCR-extracted text from ONE of these document types (the caller tells you which):
  CSI  — Charge Sales Invoice (we sell to a hospital; customer gets 30/90-day terms)
  CR   — Collection Receipt (we receive payment for previously-issued CSIs)
  DR   — Delivery Receipt (we deliver product; Terms box marks CONSIGNMENT vs SAMPLING)
  BANK_SLIP — Bank deposit slip (we deposited cash/check to our bank)
  CHECK — Received check (customer payment we're about to deposit)

Extract any of these fields you can read (omit or null any you can't):

CSI fields:
  csi_no          — invoice number (often stamped in red, e.g. "004736", "008125")
  csi_date        — invoice date
  hospital_name   — customer (text after "Charged To:" / "Charge To:")
  hospital_address
  terms           — e.g. "30 days", "90 days"
  total_amount    — Total Amount Due (VAT inclusive)
  vat_amount      — Less VAT
  net_of_vat      — Amount Net of VAT
  line_items      — array of { qty, unit, product_name, batch_no, expiry_date, unit_price, amount }

CR fields:
  cr_no           — receipt number
  cr_date         — receipt date
  hospital_name   — customer (text after "Received From:")
  cr_amount       — numeric total (words or digits — convert words to number if needed)
  payment_mode    — CASH | CHECK | GCASH | BANK_TRANSFER
  check_no        — if payment is check
  bank            — abbreviation OK: SB, RCBC, BPI, BDO, LBP, PNB, etc.
  check_date
  settled_csis    — array of { csi_no, amount } from the "In Settlement of the Following" box

DR fields:
  dr_ref          — DR number
  dr_date         — delivery date
  hospital_name   — customer (text after "Delivered To:")
  terms           — text in the Terms field; look for SAMPLING / SAMPLE / FREE SAMPLE / CONSIGNMENT / CONSIGN
  dispatch_type   — CONSIGNMENT (default) | SAMPLING (if terms field contains sample/sampling keywords)
  total_amount
  line_items      — array of { qty, unit, product_name, batch_no, expiry_date, unit_price, amount }

BANK_SLIP fields:
  bank_name       — BPI, BDO, LandBank, Metrobank, RCBC, etc.
  account_number
  account_holder  — usually VIP Inc. or MG AND CO.
  deposit_date
  amount          — deposit amount

CHECK fields:
  check_no        — top-right, usually 8-10 digits
  bank            — from the issuing bank letterhead
  check_date      — MM DD YYYY boxes
  payee           — "PAY TO THE ORDER OF" line (this should be VIP Inc. or MG AND CO.)
  payer           — account holder name (top-left)
  amount          — numeric amount; if both numeric and words are present, use numeric

Reading hints (Philippine context):
- Date format is almost always MMM DD, YYYY or DD/MM/YYYY — NOT US MM/DD/YYYY. "03-06-2026" = March 6, 2026.
- Expiry date formats on product lines: MM/YY, MM/YYYY, DD/MM/YYYY, MM-YYYY. Common: "11/2027", "09/20/28".
- Batch/Lot labels are synonyms: "Batch #", "Batch No.", "Batch no:", "LOT#", "LOT #".
- Letterhead TIN identifies the selling entity: 744-251-498-00000 = VIP Inc., 010-824-240-00000 = MG AND CO.
- Phone OCR may split long numbers across lines — recombine carefully.
- Some receipts use a dash as the decimal separator: "2143-23" means 2143.23.
- Amounts may have peso symbols ("₱", "P", "P-") before the number; strip those.
- CR "Form of Payment" uses [ ] CASH [ ] CHECK checkboxes — the filled one indicates payment_mode.
- Product format in line items: "BrandName (GenericName) strength/unit" — preserve this full string.

Respond ONLY with valid JSON. No explanation. Include confidence: "HIGH" or "MEDIUM".`;

// Phase H6 — dispatch to the correct system prompt by doc type.
const EXPENSE_DOC_TYPES_SET = new Set(['OR', 'GAS_RECEIPT']);
function getSystemPrompt(docType) {
  return EXPENSE_DOC_TYPES_SET.has(docType) ? EXPENSE_SYSTEM_PROMPT : SALES_SYSTEM_PROMPT;
}

/**
 * Classify expense (and/or fill missing fields) using Claude.
 *
 * Phase H4: also handles field completion when regex extracted values are missing
 * or LOW confidence even if classification was HIGH.
 *
 * @param {string} rawOcrText - Full OCR text from Vision API
 * @param {Object} extractedFields - Fields from regex parser (may be incomplete)
 * @param {Object} [context] - { doc_type, missing_fields, mode, entityId }
 *   - doc_type: 'OR' | 'GAS_RECEIPT' (informs prompt)
 *   - missing_fields: string[] of field names the regex couldn't extract reliably
 *   - mode: 'CLASSIFY' (default — full classification) | 'FIELD_COMPLETION' (focus on missing fields)
 *   - entityId: ObjectId — Phase H6: required for AI_SPEND_CAPS enforcement
 * @returns {Object} Refined classification + filled fields with confidence
 * @throws  {Error}  status=429 when monthly AI spend cap is exceeded for this entity
 */
async function classifyWithClaude(rawOcrText, extractedFields = {}, context = {}) {
  // Phase H6 (P1-1): gate Claude call against the per-entity AI_SPEND_CAPS lookup.
  // Throws a 429 when the global or OCR-feature cap is reached so the caller can
  // record the skip and continue with the rule-based result. When entityId is
  // absent (OCR test endpoint, unattached contexts) this is a no-op.
  if (context.entityId) {
    await enforceSpendCap(context.entityId, 'OCR');
  }
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
      system: getSystemPrompt(docType),
      prompt,
      // Phase H6 — sales docs with line items can be long (CSI/DR); bump limit
      // so Claude doesn't truncate the array. Expense docs stay well under 400.
      maxTokens: EXPENSE_DOC_TYPES_SET.has(docType) ? 400 : 1200,
      agent: 'ocr_auto_fill'
    });

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[OcrAutoFill] Claude response not JSON:', text.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const base = {
      confidence: parsed.confidence || 'MEDIUM',
      match_method: 'CLAUDE_AI',
      ai_usage: usage,
      ai_cost: cost,
    };

    // Phase H6 — per-doc-type return shape. Only surface fields that belong to
    // this doc type so ocrProcessor.listMissingCriticalFields matches cleanly
    // and we never accidentally inject supplier_name/coa_code onto a CSI.
    if (EXPENSE_DOC_TYPES_SET.has(docType)) {
      return {
        ...base,
        // Classification fields (OR/GAS_RECEIPT)
        supplier_name: parsed.supplier_name || parsed.station_name || null,
        expense_category: parsed.expense_category || 'MISCELLANEOUS',
        coa_code: parsed.coa_code || '6900',
        coa_name: parsed.expense_category || 'Miscellaneous Expense',
        amount: parsed.amount ?? null,
        total_amount: parsed.total_amount ?? parsed.amount ?? null,
        vat_amount: parsed.vat_amount ?? null,
        or_number: parsed.or_number ?? null,
        date: parsed.date ?? null,
        station_name: parsed.station_name ?? parsed.supplier_name ?? null,
        liters: parsed.liters ?? null,
        price_per_liter: parsed.price_per_liter ?? null,
        fuel_type: parsed.fuel_type ?? null,
      };
    }

    if (docType === 'CSI') {
      return {
        ...base,
        csi_no: parsed.csi_no ?? null,
        csi_date: parsed.csi_date ?? null,
        hospital_name: parsed.hospital_name ?? null,
        hospital_address: parsed.hospital_address ?? null,
        terms: parsed.terms ?? null,
        total_amount: parsed.total_amount ?? parsed.amount ?? null,
        vat_amount: parsed.vat_amount ?? null,
        net_of_vat: parsed.net_of_vat ?? null,
        line_items: Array.isArray(parsed.line_items) ? parsed.line_items : null,
      };
    }

    if (docType === 'CR') {
      return {
        ...base,
        cr_no: parsed.cr_no ?? null,
        cr_date: parsed.cr_date ?? null,
        hospital_name: parsed.hospital_name ?? null,
        cr_amount: parsed.cr_amount ?? parsed.amount ?? null,
        payment_mode: parsed.payment_mode ?? null,
        check_no: parsed.check_no ?? null,
        bank: parsed.bank ?? null,
        check_date: parsed.check_date ?? null,
        settled_csis: Array.isArray(parsed.settled_csis) ? parsed.settled_csis : null,
      };
    }

    if (docType === 'DR') {
      // Normalise dispatch_type — the router defaults to CONSIGNMENT when
      // Claude can't tell. Anything other than an explicit SAMPLING keyword
      // stays as CONSIGNMENT.
      const rawDispatch = String(parsed.dispatch_type || '').toUpperCase();
      const dispatchType = rawDispatch === 'SAMPLING' ? 'SAMPLING' : 'CONSIGNMENT';
      return {
        ...base,
        dr_ref: parsed.dr_ref ?? null,
        dr_date: parsed.dr_date ?? null,
        hospital_name: parsed.hospital_name ?? null,
        terms: parsed.terms ?? null,
        dispatch_type: dispatchType,
        total_amount: parsed.total_amount ?? parsed.amount ?? null,
        line_items: Array.isArray(parsed.line_items) ? parsed.line_items : null,
      };
    }

    if (docType === 'BANK_SLIP') {
      return {
        ...base,
        bank_name: parsed.bank_name ?? null,
        account_number: parsed.account_number ?? null,
        account_holder: parsed.account_holder ?? null,
        deposit_date: parsed.deposit_date ?? null,
        amount: parsed.amount ?? null,
      };
    }

    if (docType === 'CHECK') {
      return {
        ...base,
        check_no: parsed.check_no ?? null,
        bank: parsed.bank ?? null,
        check_date: parsed.check_date ?? null,
        payee: parsed.payee ?? null,
        payer: parsed.payer ?? null,
        amount: parsed.amount ?? null,
      };
    }

    // Unknown doc type — return the raw parsed object + base metadata so the
    // caller doesn't crash. Processor will ignore fields not in CRITICAL_FIELDS_BY_DOC.
    return { ...base, ...parsed };
  } catch (err) {
    // Phase H6 (P1-1 fix): re-throw the 429 from enforceSpendCap so ocrProcessor's
    // handler can record ai_skipped_reason: 'SPEND_CAP_EXCEEDED'. Swallowing it
    // here would silence the budget gate — parser result returns but without the
    // flag, so the UI never knows the Claude call was blocked by budget.
    if (err && err.status === 429 && err.reason === 'SPEND_CAP_EXCEEDED') {
      throw err;
    }
    console.error('[OcrAutoFill] Claude classification failed:', err.message);
    return null;
  }
}

// On-demand agent — no scheduled run(), but expose for scheduler compatibility
async function run() {
  console.log('[OcrAutoFill] This agent runs on-demand, not on schedule. Use classifyWithClaude() directly.');
}

module.exports = { run, classifyWithClaude };
