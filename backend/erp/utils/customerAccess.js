/**
 * Customer Access Utility — BDM-Tag-Driven
 *
 * Shared filter logic for customer queries. BDMs see only customers where their
 * _id appears in an active `tagged_bdms` row. Admin-like roles see all.
 *
 * Mirror of hospitalAccess.js — keep the two shapes aligned so any future
 * PII/by-ID hardening pass can treat both globally-shared masters identically.
 *
 * Usage:
 *   const { buildCustomerAccessFilter } = require('../utils/customerAccess');
 *   const accessFilter = await buildCustomerAccessFilter(req.user);
 *   const customer = await Customer.findOne({ _id, ...accessFilter });
 */
const { isAdminLike } = require('../../constants/roles');

async function buildCustomerAccessFilter(user) {
  if (!user || isAdminLike(user.role)) return {};
  return {
    tagged_bdms: {
      $elemMatch: { bdm_id: user._id, is_active: { $ne: false } }
    }
  };
}

async function getAccessibleCustomerIds(user) {
  const Customer = require('../models/Customer');
  const filter = { status: 'ACTIVE', ...(await buildCustomerAccessFilter(user)) };
  const customers = await Customer.find(filter).select('_id').lean();
  return customers.map(c => c._id);
}

module.exports = { buildCustomerAccessFilter, getAccessibleCustomerIds };
