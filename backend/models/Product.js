/**
 * Product Model
 *
 * This model represents pharmaceutical products
 *
 * Key features:
 * - Rich product information for field employees during visits
 * - Image required (stored in S3)
 * - Key benefits and usage information for presentations
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [100, 'Product name cannot exceed 100 characters'],
    },
    genericName: {
      type: String,
      trim: true,
      maxlength: [100, 'Generic name cannot exceed 100 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: [
          'Antibiotics',
          'Analgesics',
          'Antacids',
          'Antihistamines',
          'Cardiovascular',
          'Respiratory',
          'Gastrointestinal',
          'Vitamins/Supplements',
          'Dermatological',
          'Neurological',
          'Hormonal',
          'Pediatric',
          'Other',
        ],
        message: 'Invalid product category',
      },
    },
    // Brief description for quick reference during visits
    briefDescription: {
      type: String,
      required: [true, 'Brief description is required'],
      maxlength: [200, 'Brief description cannot exceed 200 characters'],
    },
    // Full description for detailed viewing
    description: {
      type: String,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    // Key benefits as bullet points for easy presentation
    keyBenefits: {
      type: [String],
      validate: {
        validator: function (arr) {
          return arr.length <= 10;
        },
        message: 'Maximum 10 key benefits allowed',
      },
    },
    // Usage information for field employees
    usageInformation: {
      type: String,
      maxlength: [1000, 'Usage information cannot exceed 1000 characters'],
    },
    dosage: {
      type: String,
      trim: true,
      maxlength: [200, 'Dosage info cannot exceed 200 characters'],
    },
    price: {
      type: Number,
      min: [0, 'Price cannot be negative'],
    },
    manufacturer: {
      type: String,
      trim: true,
      maxlength: [100, 'Manufacturer name cannot exceed 100 characters'],
    },
    // Product image (REQUIRED - S3 URL)
    image: {
      type: String,
      required: [true, 'Product image is required'],
    },
    // Optional thumbnail for list views
    thumbnailImage: {
      type: String,
    },
    // SKU or product code
    sku: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    // Target specializations for product recommendations
    targetSpecializations: [
      {
        type: String,
        enum: [
          'IM Gastro',
          'Pediatrics',
          'General Surgery',
          'ENT',
          'Urology',
          'Internal Medicine',
          'Cardiology',
          'Dermatology',
          'Neurology',
          'Orthopedics',
          'Obstetrics/Gynecology',
          'Ophthalmology',
          'Pulmonology',
          'Nephrology',
          'Oncology',
          'General Practice',
          'Other',
        ],
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
productSchema.index({ name: 'text', genericName: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ targetSpecializations: 1 });
productSchema.index({ sku: 1 });
// Compound indexes for common query patterns
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ targetSpecializations: 1, isActive: 1 });

// Virtual: Get assignment count
productSchema.virtual('assignmentCount', {
  ref: 'ProductAssignment',
  localField: '_id',
  foreignField: 'product',
  count: true,
  match: { status: 'active' },
});

// Static: Find products by category
productSchema.statics.findByCategory = function (category) {
  return this.find({ category, isActive: true });
};

// Static: Find products for a specialization
productSchema.statics.findForSpecialization = function (specialization) {
  return this.find({
    targetSpecializations: specialization,
    isActive: true,
  });
};

// Static: Search products
productSchema.statics.searchProducts = function (query) {
  return this.find(
    { $text: { $search: query }, isActive: true },
    { score: { $meta: 'textScore' } }
  ).sort({ score: { $meta: 'textScore' } });
};

// Pre-delete hook to cascade delete related ProductAssignments
productSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  try {
    const ProductAssignment = mongoose.model('ProductAssignment');
    await ProductAssignment.deleteMany({ product: this._id });
    next();
  } catch (error) {
    next(error);
  }
});

// Also handle findOneAndDelete via query middleware
productSchema.pre('findOneAndDelete', async function (next) {
  try {
    const doc = await this.model.findOne(this.getFilter());
    if (doc) {
      const ProductAssignment = mongoose.model('ProductAssignment');
      await ProductAssignment.deleteMany({ product: doc._id });
    }
    next();
  } catch (error) {
    next(error);
  }
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
