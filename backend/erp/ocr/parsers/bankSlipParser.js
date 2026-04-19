/**
 * Bank Deposit Slip Parser — Phase H6
 *
 * Extracts: bank_name, account_number, account_holder, deposit_date, amount.
 *
 * Covers the common Philippine deposit-slip layouts (BPI, BDO, Metrobank,
 * LandBank, RCBC, PNB, Security Bank, Chinabank, UnionBank). The parser is
 * deliberately tolerant — fields missed here are handed to Claude field-
 * completion via ocrProcessor when ai_field_completion_enabled is true.
 *
 * All output is wrapped in scoredField() so downstream consumers see a
 * confidence level. Matches the shape of csiParser / crParser / drParser.
 */

const {
  scoredField,
  getWordConfidencesForText,
  parseAmount,
  splitLines,
} = require('../confidenceScorer');

// Known Philippine banks — used for bank_name extraction when the letterhead
// isn't read cleanly. Admins can override via the existing OCR_EXPENSE_RULES
// lookup pattern in future; hardcoded fallback only for Phase H6 boot.
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

// "Deposit" / "Credit" / "Validated on" markers that confirm this is a slip.
const RE_DEPOSIT_MARKER = /DEPOSIT\s*SLIP|CASH\s*DEPOSIT|CHECK\s*DEPOSIT|CREDIT\s+MEMO/i;

