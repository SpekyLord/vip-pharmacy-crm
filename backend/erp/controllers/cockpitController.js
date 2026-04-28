/**
 * Cockpit Controller — Phase EC-1 (Apr 2026).
 *
 * Single read-only endpoint for the Executive Cockpit at /erp/cockpit.
 * Aggregates 6 Tier-1 + 4 Tier-2 tiles via cockpitService.getCockpit().
 *
 * Authorization: page-level VIEW_COCKPIT gate is applied at the route layer
 * (requireCockpitRole). Tile-level visibility (financial vs operational) is
 * resolved INSIDE the controller based on the caller's roles — never trust
 * the client-supplied scopes flag.
 *
 * Why one endpoint instead of one-per-tile:
 *   - Cockpit is a single render; one trip is faster than 10.
 *   - Per-tile error isolation is preserved by Promise.allSettled in the
 *     service — a failing tile returns `{ status: 'error' }`, the rest render.
 *   - Adding a tile requires zero new routes (Rule #3 alignment).
 *
 * Read-only: no period-lock check, no audit log entry. Strictly idempotent.
 */
const { catchAsync } = require('../../middleware/errorHandler');
const { getCockpit } = require('../services/cockpitService');
const { userHasCockpitRole } = require('../../utils/executiveCockpitAccess');

/**
 * GET /api/erp/cockpit
 * Returns: { success, data: { generated_at, entity_id, scopes, tiles: { code: { status, tier, scope, value? | message? } } } }
 */
exports.getCockpitData = catchAsync(async (req, res) => {
  // Resolve per-scope visibility from the lookup-driven role gate.
  // President with VIEW_COCKPIT gets both by default (the lookup rows
  // include president in all three codes' role lists).
  const [includeFinancial, includeOperational] = await Promise.all([
    userHasCockpitRole(req, 'VIEW_FINANCIAL'),
    userHasCockpitRole(req, 'VIEW_OPERATIONAL'),
  ]);

  // Defensive: if the user holds VIEW_COCKPIT but neither scope (admin
  // misconfigured the lookup), fall back to financial only so the page
  // doesn't render empty. Better to show *something* with a warning the
  // user can act on. The frontend renders an info banner when both
  // scope flags arrive false despite the page being reachable.
  const safeFinancial = includeFinancial || (!includeFinancial && !includeOperational);

  const data = await getCockpit({
    entityId: req.entityId || null,
    bdmId: req.bdmId || null,
    isAdmin: !!req.isAdmin,
    isPresident: !!req.isPresident,
    includeFinancial: safeFinancial,
    includeOperational,
  });

  res.json({ success: true, data });
});
