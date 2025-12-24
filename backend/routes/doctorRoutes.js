/**
 * Doctor Routes
 *
 * Endpoints:
 * GET /api/doctors - Get all doctors (filtered by region for employees)
 * GET /api/doctors/:id - Get doctor by ID
 * GET /api/doctors/:id/visits - Get doctor's visit history
 * GET /api/doctors/:id/products - Get doctor's assigned products
 * POST /api/doctors - Create new doctor (admin only)
 * PUT /api/doctors/:id - Update doctor (admin only)
 * DELETE /api/doctors/:id - Soft delete doctor (admin only)
 */

const express = require('express');
const router = express.Router();

const {
  getAllDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  getDoctorVisits,
  getDoctorProducts,
} = require('../controllers/doctorController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { createDoctorValidation, updateDoctorValidation } = require('../middleware/validation');

// All routes require authentication
router.use(protect);

// Public routes (accessible by all authenticated users with region filtering)
router.get('/', getAllDoctors);
router.get('/:id', getDoctorById);
router.get('/:id/visits', getDoctorVisits);
router.get('/:id/products', getDoctorProducts);

// Admin only routes
router.post('/', adminOnly, createDoctorValidation, createDoctor);
router.put('/:id', adminOnly, updateDoctorValidation, updateDoctor);
router.delete('/:id', adminOnly, deleteDoctor);

module.exports = router;
