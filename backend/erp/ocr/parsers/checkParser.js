/**
 * Check (Cheque) Parser — Phase H6
 *
 * Extracts: check_no, bank, check_date, payee, payer, amount.
 *
 * Scanning a received check lets the BDM pre-fill a Collection DRAFT's
 * payment fields (check_no, bank, check_date) without typing. The existing
 * Collection model already accepts all of these — this parser just feeds them.
 *
 * Key reliability source: the MICR line at the bottom of a check. Vision OCR
 * reads digits very cleanly from the E13B font, so when a MICR match is
 * found the check number is HIGH confidence regardless of handwriting above.
 *
 * Shape matches csiParser / crParser / drParser / bankSlipParser conventions.
 */

const {
  scoredField,
  getWordConfidencesForText,
  parseAmount,
  splitLines,
} = require('../confidenceScorer');

// Same Philippine bank set as bankSlipParser — duplicated deliberately so the
// two parsers can evolve independently (a subscriber might add a bank alias
// for check recognition that doesn't apply to deposit slips or vice versa).
const BANK_PATTERNS = [
  { code: 'BPI', regex: /\bBPI\b|BANK\s+OF\s+THE\s+PHILIPPINE\s+ISLANDS/i },
  { code: 'BDO', regex: /\bBDO\b|BANCO\s+DE\s+ORO/i },
  { code: 'METROBANK', regex: /\bMETROBANK\b|METROPOLITAN\s+BANK/i },
  { code: 'LANDBANK', regex: /\bLAND\s*BANK\b|LBP\b/i },
  { code: 'RCBC', regex: /\bRCBC\b|RIZAL\s+COMMERCIAL/i },
  { code: 'PNB', regex: /\bPNB\b|PHILIPPINE\s+NATIONAL\s+BANK/i },
  { code: 'SECURITY_BANK', regex: /\bSECURITY\s+BANK\b|\bSB\b/i },
  { code: 'CHINABANK', regex: /\bCHINA\s*BANK\b|CBC\b/i },
  { code: 'UNIONBANK', regex: /\bUNION\s*BANK\b|UBP\b/i },
  { code: 'EASTWEST', regex: /\bEAST\s*WEST\b|EWB\b/i },
  { code: 'MAYBANK', regex: /\bMAYBANK\b/i },
  { code: 'PSBANK', regex: /\bPSBANK\b|PHILIPPINE\s+SAVINGS\s+BANK/i },
];

