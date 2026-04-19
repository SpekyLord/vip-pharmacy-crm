/**
 * Unified OCR Processor
 *
 * Routes raw Vision API output to the correct document parser
 * based on docType, then returns a normalised response.
 */

const { parseCSI } = require('./parsers/csiParser');
const { parseCR } = require('./parsers/crParser');
const { parseCWT } = require('./parsers/cwtParser');
const { parseGasReceipt } = require('./parsers/gasReceiptParser');
const { parseOdometer } = require('./parsers/odometerParser');
const { parseOR } = require('./parsers/orParser');
const { parseUndertaking } = require('./parsers/undertakingParser');
const { parseDR } = require('./parsers/drParser');
// Phase H6 — Sales OCR new parsers
const { parseBankSlip } = require('./parsers/bankSlipParser');
const { parseCheck } = require('./parsers/checkParser');
const { classifyExpense } = require('../services/expenseClassifier');
const { resolveCustomer, resolveProduct, resolveVendor } = require('../services/productResolver');
const { learnFromAiResult } = require('../services/vendorAutoLearner');

// Document types that should get expense classification (Layer 2a — COA mapping)
// Sales docs (CSI/CR/DR/BANK_SLIP/CHECK) are deliberately excluded — they do
// not map to COA. They still benefit from Claude field-completion (below).
const EXPENSE_DOC_TYPES = new Set(['OR', 'GAS_RECEIPT']);

// Phase H4 + H6 — critical fields per doc type for the AI field-completion
// trigger. If any of these are null OR LOW confidence, Claude is asked to
// fill the gap. Phase H6 extends this to sales doc types so handwritten
// CSI/CR/DR scans benefit from the same smart-OCR fallback that expense
// docs do.
const CRITICAL_FIELDS_BY_DOC = {
  OR: ['amount', 'date', 'or_number', 'supplier_name'],
  GAS_RECEIPT: ['total_amount', 'date', 'station_name', 'liters'],
  // Phase H6 — sales docs
  CSI: ['csi_no', 'csi_date', 'hospital_name', 'total_amount'],
  CR: ['cr_no', 'cr_date', 'hospital_name', 'cr_amount'],
  DR: ['dr_ref', 'dr_date', 'hospital_name', 'dispatch_type'],
  BANK_SLIP: ['bank_name', 'account_number', 'deposit_date', 'amount'],
  CHECK: ['check_no', 'bank', 'check_date', 'amount'],
};

// Test whether a scoredField is missing or LOW confidence.
// scoredField shape: { value, confidence: 'HIGH'|'MEDIUM'|'LOW', present }
function isFieldWeak(field) {
  if (field == null) return true;
  if (typeof field !== 'object') return field === null || field === undefined || field === '';
  if (field.value == null || field.value === '') return true;
  if (field.confidence === 'LOW') return true;
  return false;
}

function listMissingCriticalFields(docType, extracted) {
  const required = CRITICAL_FIELDS_BY_DOC[docType] || [];
  return required.filter(name => isFieldWeak(extracted[name]));
}

// Document types that should get master data resolution (Layer 3 — Phase 18)
const CUSTOMER_DOC_TYPES = new Set(['CSI', 'CR', 'DR']);
const PRODUCT_DOC_TYPES = new Set(['CSI', 'DR']);
const VENDOR_DOC_TYPES = new Set(['OR', 'GAS_RECEIPT']);

const PARSERS = {
  CSI: parseCSI,
  CR: parseCR,
  CWT_2307: parseCWT,
  GAS_RECEIPT: parseGasReceipt,
  ODOMETER: parseOdometer,
  OR: parseOR,
  UNDERTAKING: parseUndertaking,
  DR: parseDR,
  // Phase H6 — Sales OCR
  BANK_SLIP: parseBankSlip,
  CHECK: parseCheck,
};

/**
 * Process an OCR result through the appropriate parser.
 *
 * @param {string} docType  – One of: CSI, CR, CWT_2307, GAS_RECEIPT, ODOMETER, OR, UNDERTAKING, DR
 * @param {object} ocrResult – Output of visionClient.detectText()
 * @returns {{ doc_type, extracted, validation_flags, raw_ocr_text }}
 */
