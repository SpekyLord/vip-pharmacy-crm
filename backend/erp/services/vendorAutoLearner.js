/**
 * Vendor Auto-Learner — Phase H5 (Tier 1 #2 from the OCR confidence playbook)
 *
 * When Claude's fallback classifies an OR / GAS_RECEIPT with a supplier_name the
 * expense classifier didn't recognise, the OCR pipeline has effectively paid for
 * training data that it throws away. This service closes the loop:
 *
 *   • If a similar VendorMaster entry already exists (entity-scoped), append the
 *     new OCR text variation to its `vendor_aliases` — so next scan hits ALIAS_MATCH.
 *   • Otherwise, create a new VendorMaster entry flagged `auto_learned_from_ocr: true`,
 *     `learning_status: 'UNREVIEWED'`. Next scan hits EXACT_VENDOR without calling Claude.
 *
 * Guardrails (all conditions must pass, else action = 'SKIPPED'):
 *   1. ai_result.supplier_name is present and ≥ MIN_NAME_LEN characters
 *   2. not purely numeric / not a generic word ("RECEIPT", "OR", "INVOICE", …)
 *   3. ai_result.confidence is HIGH or MEDIUM (never learn from LOW)
 *   4. ai_result.coa_code is present — a vendor without a COA is noise
 *   5. entity_id must be non-null (subscription-ready — no cross-tenant leak)
 *
 * Non-destructive: never overwrites an existing vendor's default_coa_code
 * (admin-set values win), only appends unique aliases. Admin can still reject
 * auto-learned entries via PATCH /vendor-learnings/:id (sets is_active = false).
 */
const VendorMaster = require('../models/VendorMaster');
const Lookup = require('../models/Lookup');

// ── Guardrail fallbacks (used when the Lookup table has no entries for a given
//    entity — fresh install before `ensureSeed` runs, or if admin deleted
//    every row). Keeps the learner safe even with an empty DB. Admin-facing
//    tuning lives in Control Center → Lookup Tables → VENDOR_AUTO_LEARN_*. ──
const FALLBACK_THRESHOLDS = {
  MIN_NAME_LEN: 3,
  MAX_NAME_LEN: 120,
  MAX_RAW_SNIPPET: 300,
};
const FALLBACK_BLOCKLIST = new Set([
  'RECEIPT', 'OFFICIAL RECEIPT', 'OR', 'INVOICE', 'UNKNOWN', 'N/A', 'NA',
  'SUPPLIER', 'VENDOR', 'ESTABLISHMENT', 'STORE', 'SHOP', 'CUSTOMER',
  'CASH', 'SALES', 'CASHIER', 'THANK YOU', 'THANK', 'NONE', 'NULL',
  'GAS STATION', 'STATION', 'PUMP',
]);

// ── Per-entity guardrail cache — mirrors expenseClassifier.getKeywordRules pattern.
//    Invalidation is wired into lookupGenericController.js (create/update/delete/seed). ──
const _guardrailCache = new Map(); // entityKey → { value, expiry }
const GUARDRAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const _entityKey = (entityId) => entityId ? String(entityId) : '__GLOBAL__';

async function getGuardrails(entityId) {
  const key = _entityKey(entityId);
  const now = Date.now();
  const hit = _guardrailCache.get(key);
  if (hit && now < hit.expiry) return hit.value;

  // Lookups require entity_id — without it, fall back immediately.
  let thresholds = [];
  let blocklist = [];
  if (entityId) {
    try {
      [thresholds, blocklist] = await Promise.all([
        Lookup.find({ entity_id: entityId, category: 'VENDOR_AUTO_LEARN_THRESHOLDS', is_active: true }).lean(),
        Lookup.find({ entity_id: entityId, category: 'VENDOR_AUTO_LEARN_BLOCKLIST',  is_active: true }).lean(),
      ]);
    } catch (_) {
      // swallow — fallbacks below keep the learner safe
    }
  }

  const tMap = Object.fromEntries((thresholds || []).map(t => [t.code, t.metadata?.value]));
  const value = {
    MIN_NAME_LEN:    Number.isFinite(tMap.MIN_NAME_LEN)    ? tMap.MIN_NAME_LEN    : FALLBACK_THRESHOLDS.MIN_NAME_LEN,
    MAX_NAME_LEN:    Number.isFinite(tMap.MAX_NAME_LEN)    ? tMap.MAX_NAME_LEN    : FALLBACK_THRESHOLDS.MAX_NAME_LEN,
    MAX_RAW_SNIPPET: Number.isFinite(tMap.MAX_RAW_SNIPPET) ? tMap.MAX_RAW_SNIPPET : FALLBACK_THRESHOLDS.MAX_RAW_SNIPPET,
    BLOCKLIST: (blocklist && blocklist.length)
      ? new Set(blocklist.map(b => String(b.metadata?.blocked_value || b.code).toUpperCase().trim()))
      : FALLBACK_BLOCKLIST,
  };
  _guardrailCache.set(key, { value, expiry: now + GUARDRAIL_CACHE_TTL_MS });
  return value;
}

