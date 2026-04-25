/**
 * Cost Center Controller — Phase 15.5
 */
const { catchAsync } = require('../../middleware/errorHandler');
const svc = require('../services/costCenterService');
const CostCenter = require('../models/CostCenter');
const XLSX = require('xlsx');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');

const create = catchAsync(async (req, res) => {
  const data = await svc.createCostCenter(req.entityId, req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const list = catchAsync(async (req, res) => {
  const data = await svc.getCostCenters(req.entityId, req.query);
  res.json({ success: true, data });
});

const update = catchAsync(async (req, res) => {
  const scopeEntityId = req.isPresident ? null : req.entityId;
  const data = await svc.updateCostCenter(req.params.id, req.body, req.user._id, scopeEntityId);
  res.json({ success: true, data });
});

const getTree = catchAsync(async (req, res) => {
  const data = await svc.getCostCenterTree(req.entityId);
  res.json({ success: true, data });
});

// ═══ Export Cost Centers (Excel) ═══
const exportCostCenters = catchAsync(async (req, res) => {
  const centers = await CostCenter.find({ entity_id: req.entityId }).sort({ code: 1 })
    .populate('parent_cost_center', 'code name')
    .lean();

  const rows = centers.map(c => ({
    'Code': c.code,
    'Name': c.name,
    'Parent Code': c.parent_cost_center?.code || '',
    'Description': c.description || '',
    'Active': c.is_active !== false ? 'YES' : 'NO'
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 35 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Cost Centers');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="cost-centers-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import Cost Centers (Excel) — upsert by code ═══
const importCostCenters = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });

  const wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  let created = 0, updated = 0, errors = [];

  // First pass: upsert all centers (without parent references)
  for (const r of rows) {
    const code = String(r['Code'] || r.code || '').trim().toUpperCase();
    const name = String(r['Name'] || r.name || '').trim();
    if (!code || !name) { errors.push({ code: code || '(empty)', error: 'Code and Name are required' }); continue; }

    try {
      const result = await CostCenter.findOneAndUpdate(
        { entity_id: req.entityId, code },
        {
          entity_id: req.entityId,
          code,
          name,
          description: String(r['Description'] || r.description || '').trim() || undefined,
          is_active: String(r['Active'] || r.is_active || 'YES').toUpperCase() !== 'NO'
        },
        { upsert: true, new: true }
      );
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) created++;
      else updated++;
    } catch (err) {
      errors.push({ code, error: err.message });
    }
  }

  // Second pass: wire parent references
  for (const r of rows) {
    const code = String(r['Code'] || r.code || '').trim().toUpperCase();
    const parentCode = String(r['Parent Code'] || r.parent_cost_center || '').trim().toUpperCase();
    if (!parentCode || !code) continue;

    try {
      const parent = await CostCenter.findOne({ entity_id: req.entityId, code: parentCode }).select('_id').lean();
      if (parent) {
        await CostCenter.findOneAndUpdate({ entity_id: req.entityId, code }, { parent_cost_center: parent._id });
      }
    } catch { /* non-critical */ }
  }

  res.json({
    success: true,
    message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`,
    data: { created, updated, errors }
  });
});

module.exports = { create, list, update, getTree, exportCostCenters, importCostCenters };
