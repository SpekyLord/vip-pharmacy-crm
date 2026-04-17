const PeriodLock = require('../models/PeriodLock');

/**
 * Factory middleware: reject writes to locked periods.
 * Usage: router.post('/journals', periodLockCheck('JOURNAL'), handler)
 *
 * Extracts period from req.body.period (YYYY-MM), or derives from
 * date fields (je_date, sale_date, expense_date, date, recorded_date).
 */
function periodLockCheck(moduleKey) {
  return async (req, res, next) => {
    try {
      // Only enforce on create/update (POST/PUT)
      if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

      let year, month;

      // Try explicit period field first (YYYY-MM)
      const periodField = req.body.period || req.body.start_period;
      if (periodField) {
        const parts = String(periodField).split('-');
        year = parseInt(parts[0]);
        month = parseInt(parts[1]);
      }

      // Fall back to date fields
      if (!year || !month) {
        const dateStr = req.body.je_date || req.body.sale_date || req.body.expense_date
          || req.body.date || req.body.recorded_date;
        if (dateStr) {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            year = d.getFullYear();
            month = d.getMonth() + 1;
          }
        }
      }

      // If we can't determine a period, skip enforcement (don't block reads or period-less ops)
      if (!year || !month) return next();

      const entityId = req.entityId;
      if (!entityId) return next();

      const lock = await PeriodLock.findOne({
        entity_id: entityId,
        module: moduleKey,
        year,
        month,
        is_locked: true
      }).lean();

      if (lock) {
        const monthName = new Date(year, month - 1).toLocaleString('en', { month: 'long' });
        return res.status(403).json({
          success: false,
          message: `Period ${monthName} ${year} is locked for ${moduleKey}. Unlock the period before making changes.`
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = periodLockCheck;
