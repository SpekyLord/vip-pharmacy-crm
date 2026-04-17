const { classifyExpense, getCategories } = require('../services/expenseClassifier');
const VendorMaster = require('../models/VendorMaster');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * POST /api/erp/classify
 * Classify an expense from extracted fields
 */
const classify = catchAsync(async (req, res) => {
  const { supplier_name, amount, vat_amount } = req.body;
  const result = await classifyExpense({
    supplier_name: { value: supplier_name },
    amount: { value: amount },
    vat_amount: { value: vat_amount }
  }, { entityId: req.entityId });
  res.json({ success: true, data: result });
});

/**
 * POST /api/erp/classify/override
 * User overrides classification. Optionally saves as vendor default.
 */
const override = catchAsync(async (req, res) => {
  const { vendor_id, supplier_name, new_coa_code, new_category, save_as_default } = req.body;

  if (!new_coa_code) {
    return res.status(400).json({ success: false, message: 'new_coa_code is required' });
  }

  if (save_as_default) {
    if (vendor_id) {
      // Update existing vendor's default
      await VendorMaster.findByIdAndUpdate(vendor_id, {
        $set: {
          default_coa_code: new_coa_code,
          default_expense_category: new_category,
          updated_by: req.user._id
        }
      });
    } else if (supplier_name) {
      // Create new vendor with this default
      await VendorMaster.create({
        entity_id: req.entityId,
        vendor_name: supplier_name.trim(),
        vendor_aliases: [supplier_name.trim().toUpperCase()],
        default_coa_code: new_coa_code,
        default_expense_category: new_category,
        created_by: req.user._id
      });
    }
  }

  res.json({
    success: true,
    message: save_as_default ? 'Classification overridden and saved as vendor default' : 'Classification overridden',
    data: { coa_code: new_coa_code, expense_category: new_category }
  });
});

/**
 * GET /api/erp/classify/categories
 * Return available expense categories for dropdown
 */
const categories = catchAsync(async (req, res) => {
  res.json({ success: true, data: await getCategories(req.entityId) });
});

module.exports = { classify, override, categories };
