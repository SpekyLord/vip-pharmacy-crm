/**
 * Rx Correlation Controller — Gap 9
 *
 * Exposes the rxCorrelationService analytics endpoints.
 * All routes gated by erpAccessCheck('reports').
 */
const { catchAsync } = require('../../middleware/errorHandler');
const svc = require('../services/rxCorrelationService');

// ═══ Analytics ═══

const getCorrelationSummary = catchAsync(async (req, res) => {
  const filters = {};
  if (req.query.territory_id) filters.territory_id = req.query.territory_id;
  if (req.query.program) filters.program = req.query.program;
  if (req.query.support_type) filters.support_type = req.query.support_type;
  if (req.query.client_type) filters.client_type = req.query.client_type;
  if (req.query.pathway) filters.pathway = req.query.pathway;

  const data = await svc.getCorrelationSummary(req.entityId, req.params.period, filters);
  res.json({ success: true, data });
});

const getPartnerDetail = catchAsync(async (req, res) => {
  const filters = {};
  if (req.query.territory_id) filters.territory_id = req.query.territory_id;
  const data = await svc.getPartnerDetail(req.entityId, req.params.period, filters);
  res.json({ success: true, data });
});

const getHospitalStakeholderView = catchAsync(async (req, res) => {
  const filters = {};
  if (req.query.territory_id) filters.territory_id = req.query.territory_id;
  const data = await svc.getHospitalStakeholderView(req.entityId, req.params.period, filters);
  res.json({ success: true, data });
});

const getTerritoryDetail = catchAsync(async (req, res) => {
  const data = await svc.getTerritoryDetail(req.entityId, req.params.territoryId, req.params.period);
  res.json({ success: true, data });
});

const getTimeSeries = catchAsync(async (req, res) => {
  const { territory_id, product_id, start, end } = req.query;
  const data = await svc.getTimeSeries(req.entityId, territory_id, product_id, start, end);
  res.json({ success: true, data });
});

const getProgramEffectiveness = catchAsync(async (req, res) => {
  const data = await svc.getProgramEffectiveness(req.entityId, req.params.period);
  res.json({ success: true, data });
});

const getSupportTypeEffectiveness = catchAsync(async (req, res) => {
  const data = await svc.getSupportTypeEffectiveness(req.entityId, req.params.period);
  res.json({ success: true, data });
});

// ═══ Product Mapping CRUD ═══

const getProductMappings = catchAsync(async (req, res) => {
  const data = await svc.getProductMappings(req.entityId);
  res.json({ success: true, data });
});

const createProductMapping = catchAsync(async (req, res) => {
  const data = await svc.createProductMapping(req.entityId, {
    ...req.body,
    mapped_by: req.user._id,
  });
  res.status(201).json({ success: true, data });
});

const deleteProductMapping = catchAsync(async (req, res) => {
  await svc.deleteProductMapping(req.entityId, req.params.id);
  res.json({ success: true, message: 'Product mapping deactivated' });
});

const autoMapProducts = catchAsync(async (req, res) => {
  const data = await svc.autoMapProducts(req.entityId, req.user._id);
  res.json({ success: true, data });
});

const getUnmappedProducts = catchAsync(async (req, res) => {
  const data = await svc.getUnmappedProducts(req.entityId);
  res.json({ success: true, data });
});

module.exports = {
  getCorrelationSummary,
  getPartnerDetail,
  getHospitalStakeholderView,
  getTerritoryDetail,
  getTimeSeries,
  getProgramEffectiveness,
  getSupportTypeEffectiveness,
  getProductMappings,
  createProductMapping,
  deleteProductMapping,
  autoMapProducts,
  getUnmappedProducts,
};
