/**
 * Phase A.5.4 — Shape-agnostic Doctor assignee access helpers.
 *
 * Doctor.assignedTo is an array of User ObjectIds (post-A.5.4). These helpers
 * normalize across the shapes a caller may encounter at runtime:
 *   - populated array  : assignedTo: [{ _id, name, email }, ...]
 *   - unpopulated array: assignedTo: [ObjectId, ...]
 *   - legacy scalar    : assignedTo: ObjectId (pre-A.5.4 docs the migration
 *                        will sweep; helpers tolerate it as a single-element
 *                        array so a stale read doesn't deny access)
 *
 * Use these instead of:
 *   const assignedToId = doctor.assignedTo?._id || doctor.assignedTo;
 *   if (assignedToId.toString() !== req.user._id.toString()) ...
 *
 * That pre-A.5.4 pattern silently miscompares against array shapes and is the
 * exact bug A.5.4 closes.
 */

function normalizeUserId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value._id) return value._id.toString();
  if (typeof value.toString === 'function') return value.toString();
  return null;
}

/**
 * Return every assignee ID on the doctor as a string array.
 * Works for populated array, unpopulated array, or legacy scalar.
 */
function getAssigneeIds(doctor) {
  if (!doctor) return [];
  const raw = doctor.assignedTo;
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw.map(normalizeUserId).filter(Boolean);
  }
  const id = normalizeUserId(raw);
  return id ? [id] : [];
}

/**
 * Is `userId` one of the doctor's assignees? Shape-agnostic.
 * Returns false for falsy input rather than throwing.
 */
function isAssignedTo(doctor, userId) {
  if (!userId) return false;
  const target = normalizeUserId(userId);
  if (!target) return false;
  return getAssigneeIds(doctor).includes(target);
}

/**
 * Resolve the primary (canonical) assignee — the BDM who "owns" this VIP
 * Client for ownership-style operations (auto-reply send-as user, default
 * owner on rebate routing, default name shown when only one BDM is rendered).
 *
 * Resolution order:
 *   1. doctor.primaryAssignee (the scalar we always keep in sync via pre-save)
 *   2. first element of assignedTo[]
 *   3. null if neither is set
 *
 * Returns a string ID (or null) — populated callers can re-fetch the user if
 * they need name/email.
 */
function getPrimaryAssigneeId(doctor) {
  if (!doctor) return null;
  const primary = normalizeUserId(doctor.primaryAssignee);
  if (primary) return primary;
  const ids = getAssigneeIds(doctor);
  return ids[0] || null;
}

/**
 * Resolve the primary assignee as the populated user object when available,
 * otherwise as a bare ObjectId/string. Used by routes that previously did
 * `doctor.populate('assignedTo', 'name email')` and then read `.name`.
 *
 * Caller is responsible for populating `assignedTo` before invoking — this
 * helper does NOT trigger a fetch.
 */
function getPrimaryAssigneeObject(doctor) {
  if (!doctor) return null;
  const raw = doctor.assignedTo;
  if (Array.isArray(raw) && raw.length > 0) {
    // Prefer the populated entry whose _id matches primaryAssignee
    const primaryId = normalizeUserId(doctor.primaryAssignee);
    if (primaryId) {
      const match = raw.find((u) => normalizeUserId(u) === primaryId);
      if (match) return match;
    }
    return raw[0];
  }
  if (raw && !Array.isArray(raw)) return raw; // legacy scalar
  return null;
}

module.exports = {
  normalizeUserId,
  getAssigneeIds,
  isAssignedTo,
  getPrimaryAssigneeId,
  getPrimaryAssigneeObject,
};
