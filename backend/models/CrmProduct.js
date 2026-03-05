/**
 * CRM Product Model
 *
 * Products managed directly within the CRM (independent from e-commerce website DB).
 * Admin creates products with images (S3) and assigns them to specialization types.
 * BDMs see only products relevant to a VIP Client's specialization.
 *
 * Replaces the old cross-database WebsiteProduct pattern entirely.
 */

const mongoose = require('mongoose');

const crmProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    genericName: {
      type: String,
      trim: true,
      maxlength: [100, 'Generic name cannot exceed 100 characters'],
    },
    dosage: {
      type: String,
      trim: true,
      maxlength: [100, 'Dosage cannot exceed 100 characters'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      maxlength: [50, 'Category cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    usage: {
      type: String,
      trim: true,
      maxlength: [2000, 'Usage information cannot exceed 2000 characters'],
    },
    safety: {
      type: String,
      trim: true,
      maxlength: [2000, 'Safety information cannot exceed 2000 characters'],
    },
    // S3 image URL (public or signed)
    image: {
      type: String,
    },
    // S3 object key for deletion when replacing image
    imageKey: {
      type: String,
    },
    // Specializations this product targets (e.g. ["OB-GYN", "Pedia", "IM"])
    targetSpecializations: [
      {
        type: String,
        trim: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
crmProductSchema.index({ name: 'text', genericName: 'text' });
crmProductSchema.index({ targetSpecializations: 1 });
crmProductSchema.index({ category: 1 });
crmProductSchema.index({ isActive: 1 });

const CrmProduct = mongoose.model('CrmProduct', crmProductSchema);

module.exports = CrmProduct;
