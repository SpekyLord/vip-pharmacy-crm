/**
 * Document Numbering Service — Central engine for all ERP document numbers.
 *
 * Format: {DOC_PREFIX}-{CODE}{MMDDYY}-{NNN}
 *   CODE is either a territory code (BDM workflow) or an entity code (cross-entity workflow).
 *   Examples:
 *     - CALF-ILO040326-001  (territory-scoped: CALF + Iloilo territory)
 *     - ICT-VIP040326-001   (entity-scoped: Inter-Company Transfer + VIP)
 *     - JE-MGCO040326-003   (entity-scoped Journal Entry)
 *
 * Used by: CALF/PRF/PO/CN/SVC/RCT/PCF/REM/DS (territory) + JE/ICT (entity).
 *   - Territory code from Territory collection (admin-managed, resolved via BDM).
 *   - Entity code from Entity.short_name (admin-editable, cached + invalidated on rename).
 *   - Sequence from DocSequence collection (atomic upsert, collision-safe).
 */
const DocSequence = require('../models/DocSequence');
const Territory = require('../models/Territory');
const Entity = require('../models/Entity');

/**
 * Format date as MMDDYY
 * @param {Date} date
 * @returns {String} e.g., "040326" for April 3 2026
 */
function formatMMDDYY(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}${dd}${yy}`;
}

/**
 * Generate a document number using territory OR entity code + date + sequence.
 *
 * Two resolution modes (mutually exclusive — pick whichever fits the module):
 *   - **Territory-scoped** (CALF/PRF/PO/CN/SVC/RCT/PCF/REM/DS): pass `bdmId` so
 *     the helper looks up `Territory.getCodeForBdm(bdmId)`. Historic default.
 *   - **Entity-scoped** (ICT, and any future cross-entity doc): pass `entityId`
 *     so the helper uses `getEntityCode(entityId)` — same cache as JE numbers.
 *     Use this when the doc flows between entities and a BDM/territory doesn't
 *     represent the right sequencing boundary.
 *
 * Resolution priority when more than one is provided:
 *   1. `territoryCode` (explicit override — skips all lookups)
 *   2. `bdmId` → Territory lookup
 *   3. `entityId` → Entity.short_name lookup (cached)
 *   4. `fallbackCode`
 *
 * @param {Object} options
 * @param {String} options.prefix — document type prefix (CALF, PRF, PO, ICT, etc.)
 * @param {ObjectId|String} [options.bdmId] — BDM user ID (to look up territory)
 * @param {ObjectId|String} [options.entityId] — Entity ID (to look up short_name)
 * @param {String} [options.territoryCode] — explicit code override (skip lookups)
 * @param {Date} [options.date] — document date (default: now)
 * @param {String} [options.fallbackCode] — fallback if no code resolved (default: 'XXX')
 * @returns {Promise<String>} e.g., "CALF-ILO040326-001" or "ICT-VIP040326-001"
 */
async function generateDocNumber({ prefix, bdmId, entityId, territoryCode, date, fallbackCode = 'XXX' }) {
  // Resolve code: explicit override > BDM territory > entity short_name > fallback
  let code = territoryCode;
  if (!code && bdmId) {
    code = await Territory.getCodeForBdm(bdmId);
  }
  if (!code && entityId) {
    code = await getEntityCode(entityId);
  }
  if (!code) code = fallbackCode;

  // Format date
  const dateStr = formatMMDDYY(date || new Date());

  // Get next sequence atomically
  const seqKey = `${prefix}-${code}-${dateStr}`;
  const seq = await DocSequence.getNext(seqKey);
  const seqStr = String(seq).padStart(3, '0');

  return `${prefix}-${code}${dateStr}-${seqStr}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Entity-scoped code resolution (for JE and other non-territory doc types)
// ──────────────────────────────────────────────────────────────────────────────

// In-memory cache keyed by entity_id → short_name. Entity short_name is set by
// admin and rarely changes; invalidate via `invalidateEntityCodeCache(entityId)`
// from the Entity update/delete controllers if you add mutation paths there.
const _entityCodeCache = new Map();

/**
 * Resolve a short, ASCII-uppercase entity code for use in doc numbers. Pulls
 * `Entity.short_name` (admin-configurable) and sanitizes it. Falls back to the
 * first 3 chars of the entity _id when short_name is blank so numbers still
 * generate during bootstrapping (admin can rename later).
 */
async function getEntityCode(entityId) {
  if (!entityId) return 'XXX';
  const key = String(entityId);
  if (_entityCodeCache.has(key)) return _entityCodeCache.get(key);

  const ent = await Entity.findById(entityId).select('short_name').lean();
  const raw = (ent?.short_name || '').toString().trim();
  // Strip non-alphanumerics, uppercase, clamp to 8 chars so numbers stay compact
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  const code = clean || key.slice(-3).toUpperCase();
  _entityCodeCache.set(key, code);
  return code;
}

function invalidateEntityCodeCache(entityId) {
  if (entityId) _entityCodeCache.delete(String(entityId));
  else _entityCodeCache.clear();
}

/**
 * Generate a Journal Entry number in the project's standard doc-sequencing
 * format: `JE-{ENTITY_CODE}{MMDDYY}-{NNN}` (e.g. `JE-VIP040326-001`).
 *
 * - Entity code comes from `Entity.short_name` (lookup-driven, admin-editable),
 *   so subsidiaries get their own prefix without a code change.
 * - MMDDYY matches CALF/PRF/PO/etc. already generated via `generateDocNumber`.
 * - Sequence is per-entity-per-day, atomic via DocSequence. Gaps on deleted
 *   DRAFT JEs are acceptable (same semantics as existing doc numbers).
 *
 * @param {Object} options
 * @param {String|ObjectId} options.entityId
 * @param {Date}   [options.date] — JE date (default: now)
 * @returns {Promise<String>} formatted JE number
 */
async function generateJeNumber({ entityId, date }) {
  const code = await getEntityCode(entityId);
  const dateStr = formatMMDDYY(date || new Date());
  const seqKey = `JE-${code}-${dateStr}`;
  const seq = await DocSequence.getNext(seqKey);
  const seqStr = String(seq).padStart(3, '0');
  return `JE-${code}${dateStr}-${seqStr}`;
}

/**
 * Format date as YYMM (e.g. "2604" for April 2026).
 */
function formatYYMM(date) {
  const d = new Date(date);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

/**
 * Generate a Sales Goal Plan reference number.
 *
 * Format: `SG-{ENTITY_CODE}{YYMM}-{NNN}` (e.g. `SG-VIP2604-001`).
 *
 * Plans are annual/quarterly, so YYMM is more informative than MMDDYY —
 * it answers "which month was this plan activated" without needing the day.
 * Sequence is per-entity-per-month, atomic via DocSequence. Matches the
 * generateJeNumber pattern for consistency.
 *
 * @param {Object} options
 * @param {String|ObjectId} options.entityId
 * @param {Date} [options.date] — activation date (default: now)
 * @returns {Promise<String>}
 */
async function generateSalesGoalNumber({ entityId, date }) {
  const code = await getEntityCode(entityId);
  const monthStr = formatYYMM(date || new Date());
  const seqKey = `SG-${code}-${monthStr}`;
  const seq = await DocSequence.getNext(seqKey);
  const seqStr = String(seq).padStart(3, '0');
  return `SG-${code}${monthStr}-${seqStr}`;
}

module.exports = {
  generateDocNumber,
  formatMMDDYY,
  formatYYMM,
  generateJeNumber,
  generateSalesGoalNumber,
  getEntityCode,
  invalidateEntityCodeCache,
};