function invalidateGuardrailCache(entityId) {
  if (entityId) _guardrailCache.delete(_entityKey(entityId));
  else _guardrailCache.clear();
}

function isValidCandidateName(name, guardrails) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < guardrails.MIN_NAME_LEN || trimmed.length > guardrails.MAX_NAME_LEN) return false;
  if (/^\d+$/.test(trimmed)) return false; // purely numeric
  if (guardrails.BLOCKLIST.has(trimmed.toUpperCase())) return false;
  return true;
}

function normaliseForCompare(s) {
  return (s || '').toString().toUpperCase().replace(/\s+/g, ' ').trim();
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Learn from a Claude win on an OR/GAS_RECEIPT.
 *
 * @param {Object} params
 * @param {Object} params.aiResult         — Output of classifyWithClaude (must have supplier_name, coa_code, confidence)
 * @param {Object} params.extractedFields  — Original regex-parser output (used for raw OCR text variation)
 * @param {string} params.rawOcrText       — Full OCR text (truncated for learning_meta.source_raw_snippet)
 * @param {string} params.docType          — OR | GAS_RECEIPT
 * @param {ObjectId} params.entityId       — Required — prevents cross-tenant learning
 * @param {ObjectId} [params.userId]       — For audit (created_by / updated_by)
 *
 * @returns {Promise<{ action: 'CREATED'|'ALIAS_ADDED'|'SKIPPED', vendor_id: ObjectId|null, reason: string }>}
 */
async function learnFromAiResult({ aiResult, extractedFields = {}, rawOcrText = '', docType, entityId, userId }) {
  // Guardrail 0: entity required
  if (!entityId) {
    return { action: 'SKIPPED', vendor_id: null, reason: 'NO_ENTITY' };
  }

  // Load per-entity guardrails (lookup-driven; cached 5 min; falls back to defaults)
  const guardrails = await getGuardrails(entityId);

  const supplierName = aiResult?.supplier_name || aiResult?.station_name || null;

  // Guardrail 1 + 2: candidate name quality
  if (!isValidCandidateName(supplierName, guardrails)) {
    return { action: 'SKIPPED', vendor_id: null, reason: 'INVALID_NAME' };
  }

  // Guardrail 3: only learn from HIGH/MEDIUM Claude confidence
  const confidence = aiResult?.confidence;
  if (confidence !== 'HIGH' && confidence !== 'MEDIUM') {
    return { action: 'SKIPPED', vendor_id: null, reason: 'LOW_CONFIDENCE' };
  }

  // Guardrail 4: must have a COA to be worth learning
  if (!aiResult?.coa_code) {
    return { action: 'SKIPPED', vendor_id: null, reason: 'NO_COA' };
  }

  const cleanName = supplierName.trim();
  const cleanNameUpper = normaliseForCompare(cleanName);

  // The raw OCR text variation that produced this learning — preferred alias to add.
  // Prefer the regex-extracted supplier_name (actual receipt text) over Claude's cleaned version.
  const rawOcrVariation = normaliseForCompare(
    extractedFields.supplier_name?.value
    || extractedFields.establishment?.value
    || extractedFields.station_name?.value
    || extractedFields.station?.value
    || cleanName
  );

  // ── Step A: Look for existing vendor (exact name, alias match, or Claude-name alias) ──
  // Using a single compound query to minimise round-trips.
  const existing = await VendorMaster.findOne({
    entity_id: entityId,
    is_active: true,
    $or: [
      { vendor_name: { $regex: `^${escapeRegex(cleanName)}$`, $options: 'i' } },
      { vendor_aliases: { $in: [cleanNameUpper, rawOcrVariation] } },
    ],
  });

  if (existing) {
    // Append any missing alias variations (both the Claude-cleaned name and the raw OCR text).
    const existingAliases = new Set((existing.vendor_aliases || []).map(a => normaliseForCompare(a)));
    const newAliases = [];
    if (!existingAliases.has(cleanNameUpper)) newAliases.push(cleanNameUpper);
    if (rawOcrVariation && rawOcrVariation !== cleanNameUpper && !existingAliases.has(rawOcrVariation)) {
      newAliases.push(rawOcrVariation);
    }

    if (newAliases.length === 0) {
      return { action: 'SKIPPED', vendor_id: existing._id, reason: 'ALIAS_EXISTS' };
    }

    try {
      const update = {
        $addToSet: { vendor_aliases: { $each: newAliases } },
        $set: {
          updated_by: userId || existing.updated_by || null,
        },
      };
      // Only bump the learn_count + timestamp when the vendor was itself auto-learned —
      // preserve learning_meta on manually-created admin vendors untouched.
      if (existing.auto_learned_from_ocr) {
        update.$inc = { 'learning_meta.learn_count': 1 };
        update.$set['learning_meta.source_raw_snippet'] = (rawOcrText || '').slice(0, guardrails.MAX_RAW_SNIPPET);
        update.$set.learned_at = new Date();
      }
      await VendorMaster.updateOne({ _id: existing._id, entity_id: entityId }, update);
      return { action: 'ALIAS_ADDED', vendor_id: existing._id, reason: 'ALIAS_APPENDED' };
    } catch (err) {
      return { action: 'SKIPPED', vendor_id: existing._id, reason: `ALIAS_UPDATE_FAILED: ${err.message}` };
    }
  }

  // ── Step B: Create a new auto-learned VendorMaster entry ──
  try {
    // Build alias set (unique, uppercased) — always include the Claude-cleaned name
    // plus the raw OCR variation if different. This maximises ALIAS_MATCH hit rate
    // for subsequent scans where OCR returns either form.
    const aliases = [cleanNameUpper];
    if (rawOcrVariation && rawOcrVariation !== cleanNameUpper) aliases.push(rawOcrVariation);

    const created = await VendorMaster.create({
      entity_id: entityId,
      vendor_name: cleanName,
      vendor_aliases: aliases,
      default_coa_code: aiResult.coa_code,
      default_expense_category: aiResult.expense_category || aiResult.coa_name || null,
      is_active: true,
      auto_learned_from_ocr: true,
      learning_source: 'CLAUDE_AI',
      learned_at: new Date(),
      learning_status: 'UNREVIEWED',
      learning_meta: {
        source_doc_type: docType || null,
        source_ocr_text: rawOcrVariation || cleanName,
        source_raw_snippet: (rawOcrText || '').slice(0, guardrails.MAX_RAW_SNIPPET),
        ai_confidence: confidence,
        suggested_coa_code: aiResult.coa_code,
        suggested_category: aiResult.expense_category || null,
        learn_count: 1,
      },
      created_by: userId || null,
      updated_by: userId || null,
    });
    return { action: 'CREATED', vendor_id: created._id, reason: 'NEW_VENDOR' };
  } catch (err) {
    // Possible duplicate-race under concurrent OCR calls — treat as skipped, not an error.
    if (err?.code === 11000) {
      return { action: 'SKIPPED', vendor_id: null, reason: 'DUPLICATE_RACE' };
    }
    return { action: 'SKIPPED', vendor_id: null, reason: `CREATE_FAILED: ${err.message}` };
  }
}

module.exports = {
  learnFromAiResult,
  getGuardrails,
  invalidateGuardrailCache,
  // exported for unit tests / admin diagnostics
  _internal: { isValidCandidateName, normaliseForCompare, FALLBACK_BLOCKLIST, FALLBACK_THRESHOLDS },
};
