const Hospital = require('../models/Hospital');
const { catchAsync } = require('../../middleware/errorHandler');
const { ROLES } = require('../../constants/roles');
const XLSX = require('xlsx');

const getAll = catchAsync(async (req, res) => {
  // Hospitals are globally shared (Phase 4A.3) — no entity_id filter
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    filter.hospital_name = { $regex: req.query.q, $options: 'i' };
  }

  // BDM sees only their tagged hospitals; admin/president/finance/ceo see all
  const bdmRoles = [ROLES.CONTRACTOR];
  if (bdmRoles.includes(req.user?.role) || req.query.my === 'true') {
    filter.tagged_bdms = {
      $elemMatch: { bdm_id: req.user._id, is_active: { $ne: false } }
    };
  }

  const page = parseInt(req.query.page) || 1;
  const rawLimit = req.query.limit;
  const limit = rawLimit === '0' || rawLimit === 0 ? 0 : (parseInt(rawLimit) || 50);
  const skip = (page - 1) * (limit || 1);

  const query = Hospital.find(filter).sort({ hospital_name: 1 });
  if (limit > 0) query.skip(skip).limit(limit);

  const [hospitals, total] = await Promise.all([
    query.lean(),
    Hospital.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: hospitals,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

const getById = catchAsync(async (req, res) => {
  const hospital = await Hospital.findById(req.params.id).lean();
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, data: hospital });
});

const create = catchAsync(async (req, res) => {
  const hospital = await Hospital.create(req.body);
  res.status(201).json({ success: true, data: hospital });
});

const update = catchAsync(async (req, res) => {
  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $set: req.body },
    { new: true, runValidators: true }
  );
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, data: hospital });
});

const deactivate = catchAsync(async (req, res) => {
  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $set: { status: 'INACTIVE' } },
    { new: true }
  );
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, message: 'Hospital deactivated', data: hospital });
});

const addAlias = catchAsync(async (req, res) => {
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ success: false, message: 'Alias is required' });

  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $addToSet: { hospital_aliases: alias.trim() } },
    { new: true }
  );
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, data: hospital });
});

const removeAlias = catchAsync(async (req, res) => {
  const { alias } = req.body;
  if (!alias) return res.status(400).json({ success: false, message: 'Alias is required' });

  const hospital = await Hospital.findByIdAndUpdate(
    req.params.id,
    { $pull: { hospital_aliases: alias.trim() } },
    { new: true }
  );
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' });
  res.json({ success: true, data: hospital });
});

