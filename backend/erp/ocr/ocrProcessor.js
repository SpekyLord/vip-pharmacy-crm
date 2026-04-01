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
function processOcr(docType, ocrResult, options = {}) {
  const normalised = (docType || '').toUpperCase().replace(/[\s-]+/g, '_');
  const parser = PARSERS[normalised];

  if (!parser) {
    return {
      doc_type: docType,
      extracted: null,
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

  return {
    doc_type: normalised,
    extracted,
    validation_flags,
    raw_ocr_text: ocrResult.fullText || '',
  };
}

/** List of supported document types. */
const SUPPORTED_DOC_TYPES = Object.keys(PARSERS);

module.exports = {
  processOcr,
  SUPPORTED_DOC_TYPES,
};
