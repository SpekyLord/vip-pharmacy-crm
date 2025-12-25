/**
 * Product Controller
 *
 * Handles product catalog operations
 *
 * IMPORTANT: Products are READ from the website database (vip-pharmacy)
 * The CRM does not manage products directly - they are managed via the website.
 *
 * This controller provides:
 * - Read-only access to website products
 * - Product search and filtering for MedReps/Employees
 * - Product data for assignments and visits
 */

const { getWebsiteProductModel } = require('../models/WebsiteProduct');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');

/**
 * @desc    Get all products with pagination and filters
 * @route   GET /api/products
 * @access  All authenticated users
 */
const getAllProducts = catchAsync(async (req, res) => {
  const Product = getWebsiteProductModel();
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter query
  const filter = { inStock: true };

  // Filter by category
  if (req.query.category) {
    filter.category = req.query.category;
  }

  // Filter by VIP products
  if (req.query.isVIP === 'true') {
    filter.isVIP = true;
  }

  // Filter by prescription requirement
  if (req.query.requiresPrescription === 'true') {
    filter.requiresPrescription = true;
  }

  // Search by name or description
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { genericName: { $regex: req.query.search, $options: 'i' } },
      { description: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Include out of stock if requested (admin only)
  if (req.query.includeOutOfStock === 'true' && req.user.role === 'admin') {
    delete filter.inStock;
  }

  // Execute query
  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: products,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc    Get product by ID
 * @route   GET /api/products/:id
 * @access  All authenticated users
 */
const getProductById = catchAsync(async (req, res) => {
  const Product = getWebsiteProductModel();
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  res.status(200).json({
    success: true,
    data: product,
  });
});

/**
 * @desc    Get products by category
 * @route   GET /api/products/category/:category
 * @access  All authenticated users
 */
const getProductsByCategory = catchAsync(async (req, res) => {
  const Product = getWebsiteProductModel();
  const { category } = req.params;

  const products = await Product.find({ category, inStock: true })
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: products,
    count: products.length,
  });
});

/**
 * @desc    Get product categories list
 * @route   GET /api/products/categories
 * @access  All authenticated users
 */
const getCategories = catchAsync(async (req, res) => {
  const Product = getWebsiteProductModel();
  const categories = await Product.distinct('category', { inStock: true });

  res.status(200).json({
    success: true,
    data: categories,
  });
});

/**
 * @desc    Get VIP products
 * @route   GET /api/products/vip
 * @access  All authenticated users
 */
const getVIPProducts = catchAsync(async (req, res) => {
  const Product = getWebsiteProductModel();
  const products = await Product.find({ isVIP: true, inStock: true })
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: products,
    count: products.length,
  });
});

/**
 * @desc    Search products
 * @route   GET /api/products/search
 * @access  All authenticated users
 */
const searchProducts = catchAsync(async (req, res) => {
  const Product = getWebsiteProductModel();
  const { q } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Search query must be at least 2 characters',
    });
  }

  const products = await Product.find({
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { genericName: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
    ],
    inStock: true,
  })
    .limit(20)
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: products,
    count: products.length,
  });
});

/**
 * NOTE: Create, Update, Delete operations are NOT available in CRM
 * Products are managed through the VIP Pharmacy website.
 * These placeholder functions return appropriate messages.
 */

const createProduct = catchAsync(async (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Products are managed through the VIP Pharmacy website. Please use the website admin panel to add products.',
  });
});

const updateProduct = catchAsync(async (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Products are managed through the VIP Pharmacy website. Please use the website admin panel to update products.',
  });
});

const deleteProduct = catchAsync(async (req, res) => {
  res.status(403).json({
    success: false,
    message: 'Products are managed through the VIP Pharmacy website. Please use the website admin panel to remove products.',
  });
});

// Placeholder for backward compatibility
const getProductsForSpecialization = catchAsync(async (req, res) => {
  const Product = getWebsiteProductModel();

  // Since website products don't have targetSpecializations,
  // return all VIP products as a fallback
  const products = await Product.find({ isVIP: true, inStock: true })
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: products,
    count: products.length,
    note: 'Returning VIP products. Website products do not have specialization targeting.',
  });
});

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getCategories,
  getProductsForSpecialization,
  getVIPProducts,
  searchProducts,
};
