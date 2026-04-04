/**
 * Cost Center Controller — Phase 15.5
 */
const { catchAsync } = require('../../middleware/errorHandler');
const svc = require('../services/costCenterService');

const create = catchAsync(async (req, res) => {
  const data = await svc.createCostCenter(req.entityId, req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const list = catchAsync(async (req, res) => {
  const data = await svc.getCostCenters(req.entityId, req.query);
  res.json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const data = await svc.updateCostCenter(req.params.id, req.body, req.user._id);
  res.json({ success: true, data });
});

const getTree = catchAsync(async (req, res) => {
  const data = await svc.getCostCenterTree(req.entityId);
  res.json({ success: true, data });
});

module.exports = { create, list, update, getTree };
