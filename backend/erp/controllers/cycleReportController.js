/**
 * Cycle Report Controller — Phase 15.3
 */
const { catchAsync } = require('../../middleware/errorHandler');
const svc = require('../services/cycleReportService');

const generate = catchAsync(async (req, res) => {
  const { bdm_id, period, cycle } = req.body;
  const data = await svc.generateCycleReport(req.entityId, bdm_id, period, cycle || 'MONTHLY', req.user._id);
  res.status(201).json({ success: true, data });
});

const review = catchAsync(async (req, res) => {
  const data = await svc.reviewCycleReport(req.params.id, req.user._id, req.body.notes);
  res.json({ success: true, data });
});

const confirm = catchAsync(async (req, res) => {
  const data = await svc.confirmCycleReport(req.params.id, req.user._id, req.body.notes);
  res.json({ success: true, data });
});

const credit = catchAsync(async (req, res) => {
  const data = await svc.creditCycleReport(req.params.id, req.user._id, req.body.credit_reference);
  res.json({ success: true, data });
});

const list = catchAsync(async (req, res) => {
  const data = await svc.getCycleReports(req.entityId, req.query);
  res.json({ success: true, data });
});

module.exports = { generate, review, confirm, credit, list };
