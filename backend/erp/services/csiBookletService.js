/**
 * CSI Booklet Service — Phase 15.2 (Monitoring + Traceability refactor)
 *
 * Purpose (per CLAUDE-ERP §CSI Booklets):
 *   BIR-registered CSI booklets live at the Iloilo HQ. HQ allocates small number
 *   ranges (3–7 numbers) to remote BDMs. BDMs use those numbers for field sales.
 *   This service provides:
 *     - Booklet master (create)
 *     - Flexible allocation (range only; week dates optional/legacy)
 *     - Per-BDM "available numbers" lookup
 *     - Number validation (monitoring-only — returns {valid, reason}; never throws)
 *     - markUsed (auto-stamp on POSTED sale)
 *     - voidNumber (contractor-only, requires S3 proof upload)
 *
 * NOTE: validateCsiNumber is advisory. Sales posting NEVER blocks on its return.
 * See salesController for the soft-warning integration.
 */
const mongoose = require('mongoose');
const CsiBooklet = require('../models/CsiBooklet');

/**
 * Create a new CSI booklet.
 * Series ranges for an entity cannot overlap (excluding VOID booklets).
 */
async function createBooklet(entityId, data, userId) {
  const eId = new mongoose.Types.ObjectId(entityId);

  const overlap = await CsiBooklet.findOne({
    entity_id: eId,
    status: { $ne: 'VOID' },
    $or: [
      { series_start: { $lte: data.series_end }, series_end: { $gte: data.series_start } }
    ]
  });
  if (overlap) {
    throw Object.assign(
      new Error(`Series overlaps with booklet ${overlap.booklet_code} (${overlap.series_start}-${overlap.series_end})`),
      { statusCode: 400 }
    );
  }

  const booklet = await CsiBooklet.create({
    entity_id: eId,
    booklet_code: data.booklet_code,
    atp_number: data.atp_number || undefined,
    bir_registration_address: data.bir_registration_address || undefined,
    issued_at: data.issued_at || undefined,
    source_warehouse_id: data.source_warehouse_id || undefined,
    series_start: data.series_start,
    series_end: data.series_end,
    assigned_to: data.assigned_to || null,
    assigned_at: data.assigned_to ? new Date() : null,
    created_by: userId
  });

  return booklet;
}

/**
 * Allocate a number range inside a booklet.
 * Week dates (week_start/week_end) are OPTIONAL/legacy — accepted if provided.
 */
async function allocate(entityId, bookletId, allocation) {
  const booklet = await CsiBooklet.findOne({
    _id: bookletId,
    entity_id: new mongoose.Types.ObjectId(entityId)
  });
  if (!booklet) throw Object.assign(new Error('Booklet not found'), { statusCode: 404 });
  if (booklet.status === 'VOID') throw Object.assign(new Error('Booklet is voided'), { statusCode: 400 });

  const rangeStart = Number(allocation.range_start);
  const rangeEnd = Number(allocation.range_end);

  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd < rangeStart) {
    throw Object.assign(new Error('Invalid range: range_start and range_end required, range_end >= range_start'), { statusCode: 400 });
  }

  if (rangeStart < booklet.series_start || rangeEnd > booklet.series_end) {
    throw Object.assign(
      new Error(`Range ${rangeStart}-${rangeEnd} outside booklet series ${booklet.series_start}-${booklet.series_end}`),
      { statusCode: 400 }
    );
  }

  for (const existing of booklet.allocations) {
    if (rangeStart <= existing.range_end && rangeEnd >= existing.range_start) {
      throw Object.assign(
        new Error(`Range overlaps with existing allocation ${existing.range_start}-${existing.range_end}`),
        { statusCode: 400 }
      );
    }
  }

  booklet.allocations.push({
    assigned_to: allocation.assigned_to || undefined,
    week_start: allocation.week_start || undefined,
    week_end: allocation.week_end || undefined,
    range_start: rangeStart,
    range_end: rangeEnd
  });

  // Auto-assign booklet-level if this is the first allocation and booklet has no owner.
  if (!booklet.assigned_to && allocation.assigned_to) {
    booklet.assigned_to = allocation.assigned_to;
    booklet.assigned_at = new Date();
  }

  await booklet.save();
  return booklet;
}

// Backward-compat alias — older callers/routes may still reference this name.
const allocateWeek = allocate;

/**
 * Validate a CSI number — MONITORING ONLY.
 * Returns { valid, reason, booklet_id?, allocation_index? }.
 * Never throws. Callers (Sales) use this to warn, not to block.
 *
 * Iloilo HQ policy: only BDMs outside Iloilo need allocation monitoring. BDMs
 * based at HQ use booklets directly. If the BDM has NO allocations assigned
 * to them in any booklet, we treat them as "unmonitored" and return
 * { valid: true, skipped: true } so no warning is surfaced.
 */
