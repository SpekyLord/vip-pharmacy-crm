/**
 * Name Cleanup Utility — Lookup-Driven
 *
 * Proper-cases VIP Client names using admin-configurable rules
 * stored in Lookup tables (NAME_PARTICLE, NAME_SUFFIX, NAME_PREFIX).
 *
 * Used by:
 *  - Doctor model pre-save hook (BDM entry / admin edits)
 *  - Import controller (Excel CPT uploads)
 *  - Doctor controller bulk cleanup API
 */

const Lookup = require('../erp/models/Lookup');

// Fallback defaults — mirrors SEED_DEFAULTS in lookupGenericController.js
const FALLBACK_PARTICLES = [
  { code: 'DE', label: 'de', metadata: { position: 'any' } },
  { code: 'DEL', label: 'del', metadata: { position: 'any' } },
  { code: 'DELA', label: 'dela', metadata: { position: 'any' } },
  { code: 'DELOS', label: 'delos', metadata: { position: 'any' } },
  { code: 'NG', label: 'ng', metadata: { position: 'any' } },
  { code: 'LA', label: 'la', metadata: { after: 'DE' } },
  { code: 'LOS', label: 'los', metadata: { after: 'DE' } },
  { code: 'LAS', label: 'las', metadata: { after: 'DE' } },
];

const FALLBACK_SUFFIXES = [
  { code: 'JR', label: 'Jr.', metadata: {} },
  { code: 'SR', label: 'Sr.', metadata: {} },
  { code: 'II', label: 'II', metadata: {} },
  { code: 'III', label: 'III', metadata: {} },
  { code: 'IV', label: 'IV', metadata: {} },
  { code: 'V', label: 'V', metadata: {} },
];

const FALLBACK_PREFIXES = [
  { code: 'MC', label: 'Mc', metadata: { min_length: 3 } },
  { code: 'MAC', label: 'Mac', metadata: { min_length: 4 } },
  { code: 'O_APOSTROPHE', label: "O'", metadata: { min_length: 3 } },
];

/**
 * Load name rules from Lookup DB. Falls back to hardcoded defaults if DB empty.
 * @param {ObjectId|null} entityId - Entity scope (null = use fallbacks)
 * @returns {{ particles: Array, suffixes: Array, prefixes: Array }}
 */
async function loadNameRules(entityId) {
  if (!entityId) {
    return {
      particles: FALLBACK_PARTICLES,
      suffixes: FALLBACK_SUFFIXES,
      prefixes: FALLBACK_PREFIXES,
    };
  }

  try {
    const [particles, suffixes, prefixes] = await Promise.all([
      Lookup.find({ entity_id: entityId, category: 'NAME_PARTICLE', is_active: true })
        .select('code label metadata').sort('sort_order').lean(),
      Lookup.find({ entity_id: entityId, category: 'NAME_SUFFIX', is_active: true })
        .select('code label metadata').sort('sort_order').lean(),
      Lookup.find({ entity_id: entityId, category: 'NAME_PREFIX', is_active: true })
        .select('code label metadata').sort('sort_order').lean(),
    ]);

    return {
      particles: particles.length ? particles : FALLBACK_PARTICLES,
      suffixes: suffixes.length ? suffixes : FALLBACK_SUFFIXES,
      prefixes: prefixes.length ? prefixes : FALLBACK_PREFIXES,
    };
  } catch {
    // DB not available — use fallbacks
    return {
      particles: FALLBACK_PARTICLES,
      suffixes: FALLBACK_SUFFIXES,
      prefixes: FALLBACK_PREFIXES,
    };
  }
}

/**
 * Capitalize a single word: first letter upper, rest lower.
 */
function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Process a hyphenated segment (e.g., "santos-cruz" → "Santos-Cruz").
 */
function capitalizeHyphenated(word) {
  if (!word.includes('-')) return capitalize(word);
  return word.split('-').map(capitalize).join('-');
}

/**
 * Process an apostrophe segment (e.g., "o'brien" → "O'Brien").
 */
function capitalizeApostrophe(word) {
  if (!word.includes("'")) return word;
  const parts = word.split("'");
  return parts.map(capitalize).join("'");
}

/**
 * Clean a single name string using lookup-driven rules.
 * @param {string} rawName - The raw name to clean
 * @param {{ particles: Array, suffixes: Array, prefixes: Array }} rules
 * @returns {string} Properly cased name
 */