// Account-number shapes:
//   "1234-5678-90"     (10 digits with dashes)
//   "7-590-52168-4"    (Security Bank style)
//   "001234567890"     (12-digit, no dashes)
//   "A/C No.: ..."     (labeled)
const RE_ACCOUNT_LABELED = /(?:ACC(?:OUNT|T)?\s*(?:NO|NUMBER|#)|A[\/\s]*C\s*(?:NO|#)?)\s*\.?\s*:?\s*([0-9][0-9\s\-]{6,})/i;
const RE_ACCOUNT_RAW = /\b(\d[\d\-\s]{9,17}\d)\b/g;

// Amounts — labeled or appearing next to Peso symbol.
const RE_AMOUNT_LABELED = /(?:AMOUNT|TOTAL(?:\s+AMOUNT)?|CASH\s+TOTAL|DEPOSIT\s+AMOUNT|PHP|P[₱])\s*[:;=]?\s*[₱P]?\s*([\d,]+\.\d{2})/i;
const RE_AMOUNT_PESO = /[₱P]\s*([\d,]+\.\d{2})/;

// Dates — many formats (MM/DD/YYYY, DD/MM/YYYY, MMM DD YYYY, YYYY-MM-DD).
const RE_DATE_SLASH = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/;
const RE_DATE_DASH = /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/;
const RE_DATE_WORDS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i;
const RE_DATE_LABEL = /(?:DATE|VALIDATION\s*DATE|DEPOSIT\s*DATE|TRAN\s*DATE)\s*[:;]?\s*(.{6,30})/i;

// Account holder / depositor — usually after "Account Name" or "Depositor".
// Stop at newline or at any well-known next-label so we don't swallow adjacent
// fields (e.g., "DEPOSIT DATE", "AMOUNT", "TOTAL"). Non-greedy + lookahead.
const RE_HOLDER_LABELED = /(?:ACCOUNT\s*NAME|DEPOSITOR(?:'S?\s+NAME)?|NAME\s*OF\s*DEPOSITOR|IN\s*FAVOR\s*OF|PAYEE)\s*:?\s*([A-Z][^\n]{2,80}?)(?=\s*(?:DEPOSIT\s*DATE|TRAN\s*DATE|DATE|AMOUNT|TOTAL|PHP|[₱P]\s*\d|$))/i;

function detectBank(fullText) {
  for (const bank of BANK_PATTERNS) {
    if (bank.regex.test(fullText)) return bank.code;
  }
  return null;
}

function extractAccountNumber(lines, fullText) {
  // Prefer labeled match
  const labeled = fullText.match(RE_ACCOUNT_LABELED);
  if (labeled) {
    return labeled[1].replace(/\s+/g, '').trim();
  }
  // Fallback: scan for raw number patterns that look like account numbers
  // (10-18 digits with optional dashes). Skip lines that look like dates or
  // amounts to reduce false positives.
  for (const line of lines) {
    if (/date|amount|total|php|[₱p]\s*\d/i.test(line)) continue;
    const matches = line.match(RE_ACCOUNT_RAW);
    if (!matches) continue;
    for (const m of matches) {
      const digitsOnly = m.replace(/[\s\-]/g, '');
      // Account numbers are typically 10-18 digits. Reject if fewer or more.
      if (digitsOnly.length >= 10 && digitsOnly.length <= 18) {
        return m.replace(/\s+/g, '').trim();
      }
    }
  }
  return null;
}

function extractDate(lines, fullText) {
  // Try labeled date first
  const labeled = fullText.match(RE_DATE_LABEL);
  if (labeled) {
    const chunk = labeled[1];
    const words = chunk.match(RE_DATE_WORDS);
    if (words) return `${words[1]} ${words[2]}, ${words[3]}`;
    const iso = chunk.match(RE_DATE_DASH);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    const slash = chunk.match(RE_DATE_SLASH);
    if (slash) return chunk.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/)[0];
  }
  // Fallback: first date we see that isn't the printer's ATP date
  for (const line of lines) {
    if (/ATP|Accred|OCN|Printer|Date\s*Issued/i.test(line)) continue;
    const words = line.match(RE_DATE_WORDS);
    if (words) return `${words[1]} ${words[2]}, ${words[3]}`;
    const iso = line.match(RE_DATE_DASH);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
    const slash = line.match(RE_DATE_SLASH);
    if (slash) return slash[0];
  }
  return null;
}

function extractAmount(lines, fullText) {
  // Prefer labeled
  const labeled = fullText.match(RE_AMOUNT_LABELED);
  if (labeled) return parseAmount(labeled[1]);
  // Then peso-symbol prefixed
  const peso = fullText.match(RE_AMOUNT_PESO);
  if (peso) return parseAmount(peso[1]);
  // Fallback: largest money-shaped number in the slip (deposit amount is
  // usually the biggest figure on the page)
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

function extractHolder(fullText) {
  const m = fullText.match(RE_HOLDER_LABELED);
  if (!m) return null;
  // Strip trailing common noise
  return m[1].replace(/\s+/g, ' ').replace(/[\s\-,]+$/, '').trim();
}

async function parseBankSlip(ocrResult) {
  const { fullText = '', words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  if (!RE_DEPOSIT_MARKER.test(fullText)) {
    validationFlags.push({
      type: 'DEPOSIT_MARKER_NOT_FOUND',
      message: 'No "Deposit Slip" / "Cash Deposit" / "Credit Memo" marker detected — extracted fields may be unreliable.',
    });
  }

  const bankName = detectBank(fullText);
  const accountNumber = extractAccountNumber(lines, fullText);
  const depositDate = extractDate(lines, fullText);
  const amount = extractAmount(lines, fullText);
  const accountHolder = extractHolder(fullText);

  return {
    bank_name: scoredField(bankName, getWordConfidencesForText(words, bankName), !!bankName),
    account_number: scoredField(accountNumber, getWordConfidencesForText(words, accountNumber), !!accountNumber),
    account_holder: scoredField(accountHolder, getWordConfidencesForText(words, accountHolder), !!accountHolder),
    deposit_date: scoredField(depositDate, getWordConfidencesForText(words, depositDate), !!depositDate),
    amount: scoredField(amount, getWordConfidencesForText(words, amount != null ? String(amount) : null), amount != null),
    validation_flags: validationFlags,
  };
}

module.exports = { parseBankSlip };
