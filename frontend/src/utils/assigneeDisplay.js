/**
 * Phase A.5.4 — Shape-agnostic frontend helpers for Doctor.assignedTo.
 *
 * Doctor.assignedTo is now an array of populated User objects (or unpopulated
 * ObjectIds). UI surfaces that need ONE BDM (table row, form dropdown) should
 * use the primary helper; surfaces that show every assignee should iterate the
 * array directly.
 */

function pickPrimary(doctor) {
  if (!doctor) return null;
  const raw = doctor.assignedTo;
  if (Array.isArray(raw) && raw.length > 0) {
    // Prefer the entry whose _id matches primaryAssignee, else first
    if (doctor.primaryAssignee) {
      const primaryId = doctor.primaryAssignee._id || doctor.primaryAssignee;
      const match = raw.find((u) => (u && (u._id || u)) && String(u._id || u) === String(primaryId));
      if (match) return match;
    }
    return raw[0];
  }
  // Legacy scalar (defensive — pre-A.5.4)
  return raw || null;
}

export function getPrimaryAssigneeName(doctor) {
  const u = pickPrimary(doctor);
  if (!u) return '';
  if (typeof u === 'string') return ''; // unpopulated ObjectId
  return u.name || '';
}

export function getPrimaryAssigneeId(doctor) {
  const u = pickPrimary(doctor);
  if (!u) return '';
  if (typeof u === 'string') return u;
  return u._id || '';
}

export function getAllAssigneeNames(doctor) {
  if (!doctor) return [];
  const raw = doctor.assignedTo;
  if (!Array.isArray(raw)) {
    const single = raw && typeof raw === 'object' ? raw.name : '';
    return single ? [single] : [];
  }
  return raw.map((u) => (typeof u === 'object' && u && u.name) ? u.name : '').filter(Boolean);
}

export default { pickPrimary, getPrimaryAssigneeName, getPrimaryAssigneeId, getAllAssigneeNames };