function cleanName(rawName, rules) {
  if (!rawName || typeof rawName !== 'string') return rawName || '';

  // 1. Trim + collapse internal whitespace
  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  // Build lookup maps from rules
  const suffixMap = new Map(); // code (uppercase, no dots) → canonical label
  for (const s of rules.suffixes) {
    suffixMap.set(s.code.toUpperCase(), s.label);
    // Also match with/without dots: "JR." → code "JR"
    const stripped = s.label.replace(/\./g, '').toUpperCase();
    if (stripped !== s.code.toUpperCase()) {
      suffixMap.set(stripped, s.label);
    }
  }

  const particleMap = new Map(); // code (uppercase) → { label, after }
  for (const p of rules.particles) {
    particleMap.set(p.code.toUpperCase(), {
      label: p.label,
      after: (p.metadata && p.metadata.after) ? p.metadata.after.toUpperCase() : null,
    });
  }

  // Sort prefixes by label length descending so longer prefixes match first
  const sortedPrefixes = [...rules.prefixes].sort(
    (a, b) => b.label.length - a.label.length
  );

  // 2. Split into words and process
  const words = trimmed.split(' ');
  const result = [];
  let prevCode = null; // track previous word's particle code for "after" constraint

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordUpper = word.toUpperCase().replace(/\./g, '');
    const isFirst = i === 0;

    // Check suffix (Jr., Sr., II, III, etc.)
    if (suffixMap.has(wordUpper)) {
      result.push(suffixMap.get(wordUpper));
      prevCode = null;
      continue;
    }

    // Check particle (de, del, dela, etc.) — not first word
    if (!isFirst && particleMap.has(wordUpper)) {
      const particle = particleMap.get(wordUpper);
      // If particle has "after" constraint, check previous word
      if (particle.after) {
        if (prevCode === particle.after) {
          result.push(particle.label);
          prevCode = wordUpper;
          continue;
        }
        // Constraint not met — capitalize normally
      } else {
        result.push(particle.label);
        prevCode = wordUpper;
        continue;
      }
    }

    // Check prefix (Mc, Mac, O')
    let prefixMatched = false;
    const wordLower = word.toLowerCase();
    for (const pf of sortedPrefixes) {
      const pfLower = pf.label.toLowerCase();
      const minLen = (pf.metadata && pf.metadata.min_length) || pf.label.length + 1;
      if (wordLower.startsWith(pfLower) && word.length >= minLen) {
        // Build: prefix label + capitalize rest
        const rest = word.slice(pf.label.length);
        result.push(pf.label + capitalize(rest));
        prefixMatched = true;
        break;
      }
    }
    if (prefixMatched) {
      prevCode = null;
      continue;
    }

    // Default: handle hyphens, apostrophes, then capitalize
    let cleaned = capitalizeHyphenated(word);
    cleaned = capitalizeApostrophe(cleaned);
    result.push(cleaned);
    prevCode = null;
  }

  return result.join(' ');
}

/**
 * Generate preview of name changes for all doctors.
 * @param {Array<{_id, firstName, lastName}>} doctors
 * @param {{ particles, suffixes, prefixes }} rules
 * @returns {Array} Only records where cleaned differs from original
 */
function generatePreview(doctors, rules) {
  const changes = [];

  for (const doc of doctors) {
    const cleanedFirst = cleanName(doc.firstName, rules);
    const cleanedLast = cleanName(doc.lastName, rules);

    if (cleanedFirst !== doc.firstName || cleanedLast !== doc.lastName) {
      changes.push({
        _id: doc._id,
        originalFirstName: doc.firstName,
        originalLastName: doc.lastName,
        cleanedFirstName: cleanedFirst,
        cleanedLastName: cleanedLast,
      });
    }
  }

  return changes;
}

/**
 * Find potential duplicate VIP Clients by normalized name.
 * @param {Array<{_id, firstName, lastName}>} doctors
 * @returns {Array<Array>} Groups of 2+ potential duplicates
 */
function findPotentialDuplicates(doctors) {
  const groups = new Map();

  for (const doc of doctors) {
    const key = ((doc.firstName || '') + (doc.lastName || ''))
      .toLowerCase()
      .replace(/[^a-z]/g, '');

    if (!key) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      _id: doc._id,
      firstName: doc.firstName,
      lastName: doc.lastName,
    });
  }

  return Array.from(groups.values()).filter(g => g.length > 1);
}

module.exports = {
  loadNameRules,
  cleanName,
  generatePreview,
  findPotentialDuplicates,
};
