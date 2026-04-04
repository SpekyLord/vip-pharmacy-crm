const BankAccount = require('../models/BankAccount');
const PaymentMode = require('../models/PaymentMode');
const ExpenseComponent = require('../models/ExpenseComponent');
const { catchAsync } = require('../../middleware/errorHandler');

// Generic CRUD factory for simple lookup collections
const createCrud = (Model, name) => ({
  getAll: catchAsync(async (req, res) => {
    const filter = {};
    // Filter by entity — use query param or tenant filter
    if (req.query.entity_id) filter.entity_id = req.query.entity_id;
    else if (req.entityId) filter.entity_id = req.entityId;
    if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
    const items = await Model.find(filter).sort({ _id: 1 }).lean();
    res.json({ success: true, data: items });
  }),

  create: catchAsync(async (req, res) => {
    const item = await Model.create(req.body);
    res.status(201).json({ success: true, data: item });
  }),

  update: catchAsync(async (req, res) => {
    const item = await Model.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: `${name} not found` });
    res.json({ success: true, data: item });
  }),

  remove: catchAsync(async (req, res) => {
    const item = await Model.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: `${name} not found` });
    res.json({ success: true, message: `${name} deleted` });
  })
});

module.exports = {
  bankAccounts: createCrud(BankAccount, 'Bank account'),
  paymentModes: createCrud(PaymentMode, 'Payment mode'),
  expenseComponents: createCrud(ExpenseComponent, 'Expense component'),
};
