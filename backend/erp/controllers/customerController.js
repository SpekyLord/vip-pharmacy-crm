/**
 * Customer Controller — CRUD + BDM tagging for non-hospital customers
 * Phase 18 — mirrors hospitalController pattern but entity-scoped
 */
const Customer = require('../models/Customer');
const { catchAsync } = require('../../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../../constants/roles');
const XLSX = require('xlsx');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');

const getAll = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.customer_type) filter.customer_type = req.query.customer_type;
  if (req.query.q) {
    filter.customer_name = { $regex: req.query.q, $options: 'i' };
  }

  // BDM sees only their tagged customers; admin/president/finance/ceo see all
  if (!isAdminLike(req.user?.role) || req.query.my === 'true') {
    filter.tagged_bdms = {
      $elemMatch: { bdm_id: req.user._id, is_active: { $ne: false } }
    };
  }

  const page = parseInt(req.query.page) || 1;
  const rawLimit = req.query.limit;
  const limit = rawLimit === '0' || rawLimit === 0 ? 0 : (parseInt(rawLimit) || 50);
  const skip = limit > 0 ? (page - 1) * limit : 0;

  const query = Customer.find(filter).sort({ customer_name: 1 });
  if (limit > 0) query.skip(skip).limit(limit);

  const [customers, total] = await Promise.all([
    query.lean(),
    Customer.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: customers,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

const getById = catchAsync(async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, entity_id: req.entityId }).lean();
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
});

const create = catchAsync(async (req, res) => {
  const customer = await Customer.create({ ...req.body, entity_id: req.entityId });
  res.status(201).json({ success: true, data: customer });
});

const update = catchAsync(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
});

const deactivate = catchAsync(async (req, res) => {
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $set: { status: 'INACTIVE' } },
    { new: true }
  );
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, message: 'Customer deactivated', data: customer });
});

const tagBdm = catchAsync(async (req, res) => {
  const { bdm_id } = req.body;
  if (!bdm_id) return res.status(400).json({ success: false, message: 'bdm_id is required' });

  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    {
      $addToSet: {
        tagged_bdms: { bdm_id, tagged_by: req.user._id, tagged_at: new Date(), is_active: true }
      }
    },
    { new: true }
  );
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
});

const untagBdm = catchAsync(async (req, res) => {
  const { bdm_id } = req.body;
  if (!bdm_id) return res.status(400).json({ success: false, message: 'bdm_id is required' });

  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, entity_id: req.entityId },
    { $pull: { tagged_bdms: { bdm_id } } },
    { new: true }
  );
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
  res.json({ success: true, data: customer });
});

// ═══ Export Customers (Excel) ═══
const exportCustomers = catchAsync(async (req, res) => {
  const customers = await Customer.find({ entity_id: req.entityId }).sort({ customer_name: 1 })
    .select('-__v -tagged_bdms -customer_name_clean -createdAt -updatedAt')
    .lean();

  const rows = customers.map(c => ({
    'Customer Name': c.customer_name,
    'Aliases': (c.customer_aliases || []).join('; '),
    'Customer Type': c.customer_type || '',
    'Default Sale Type': c.default_sale_type || 'CASH_RECEIPT',
    'TIN': c.tin || '',
    'VAT Status': c.vat_status || 'VATABLE',
    'Payment Terms': c.payment_terms ?? 30,
    'Credit Limit': c.credit_limit ?? '',
    'Credit Limit Action': c.credit_limit_action || 'WARN',
    'Address': c.address || '',
    'Contact Person': c.contact_person || '',
    'Contact Phone': c.contact_phone || '',
    'Contact Email': c.contact_email || '',
    'Status': c.status || 'ACTIVE'
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="customers-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import Customers (Excel) — upsert by customer_name ═══
const importCustomers = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });

  const wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  let created = 0, updated = 0, errors = [];

  for (const r of rows) {
    const customer_name = String(r['Customer Name'] || r.customer_name || '').trim();
    if (!customer_name) { errors.push({ customer_name: '(empty)', error: 'Customer name is required' }); continue; }

    const data = {
      customer_name,
      customer_type: String(r['Customer Type'] || r.customer_type || '').trim().toUpperCase() || null,
      default_sale_type: String(r['Default Sale Type'] || r.default_sale_type || 'CASH_RECEIPT').trim().toUpperCase(),
      tin: String(r['TIN'] || r.tin || '').trim() || undefined,
      vat_status: String(r['VAT Status'] || r.vat_status || 'VATABLE').trim().toUpperCase(),
      payment_terms: r['Payment Terms'] != null ? Number(r['Payment Terms']) : 30,
      credit_limit: r['Credit Limit'] != null && r['Credit Limit'] !== '' ? Number(r['Credit Limit']) : null,
      credit_limit_action: String(r['Credit Limit Action'] || r.credit_limit_action || 'WARN').trim().toUpperCase(),
      address: String(r['Address'] || r.address || '').trim() || undefined,
      contact_person: String(r['Contact Person'] || r.contact_person || '').trim() || undefined,
      contact_phone: String(r['Contact Phone'] || r.contact_phone || '').trim() || undefined,
      contact_email: String(r['Contact Email'] || r.contact_email || '').trim() || undefined,
      status: String(r['Status'] || r.status || 'ACTIVE').trim().toUpperCase()
    };

    const aliasStr = String(r['Aliases'] || r.customer_aliases || '').trim();
    if (aliasStr) data.customer_aliases = aliasStr.split(';').map(a => a.trim()).filter(Boolean);

    try {
      const { cleanName } = require('../utils/nameClean');
      const nameClean = cleanName(customer_name);
      const result = await Customer.findOneAndUpdate(
        { entity_id: req.entityId, customer_name_clean: nameClean },
        { $set: { ...data, entity_id: req.entityId, customer_name_clean: nameClean } },
        { upsert: true, new: true }
      );
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) created++;
      else updated++;
    } catch (err) {
      errors.push({ customer_name, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`,
    data: { created, updated, errors }
  });
});

module.exports = { getAll, getById, create, update, deactivate, tagBdm, untagBdm, exportCustomers, importCustomers };
