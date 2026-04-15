/**
 * Hospital Access Utility — Warehouse-Driven
 *
 * Shared filter logic for hospital queries across controllers.
 * BDMs see hospitals via warehouse_ids (primary) + tagged_bdms (legacy fallback).
 * Admin-like roles see all hospitals.
 *
 * Usage:
 *   const { buildHospitalAccessFilter } = require('../utils/hospitalAccess');
 *   const accessFilter = await buildHospitalAccessFilter(req.user);
 *   const hospitals = await Hospital.find({ ...baseFilter, ...accessFilter });
 */
const Warehouse = require('../models/Warehouse');
const { isAdminLike } = require('../../constants/roles');

/**
 * Build the MongoDB filter conditions for hospital access based on user role.
 * @param {Object} user - req.user (must have _id and role)
 * @returns {Object} MongoDB filter to merge into Hospital.find() query
 */
async function buildHospitalAccessFilter(user) {
  if (!user || isAdminLike(user.role)) return {}; // no filter for admin-like roles

  // Find warehouses this BDM is assigned to (manager or assigned_user)
  const myWarehouses = await Warehouse.find({
    is_active: true,
    $or: [{ manager_id: user._id }, { assigned_users: user._id }]
  }).select('_id').lean();
  const myWhIds = myWarehouses.map(w => w._id);

  if (myWhIds.length > 0) {
    // Primary: warehouse_ids match. Fallback: legacy tagged_bdms
    return {
      $or: [
        { warehouse_ids: { $in: myWhIds } },
        { tagged_bdms: { $elemMatch: { bdm_id: user._id, is_active: { $ne: false } } } }
      ]
    };
  }

  // No warehouse assignment — fall back to tagged_bdms only
  return {
    tagged_bdms: { $elemMatch: { bdm_id: user._id, is_active: { $ne: false } } }
  };
}

/**
 * Get the list of hospital IDs accessible to a user.
 * Useful for KPI/dashboard queries that need a count or ID list.
 * @param {Object} user - req.user
 * @returns {Array<ObjectId>} hospital IDs
 */
async function getAccessibleHospitalIds(user) {
  const Hospital = require('../models/Hospital');
  const filter = { status: 'ACTIVE', ...(await buildHospitalAccessFilter(user)) };
  const hospitals = await Hospital.find(filter).select('_id').lean();
  return hospitals.map(h => h._id);
}

module.exports = { buildHospitalAccessFilter, getAccessibleHospitalIds };
