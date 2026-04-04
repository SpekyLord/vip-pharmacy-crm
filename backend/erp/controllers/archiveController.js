/**
 * Archive Controller — Phase 15.8
 */
const { catchAsync } = require('../../middleware/errorHandler');
const svc = require('../services/dataArchivalService');

const triggerArchive = catchAsync(async (req, res) => {
  const data = await svc.archivePeriods(req.entityId, req.user._id);
  res.json({ success: true, data });
});

const listBatches = catchAsync(async (req, res) => {
  const data = await svc.getArchiveBatches(req.entityId);
  res.json({ success: true, data });
});

const getBatchDetail = catchAsync(async (req, res) => {
  const data = await svc.getArchiveBatchDetail(req.entityId, req.params.batchId);
  res.json({ success: true, data });
});

const restoreBatch = catchAsync(async (req, res) => {
  const data = await svc.restoreBatch(req.entityId, req.params.batchId, req.user._id, req.body.reason);
  res.json({ success: true, data });
});

module.exports = { triggerArchive, listBatches, getBatchDetail, restoreBatch };
