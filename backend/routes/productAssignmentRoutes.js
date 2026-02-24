/**
 * Product Assignment Routes
 *
 * Endpoints:
 * GET /api/assignments - Get all assignments
 * GET /api/assignments/my - Get current user's assignments
 * GET /api/assignments/:id - Get assignment by ID
 * POST /api/assignments - Create new assignment (admin only)
 * POST /api/assignments/bulk - Bulk create assignments (admin only)
 * PUT /api/assignments/:id - Update assignment (admin only)
 * DELETE /api/assignments/:id - Delete assignment (admin only)
 * GET /api/assignments/doctor/:doctorId - Get assignments for a doctor
 * GET /api/assignments/product/:productId - Get assignments for a product
 */

const express = require('express');
const router = express.Router();

const {
  getAllAssignments,
  getMyAssignments,
  getAssignmentById,
  createAssignment,
  bulkAssign,
  updateAssignment,
  deleteAssignment,
  getAssignmentsByDoctor,
  getAssignmentsByProduct,
} = require('../controllers/productAssignmentController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { createAssignmentValidation } = require('../middleware/validation');

// All routes require authentication
router.use(protect);

// Routes accessible by all authenticated users
router.get('/', getAllAssignments);
router.get('/my', getMyAssignments);
router.get('/doctor/:doctorId', getAssignmentsByDoctor);
router.get('/product/:productId', getAssignmentsByProduct);
router.get('/:id', getAssignmentById);

// Admin only routes
router.post('/', adminOnly, createAssignmentValidation, createAssignment);
router.post('/bulk', adminOnly, bulkAssign);
router.put('/:id', adminOnly, updateAssignment);
router.delete('/:id', adminOnly, deleteAssignment);

module.exports = router;
