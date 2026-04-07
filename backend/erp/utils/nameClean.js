/**
 * Shared name canonicalization for OCR fuzzy matching.
 * Used by Hospital model pre-save hook and smart dropdown search.
 */
const cleanName = (name) =>
  String(name ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Common Philippine hospital name abbreviations.
 * Each pair: [abbreviated, expanded]. Used bidirectionally —
 * "SAINT" in OCR text matches "ST" in hospital name and vice versa.
 */
const PH_ABBREVIATIONS = [
  ['ST', 'SAINT'],
  ['STA', 'SANTA'],
  ['STO', 'SANTO'],
  ['MC', 'MEDICAL CENTER'],
  ['GH', 'GENERAL HOSPITAL'],
  ['RH', 'REGIONAL HOSPITAL'],
  ['DH', 'DISTRICT HOSPITAL'],
  ['PH', 'PROVINCIAL HOSPITAL'],
  ['OLO', 'OUR LADY OF'],
  ['HOSP', 'HOSPITAL'],
  ['GOVT', 'GOVERNMENT'],
  ['NATL', 'NATIONAL'],
  ['PROVL', 'PROVINCIAL'],
  ['MED', 'MEDICAL'],
  ['CTR', 'CENTER'],
  ['UNIV', 'UNIVERSITY'],
  ['PHIL', 'PHILIPPINE'],
  ['DR', 'DOCTOR'],
];

/**
 * Expand abbreviations in a cleaned name to produce all known variants.
 * Returns an array of expanded forms (including the original).
 *
 * Example: "ST JUDE HOSPITAL" → ["ST JUDE HOSPITAL", "SAINT JUDE HOSPITAL"]
 *          "SAINT JUDE HOSPITAL" → ["SAINT JUDE HOSPITAL", "ST JUDE HOSPITAL"]
 */
const expandAbbreviations = (cleaned) => {
  const variants = new Set([cleaned]);

  for (const [short, long] of PH_ABBREVIATIONS) {
    // word-boundary aware replacement (avoid partial word matches)
    const shortRe = new RegExp(`\\b${short}\\b`, 'g');
    const longRe = new RegExp(`\\b${long}\\b`, 'g');

    if (shortRe.test(cleaned)) {
      variants.add(cleaned.replace(shortRe, long));
    }
    if (longRe.test(cleaned)) {
      variants.add(cleaned.replace(longRe, short));
    }
  }

  return [...variants];
};

module.exports = { cleanName, expandAbbreviations, PH_ABBREVIATIONS };