// ═══ Export Hospitals (Excel) ═══
const exportHospitals = catchAsync(async (req, res) => {
  const hospitals = await Hospital.find({}).sort({ hospital_name: 1 })
    .select('-__v -tagged_bdms -hospital_name_clean -createdAt -updatedAt')
    .lean();

  const rows = hospitals.map(h => ({
    'Hospital Name': h.hospital_name,
    'Aliases': (h.hospital_aliases || []).join('; '),
    'TIN': h.tin || '',
    'Payment Terms': h.payment_terms ?? 30,
    'VAT Status': h.vat_status || 'VATABLE',
    'CWT Rate': h.cwt_rate ?? 0.01,
    'ATC Code': h.atc_code || 'WC158',
    'Credit Limit': h.credit_limit ?? '',
    'Credit Limit Action': h.credit_limit_action || 'WARN',
    'Top WH Agent': h.is_top_withholding_agent ? 'YES' : 'NO',
    'Hospital Type': h.hospital_type || '',
    'Bed Capacity': h.bed_capacity ?? '',
    'Level': h.level || '',
    'Purchaser Name': h.purchaser_name || '',
    'Purchaser Phone': h.purchaser_phone || '',
    'Chief Pharmacist': h.chief_pharmacist_name || '',
    'Chief Pharmacist Phone': h.chief_pharmacist_phone || '',
    'Key Decision Maker': h.key_decision_maker || '',
    'Engagement Level': h.engagement_level ?? '',
    'Major Events': (h.major_events || []).join('; '),
    'Programs to Level 5': h.programs_to_level_5 || '',
    'Address': h.address || '',
    'Contact Person': h.contact_person || '',
    'Status': h.status || 'ACTIVE'
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 35 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Hospitals');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="hospitals-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import Hospitals (Excel) — upsert by hospital_name ═══
const importHospitals = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  let created = 0, updated = 0, errors = [];

  for (const r of rows) {
    const hospital_name = String(r['Hospital Name'] || r.hospital_name || '').trim();
    if (!hospital_name) { errors.push({ hospital_name: '(empty)', error: 'Hospital name is required' }); continue; }

    const data = {
      hospital_name,
      tin: String(r['TIN'] || r.tin || '').trim() || undefined,
      payment_terms: r['Payment Terms'] != null ? Number(r['Payment Terms']) : 30,
      vat_status: String(r['VAT Status'] || r.vat_status || 'VATABLE').trim().toUpperCase(),
      cwt_rate: r['CWT Rate'] != null ? Number(r['CWT Rate']) : 0.01,
      atc_code: String(r['ATC Code'] || r.atc_code || 'WC158').trim(),
      credit_limit: r['Credit Limit'] != null && r['Credit Limit'] !== '' ? Number(r['Credit Limit']) : null,
      credit_limit_action: String(r['Credit Limit Action'] || r.credit_limit_action || 'WARN').trim().toUpperCase(),
      is_top_withholding_agent: String(r['Top WH Agent'] || '').toUpperCase() === 'YES',
      hospital_type: String(r['Hospital Type'] || r.hospital_type || '').trim() || undefined,
      bed_capacity: r['Bed Capacity'] != null && r['Bed Capacity'] !== '' ? Number(r['Bed Capacity']) : undefined,
      level: String(r['Level'] || r.level || '').trim() || undefined,
      purchaser_name: String(r['Purchaser Name'] || '').trim() || undefined,
      purchaser_phone: String(r['Purchaser Phone'] || '').trim() || undefined,
      chief_pharmacist_name: String(r['Chief Pharmacist'] || '').trim() || undefined,
      chief_pharmacist_phone: String(r['Chief Pharmacist Phone'] || '').trim() || undefined,
      key_decision_maker: String(r['Key Decision Maker'] || '').trim() || undefined,
      engagement_level: r['Engagement Level'] != null && r['Engagement Level'] !== '' ? Number(r['Engagement Level']) : undefined,
      address: String(r['Address'] || r.address || '').trim() || undefined,
      contact_person: String(r['Contact Person'] || r.contact_person || '').trim() || undefined,
      status: String(r['Status'] || r.status || 'ACTIVE').trim().toUpperCase()
    };

    // Handle aliases
    const aliasStr = String(r['Aliases'] || r.hospital_aliases || '').trim();
    if (aliasStr) data.hospital_aliases = aliasStr.split(';').map(a => a.trim()).filter(Boolean);

    // Handle major events
    const eventsStr = String(r['Major Events'] || '').trim();
    if (eventsStr) data.major_events = eventsStr.split(';').map(e => e.trim()).filter(Boolean);

    // Handle programs
    const programs = String(r['Programs to Level 5'] || '').trim();
    if (programs) data.programs_to_level_5 = programs;

    try {
      const { cleanName } = require('../utils/nameClean');
      const nameClean = cleanName(hospital_name);
      const result = await Hospital.findOneAndUpdate(
        { hospital_name_clean: nameClean },
        { $set: { ...data, hospital_name_clean: nameClean } },
        { upsert: true, new: true }
      );
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) created++;
      else updated++;
    } catch (err) {
      errors.push({ hospital_name, error: err.message });
    }
  }

  res.json({
    success: true,
    message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`,
    data: { created, updated, errors }
  });
});

module.exports = { getAll, getById, create, update, deactivate, addAlias, removeAlias, exportHospitals, importHospitals };
