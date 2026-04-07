/**
 * Month-End Close Controller — HTTP layer for 29-step SOP
 */
const { catchAsync } = require('../../middleware/errorHandler');
const {
  runAutoClose,
  runPhase6ReviewStaging,
  postStagedItems,
  runPhase7Finalize,
  getCloseProgress
} = require('../services/monthEndClose');

// ═══ Run Auto Close (Steps 1-17) ═══
const runAutoCloseEndpoint = catchAsync(async (req, res) => {
  const { period } = req.body;
  if (!period) return res.status(400).json({ success: false, message: 'Period is required (YYYY-MM)' });

  const result = await runAutoClose(req.entityId, period, req.user._id);
  res.json({ success: true, data: result });
});

// ═══ Run Phase 6 Staging (Steps 18-21) ═══
const runStagingEndpoint = catchAsync(async (req, res) => {
  const { period } = req.body;
  if (!period) return res.status(400).json({ success: false, message: 'Period is required (YYYY-MM)' });

  const result = await runPhase6ReviewStaging(req.entityId, period, req.user._id);
  res.json({ success: true, data: result });
});

// ═══ Post Staged Items (Steps 23-25) ═══
const postStagedEndpoint = catchAsync(async (req, res) => {
  const { period } = req.body;
  if (!period) return res.status(400).json({ success: false, message: 'Period is required (YYYY-MM)' });

  const result = await postStagedItems(req.entityId, period, req.user._id);
  res.json({ success: true, data: result });
});

// ═══ Finalize (Steps 26-29) ═══
const finalizeEndpoint = catchAsync(async (req, res) => {
  const { period } = req.body;
  if (!period) return res.status(400).json({ success: false, message: 'Period is required (YYYY-MM)' });

  const result = await runPhase7Finalize(req.entityId, period, req.user._id);
  res.json({ success: true, data: result });
});

// ═══ Get Progress ═══
const getProgressEndpoint = catchAsync(async (req, res) => {
  const result = await getCloseProgress(req.entityId, req.params.period);
  res.json({ success: true, data: result });
});

module.exports = {
  runAutoCloseEndpoint,
  runStagingEndpoint,
  postStagedEndpoint,
  finalizeEndpoint,
  getProgressEndpoint
};
