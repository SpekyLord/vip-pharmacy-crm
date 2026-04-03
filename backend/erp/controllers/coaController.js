/**
 * COA Controller — Chart of Accounts CRUD
 *
 * Finance/Admin/President can create and update accounts.
 * All authenticated ERP users with accounting access can list.
 */
const ChartOfAccounts = require('../models/ChartOfAccounts');
const { catchAsync } = require('../../middleware/errorHandler');

// ═══ List Accounts ═══
const listAccounts = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };

  if (req.query.account_type) filter.account_type = req.query.account_type;
  if (req.query.account_subtype) filter.account_subtype = req.query.account_subtype;
  if (req.query.bir_flag) filter.bir_flag = req.query.bir_flag;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  if (req.query.search) {
    filter.$or = [
      { account_code: { $regex: req.query.search, $options: 'i' } },
      { account_name: { $regex: req.query.search, $options: 'i' } }
    ];
  }

  const accounts = await ChartOfAccounts.find(filter)
    .sort({ account_code: 1 })
    .lean();

  res.json({ success: true, data: accounts });
});

// ═══ Create Account ═══
const createAccount = catchAsync(async (req, res) => {
  const { account_code, account_name, account_type, account_subtype, normal_balance, bir_flag, parent_code } = req.body;

  if (!account_code || !account_name || !account_type || !normal_balance) {
    return res.status(400).json({ success: false, message: 'account_code, account_name, account_type, and normal_balance are required' });
  }

  const account = await ChartOfAccounts.create({
    entity_id: req.entityId,
    account_code,
    account_name,
    account_type,
    account_subtype,
    normal_balance,
    bir_flag: bir_flag || 'BOTH',
    parent_code
  });

  res.status(201).json({ success: true, data: account });
});

// ═══ Update Account ═══
const updateAccount = catchAsync(async (req, res) => {
  const account = await ChartOfAccounts.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!account) {
    return res.status(404).json({ success: false, message: 'Account not found' });
  }

  const allowed = ['account_name', 'account_subtype', 'bir_flag', 'is_active', 'parent_code'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) account[field] = req.body[field];
  }

  await account.save();
  res.json({ success: true, data: account });
});

// ═══ Deactivate Account ═══
const deactivateAccount = catchAsync(async (req, res) => {
  const account = await ChartOfAccounts.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!account) {
    return res.status(404).json({ success: false, message: 'Account not found' });
  }

  account.is_active = false;
  await account.save();
  res.json({ success: true, message: `Account ${account.account_code} deactivated` });
});

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  deactivateAccount,
};
