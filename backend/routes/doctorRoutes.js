/**
 * Doctor Routes
 *
 * Endpoints:
 * GET /api/doctors - Get all doctors (filtered by region for employees)
 * GET /api/doctors/:id - Get doctor by ID
 * GET /api/doctors/:id/visits - Get doctor's visit history
 * GET /api/doctors/:id/products - Get doctor's assigned products
 * POST /api/doctors - Create new doctor (admin only)
 * PUT /api/doctors/:id - Update doctor (admin or assigned BDM)
 * PUT /api/doctors/:id/target-products - Update target products (admin or assigned BDM)
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
  deleteDoctorsByUser,
  countDoctorsByUser,
  getDoctorVisits,
  getDoctorProducts,
  updateTargetProducts,
  getSpecializations,
  getDoctorsByBdm,
  previewNameCleanup,
  applyNameCleanup,
} = require('../controllers/doctorController');

const { protect } = require('../middleware/auth');
const { adminOnly, adminOrEmployee } = require('../middleware/roleCheck');
const { createDoctorValidation, updateDoctorValidation } = require('../middleware/validation');

// All routes require authentication
router.use(protect);

// Name cleanup tool (admin only) — must be before /:id routes
router.get('/name-cleanup/preview', adminOnly, previewNameCleanup);
router.put('/name-cleanup/apply', adminOnly, applyNameCleanup);

// Public routes (accessible by all authenticated users with region filtering)
router.get('/specializations', getSpecializations);
router.get('/count-by-user/:userId', adminOnly, countDoctorsByUser);
router.get('/by-bdm/:bdmId', getDoctorsByBdm);
router.get('/', getAllDoctors);
router.get('/:id', getDoctorById);
router.get('/:id/visits', getDoctorVisits);
router.get('/:id/products', getDoctorProducts);

// Admin or Employee (BDM) routes - ownership checked in controller
router.put('/:id/target-products', adminOrEmployee, updateTargetProducts);

// Admin or Employee (BDM) routes - ownership checked in controller
router.put('/:id', adminOrEmployee, updateDoctorValidation, updateDoctor);

// Admin only routes
router.post('/', adminOnly, createDoctorValidation, createDoctor);
router.delete('/by-user/:userId', adminOnly, deleteDoctorsByUser);
router.delete('/:id', adminOnly, deleteDoctor);

module.exports = router;
