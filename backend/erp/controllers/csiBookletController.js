/**
 * CSI Booklet Controller — Phase 15.2
 */
const { catchAsync } = require('../../middleware/errorHandler');
const { createBooklet, getBooklets, allocateWeek, validateCsiNumber } = require('../services/csiBookletService');

const create = catchAsync(async (req, res) => {
  const data = await createBooklet(req.entityId, req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const list = catchAsync(async (req, res) => {
  const data = await getBooklets(req.entityId, req.query);
  res.json({ success: true, data });
});

const allocate = catchAsync(async (req, res) => {
  const data = await allocateWeek(req.entityId, req.params.id, req.body, req.user._id);
  res.json({ success: true, data });
});

const validate = catchAsync(async (req, res) => {
  const { bdm_id, csi_number } = req.query;
  const data = await validateCsiNumber(req.entityId, bdm_id, csi_number);
  res.json({ success: true, data });
});

module.exports = { create, list, allocate, validate };
