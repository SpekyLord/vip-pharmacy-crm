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
  getVisitById,
  createVisit,
  updateVisit,
  cancelVisit,
  getVisitStats,
  getWeeklyCompliance,
  getComplianceAlerts,
} = require('../controllers/visitController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { createVisitValidation } = require('../middleware/validation');
const { uploadMultiple, processVisitPhotos } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

// Employee and admin routes
router.get('/my', getVisitsByUser);
router.get('/stats', getVisitStats);
router.get('/weekly', getWeeklyCompliance);
router.get('/compliance', getComplianceAlerts);
router.get('/', getAllVisits);
router.get('/:id', getVisitById);
router.post('/', uploadMultiple('photos', 5), processVisitPhotos, createVisitValidation, createVisit);
router.put('/:id', updateVisit);

// Admin only routes
router.delete('/:id', adminOnly, cancelVisit);

module.exports = router;
