/**
 * Doctor (VIP-Client) Merge Controller — Phase A.5.5 (Apr 2026).
 *
 * Endpoints:
 *   GET    /api/admin/md-merge/candidates        — find duplicate canonical-key groups
 *   POST   /api/admin/md-merge/preview           — read-only cascade preview
 *   POST   /api/admin/md-merge/execute           — perform the merge + write audit
 *   GET    /api/admin/md-merge/history           — list past merges (rollback queue)
 *   POST   /api/admin/md-merge/rollback/:auditId — undo a merge within 30-day grace
 *
 * Every endpoint role-gates via VIP_CLIENT_LIFECYCLE_ROLES lookup (Rule #3).
 * Defaults are admin + president. Subscribers loosen via Control Center →
 * Lookup Tables → VIP_CLIENT_LIFECYCLE_ROLES (Rule #19).
 *
 * Wiring chain: Doctor model → cascade manifest → mergeService →
 *   THIS controller → doctorMergeRoutes.js → server.js mount → Sidebar
 *   /admin/md-merge link → App.jsx route → MdMergePage.jsx → mdMergeService.js.
 */

const { catchAsync, ForbiddenError, ValidationError, NotFoundError } = require('../middleware/errorHandler');
const mergeService = require('../services/doctorMergeService');
const {
  getViewMergeToolRoles,
  getExecuteMergeRoles,
  getRollbackMergeRoles,
} = require('../utils/resolveVipClientLifecycleRole');
const { ROLES } = require('../constants/roles');

async function gateRole(req, getRolesFn) {
  if (!req.user) throw new ForbiddenError('Authentication required');
  // President bypass — universal Rule 20.
  if (req.user.role === ROLES.PRESIDENT) return;
  const allowed = await getRolesFn(req.entityId || null);
  if (!allowed.includes(req.user.role)) {
    throw new ForbiddenError(
      `Role "${req.user.role}" not authorized for this VIP-Client lifecycle action. ` +
      `Allowed roles: ${allowed.join(', ')}. ` +
      `Configure via Control Center → Lookup Tables → VIP_CLIENT_LIFECYCLE_ROLES.`,
    );
  }
}

const candidates = catchAsync(async (req, res) => {
  await gateRole(req, getViewMergeToolRoles);
  const search = (req.query.search || '').toString();
  const limit = parseInt(req.query.limit, 10) || 100;
  const groups = await mergeService.findCandidates({ search, limit });
  res.json({
    success: true,
    data: { groups, count: groups.length },
  });
});

const preview = catchAsync(async (req, res) => {
  await gateRole(req, getViewMergeToolRoles);
  const { winnerId, loserId } = req.body || {};
  if (!winnerId || !loserId) {
    throw new ValidationError('Both winnerId and loserId are required');
  }
  const result = await mergeService.previewMerge({ winnerId, loserId });
  res.json({ success: true, data: result });
});

const execute = catchAsync(async (req, res) => {
  await gateRole(req, getExecuteMergeRoles);
  const { winnerId, loserId, reason } = req.body || {};
  if (!winnerId || !loserId) {
    throw new ValidationError('Both winnerId and loserId are required');
  }
  if (!reason || !reason.trim()) {
    throw new ValidationError('Merge reason is required for the audit trail');
  }
  const actor = {
    _id: req.user._id,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || null,
  };
  const result = await mergeService.executeMerge({
    winnerId,
    loserId,
    reason: reason.trim(),
    actor,
  });
  res.json({
    success: true,
    message: 'Merge applied. Loser soft-deleted; rollback available for 30 days.',
    data: result,
  });
});

const history = catchAsync(async (req, res) => {
  await gateRole(req, getViewMergeToolRoles);
  const { status, limit } = req.query || {};
  const rows = await mergeService.listAuditHistory({
    status: status ? String(status) : null,
    limit: parseInt(limit, 10) || 50,
  });
  res.json({ success: true, data: { rows, count: rows.length } });
});

const rollback = catchAsync(async (req, res) => {
  await gateRole(req, getRollbackMergeRoles);
  const { auditId } = req.params;
  const { reason } = req.body || {};
  if (!auditId) throw new ValidationError('auditId is required');
  if (!reason || !reason.trim()) {
    throw new ValidationError('Rollback reason is required for the audit trail');
  }
  try {
    const result = await mergeService.rollbackMerge({
      auditId,
      reason: reason.trim(),
      actor: { _id: req.user._id },
    });
    res.json({
      success: true,
      message: 'Merge rolled back. Loser restored; cascade reversed.',
      data: result,
    });
  } catch (err) {
    // Service throws plain Error — surface a clean 400/404 instead of 500.
    if (/not found/i.test(err.message)) throw new NotFoundError(err.message);
    throw new ValidationError(err.message);
  }
});

module.exports = {
  candidates,
  preview,
  execute,
  history,
  rollback,
};
