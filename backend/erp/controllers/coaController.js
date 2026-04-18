/**
 * COA Controller — Chart of Accounts CRUD
 *
 * Finance/Admin/President can create and update accounts.
 * All authenticated ERP users with accounting access can list.
 */
const ChartOfAccounts = require('../models/ChartOfAccounts');
const { catchAsync } = require('../../middleware/errorHandler');
const XLSX = require('xlsx');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');

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

  // #14 Hardening: Enforce 4-digit account_code format
  if (!/^\d{4}$/.test(account_code)) {
    return res.status(400).json({ success: false, message: `account_code "${account_code}" must be exactly 4 digits (e.g., 1000, 6900)` });
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

  const allowed = ['account_name', 'normal_balance', 'account_subtype', 'bir_flag', 'is_active', 'parent_code'];
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

// ═══ Export COA (Excel or JSON) ═══
const exportAccounts = catchAsync(async (req, res) => {
  const accounts = await ChartOfAccounts.find({ entity_id: req.entityId })
    .sort({ account_code: 1 })
    .select('account_code account_name account_type account_subtype normal_balance bir_flag parent_code is_active -_id')
    .lean();

  const format = (req.query.format || 'xlsx').toLowerCase();

  if (format === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="coa-export.json"`);
    return res.json({ success: true, data: accounts, count: accounts.length });
  }

  // Excel export (default) — Google Sheets compatible
  const rows = accounts.map(a => ({
    'Account Code': a.account_code,
    'Account Name': a.account_name,
    'Type': a.account_type,
    'Subtype': a.account_subtype || '',
    'Normal Balance': a.normal_balance,
    'BIR Flag': a.bir_flag || 'BOTH',
    'Parent Code': a.parent_code || '',
    'Active': a.is_active !== false ? 'YES' : 'NO'
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 35 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Chart of Accounts');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="coa-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import COA (Excel or JSON) — upsert by account_code ═══
const importAccounts = catchAsync(async (req, res) => {
  let accounts;

  // If file uploaded (Excel), parse it
  if (req.file) {
    const wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    accounts = rows.map(r => ({
      account_code: String(r['Account Code'] || r.account_code || '').trim(),
      account_name: String(r['Account Name'] || r.account_name || '').trim(),
      account_type: String(r['Type'] || r.account_type || '').trim().toUpperCase(),
      account_subtype: String(r['Subtype'] || r.account_subtype || '').trim(),
      normal_balance: String(r['Normal Balance'] || r.normal_balance || '').trim().toUpperCase(),
      bir_flag: String(r['BIR Flag'] || r.bir_flag || 'BOTH').trim().toUpperCase(),
      parent_code: String(r['Parent Code'] || r.parent_code || '').trim() || null,
      is_active: String(r['Active'] || r.is_active || 'YES').toUpperCase() !== 'NO'
    })).filter(a => a.account_code && a.account_name);
  } else {
    // JSON body
    accounts = req.body.accounts;
  }

  if (!Array.isArray(accounts) || !accounts.length) {
    return res.status(400).json({ success: false, message: 'Upload an Excel file or send { accounts: [...] } in JSON body' });
  }

  let created = 0, updated = 0, errors = [];

  for (const acct of accounts) {
    if (!acct.account_code || !acct.account_name || !acct.account_type || !acct.normal_balance) {
      errors.push({ account_code: acct.account_code, error: 'Missing required fields (account_code, account_name, account_type, normal_balance)' });
      continue;
    }

    try {
      const result = await ChartOfAccounts.findOneAndUpdate(
        { entity_id: req.entityId, account_code: acct.account_code },
        {
          entity_id: req.entityId,
          account_code: acct.account_code,
          account_name: acct.account_name,
          account_type: acct.account_type,
          account_subtype: acct.account_subtype || '',
          normal_balance: acct.normal_balance,
          bir_flag: acct.bir_flag || 'BOTH',
          parent_code: acct.parent_code || null,
          is_active: acct.is_active !== false
        },
        { upsert: true, new: true }
      );
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) {
        created++;
      } else {
        updated++;
      }
    } catch (err) {
      errors.push({ account_code: acct.account_code, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`,
    data: { created, updated, errors }
  });
});

// ═══ Seed Default COA ═══
// Lookup-driven (Rule #3): the template is loaded from Lookup category COA_TEMPLATE
// for the current entity. Subscribers customize defaults via Control Center →
// Lookup Tables. The bootstrap defaults live in seedCOA.COA_TEMPLATE_LOOKUP_SHAPE
// and auto-seed the Lookup on first call so existing entities always pick up new
// canonical accounts (e.g., when the template is extended in code).
const { loadCoaTemplateForEntity } = require('../scripts/seedCOA');

const seedDefaultCOA = catchAsync(async (req, res) => {
  if (!req.entityId) {
    return res.status(400).json({ success: false, message: 'Entity context required.' });
  }

  const template = await loadCoaTemplateForEntity(req.entityId);
  let created = 0;
  for (const acct of template) {
    const result = await ChartOfAccounts.updateOne(
      { entity_id: req.entityId, account_code: acct.account_code },
      {
        $setOnInsert: {
          entity_id: req.entityId,
          ...acct,
          bir_flag: acct.bir_flag || 'BOTH',
          is_active: acct.is_active !== undefined ? acct.is_active : true
        }
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created++;
  }

  res.json({
    success: true,
    message: `Seed complete: ${created} new accounts created (${template.length} in template)`,
    data: { created, total_template: template.length }
  });
});

module.exports = {
  listAccounts,
  createAccount,
  updateAccount,
  deactivateAccount,
  exportAccounts,
  importAccounts,
  seedDefaultCOA,
};
