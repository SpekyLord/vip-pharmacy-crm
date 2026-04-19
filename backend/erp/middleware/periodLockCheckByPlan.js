const PeriodLock = require('../models/PeriodLock');
const SalesGoalPlan = require('../models/SalesGoalPlan');

/**
 * Phase SG-Q2 W4 — Period-lock check for plan-spanning Sales Goal routes.
 *
 * The standard `periodLockCheck(moduleKey)` middleware reads a single period
 * (`req.body.period` YYYY-MM, or a date field) and rejects writes to that
 * locked month. That works for routes like `/snapshots/compute` and
 * `/kpi/manual` where the caller specifies a target period.
 *
 * Plan-lifecycle routes (activate / reopen / close / targets-bulk /
 * targets-import) operate on a SalesGoalPlan that spans an entire
 * fiscal_year. The relevant guarantee is: refuse the operation if ANY month
 * of that fiscal year is locked for the moduleKey. This middleware fetches
 * the plan, then queries PeriodLock once for any locked month in the year.
 *
 * Plan id is read from `req.params.id` (preferred — matches `/plans/:id/...`
 * route pattern) or `req.body.plan_id` (used by /targets/bulk + /targets/import).
 *
 * Behavior:
 *   - Only enforces on POST/PUT/PATCH.
 *   - If plan id missing or plan not found → next() (let the controller
 *     return 400/404 with its own message; we don't pre-empt validation).
 *   - If `req.entityId` missing → next() (mirrors periodLockCheck.js fallback;
 *     tenantFilter populates it for /api/erp/* — this is defense in depth).
 *   - Returns 403 with the locked month name in the error message.
 */
function periodLockCheckByPlan(moduleKey) {
  return async (req, res, next) => {
    try {
      if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

      const planId = req.params.id || req.body.plan_id;
      if (!planId) return next();

      const entityId = req.entityId;
      if (!entityId) return next();

      const plan = await SalesGoalPlan.findOne({ _id: planId, entity_id: entityId })
        .select('fiscal_year').lean();
      if (!plan || !plan.fiscal_year) return next();

      const lock = await PeriodLock.findOne({
        entity_id: entityId,
        module: moduleKey,
        year: plan.fiscal_year,
        is_locked: true
      }).select('month').lean();

      if (lock) {
        const monthName = new Date(plan.fiscal_year, lock.month - 1)
          .toLocaleString('en', { month: 'long' });
        return res.status(403).json({
          success: false,
          message: `Period ${monthName} ${plan.fiscal_year} is locked for ${moduleKey}. `
            + `Unlock the period in Control Center → Period Locks before this operation.`
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = periodLockCheckByPlan;
