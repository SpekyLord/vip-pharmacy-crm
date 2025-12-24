/**
 * Region Routes
 *
 * Endpoints:
 * GET /api/regions - Get all regions
 * GET /api/regions/hierarchy - Get region hierarchy tree
 * GET /api/regions/stats - Get region statistics
 * GET /api/regions/:id - Get region by ID
 * GET /api/regions/:id/doctors - Get doctors in region
 * GET /api/regions/:id/users - Get users assigned to region
 * POST /api/regions - Create new region (admin only)
 * PUT /api/regions/:id - Update region (admin only)
 * DELETE /api/regions/:id - Soft delete region (admin only)
 */

const express = require('express');
const router = express.Router();

const {
  getAllRegions,
  getRegionById,
  createRegion,
  updateRegion,
  deleteRegion,
  getRegionHierarchy,
  getRegionStats,
  getChildRegions,
} = require('../controllers/regionController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { createRegionValidation } = require('../middleware/validation');

// All routes require authentication
router.use(protect);

// Public routes (accessible by all authenticated users)
router.get('/', getAllRegions);
router.get('/hierarchy', getRegionHierarchy);
router.get('/stats', getRegionStats);
router.get('/:id', getRegionById);
router.get('/:id/children', getChildRegions);

// Admin only routes
router.post('/', adminOnly, createRegionValidation, createRegion);
router.put('/:id', adminOnly, updateRegion);
router.delete('/:id', adminOnly, deleteRegion);

module.exports = router;