async function processOcr(docType, ocrResult, options = {}) {
  const normalised = (docType || '').toUpperCase().replace(/[\s-]+/g, '_');
  const parser = PARSERS[normalised];

  if (!parser) {
    return {
      doc_type: docType,
      extracted: null,
      classification: null,
      validation_flags: [{
        type: 'UNKNOWN_DOC_TYPE',
        message: `No parser for document type "${docType}". Raw text returned.`,
      }],
      raw_ocr_text: ocrResult.fullText || '',
    };
  }

  const parsed = await parser(ocrResult, options);

  // Separate parser metadata from extracted fields
  const {
    validation_flags = [],
    layout_family = null,
    review_required = false,
    review_reasons = [],
    preprocessing = null,
    ...extracted
  } = parsed;

  const entityId = options.entityId || null;

  const result = {
    doc_type: normalised,
    extracted,
    classification: null,
    layout_family,
    review_required,
    review_reasons,
    preprocessing,
    validation_flags,
    raw_ocr_text: ocrResult.fullText || '',
  };

  // Layer 2a: Expense classification (COA mapping) — OR / GAS_RECEIPT only.
  // Sales docs have no COA; they're customer-facing, not vendor-facing.
  if (EXPENSE_DOC_TYPES.has(normalised)) {
    try {
      result.classification = await classifyExpense(extracted, { entityId });
    } catch (err) {
      result.validation_flags.push({
        type: 'CLASSIFICATION_ERROR',
        message: `Classification failed: ${err.message}`,
      });
    }
  }

  // Layer 2b: Claude AI fallback — Phase H4 + H6.
  // Fires for ANY doc type registered in CRITICAL_FIELDS_BY_DOC when EITHER:
  //   (a) regex classifier returned LOW confidence (expense docs only), OR
  //   (b) one or more critical extracted fields are missing/LOW (field completion — all doc types)
  // Phase H6: this block is no longer gated by EXPENSE_DOC_TYPES, so CSI/CR/DR/
  // BANK_SLIP/CHECK also benefit from Claude handwriting recovery. Classifier
  // refinement and vendor auto-learn remain gated to expense docs only.
  if (CRITICAL_FIELDS_BY_DOC[normalised]) {
    const aiFallbackAllowed = options.aiFallbackEnabled !== false;
    const aiFieldCompletionAllowed = options.aiFieldCompletionEnabled !== false;
    const classificationLow = result.classification?.confidence === 'LOW';
    const missingFields = aiFieldCompletionAllowed ? listMissingCriticalFields(normalised, extracted) : [];
    const triggerByMissing = missingFields.length > 0;

    let triggerReason = 'NONE';
    if (classificationLow && triggerByMissing) triggerReason = 'BOTH';
    else if (classificationLow) triggerReason = 'LOW_CLASSIFICATION';
    else if (triggerByMissing) triggerReason = 'MISSING_FIELDS';
    result.ai_trigger_reason = triggerReason;

    if (triggerReason !== 'NONE' && aiFallbackAllowed && process.env.ANTHROPIC_API_KEY) {
      try {
        const { classifyWithClaude } = require('../../agents/ocrAutoFillAgent');
        const aiResult = await classifyWithClaude(ocrResult.fullText || '', extracted, {
          doc_type: normalised,
          missing_fields: missingFields,
          mode: triggerReason === 'MISSING_FIELDS' ? 'FIELD_COMPLETION' : 'CLASSIFY',
          entityId, // Phase H6 — required for AI_SPEND_CAPS enforcement
        });
        // Phase H6 — surface Claude $USD cost so the controller can record it
        // against the monthly AI budget via OcrUsageLog.cost_usd.
        if (aiResult && typeof aiResult.ai_cost === 'number') {
          result.ai_cost_usd = (result.ai_cost_usd || 0) + aiResult.ai_cost;
        }
        if (aiResult) {
          // Classifier refinement — expense docs only (sales docs have no classification to refine)
          if (EXPENSE_DOC_TYPES.has(normalised) && classificationLow && aiResult.confidence !== 'LOW') {
            result.classification = {
              ...result.classification,
              ...aiResult,
              fallback_used: true,
              original_method: result.classification.match_method,
            };
          }
          // Field completion — all doc types. Never overwrite HIGH-confidence regex output.
          if (triggerByMissing) {
            const filled = [];
            for (const fname of missingFields) {
              const aiVal = aiResult[fname];
              if (aiVal != null && aiVal !== '') {
                extracted[fname] = { value: aiVal, confidence: aiResult.confidence || 'MEDIUM', present: true, match_method: 'CLAUDE_AI' };
                filled.push(fname);
              }
            }
            if (filled.length > 0) {
              result.validation_flags.push({
                type: 'AI_FIELDS_COMPLETED',
                message: `Claude filled missing fields: ${filled.join(', ')}`,
              });
              result.extracted = extracted;
            }
          }
          result.ai_fallback_used = true;

          // Phase H5 — Vendor auto-learn. Expense docs only (sales docs don't have vendors).
          const vendorAutoLearnAllowed = options.vendorAutoLearnEnabled !== false;
          if (EXPENSE_DOC_TYPES.has(normalised) && vendorAutoLearnAllowed && entityId) {
            try {
              const learning = await learnFromAiResult({
                aiResult,
                extractedFields: extracted,
                rawOcrText: ocrResult.fullText || '',
                docType: normalised,
                entityId,
                userId: options.userId || null,
              });
              result.vendor_auto_learn = learning;
              if (learning.action === 'CREATED' || learning.action === 'ALIAS_ADDED') {
                result.validation_flags.push({
                  type: 'VENDOR_AUTO_LEARNED',
                  message: learning.action === 'CREATED'
                    ? `New vendor learned from Claude — admin review pending`
                    : `Vendor alias appended from OCR variation`,
                });
              }
            } catch (learnErr) {
              result.vendor_auto_learn = { action: 'SKIPPED', reason: `LEARNER_ERROR: ${learnErr.message}` };
              console.warn('[OCR] Vendor auto-learner failed:', learnErr.message);
            }
          } else {
            result.vendor_auto_learn = {
              action: 'NONE',
              reason: !EXPENSE_DOC_TYPES.has(normalised)
                ? 'NOT_EXPENSE_DOC'
                : (vendorAutoLearnAllowed ? 'NO_ENTITY' : 'DISABLED'),
            };
          }
        }
      } catch (aiErr) {
        // Phase H6 — spend-cap gate throws status=429 with reason='SPEND_CAP_EXCEEDED'.
        // Vision + parser already ran; we keep the rule-based result and flag the skip.
        if (aiErr && aiErr.status === 429 && aiErr.reason === 'SPEND_CAP_EXCEEDED') {
          result.ai_skipped_reason = 'SPEND_CAP_EXCEEDED';
          result.validation_flags.push({
            type: 'AI_SPEND_CAP_EXCEEDED',
            message: aiErr.message || 'Monthly AI spend cap reached — rule-based result returned.',
          });
        } else {
          result.validation_flags.push({
            type: 'AI_CLASSIFICATION_FALLBACK_ERROR',
            message: `Claude fallback failed: ${aiErr.message}`,
          });
        }
      }
    }
  }

  // Layer 3: Master data resolution (Phase 18 — Customer/Hospital + Product + Vendor)
  result.resolved = {};

  // Resolve hospital/customer name → master record
  if (CUSTOMER_DOC_TYPES.has(normalised)) {
    const hospitalText = extracted.hospital?.value || extracted.charged_to?.value || extracted.received_from?.value;
    if (hospitalText) {
      try {
        const match = await resolveCustomer(hospitalText, entityId);
        if (match) {
          result.resolved.customer = {
            id: match.customer._id,
            name: match.customer.hospital_name || match.customer.customer_name,
            type: match.customer_type, // 'hospital' or 'customer'
            confidence: match.confidence,
            match_method: match.match_method
          };

          if (match.confidence === 'LOW') {
            result.review_required = true;
            if (!result.review_reasons.includes('LOW_CONFIDENCE_HOSPITAL')) {
              result.review_reasons.push('LOW_CONFIDENCE_HOSPITAL');
            }
          }
        }
      } catch (err) {
        result.validation_flags.push({
          type: 'CUSTOMER_RESOLVE_ERROR',
          message: `Customer resolution failed: ${err.message}`
        });
      }

      if (!result.resolved.customer) {
        result.review_required = true;
        if (!result.review_reasons.includes('LOW_CONFIDENCE_HOSPITAL')) {
          result.review_reasons.push('LOW_CONFIDENCE_HOSPITAL');
        }
      }
    }
  }

  // Resolve product names → master records
  const productList = extracted.products || extracted.line_items;
  if (PRODUCT_DOC_TYPES.has(normalised) && productList?.length) {
    result.resolved.products = [];
    for (const prod of productList) {
      const prodText = prod.product_name?.value || prod.brand_name?.value || prod.description?.value
                    || prod.product_name || prod.brand_name || prod.description;
      if (!prodText) continue;
      try {
        const match = await resolveProduct(prodText, entityId);
        if (match) {
          result.resolved.products.push({
            ocr_text: prodText,
            id: match.product._id,
            name: match.product.product_name,
            confidence: match.confidence,
            match_method: match.match_method
          });
        } else {
          result.resolved.products.push({ ocr_text: prodText, id: null, confidence: 'NONE' });
        }
      } catch (err) {
        console.warn(`[OCR] Product resolve failed for "${prodText}":`, err.message);
      }
    }
  }

  // Resolve vendor/establishment → master record
  if (VENDOR_DOC_TYPES.has(normalised)) {
    const vendorText = extracted.establishment?.value || extracted.vendor?.value
                    || extracted.station?.value || extracted.station_name?.value
                    || extracted.supplier_name?.value
                    || extracted.establishment || extracted.vendor || extracted.station
                    || extracted.station_name || extracted.supplier_name;
    if (vendorText) {
      try {
        const match = await resolveVendor(vendorText, entityId);
        if (match) {
          result.resolved.vendor = {
            id: match.vendor._id,
            name: match.vendor.vendor_name,
            confidence: match.confidence,
            match_method: match.match_method
          };
        }
      } catch (err) {
        console.warn(`[OCR] Vendor resolve failed for "${vendorText}":`, err.message);
      }
    }
  }

  result.review_reasons = [...new Set(result.review_reasons)];

  return result;
}

/** List of supported document types. */
const SUPPORTED_DOC_TYPES = Object.keys(PARSERS);

module.exports = {
  processOcr,
  SUPPORTED_DOC_TYPES,
};
