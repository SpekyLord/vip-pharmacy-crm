/**
 * CSI Booklet Service — Booklet master, weekly allocation, number validation (Phase 15.2)
 */
const mongoose = require('mongoose');
const CsiBooklet = require('../models/CsiBooklet');

/**
 * Create a new CSI booklet
 */
async function createBooklet(entityId, data, userId) {
  const eId = new mongoose.Types.ObjectId(entityId);

  // Validate no overlapping series for entity
  const overlap = await CsiBooklet.findOne({
    entity_id: eId,
    status: { $ne: 'VOID' },
    $or: [
      { series_start: { $lte: data.series_end }, series_end: { $gte: data.series_start } }
    ]
  });
  if (overlap) {
    throw Object.assign(new Error(`Series overlaps with booklet ${overlap.booklet_code} (${overlap.series_start}-${overlap.series_end})`), { statusCode: 400 });
  }

  const booklet = await CsiBooklet.create({
    entity_id: eId,
    booklet_code: data.booklet_code,
    series_start: data.series_start,
    series_end: data.series_end,
    assigned_to: data.assigned_to || null,
    assigned_at: data.assigned_to ? new Date() : null,
    created_by: userId
  });

  return booklet;
}

/**
 * Allocate a weekly range within a booklet
 */
async function allocateWeek(entityId, bookletId, allocation, userId) {
  const booklet = await CsiBooklet.findOne({
    _id: bookletId,
    entity_id: new mongoose.Types.ObjectId(entityId)
  });
  if (!booklet) throw Object.assign(new Error('Booklet not found'), { statusCode: 404 });
  if (booklet.status === 'VOID') throw Object.assign(new Error('Booklet is voided'), { statusCode: 400 });

  // Validate range within booklet series
  if (allocation.range_start < booklet.series_start || allocation.range_end > booklet.series_end) {
    throw Object.assign(new Error(`Range ${allocation.range_start}-${allocation.range_end} outside booklet series ${booklet.series_start}-${booklet.series_end}`), { statusCode: 400 });
  }

  // Check no overlap with existing allocations
  for (const existing of booklet.allocations) {
    if (allocation.range_start <= existing.range_end && allocation.range_end >= existing.range_start) {
      throw Object.assign(new Error(`Range overlaps with existing allocation ${existing.range_start}-${existing.range_end}`), { statusCode: 400 });
    }
  }

  booklet.allocations.push({
    week_start: allocation.week_start,
    week_end: allocation.week_end,
    range_start: allocation.range_start,
    range_end: allocation.range_end
  });

  await booklet.save();
  return booklet;
}

/**
 * Validate a CSI number belongs to an allocated range for this BDM
 */
async function validateCsiNumber(entityId, bdmId, csiNumber) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const num = Number(csiNumber);

  // Find booklet assigned to this BDM containing the number
  const booklets = await CsiBooklet.find({
    entity_id: eId,
    status: { $ne: 'VOID' },
    series_start: { $lte: num },
    series_end: { $gte: num }
  }).lean();

  for (const booklet of booklets) {
    // Check if BDM is assigned
    if (booklet.assigned_to && booklet.assigned_to.toString() !== bdmId.toString()) continue;

    // Check if number is in an allocated range
    for (let i = 0; i < (booklet.allocations || []).length; i++) {
      const alloc = booklet.allocations[i];
      if (alloc.status === 'RETURNED') continue;
      if (num >= alloc.range_start && num <= alloc.range_end) {
        // Check if already used
        if ((alloc.used_numbers || []).includes(num)) {
          return { valid: false, reason: 'CSI number already used' };
        }
        return { valid: true, booklet_id: booklet._id, allocation_index: i };
      }
    }
  }

  return { valid: false, reason: 'CSI number not in any allocated range for this BDM' };
}

/**
 * Mark a CSI number as used
 */
async function markUsed(entityId, bookletId, csiNumber) {
  const num = Number(csiNumber);
  const booklet = await CsiBooklet.findOne({
    _id: bookletId,
    entity_id: new mongoose.Types.ObjectId(entityId)
  });
  if (!booklet) return;

  for (const alloc of booklet.allocations) {
    if (num >= alloc.range_start && num <= alloc.range_end) {
      if (!alloc.used_numbers.includes(num)) {
        alloc.used_numbers.push(num);
      }
      break;
    }
  }

  await booklet.save();
}

/**
 * Get all booklets for an entity
 */
async function getBooklets(entityId, filters = {}) {
  const query = { entity_id: new mongoose.Types.ObjectId(entityId) };
  if (filters.status) query.status = filters.status;
  if (filters.assigned_to) query.assigned_to = new mongoose.Types.ObjectId(filters.assigned_to);

  const booklets = await CsiBooklet.find(query)
    .populate('assigned_to', 'full_name')
    .sort({ created_at: -1 })
    .lean();

  return booklets;
}

module.exports = {
  createBooklet,
  allocateWeek,
  validateCsiNumber,
  markUsed,
  getBooklets
};
