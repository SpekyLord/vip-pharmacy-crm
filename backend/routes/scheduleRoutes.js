/**
 * Schedule Routes
 *
 * /api/schedules
 *
 * BDM endpoints:
 *   GET  /cycle       - Get full 4-week cycle grid
 *   GET  /today       - Today's visitable VIP Clients
 *
 * Admin endpoints:
 *   POST   /generate       - Auto-generate schedule for a BDM
 *   POST   /reconcile      - Trigger status reconciliation
 *   GET    /admin/cycle    - Get any BDM's cycle schedule
 *   POST   /admin/create   - Manually create schedule entries
 *   DELETE /admin/cycle    - Clear planned/carried entries
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { adminOnly, adminOrEmployee } = require('../middleware/roleCheck');
const {
  getCycle,
  getToday,
  generateSchedule,
  reconcile,
  adminGetCycle,
  adminCreate,
  adminClearCycle,
  getCPTGrid,
  getCPTGridSummary,
} = require('../controllers/scheduleController');

// All routes require authentication
router.use(protect);

// BDM + Admin routes
router.get('/cycle', adminOrEmployee, getCycle);
router.get('/today', adminOrEmployee, getToday);
router.get('/cpt-grid', adminOrEmployee, getCPTGrid);

// Admin-only routes
router.get('/cpt-grid-summary', adminOnly, getCPTGridSummary);
router.post('/generate', adminOnly, generateSchedule);
router.post('/reconcile', adminOnly, reconcile);
router.get('/admin/cycle', adminOnly, adminGetCycle);
router.post('/admin/create', adminOnly, adminCreate);
router.delete('/admin/cycle', adminOnly, adminClearCycle);

module.exports = router;
