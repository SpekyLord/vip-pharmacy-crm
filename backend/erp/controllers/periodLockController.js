const PeriodLock = require('../models/PeriodLock');
const { catchAsync } = require('../../middleware/errorHandler');
const XLSX = require('xlsx');

// Phase SG-Q2 W4 — derive from the Mongoose enum so the controller never
// drifts from the model. Prior hardcoded list lost INCOME (added later) and
// would have lost SALES_GOAL/INCENTIVE_PAYOUT/DEDUCTION too. Single source
// of truth: PeriodLock.module enum.
const MODULES = PeriodLock.schema.path('module').enumValues;

/**
 * GET /api/erp/period-locks?year=2026
 * Returns lock status matrix: all modules × 12 months for given year
 */
const getLocks = catchAsync(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const locks = await PeriodLock.find({ entity_id: req.entityId, year }).lean();

  // Build matrix: { module -> { 1: bool, 2: bool, ... 12: bool } }
  const matrix = {};
  for (const mod of MODULES) {
    matrix[mod] = {};
    for (let m = 1; m <= 12; m++) matrix[mod][m] = false;
  }
  for (const lock of locks) {
    if (matrix[lock.module]) {
      matrix[lock.module][lock.month] = lock.is_locked;
    }
  }

  res.json({ success: true, data: { year, matrix, locks } });
});

/**
 * POST /api/erp/period-locks/toggle
 * Toggle lock status for a specific module/month
 */
const toggleLock = catchAsync(async (req, res) => {
  const { module, year, month } = req.body;
  if (!MODULES.includes(module)) {
    return res.status(400).json({ success: false, message: `Invalid module: ${module}` });
  }
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ success: false, message: 'Valid year and month (1-12) required' });
  }

  const existing = await PeriodLock.findOne({
    entity_id: req.entityId, module, year: parseInt(year), month: parseInt(month)
  });

  let lock;
  if (existing) {
    existing.is_locked = !existing.is_locked;
    if (existing.is_locked) {
      existing.locked_by = req.user._id;
      existing.locked_at = new Date();
    } else {
      existing.unlocked_by = req.user._id;
      existing.unlocked_at = new Date();
    }
    lock = await existing.save();
  } else {
    lock = await PeriodLock.create({
      entity_id: req.entityId,
      module,
      year: parseInt(year),
      month: parseInt(month),
      is_locked: true,
      locked_by: req.user._id,
      locked_at: new Date()
    });
  }

  res.json({ success: true, data: lock });
});

/**
 * GET /api/erp/period-locks/export
 * Export lock matrix as XLSX
 */
const exportLocks = catchAsync(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const locks = await PeriodLock.find({ entity_id: req.entityId, year }).lean();

  const lockMap = {};
  for (const l of locks) lockMap[`${l.module}-${l.month}`] = l.is_locked;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const rows = MODULES.map(mod => {
    const row = { Module: mod };
    for (let m = 0; m < 12; m++) {
      row[months[m]] = lockMap[`${mod}-${m + 1}`] ? 'LOCKED' : 'UNLOCKED';
    }
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, ...months.map(() => ({ wch: 12 }))];
  XLSX.utils.book_append_sheet(wb, ws, `Period Locks ${year}`);

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="period-locks-${year}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

module.exports = { getLocks, toggleLock, exportLocks };
