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
const { classifyExpense } = require('../services/expenseClassifier');
const { resolveCustomer, resolveProduct, resolveVendor } = require('../services/productResolver');

// Document types that should get expense classification (Layer 2)
const EXPENSE_DOC_TYPES = new Set(['OR', 'GAS_RECEIPT']);

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

  const parsed = parser(ocrResult, options);

  // Separate validation_flags from extracted fields
  const { validation_flags = [], ...extracted } = parsed;

  const result = {
    doc_type: normalised,
    extracted,
    classification: null,
    validation_flags,
    raw_ocr_text: ocrResult.fullText || '',
  };

  // Layer 2: Expense classification for OR and GAS_RECEIPT doc types
  if (EXPENSE_DOC_TYPES.has(normalised)) {
    try {
      result.classification = await classifyExpense(extracted);

      // Layer 2b: Claude AI fallback when regex classifier returns LOW confidence
      if (result.classification?.confidence === 'LOW' && process.env.ANTHROPIC_API_KEY) {
        try {
          const { classifyWithClaude } = require('../../agents/ocrAutoFillAgent');
          const aiResult = await classifyWithClaude(ocrResult.fullText || '', extracted);
          if (aiResult && aiResult.confidence !== 'LOW') {
            result.classification = {
              ...result.classification,
              ...aiResult,
              fallback_used: true,
              original_method: result.classification.match_method
            };
          }
        } catch (aiErr) {
          result.validation_flags.push({
            type: 'AI_CLASSIFICATION_FALLBACK_ERROR',
            message: `Claude fallback failed: ${aiErr.message}`
          });
        }
      }
    } catch (err) {
      result.validation_flags.push({
        type: 'CLASSIFICATION_ERROR',
        message: `Classification failed: ${err.message}`
      });
    }
  }

  // Layer 3: Master data resolution (Phase 18 — Customer/Hospital + Product + Vendor)
  const entityId = options.entityId || null;
  result.resolved = {};

  // Resolve hospital/customer name → master record
  if (CUSTOMER_DOC_TYPES.has(normalised)) {
    const hospitalText = extracted.hospital || extracted.charged_to || extracted.received_from;
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
        }
      } catch (err) {
        result.validation_flags.push({
          type: 'CUSTOMER_RESOLVE_ERROR',
          message: `Customer resolution failed: ${err.message}`
        });
      }
    }
  }

  // Resolve product names → master records
  if (PRODUCT_DOC_TYPES.has(normalised) && extracted.products?.length) {
    result.resolved.products = [];
    for (const prod of extracted.products) {
      const prodText = prod.product_name || prod.description;
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
      } catch { /* non-critical */ }
    }
  }

  // Resolve vendor/establishment → master record
  if (VENDOR_DOC_TYPES.has(normalised)) {
    const vendorText = extracted.establishment || extracted.vendor || extracted.station;
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
      } catch { /* non-critical */ }
    }
  }

  return result;
}

/** List of supported document types. */
const SUPPORTED_DOC_TYPES = Object.keys(PARSERS);

module.exports = {
  processOcr,
  SUPPORTED_DOC_TYPES,
};
