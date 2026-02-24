/**
 * Website Product Model
 *
 * This model maps to the products collection in the vip-pharmacy website database.
 * It's READ-ONLY from the CRM perspective - products are managed via the website.
 *
 * Used for:
 * - Displaying products to BDMs and Admins
 * - Assigning products to doctors
 * - Product recommendations during visits
 */

const mongoose = require('mongoose');
const { getWebsiteConnection } = require('../config/websiteDb');

// Schema matching the website's product structure
const websiteProductSchema = new mongoose.Schema(
  {
    id: String, // Website's custom ID (e.g., "p1")
    name: {
      type: String,
      required: true,
    },
    genericName: String,
    dosage: String,
    category: String,
    price: Number,
    image: String,
    description: String,
    usage: String,
    safety: String,
    inStock: {
      type: Boolean,
      default: true,
    },
    stockQuantity: Number,
    isFeatured: Boolean,
    isGreen: Boolean,
    isVIP: Boolean,
    requiresPrescription: Boolean,
  },
  {
    timestamps: true,
    // Map to the 'products' collection in website DB
    collection: 'products',
  }
);

// Virtual to check if product is available
websiteProductSchema.virtual('isAvailable').get(function () {
  return this.inStock && this.stockQuantity > 0;
});

// Transform for JSON responses (add CRM-friendly fields)
websiteProductSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    // Map website fields to CRM-expected format
    ret.briefDescription = ret.description?.substring(0, 200) || '';
    ret.usageInformation = ret.usage || '';
    ret.isActive = ret.inStock;
    delete ret.__v;
    return ret;
  },
});

// Static methods for CRM queries
websiteProductSchema.statics.findActive = function () {
  return this.find({ inStock: true });
};

websiteProductSchema.statics.findByCategory = function (category) {
  return this.find({ category, inStock: true });
};

websiteProductSchema.statics.findVIPProducts = function () {
  return this.find({ isVIP: true, inStock: true });
};

websiteProductSchema.statics.searchProducts = function (query) {
  return this.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { genericName: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } },
    ],
    inStock: true,
  });
};

// We need to create the model lazily after the connection is established
let WebsiteProduct = null;

const getWebsiteProductModel = () => {
  if (!WebsiteProduct) {
    const connection = getWebsiteConnection();
    WebsiteProduct = connection.model('Product', websiteProductSchema);
  }
  return WebsiteProduct;
};

module.exports = {
  websiteProductSchema,
  getWebsiteProductModel,
};
