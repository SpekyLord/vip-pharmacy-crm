/**
 * Tenant Filtering Middleware for ERP routes
 *
 * Runs AFTER protect (auth) middleware. Reads entity_id from req.user
 * and attaches tenant context to the request for use by ERP controllers.
 *
 * Access levels:
 * - president/ceo: no entity filter (sees all entities)
 * - admin/finance: filter by entity_id only
 * - employee (BDM): filter by entity_id AND bdm_id
 * - no entity_id on user: skip filtering (backward compat with CRM-only users)
 */
const tenantFilter = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const { role, entity_id, _id } = req.user;

  // Attach tenant context
  req.entityId = entity_id || null;
  req.bdmId = _id;
  req.isAdmin = role === 'admin';
  req.isFinance = role === 'finance';
  req.isPresident = role === 'president' || role === 'ceo';

  // President/CEO sees all entities — no filter
  if (req.isPresident) {
    req.tenantFilter = {};
    return next();
  }

  // If user has no entity_id assigned, skip entity filtering
  // (backward compat for CRM users not yet assigned to an entity)
  if (!entity_id) {
    req.tenantFilter = {};
    return next();
  }

  // Admin/Finance: filter by entity only
  if (req.isAdmin || req.isFinance) {
    req.tenantFilter = { entity_id };
    return next();
  }

  // BDM (employee): filter by entity AND own bdm_id
  req.tenantFilter = { entity_id, bdm_id: _id };
  next();
};

module.exports = tenantFilter;
