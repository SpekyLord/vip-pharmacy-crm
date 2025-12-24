/**
 * Product Routes
 *
 * Endpoints:
 * GET /api/products - Get all products
 * GET /api/products/categories - Get all product categories
 * GET /api/products/stats - Get product statistics
 * GET /api/products/:id - Get product by ID
 * POST /api/products - Create new product (admin only)
 * PUT /api/products/:id - Update product (admin only)
 * DELETE /api/products/:id - Soft delete product (admin only)
 */

const express = require('express');
const router = express.Router();

const {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
} = require('../controllers/productController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const { createProductValidation, updateProductValidation } = require('../middleware/validation');
const { uploadSingle, processProductImage, processProductImageOptional } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

// Public routes (accessible by all authenticated users)
router.get('/', getAllProducts);
router.get('/categories', getCategories);
router.get('/:id', getProductById);

// Admin only routes
router.post('/', adminOnly, uploadSingle('image'), processProductImage, createProductValidation, createProduct);
router.put('/:id', adminOnly, uploadSingle('image'), processProductImageOptional, updateProductValidation, updateProduct);
router.delete('/:id', adminOnly, deleteProduct);

module.exports = router;
