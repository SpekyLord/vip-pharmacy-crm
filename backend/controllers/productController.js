/**
 * Product Controller
 *
 * Handles CRM product catalog operations.
 * Products are stored in the CRM database (CrmProduct model) — fully independent
 * from the e-commerce website database.
 *
 * Admin creates products with images (S3) and assigns specializations.
 * BDMs see products filtered by a VIP Client's specialization.
 */

const CrmProduct = require('../models/CrmProduct');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { sanitizeSearchString } = require('../utils/controllerHelpers');
const { deleteFromS3 } = require('../config/s3');

/**
 * @desc    Get all products with pagination and filters
 * @route   GET /api/products
 * @access  All authenticated users
 */
const getAllProducts = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const filter = { isActive: true };

  // Filter by category
  if (req.query.category) {
    filter.category = req.query.category;
  }

  // Filter by specialization
  if (req.query.specialization) {
    filter.targetSpecializations = {
      $regex: new RegExp(`^${req.query.specialization.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    };
  }

  // Search by name or genericName
  if (req.query.search) {
    const safeSearch = sanitizeSearchString(req.query.search);
    filter.$or = [
      { name: { $regex: safeSearch, $options: 'i' } },
      { genericName: { $regex: safeSearch, $options: 'i' } },
    ];
  }

  // Include inactive if requested (admin only)
  if (req.query.includeInactive === 'true' && req.user.role === 'admin') {
    delete filter.isActive;
  }

  let query = CrmProduct.find(filter).sort({ name: 1 });

  if (limit > 0) {
    query = query.skip(skip).limit(limit);
  }

  let products, total;
  if (limit === 0) {
    products = await query;
    total = products.length;
  } else {
    [products, total] = await Promise.all([
      query,
      CrmProduct.countDocuments(filter),
    ]);
  }

  res.status(200).json({
    success: true,
    data: products,
    pagination: {
      page,
      limit: limit || total,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 1,
    },
  });
});

/**
 * @desc    Get product by ID
 * @route   GET /api/products/:id
 * @access  All authenticated users
 */
const getProductById = catchAsync(async (req, res) => {
  const product = await CrmProduct.findById(req.params.id);

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
  const { name, genericName, dosage, category, description, usage, safety, targetSpecializations } = req.body;

  // Parse targetSpecializations if sent as JSON string (FormData)
  let specs = targetSpecializations;
  if (typeof targetSpecializations === 'string') {
    try {
      specs = JSON.parse(targetSpecializations);
    } catch {
      specs = targetSpecializations.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  const productData = {
    name,
    genericName,
    dosage,
    category,
    description,
    usage,
    safety,
    targetSpecializations: specs || [],
    createdBy: req.user._id,
  };

  // Attach S3 image if uploaded
  if (req.uploadedImage) {
    productData.image = req.uploadedImage.url;
    productData.imageKey = req.uploadedImage.key;
  }

  const product = await CrmProduct.create(productData);

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
  const product = await CrmProduct.findById(req.params.id);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const allowedFields = [
    'name', 'genericName', 'dosage', 'category', 'description',
    'usage', 'safety', 'targetSpecializations', 'isActive',
  ];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      let value = req.body[field];
      // Parse targetSpecializations if sent as JSON string (FormData)
      if (field === 'targetSpecializations' && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch {
          value = value.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
      // Parse isActive if sent as string (FormData)
      if (field === 'isActive' && typeof value === 'string') {
        value = value === 'true';
      }
      product[field] = value;
    }
  });

  // Handle new image upload — delete old S3 key first
  if (req.uploadedImage) {
    if (product.imageKey) {
      try {
        await deleteFromS3(product.imageKey);
      } catch (err) {
        console.error('Failed to delete old product image from S3:', err.message);
      }
    }
    product.image = req.uploadedImage.url;
    product.imageKey = req.uploadedImage.key;
  }

  await product.save();

  res.status(200).json({
    success: true,
    message: 'Product updated successfully',
    data: product,
  });
});

/**
 * @desc    Soft delete product (set isActive = false)
 * @route   DELETE /api/products/:id
 * @access  Admin only
 */
const deleteProduct = catchAsync(async (req, res) => {
  const product = await CrmProduct.findById(req.params.id);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  product.isActive = false;
  await product.save();

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

  const products = await CrmProduct.find({ category, isActive: true })
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
  const categories = await CrmProduct.distinct('category', { isActive: true });

  res.status(200).json({
    success: true,
    data: categories,
  });
});

/**
 * @desc    Get products matching a specialization (case-insensitive)
 * @route   GET /api/products/specialization/:specialization
 * @access  All authenticated users
 */
const getBySpecialization = catchAsync(async (req, res) => {
  const { specialization } = req.params;

  const products = await CrmProduct.find({
    isActive: true,
    targetSpecializations: {
      $regex: new RegExp(`^${specialization.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    },
  }).sort({ name: 1 });

  res.status(200).json({
    success: true,
    data: products,
    count: products.length,
  });
});

/**
 * @desc    Get distinct specialization values (for admin UI dropdown)
 * @route   GET /api/products/specializations
 * @access  All authenticated users
 */
const getSpecializations = catchAsync(async (req, res) => {
  const specializations = await CrmProduct.distinct('targetSpecializations', { isActive: true });

  res.status(200).json({
    success: true,
    data: specializations.filter(Boolean).sort(),
  });
});

/**
 * @desc    Search products
 * @route   GET /api/products/search
 * @access  All authenticated users
 */
const searchProducts = catchAsync(async (req, res) => {
  const { q } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Search query must be at least 2 characters',
    });
  }

  const safeQuery = sanitizeSearchString(q);
  const products = await CrmProduct.find({
    $or: [
      { name: { $regex: safeQuery, $options: 'i' } },
      { genericName: { $regex: safeQuery, $options: 'i' } },
    ],
    isActive: true,
  })
    .limit(20)
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
  getBySpecialization,
  getSpecializations,
  searchProducts,
};
