/**
 * Product Controller
 *
 * Handles product catalog CRUD operations
 * Follows CLAUDE.md rules:
 * - Admin can manage products
 * - All authenticated users can view products
 * - Images stored in AWS S3
 */

const Product = require('../models/Product');
const ProductAssignment = require('../models/ProductAssignment');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { deleteFromS3 } = require('../config/s3');

/**
 * @desc    Get all products with pagination and filters
 * @route   GET /api/products
 * @access  All authenticated users
 */
const getAllProducts = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Build filter query
  const filter = { isActive: true };

  // Filter by category
  if (req.query.category) {
    filter.category = req.query.category;
  }

  // Filter by target specialization
  if (req.query.specialization) {
    filter.targetSpecializations = req.query.specialization;
  }

  // Search by name or description
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { genericName: { $regex: req.query.search, $options: 'i' } },
      { briefDescription: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Include inactive if requested (admin only)
  if (req.query.includeInactive === 'true' && req.user.role === 'admin') {
    delete filter.isActive;
  }

  // Execute query
  const [products, total] = await Promise.all([
    Product.find(filter)
      .select('name genericName category briefDescription keyBenefits image price isActive')
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
 * @desc    Create new product
 * @route   POST /api/products
 * @access  Admin only
 */
const createProduct = catchAsync(async (req, res) => {
  const {
    name,
    genericName,
    category,
    briefDescription,
    description,
    keyBenefits,
    usageInformation,
    dosage,
    price,
    manufacturer,
    sku,
    targetSpecializations,
  } = req.body;

  // Image URL from S3 upload middleware
  const image = req.body.image || (req.file ? req.file.location : null);

  if (!image) {
    throw new NotFoundError('Product image is required');
  }

  const product = await Product.create({
    name,
    genericName,
    category,
    briefDescription,
    description,
    keyBenefits: keyBenefits || [],
    usageInformation,
    dosage,
    price,
    manufacturer,
    image,
    sku,
    targetSpecializations: targetSpecializations || [],
  });

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: product,
  });
});

/**
 * @desc    Update product
 * @route   PUT /api/products/:id
 * @access  Admin only
 */
const updateProduct = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // Allowed fields to update
  const allowedFields = [
    'name',
    'genericName',
    'category',
    'briefDescription',
    'description',
    'keyBenefits',
    'usageInformation',
    'dosage',
    'price',
    'manufacturer',
    'sku',
    'targetSpecializations',
    'isActive',
  ];

  // Update only allowed fields
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  // Handle image update
  if (req.file) {
    // Delete old image from S3 if exists
    if (product.image) {
      try {
        await deleteFromS3(product.image);
      } catch (err) {
        console.error('Failed to delete old product image:', err);
      }
    }
    product.image = req.file.location;
  }

  await product.save();

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: product,
  });
});

/**
 * @desc    Deactivate product (soft delete)
 * @route   DELETE /api/products/:id
 * @access  Admin only
 */
const deleteProduct = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  // Soft delete
  product.isActive = false;
  await product.save();

  // Deactivate all product assignments
  await ProductAssignment.updateMany(
    { product: product._id, status: 'active' },
    { status: 'inactive', deactivatedAt: new Date() }
  );

  res.status(200).json({
    success: true,
    message: 'Product deactivated successfully',
  });
});

/**
 * @desc    Get products by category
 * @route   GET /api/products/category/:category
 * @access  All authenticated users
 */
const getProductsByCategory = catchAsync(async (req, res) => {
  const { category } = req.params;

  const products = await Product.find({ category, isActive: true })
    .select('name genericName briefDescription keyBenefits image price')
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
  const categories = await Product.distinct('category', { isActive: true });

  res.status(200).json({
    success: true,
    data: categories,
  });
});

/**
 * @desc    Get products for a specific specialization
 * @route   GET /api/products/specialization/:specialization
 * @access  All authenticated users
 */
const getProductsForSpecialization = catchAsync(async (req, res) => {
  const { specialization } = req.params;

  const products = await Product.find({
    targetSpecializations: specialization,
    isActive: true,
  })
    .select('name genericName category briefDescription keyBenefits image price')
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: products,
    count: products.length,
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
};