// Check number from labeled lines ("CHECK NO.", "CA 1200041967", "No. 1234567")
// or from the MICR line between ||pipes||.
const RE_CHECK_NO_LABELED = /(?:CHECK\s*(?:NO|NUMBER|#)|CHEQUE\s*(?:NO|NUMBER|#)|\bCA\b)\s*\.?\s*:?\s*(\d{7,12})/i;
const RE_MICR = /[‖|⑆]\s*(\d{7,12})\s*[‖|⑆]/;
const RE_MICR_FALLBACK = /\|\s*(\d{7,12})\s*\|/;

// Date — Philippine checks use the MM DD YYYY boxed format. Boxes often read
// as "02 26 2026" or "02-26-2026" or a single "02262026" when separators blur.
const RE_DATE_BOXED = /\b(\d{2})[\s\-\/](\d{2})[\s\-\/](\d{4})\b/;
const RE_DATE_8DIG = /\b(\d{8})\b/;
const RE_DATE_WORDS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i;

// "PAY TO THE ORDER OF" payee extraction.
const RE_PAYEE = /PAY\s+TO\s+THE\s+ORDER\s+OF\s*:?\s*([A-Z0-9&\.,\s\-]{2,80}?)(?:\s+PESOS|\n|$)/i;
const RE_PAYEE_FALLBACK = /ORDER\s+OF\s*:?\s*([A-Z][A-Z0-9&\.,\s\-]{2,80})/i;

// Payer — account name top-left of the check. Usually "ACCOUNT NAME: ..." or
// appears on a line before the account number. Stop at newline or the next
// well-known label so we don't swallow the check number / date / payee block.
const RE_PAYER_LABELED = /ACCOUNT\s*NAME\s*:?\s*([A-Z][^\n]{2,80}?)(?=\s*(?:\bCA\b\s*\d|CHECK\s*(?:NO|#)|DATE|PAY\s+TO|PHP|[₱P]\s*\d|$))/i;

// Amount — numeric first (most reliable). Look for peso-prefixed amount near
// the middle-right of the check.
const RE_AMOUNT_PESO = /[₱P]\s*([\d,]+\.\d{2})/;
const RE_AMOUNT_LABELED = /(?:AMOUNT|PHP|PESOS)\s*[:;=]?\s*[₱P]?\s*([\d,]+\.\d{2})/i;

// Amount in words — "FIVE THOUSAND ... AND 43/100 PESOS ONLY" — used only as
// a cross-check signal; we don't parse words to a number, just flag mismatch.
const RE_AMOUNT_WORDS_MARKER = /\b(?:PESOS|AND)\s+\d{1,2}\/100\b/i;

function detectBank(fullText) {
  for (const bank of BANK_PATTERNS) {
    if (bank.regex.test(fullText)) return bank.code;
  }
  return null;
}

function extractCheckNo(lines, fullText) {
  // Prefer labeled
  const labeled = fullText.match(RE_CHECK_NO_LABELED);
  if (labeled) return labeled[1];
  // MICR line — most reliable source for check #
  const micr = fullText.match(RE_MICR) || fullText.match(RE_MICR_FALLBACK);
  if (micr) return micr[1];
  // Last resort: look for a 7-12 digit sequence near "NO." or "#" anywhere
  for (const line of lines) {
    const m = line.match(/\bNo\.?\s*[:;]?\s*(\d{7,12})\b/i);
    if (m) return m[1];
  }
  return null;
}

function extractDate(lines, fullText) {
  // Word-form dates read reliably
  const words = fullText.match(RE_DATE_WORDS);
  if (words) return `${words[1]} ${words[2]}, ${words[3]}`;
  // Boxed MM DD YYYY
  const boxed = fullText.match(RE_DATE_BOXED);
  if (boxed) {
    const [, mm, dd, yyyy] = boxed;
    return `${yyyy}-${mm}-${dd}`;
  }
  // Run-together 8-digit date (MMDDYYYY) — only trust if exactly 8 digits and
  // lies on a line near "DATE"
  for (const line of lines) {
    if (!/DATE/i.test(line)) continue;
    const m8 = line.match(RE_DATE_8DIG);
    if (m8) {
      const s = m8[1];
      const mm = s.slice(0, 2), dd = s.slice(2, 4), yyyy = s.slice(4);
      const mmN = Number(mm), ddN = Number(dd), yyN = Number(yyyy);
      if (mmN >= 1 && mmN <= 12 && ddN >= 1 && ddN <= 31 && yyN >= 2000 && yyN <= 2099) {
        return `${yyyy}-${mm}-${dd}`;
      }
    }
  }
  return null;
}

function extractPayee(fullText) {
  const primary = fullText.match(RE_PAYEE);
  if (primary) return primary[1].replace(/\s+/g, ' ').trim();
  const fallback = fullText.match(RE_PAYEE_FALLBACK);
  if (fallback) return fallback[1].replace(/\s+/g, ' ').trim();
  return null;
}

function extractPayer(fullText) {
  const m = fullText.match(RE_PAYER_LABELED);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  return null;
}

function extractAmount(lines, fullText) {
  const labeled = fullText.match(RE_AMOUNT_LABELED);
  if (labeled) return parseAmount(labeled[1]);
  const peso = fullText.match(RE_AMOUNT_PESO);
  if (peso) return parseAmount(peso[1]);
  // Fallback: largest money-shaped number on the page
  let max = null;
  for (const line of lines) {
    const matches = line.match(/([\d,]+\.\d{2})/g);
    if (!matches) continue;
    for (const m of matches) {
      const n = parseAmount(m);
      if (n != null && (max == null || n > max)) max = n;
    }
  }
  return max;
}

async function parseCheck(ocrResult) {
  const { fullText = '', words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  if (!/PAY\s+TO\s+THE\s+ORDER\s+OF/i.test(fullText)) {
    validationFlags.push({
      type: 'CHECK_MARKER_NOT_FOUND',
      message: 'No "Pay to the order of" marker detected — may not be a check image.',
    });
  }

  const bank = detectBank(fullText);
  const checkNo = extractCheckNo(lines, fullText);
  const checkDate = extractDate(lines, fullText);
  const payee = extractPayee(fullText);
  const payer = extractPayer(fullText);
  const amount = extractAmount(lines, fullText);

  // Signal (non-blocking) when words-form amount is present but numeric wasn't
  // — Claude field-completion is the right recovery path.
  if (amount == null && RE_AMOUNT_WORDS_MARKER.test(fullText)) {
    validationFlags.push({
      type: 'AMOUNT_IN_WORDS_ONLY',
      message: 'Numeric amount not readable; amount-in-words is present. AI field-completion will try to recover it.',
    });
  }

  return {
    check_no: scoredField(checkNo, getWordConfidencesForText(words, checkNo), !!checkNo),
    bank: scoredField(bank, getWordConfidencesForText(words, bank), !!bank),
    check_date: scoredField(checkDate, getWordConfidencesForText(words, checkDate), !!checkDate),
    payee: scoredField(payee, getWordConfidencesForText(words, payee), !!payee),
    payer: scoredField(payer, getWordConfidencesForText(words, payer), !!payer),
    amount: scoredField(amount, getWordConfidencesForText(words, amount != null ? String(amount) : null), amount != null),
    validation_flags: validationFlags,
  };
}

module.exports = { parseCheck };
