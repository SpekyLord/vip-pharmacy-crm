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
 * GET /api/users/profile - Get current user profile
 * PUT /api/users/profile - Update current user profile
 */

const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  getEmployees,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getProfile,
  updateProfile,
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

// Admin only routes
router.get('/', adminOnly, getAllUsers);
router.post('/', adminOnly, createUserValidation, createUser);
router.get('/:id', adminOnly, getUserById);
router.put('/:id', adminOnly, updateUserValidation, updateUser);
router.delete('/:id', adminOnly, deleteUser);

module.exports = router;