async function validateCsiNumber(entityId, bdmId, csiNumber) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const num = Number(csiNumber);

  if (!Number.isFinite(num)) {
    return { valid: false, reason: 'CSI number is not numeric' };
  }

  // Skip monitoring for BDMs with no allocations (Iloilo-based / unmonitored).
  if (bdmId) {
    const bdmObjectId = new mongoose.Types.ObjectId(bdmId);
    const hasAllocations = await CsiBooklet.exists({
      entity_id: eId,
      status: { $ne: 'VOID' },
      $or: [
        { assigned_to: bdmObjectId },
        { 'allocations.assigned_to': bdmObjectId }
      ]
    });
    if (!hasAllocations) {
      return { valid: true, skipped: true, reason: 'No CSI allocations on file — monitoring skipped' };
    }
  }

  const booklets = await CsiBooklet.find({
    entity_id: eId,
    status: { $ne: 'VOID' },
    series_start: { $lte: num },
    series_end: { $gte: num }
  }).lean();

  for (const booklet of booklets) {
    for (let i = 0; i < (booklet.allocations || []).length; i++) {
      const alloc = booklet.allocations[i];
      if (alloc.status === 'RETURNED') continue;
      if (num < alloc.range_start || num > alloc.range_end) continue;

      // Ownership: allocation-level assigned_to takes precedence; fall back to booklet-level.
      const effectiveOwner = alloc.assigned_to || booklet.assigned_to;
      if (bdmId && effectiveOwner && effectiveOwner.toString() !== bdmId.toString()) {
        // Owner mismatch: this range belongs to a different BDM
        return {
          valid: false,
          reason: `CSI ${num} is allocated to a different BDM`,
          booklet_id: booklet._id,
          allocation_index: i,
          owner_mismatch: true
        };
      }

      // Voided check first — a voided number is the strongest signal (possible fraud)
      const voided = (alloc.voided_numbers || []).find((v) => v.number === num);
      if (voided) {
        const note = voided.reason_note ? ` — ${voided.reason_note}` : '';
        return {
          valid: false,
          reason: `CSI ${num} was VOIDED (${voided.reason}${note}). Physical copy should be destroyed or attached to void proof.`,
          booklet_id: booklet._id,
          allocation_index: i,
          voided: true
        };
      }

      if ((alloc.used_numbers || []).includes(num)) {
        return {
          valid: false,
          reason: `CSI ${num} already used on another sale`,
          booklet_id: booklet._id,
          allocation_index: i,
          used: true
        };
      }

      return { valid: true, booklet_id: booklet._id, allocation_index: i };
    }
  }

  return { valid: false, reason: `CSI ${num} not in any allocated range for this BDM` };
}

/**
 * Mark a CSI number as used on a POSTED sale.
 *
 * Accepts either (entityId, bookletId, csiNumber) — explicit booklet, fast path —
 * or (entityId, null, csiNumber) — search the entity for the booklet containing
 * the number. The null-booklet path is what submitSales uses, since it only
 * knows the CSI number at post time.
 *
 * Refuses to mark a voided number and returns { ok: false, reason }.
 */
async function markUsed(entityId, bookletId, csiNumber) {
  const num = Number(csiNumber);
  if (!Number.isFinite(num)) return { ok: false, reason: 'non-numeric CSI' };

  const eId = new mongoose.Types.ObjectId(entityId);

  let booklet;
  if (bookletId) {
    booklet = await CsiBooklet.findOne({ _id: bookletId, entity_id: eId });
  } else {
    booklet = await CsiBooklet.findOne({
      entity_id: eId,
      status: { $ne: 'VOID' },
      series_start: { $lte: num },
      series_end: { $gte: num }
    });
  }
  if (!booklet) return { ok: false, reason: 'booklet not found for this CSI number' };

  for (const alloc of booklet.allocations) {
    if (num < alloc.range_start || num > alloc.range_end) continue;

    const voided = (alloc.voided_numbers || []).find((v) => v.number === num);
    if (voided) {
      return { ok: false, reason: `CSI ${num} is VOIDED — cannot mark used` };
    }

    if (!alloc.used_numbers.includes(num)) {
      alloc.used_numbers.push(num);
    }
    await booklet.save();
    return { ok: true, booklet_id: booklet._id };
  }

  return { ok: false, reason: 'number not in any allocation range' };
}

/**
 * Unmark a CSI number as used — called when a POSTED CSI sale is reopened (SAP Storno).
 * Idempotent. Never throws into the caller; returns { ok }.
 */
async function unmarkUsed(entityId, csiNumber) {
  const num = Number(csiNumber);
  if (!Number.isFinite(num)) return { ok: false, reason: 'non-numeric CSI' };

  const eId = new mongoose.Types.ObjectId(entityId);
  const booklet = await CsiBooklet.findOne({
    entity_id: eId,
    status: { $ne: 'VOID' },
    series_start: { $lte: num },
    series_end: { $gte: num }
  });
  if (!booklet) return { ok: false, reason: 'booklet not found' };

  for (const alloc of booklet.allocations) {
    if (num < alloc.range_start || num > alloc.range_end) continue;
    const idx = (alloc.used_numbers || []).indexOf(num);
    if (idx !== -1) {
      alloc.used_numbers.splice(idx, 1);
      await booklet.save();
      return { ok: true };
    }
  }
  return { ok: false, reason: 'number was not marked used' };
}

