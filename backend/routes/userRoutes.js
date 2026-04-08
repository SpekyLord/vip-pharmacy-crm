/**
 * User Routes
 *
 * Endpoints:
 * GET /api/users - Get all users (admin only)
 * GET /api/users/employees - Get all employees (admin only)
 * GET /api/users/:id - Get user by ID (admin only)
 * POST /api/users - Create new user (admin only)
 * PUT /api/users/:id - Update user (admin only)
 * DELETE /api/users/:id - Soft delete user (admin only)
 * PUT /api/users/:id/reset-password - Admin reset user password (admin only)
 * PUT /api/users/:id/unlock - Unlock locked/deactivated account (admin only)
 * DELETE /api/users/:id/permanent - Permanently delete user (admin only)
 * GET /api/users/profile - Get current user profile
 * PUT /api/users/profile - Update current user profile
 */

const express = require('express');
const router = express.Router();

const {
  getActiveUsers,
  getAllUsers,
  getEmployees,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getProfile,
  updateProfile,
  resetUserPassword,
  unlockAccount,
  hardDeleteUser,
  getEntitiesLookup,
  getAccessTemplatesLookup,
} = require('../controllers/userController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { createUserValidation, updateUserValidation } = require('../middleware/validation');
const { uploadSingle, processAvatar } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

// Profile routes (must be before /:id to avoid conflicts)
router.get('/profile', getProfile);
router.put('/profile', uploadSingle('avatar'), processAvatar, updateProfile);

// Employee list (admin only)
router.get('/employees', adminOnly, getEmployees);

// Active users (admin only)
router.get('/active', adminOnly, getActiveUsers);

// Lookup routes for BDM form dropdowns (admin only)
router.get('/lookup/entities', adminOnly, getEntitiesLookup);
router.get('/lookup/access-templates', adminOnly, getAccessTemplatesLookup);

// Admin only routes
router.get('/', adminOnly, getAllUsers);
router.post('/', adminOnly, createUserValidation, createUser);
router.get('/:id', adminOnly, getUserById);
router.put('/:id', adminOnly, updateUserValidation, updateUser);
router.delete('/:id', adminOnly, deleteUser);

// Account management routes (admin only) — must be after /:id routes
router.put('/:id/reset-password', adminOnly, resetUserPassword);
router.put('/:id/unlock', adminOnly, unlockAccount);
router.delete('/:id/permanent', adminOnly, hardDeleteUser);

module.exports = router;
