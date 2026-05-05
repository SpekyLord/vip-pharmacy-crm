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
 *   POST   /generate         - Auto-generate schedule for a BDM
 *   POST   /reconcile        - Trigger status reconciliation
 *   GET    /admin/cycle      - Get any BDM's cycle schedule
 *   POST   /admin/create     - Manually create schedule entries (Phase A.6: now accepts {date} per entry)
 *   GET    /admin/upcoming   - List upcoming planned/carried entries for a doctor (Phase A.6)
 *   PATCH  /admin/:id        - Reschedule a single entry by passing a new date (Phase A.6)
 *   DELETE /admin/cycle      - Clear planned/carried entries
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
  adminReschedule,
  adminGetUpcoming,
  adminGetUpcomingCounts,
  getCPTGrid,
  getCPTGridSummary,
  getCrossBdmHeatmap,
  getTeamActivity,
} = require('../controllers/scheduleController');

// All routes require authentication
router.use(protect);

// BDM + Admin routes
router.get('/cycle', adminOrEmployee, getCycle);
router.get('/today', adminOrEmployee, getToday);
router.get('/cpt-grid', adminOrEmployee, getCPTGrid);

// Admin-only routes
router.get('/cpt-grid-summary', adminOnly, getCPTGridSummary);
router.get('/cross-bdm-heatmap', adminOnly, getCrossBdmHeatmap);
router.get('/team-activity', adminOnly, getTeamActivity);
router.post('/generate', adminOnly, generateSchedule);
router.post('/reconcile', adminOnly, reconcile);
router.get('/admin/cycle', adminOnly, adminGetCycle);
router.get('/admin/upcoming', adminOnly, adminGetUpcoming);
router.get('/admin/upcoming-counts', adminOnly, adminGetUpcomingCounts);
router.post('/admin/create', adminOnly, adminCreate);
router.delete('/admin/cycle', adminOnly, adminClearCycle);
// PATCH /admin/:id MUST be defined AFTER the more specific /admin/* routes
// above so Express doesn't match e.g. GET /admin/upcoming as id="upcoming".
router.patch('/admin/:id', adminOnly, adminReschedule);

module.exports = router;
