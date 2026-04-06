const Lookup = require('../models/Lookup');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * Generic Lookup Controller — Phase 24
 * CRUD for configurable dropdown values (replaces hardcoded frontend arrays).
 */

// Default seed data for each category — mirrors current hardcoded arrays
const SEED_DEFAULTS = {
  EXPENSE_CATEGORY: [
    'Transportation', 'Travel/Accommodation', 'Fuel & Gas', 'Parking/Toll',
    'Courier/Shipping', 'ACCESS/Meals', 'Office Supplies',
    'Utilities/Communication', 'Rent', 'Marketing — HCP/Doctor', 'Marketing — Hospital',
    'Marketing — Retail', 'Vehicle Maintenance', 'Repairs/Maintenance', 'Professional Fees',
    'Regulatory/Licensing', 'IT/Software', 'Miscellaneous'
  ],
  PERSON_TYPE: ['BDM', 'ECOMMERCE_BDM', 'EMPLOYEE', 'SALES_REP', 'CONSULTANT', 'DIRECTOR'],
  EMPLOYMENT_TYPE: ['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'CONSULTANT', 'PARTNERSHIP'],
  CARD_TYPE: ['CREDIT_CARD', 'FLEET_CARD', 'DEBIT_CARD'],
  CARD_BRAND: ['VISA', 'MASTERCARD', 'JCB', 'AMEX', 'FLEET'],
  FUEL_TYPE: ['UNLEADED', 'DIESEL', 'PREMIUM', 'V-POWER', 'XCS', 'OTHER'],
  COLLATERAL_TYPE: ['BROCHURE', 'SAMPLE', 'MERCHANDISE', 'BANNER', 'FLYER', 'OTHER'],
  ACTIVITY_TYPE: ['Office', 'Field', 'Other'],
  VEHICLE_TYPE: ['CAR', 'MOTORCYCLE', 'COMPANY_CAR', 'NONE'],
  BIR_FLAG: ['BOTH', 'INTERNAL', 'BIR'],
  OFFICE_SUPPLY_CATEGORY: ['PAPER', 'INK_TONER', 'CLEANING', 'STATIONERY', 'ELECTRONICS', 'OTHER'],
  CUSTOMER_TYPE: ['PERSON', 'PHARMACY', 'DIAGNOSTIC_CENTER', 'INDUSTRIAL', 'OTHER'],
  DR_TYPE: ['DR_CONSIGNMENT', 'DR_SAMPLING', 'DR_DONATION'],
  STOCK_TYPE: ['PHARMA', 'FNB', 'OFFICE'],
  DEPARTMENT: ['SALES', 'ADMIN', 'FINANCE', 'OPERATIONS', 'LOGISTICS', 'MARKETING', 'EXECUTIVE'],
  POSITION: ['BDM', 'eBDM', 'Sales Manager', 'Admin Staff', 'Finance Staff', 'President', 'Operations Head'],
  // Phase 24B — new categories
  ENGAGEMENT_TYPE: [
    { code: 'TXT_PROMATS', label: 'TXT/PROMATS' },
    { code: 'MES_VIBER_GIF', label: 'MES/VIBER GIF' },
    { code: 'PICTURE', label: 'PICTURE' },
    { code: 'SIGNED_CALL', label: 'SIGNED CALL' },
    { code: 'VOICE_CALL', label: 'VOICE CALL' },
  ],
  ENGAGEMENT_LEVEL: [
    { code: '1', label: '1 - Visited 4 times' },
    { code: '2', label: '2 - Knows BDM/products' },
    { code: '3', label: '3 - Tried products' },
    { code: '4', label: '4 - In group chat' },
    { code: '5', label: '5 - Active partner' },
  ],
  DOC_TYPE: [
    { code: 'CSI', label: 'Charge Sales Invoice (CSI)' },
    { code: 'CR', label: 'Collection Receipt (CR)' },
    { code: 'CWT_2307', label: 'BIR 2307 (Withholding Tax)' },
    { code: 'GAS_RECEIPT', label: 'Gas Station Receipt' },
    { code: 'ODOMETER', label: 'Odometer' },
    { code: 'OR', label: 'Expense Receipt / OR' },
    { code: 'UNDERTAKING', label: 'Undertaking of Receipt (GRN)' },
    { code: 'DR', label: 'Delivery Receipt (DR)' },
  ],
  SALE_TYPE: ['CSI', 'SERVICE_INVOICE', 'CASH_RECEIPT'],
  VAT_TYPE: ['VATABLE', 'EXEMPT', 'ZERO'],
  EXPENSE_TYPE: ['ORE', 'ACCESS'],
  OFFICE_SUPPLY_TXN_TYPE: ['PURCHASE', 'ISSUE', 'RETURN', 'ADJUSTMENT'],
  PAYMENT_MODE_TYPE: ['CASH', 'CHECK', 'BANK_TRANSFER', 'GCASH', 'CARD', 'OTHER'],
  PEOPLE_STATUS: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'SEPARATED'],
};

