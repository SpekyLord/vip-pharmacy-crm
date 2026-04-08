/**
 * Tenant Filtering Middleware for ERP routes
 *
 * Runs AFTER protect (auth) middleware. Reads entity_id from req.user
 * and attaches tenant context to the request for use by ERP controllers.
 *
 * Access levels:
 * - president/ceo: no entity filter (sees all entities)
 *     Reads X-Entity-Id header to set req.entityId for create operations.
 * - multi-entity users (entity_ids.length > 1): can switch via X-Entity-Id
 *     header, validated against their allowed entity list.
 * - admin/finance: filter by entity_id only
 * - employee (BDM): filter by entity_id AND bdm_id
 * - no entity_id on user: skip filtering (backward compat with CRM-only users)
 */
const mongoose = require('mongoose');

const tenantFilter = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { role, entity_id, entity_ids, _id } = req.user;

  // Attach tenant context — prefer entity_id (primary), fallback to first entity_ids entry
  req.entityId = entity_id || (entity_ids && entity_ids.length > 0 ? entity_ids[0] : null);
  req.bdmId = _id;
  req.isAdmin = role === 'admin';
  req.isFinance = role === 'finance';
  req.isPresident = role === 'president' || role === 'ceo';

  // Build allowed entity set for header validation (multi-entity users)
  const allowedSet = new Set();
  if (entity_ids && entity_ids.length > 0) {
    entity_ids.forEach(id => allowedSet.add(id.toString()));
  }
  if (entity_id) allowedSet.add(entity_id.toString());
  const isMultiEntity = allowedSet.size > 1;

  // President/CEO sees all entities — no query filter
  // Use X-Entity-Id header to determine which entity to stamp on creates
  if (req.isPresident) {
    req.tenantFilter = {};
    const headerEntityId = req.headers['x-entity-id'];
    if (headerEntityId && /^[a-f\d]{24}$/i.test(headerEntityId)) {
      req.entityId = new mongoose.Types.ObjectId(headerEntityId);
    }
    return next();
  }

  // Multi-entity users: allow X-Entity-Id header if value is in their allowed list
  if (isMultiEntity) {
    const headerEntityId = req.headers['x-entity-id'];
    if (headerEntityId && /^[a-f\d]{24}$/i.test(headerEntityId) && allowedSet.has(headerEntityId)) {
      req.entityId = new mongoose.Types.ObjectId(headerEntityId);
    }
    // else: keep primary entity_id (already set above)
  } else {
    // Single-entity users: strip header to prevent spoofing
    delete req.headers['x-entity-id'];
  }

  // If user has no entity_id assigned, skip entity filtering
  // (backward compat for CRM users not yet assigned to an entity)
  if (!req.entityId) {
    req.tenantFilter = {};
    return next();
  }

  // Admin/Finance: filter by working entity only
  if (req.isAdmin || req.isFinance) {
    req.tenantFilter = { entity_id: req.entityId };
    return next();
  }

  // BDM (employee): filter by working entity AND own bdm_id
  req.tenantFilter = { entity_id: req.entityId, bdm_id: _id };
  next();
};

module.exports = tenantFilter;
