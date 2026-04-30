const Hospital = require('../models/Hospital');
const Warehouse = require('../models/Warehouse');
const { catchAsync } = require('../../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../../constants/roles');
const { buildHospitalAccessFilter } = require('../utils/hospitalAccess');
const { markCrossEntityAllowed } = require('../../middleware/requestContext');
const XLSX = require('xlsx');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');

const getAll = catchAsync(async (req, res) => {
  // Hospitals are globally shared (Phase 4A.3) — no entity_id filter
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    filter.hospital_name = { $regex: req.query.q, $options: 'i' };
  }

  // ── Proxy/warehouse-scoped hospital list ───────────────────────────────
  // SalesEntry (and any proxy-aware caller) passes ?warehouse_id=<id> so the
  // dropdown reflects hospitals tied to the SELECTED warehouse rather than the
  // logged-in user's own warehouses. Without this, a proxy filing on behalf of
  // another BDM would see THEIR OWN hospitals, not the target warehouse's —
  // causing the buggy fallback observed in Phase G4.5a proxy entry.
  //
  // Access guard: the caller must be entitled to see the warehouse, using the
  // same rules as `GET /warehouse/my` (admin-like → any; ERP-enabled BDM → any
  // active warehouse in their working entity; otherwise → manager_id or
  // assigned_users membership). If the warehouse fails the guard, fall through
  // to user-scoped behavior so we don't leak hospitals tied to inaccessible
  // warehouses.
  const warehouseIdParam = req.query.warehouse_id ? String(req.query.warehouse_id).trim() : '';
  let warehouseScoped = false;
  if (warehouseIdParam) {
    const whGuard = { _id: warehouseIdParam, is_active: true };
    if (!isAdminLike(req.user.role)) {
      if (req.user.erp_access?.enabled && req.entityId) {
        whGuard.entity_id = req.entityId;
      } else {
        whGuard.$or = [
          { manager_id: req.user._id },
          { assigned_users: req.user._id },
        ];
        if (req.entityId) whGuard.entity_id = req.entityId;
      }
    }
    const wh = await Warehouse.findOne(whGuard).select('_id').lean();
    if (wh) {
      filter.warehouse_ids = wh._id;
      warehouseScoped = true;
    }
    // If the guard fails we silently fall through to user-scoped — never leak
    // by bypassing the filter entirely.
  }

  // BDM sees only hospitals assigned to their warehouse(s); admin/president/finance/ceo see all
  // Scalable: warehouse_ids is the primary mechanism; tagged_bdms is legacy fallback
  // ?my=true forces BDM filter even for admin-like roles
  const forceMyFilter = req.query.my === 'true';
  if (!warehouseScoped) {
    const effectiveUser = forceMyFilter ? { ...req.user, role: 'staff' } : req.user;
    Object.assign(filter, await buildHospitalAccessFilter(effectiveUser));
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
  // Gate by the same access filter as getAll — a BDM must not be able to fetch a
  // hospital's detail record by guessing/enumerating _id. 404 on miss (not 403)
  // so we don't confirm existence to unauthorized callers.
  const accessFilter = await buildHospitalAccessFilter(req.user);
  const hospital = await Hospital.findOne({ _id: req.params.id, ...accessFilter }).lean();
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
  markCrossEntityAllowed(req, 'admin Hospital export reads warehouse codes across all entities (Hospital.warehouse_ids is multi-entity per Phase G3)');

  const hospitals = await Hospital.find({}).sort({ hospital_name: 1 })
    .select('-__v -tagged_bdms -hospital_name_clean -createdAt -updatedAt')
    .lean();

  // Build warehouse lookup for codes
  // eslint-disable-next-line vip-tenant/require-entity-filter -- admin Hospital export reads warehouse codes across all entities (Hospital.warehouse_ids is multi-entity per Phase G3)
  const allWarehouses = await Warehouse.find({ is_active: true }).select('_id warehouse_code').lean();
  const whMap = new Map(allWarehouses.map(w => [w._id.toString(), w.warehouse_code]));

  const rows = hospitals.map(h => ({
    'Hospital Name': h.hospital_name,
    'Warehouse Codes': (h.warehouse_ids || []).map(id => whMap.get(id.toString()) || '?').join('; '),
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
  ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 30 }, { wch: 18 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Hospitals');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="hospitals-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import Hospitals (Excel) — upsert by hospital_name ═══
const importHospitals = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });

  markCrossEntityAllowed(req, 'admin Hospital import resolves warehouse codes across all entities (Hospital.warehouse_ids is multi-entity per Phase G3)');

  const wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  // Build warehouse code→id map for import
  // eslint-disable-next-line vip-tenant/require-entity-filter -- admin Hospital import resolves warehouse codes across all entities (Hospital.warehouse_ids is multi-entity per Phase G3)
  const allWarehouses = await Warehouse.find({ is_active: true }).select('_id warehouse_code').lean();
  const whCodeToId = new Map(allWarehouses.map(w => [w.warehouse_code.toUpperCase(), w._id]));

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

    // Handle warehouse codes (semicolon-separated, e.g. "GSC;ILO-MAIN")
    const whStr = String(r['Warehouse Codes'] || r.warehouse_codes || '').trim();
    if (whStr) {
      const codes = whStr.split(';').map(c => c.trim().toUpperCase()).filter(Boolean);
      const resolvedIds = [];
      for (const code of codes) {
        const id = whCodeToId.get(code);
        if (id) resolvedIds.push(id);
        else errors.push({ hospital_name, error: `Unknown warehouse code: ${code}` });
      }
      if (resolvedIds.length > 0) data.warehouse_ids = resolvedIds;
    }

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
