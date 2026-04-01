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

// Document types that should get expense classification (Layer 2)
const EXPENSE_DOC_TYPES = new Set(['OR', 'GAS_RECEIPT']);

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
    } catch (err) {
      result.validation_flags.push({
        type: 'CLASSIFICATION_ERROR',
        message: `Classification failed: ${err.message}`
      });
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