/**
 * Void a CSI number (contractor action). Requires proof_url (S3 key).
 * Refuses to void an already-used or already-voided number.
 */
async function voidNumber(entityId, bookletId, allocationIndex, number, { reason, reason_note, proof_url, proof_key }, userId) {
  if (!reason) throw Object.assign(new Error('reason is required'), { statusCode: 400 });
  if (!proof_url) throw Object.assign(new Error('proof image upload is required to void a CSI number'), { statusCode: 400 });

  const num = Number(number);
  if (!Number.isFinite(num)) throw Object.assign(new Error('Invalid CSI number'), { statusCode: 400 });

  const booklet = await CsiBooklet.findOne({
    _id: bookletId,
    entity_id: new mongoose.Types.ObjectId(entityId)
  });
  if (!booklet) throw Object.assign(new Error('Booklet not found'), { statusCode: 404 });
  if (booklet.status === 'VOID') throw Object.assign(new Error('Booklet is voided'), { statusCode: 400 });

  const alloc = booklet.allocations[allocationIndex];
  if (!alloc) throw Object.assign(new Error('Allocation not found'), { statusCode: 404 });

  if (num < alloc.range_start || num > alloc.range_end) {
    throw Object.assign(new Error(`CSI ${num} is not inside allocation range ${alloc.range_start}-${alloc.range_end}`), { statusCode: 400 });
  }

  if ((alloc.used_numbers || []).includes(num)) {
    throw Object.assign(new Error(`CSI ${num} has already been used — cannot void`), { statusCode: 400 });
  }

  if ((alloc.voided_numbers || []).some((v) => v.number === num)) {
    throw Object.assign(new Error(`CSI ${num} has already been voided`), { statusCode: 400 });
  }

  alloc.voided_numbers.push({
    number: num,
    reason,
    reason_note: reason_note || '',
    proof_url,
    proof_key: proof_key || '',
    voided_by: userId,
    voided_at: new Date()
  });

  await booklet.save();
  return booklet;
}

/**
 * Get available CSI numbers for a BDM.
 * Returns a flat sorted array: [{ booklet_id, booklet_code, allocation_id, allocation_index, number }].
 * If bdmId is null, returns available numbers for ALL booklets in the entity (admin view).
 */
async function getAvailableForBdm(entityId, bdmId) {
  const query = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    status: { $ne: 'VOID' }
  };
  // NOTE: we do NOT pre-filter by booklet.assigned_to because ownership may
  // live at the allocation level. We filter per-allocation below.

  const booklets = await CsiBooklet.find(query)
    .populate('assigned_to', 'name full_name')
    .populate('allocations.assigned_to', 'name full_name')
    .lean();

  const bdmStr = bdmId ? bdmId.toString() : null;
  const available = [];
  for (const booklet of booklets) {
    for (let i = 0; i < (booklet.allocations || []).length; i++) {
      const alloc = booklet.allocations[i];
      if (alloc.status === 'RETURNED') continue;

      // Effective owner: allocation-level wins; fall back to booklet-level
      const owner = alloc.assigned_to || booklet.assigned_to;
      const ownerId = owner?._id ? owner._id.toString() : (owner ? owner.toString() : null);
      if (bdmStr && ownerId && ownerId !== bdmStr) continue;
      // If bdmStr set but allocation has NO owner at all, skip (would expose unassigned ranges)
      if (bdmStr && !ownerId) continue;

      const usedSet = new Set(alloc.used_numbers || []);
      const voidedSet = new Set((alloc.voided_numbers || []).map((v) => v.number));
      for (let n = alloc.range_start; n <= alloc.range_end; n += 1) {
        if (usedSet.has(n) || voidedSet.has(n)) continue;
        available.push({
          booklet_id: booklet._id,
          booklet_code: booklet.booklet_code,
          allocation_id: alloc._id,
          allocation_index: i,
          number: n,
          assigned_to: ownerId,
          assigned_to_name: owner?.name || owner?.full_name || null
        });
      }
    }
  }

  available.sort((a, b) => a.number - b.number);
  return available;
}

/**
 * Get all booklets for an entity (admin view / Usage tab).
 * Does not strip voided_numbers details — caller may sign proof URLs before sending.
 */
async function getBooklets(entityId, filters = {}) {
  const query = { entity_id: new mongoose.Types.ObjectId(entityId) };
  if (filters.status) query.status = filters.status;
  if (filters.assigned_to) query.assigned_to = new mongoose.Types.ObjectId(filters.assigned_to);

  const booklets = await CsiBooklet.find(query)
    .populate('assigned_to', 'name full_name')
    .populate('allocations.assigned_to', 'name full_name')
    .sort({ created_at: -1 })
    .lean();

  return booklets;
}

module.exports = {
  createBooklet,
  allocate,
  allocateWeek, // backward-compat alias
  validateCsiNumber,
  markUsed,
  unmarkUsed,
  voidNumber,
  getAvailableForBdm,
  getBooklets
};
