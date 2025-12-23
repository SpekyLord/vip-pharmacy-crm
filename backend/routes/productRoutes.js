/**
 * Product Routes
 *
 * Endpoints:
 * GET /api/products - Get all products
 * GET /api/products/:id - Get product by ID
 * POST /api/products - Create new product (admin)
 * PUT /api/products/:id - Update product (admin)
 * DELETE /api/products/:id - Delete product (admin)
 * GET /api/products/category/:category - Get products by category
 * POST /api/products/:id/assign - Assign product to doctor
 * GET /api/products/stats - Get product statistics
 */

const express = require('express');
const router = express.Router();

// TODO: Import product controller
// TODO: Import auth and role middleware
// TODO: Define routes with proper middleware

module.exports = router;