// List all distinct categories for current entity
exports.getCategories = catchAsync(async (req, res) => {
  const filter = {};
  if (req.entityId) filter.entity_id = req.entityId;
  const categories = await Lookup.distinct('category', filter);
  // Merge with seed defaults to show all available categories
  const allCategories = [...new Set([...categories, ...Object.keys(SEED_DEFAULTS)])].sort();
  res.json({ success: true, data: allCategories });
});

// Helper: build bulkWrite ops from seed defaults (supports string or {code,label} items)
function buildSeedOps(defaults, category, entityId, userId) {
  return defaults.map((item, i) => {
    const isObj = typeof item === 'object';
    const label = isObj ? item.label : item;
    const code = isObj ? item.code.toUpperCase() : label.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return {
      updateOne: {
        filter: { entity_id: entityId, category, code },
        update: { $setOnInsert: { label, sort_order: i * 10, is_active: true, metadata: isObj ? (item.metadata || {}) : {}, created_by: userId } },
        upsert: true
      }
    };
  });
}

// List items in a category (auto-seeds if empty and defaults exist)
exports.getByCategory = catchAsync(async (req, res) => {
  const filter = { category: req.params.category.toUpperCase() };
  if (req.entityId) filter.entity_id = req.entityId;
  if (req.query.active_only === 'true') filter.is_active = true;
  let items = await Lookup.find(filter).sort({ sort_order: 1, label: 1 }).lean();

  // Auto-seed on first access if empty and defaults exist
  if (items.length === 0 && req.entityId && SEED_DEFAULTS[filter.category]) {
    const ops = buildSeedOps(SEED_DEFAULTS[filter.category], filter.category, req.entityId, req.user?._id);
    await Lookup.bulkWrite(ops);
    items = await Lookup.find(filter).sort({ sort_order: 1, label: 1 }).lean();
  }

  res.json({ success: true, data: items });
});

// Create a lookup item
exports.create = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required. President must select a working entity first.' });
  const { category, code, label, sort_order, metadata } = req.body;
  const item = await Lookup.create({
    entity_id: req.entityId,
    category: category.toUpperCase(),
    code: code.toUpperCase(),
    label,
    sort_order: sort_order || 0,
    metadata: metadata || {},
    created_by: req.user._id
  });
  res.status(201).json({ success: true, data: item });
});

// Update a lookup item
exports.update = catchAsync(async (req, res) => {
  const allowed = ['label', 'sort_order', 'is_active', 'metadata'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const item = await Lookup.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: 'Lookup item not found' });
  res.json({ success: true, data: item });
});

// Delete a lookup item (soft — set is_active=false)
exports.remove = catchAsync(async (req, res) => {
  const item = await Lookup.findByIdAndUpdate(req.params.id, { $set: { is_active: false } }, { new: true });
  if (!item) return res.status(404).json({ success: false, message: 'Lookup item not found' });
  res.json({ success: true, data: item, message: 'Item deactivated' });
});

// Seed defaults for a category (upsert — won't overwrite existing)
exports.seedCategory = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required. President must select a working entity first.' });
  const category = req.params.category.toUpperCase();
  const defaults = SEED_DEFAULTS[category];
  if (!defaults) return res.status(400).json({ success: false, message: `No defaults for category: ${category}` });

  const ops = buildSeedOps(defaults, category, req.entityId, req.user._id);
  await Lookup.bulkWrite(ops);
  const items = await Lookup.find({ entity_id: req.entityId, category }).sort({ sort_order: 1 }).lean();
  res.json({ success: true, data: items, message: `Seeded ${defaults.length} defaults for ${category}` });
});

// Get seed defaults (for frontend to show available categories)
exports.getSeedDefaults = catchAsync(async (req, res) => {
  const summary = {};
  for (const [cat, items] of Object.entries(SEED_DEFAULTS)) {
    summary[cat] = { count: items.length, sample: items.slice(0, 3) };
  }
  res.json({ success: true, data: summary });
});
