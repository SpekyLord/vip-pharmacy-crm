/**
 * Visit Routes
 *
 * Endpoints:
 * GET /api/visits - Get all visits (filtered by user/region)
 * GET /api/visits/my - Get current user's visits
 * GET /api/visits/stats - Get visit statistics
 * GET /api/visits/weekly - Get weekly visit summary
 * GET /api/visits/compliance - Get compliance report
 * GET /api/visits/:id - Get visit by ID
 * POST /api/visits - Create new visit (with GPS + photo validation)
 * PUT /api/visits/:id - Update visit (limited fields)
 * DELETE /api/visits/:id - Delete visit (admin only)
 */

const express = require('express');
const router = express.Router();

const {
  getAllVisits,
  getVisitsByUser,
  getMyVisits,
  getVisitById,
  createVisit,
  updateVisit,
  cancelVisit,
  getVisitStats,
  getWeeklyCompliance,
  getComplianceAlerts,
  checkCanVisit,
  checkCanVisitBatch,
  getTodayVisits,
  refreshPhotoUrls,
  getEmployeeReport,
  getQuotaDumpingAlerts,
  getGPSReview,
} = require('../controllers/visitController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { createVisitValidation } = require('../middleware/validation');
const { uploadMultiple, processVisitPhotos, parseFormDataJson } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

// Employee and admin routes
router.get('/my', getMyVisits);
router.get('/today', getTodayVisits);
router.get('/stats', getVisitStats);
router.get('/weekly', getWeeklyCompliance);
router.get('/compliance', adminOnly, getComplianceAlerts);
router.get('/quota-dumping', adminOnly, getQuotaDumpingAlerts);
router.get('/gps-review', adminOnly, getGPSReview);
router.get('/employee-report/:userId', adminOnly, getEmployeeReport);
router.get('/can-visit/:doctorId', checkCanVisit);
router.post('/can-visit-batch', checkCanVisitBatch);
router.get('/', getAllVisits);
router.get('/:id', getVisitById);
router.get('/:id/refresh-photos', refreshPhotoUrls);
router.post('/', uploadMultiple('photos', 5), processVisitPhotos, parseFormDataJson(['location', 'productsDiscussed']), createVisitValidation, createVisit);
router.put('/:id', updateVisit);

// Admin only routes
router.delete('/:id', adminOnly, cancelVisit);

module.exports = router;
