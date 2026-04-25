/**
 * Rx Correlation Service — Gap 9 Analytics Engine
 *
 * Joins CRM visit data with ERP sales and collection/rebate data to measure
 * the ROI of field visits. Answers: "When BDMs visit doctors, does it translate
 * to sales and collections in the same territory?"
 *
 * Data flow:
 *   CRM Visit (doctor, user, productsDiscussed) → mapped via ProductMapping → ERP SalesLine
 *   ERP Collection (partner_tags[].rebate_amount) → rebate attribution per MD partner
 *
 * All date handling uses Manila timezone (+08:00).
 */

const mongoose = require('mongoose');

// CRM models (no entity_id)
const Visit = require('../../models/Visit');
const Doctor = require('../../models/Doctor');
const CrmProduct = require('../../models/CrmProduct');

// ERP models (entity-scoped unless noted)
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const ProductMaster = require('../models/ProductMaster');
const Territory = require('../models/Territory');
const PeopleMaster = require('../models/PeopleMaster');
const ProductMapping = require('../models/ProductMapping');
const Hospital = require('../models/Hospital'); // globally shared, no entity_id

// ─── Helpers ────────────────────────────────────────────────────────────────

function periodToDates(period) {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(id);
}

/**
 * Build BDM user_id → territory_id map from PeopleMaster
 */
async function buildBdmToTerritoryMap(entityId) {
  const people = await PeopleMaster.find({
    entity_id: toObjectId(entityId),
    is_active: true,
    territory_id: { $ne: null },
  }).select('user_id territory_id').lean();

  const map = new Map();
  for (const p of people) {
    if (p.user_id) {
      map.set(p.user_id.toString(), p.territory_id.toString());
    }
  }
  return map;
}

/**
 * Build CRM product_id → ERP product_id map from ProductMapping
 */
async function buildCrmToErpMap(entityId) {
  const mappings = await ProductMapping.find({
    entity_id: toObjectId(entityId),
    is_active: true,
  }).select('crm_product_id erp_product_id').lean();

  const map = new Map();
  for (const m of mappings) {
    map.set(m.crm_product_id.toString(), m.erp_product_id.toString());
  }
  return map;
}

/**
 * Generate array of period strings between startMonth and endMonth (inclusive)
 */
function generateMonthRange(startMonth, endMonth) {
  const months = [];
  let [y, m] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);

  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ─── 1. Correlation Summary ────────────────────────────────────────────────

/**
 * getCorrelationSummary — territory-level summary joining visits, sales, and rebates
 */
async function getCorrelationSummary(entityId, period, filters = {}) {
  const eId = toObjectId(entityId);
  const { start, end } = periodToDates(period);

  // Build lookup maps in parallel
  const [bdmToTerritory, crmToErp] = await Promise.all([
    buildBdmToTerritoryMap(entityId),
    buildCrmToErpMap(entityId),
  ]);

  // ── Visit aggregation ──
  const visitMatchStage = {
    monthYear: period,
    status: 'completed',
  };

  const visitPipeline = [
    { $match: visitMatchStage },
    {
      $lookup: {
        from: 'doctors',
        localField: 'doctor',
        foreignField: '_id',
        as: 'doctorInfo',
      },
    },
    { $unwind: { path: '$doctorInfo', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$productsDiscussed', preserveNullAndEmptyArrays: false } },
  ];

  // Apply optional filters
  const postLookupMatch = {};
  if (filters.program) {
    postLookupMatch['doctorInfo.programsToImplement'] = filters.program;
  }
  if (filters.support_type) {
    postLookupMatch['doctorInfo.supportDuringCoverage'] = filters.support_type;
  }
  if (filters.client_type) {
    postLookupMatch['doctorInfo.clientType'] = filters.client_type;
  }
  if (Object.keys(postLookupMatch).length > 0) {
    visitPipeline.push({ $match: postLookupMatch });
  }

  visitPipeline.push({
    $group: {
      _id: {
        user: '$user',
        product: '$productsDiscussed.product',
      },
      visit_count: { $sum: 1 },
      unique_doctors: { $addToSet: '$doctor' },
    },
  });

  const visitResults = await Visit.aggregate(visitPipeline);

  // Post-process visits: map user→territory, crm_product→erp_product
  // Group by territory_id
  const visitsByTerritory = new Map(); // territory_id → { visit_count, unique_doctors, products: Map<erp_product_id, count> }

  for (const row of visitResults) {
    const userId = row._id.user?.toString();
    const crmProductId = row._id.product?.toString();
    const territoryId = userId ? bdmToTerritory.get(userId) : null;
    if (!territoryId) continue;

    // Filter by territory if specified
    if (filters.territory_id && territoryId !== filters.territory_id.toString()) continue;

    // Filter by pathway (PS/NON_PS) — skip if no mapping and pathway=PS
    const erpProductId = crmProductId ? crmToErp.get(crmProductId) : null;
    if (filters.pathway === 'PS' && !erpProductId) continue;
    if (filters.pathway === 'NON_PS' && erpProductId) continue;

    if (!visitsByTerritory.has(territoryId)) {
      visitsByTerritory.set(territoryId, {
        visit_count: 0,
        unique_doctors: new Set(),
        products: new Map(),
      });
    }
    const terr = visitsByTerritory.get(territoryId);
    terr.visit_count += row.visit_count;
    for (const d of row.unique_doctors) {
      terr.unique_doctors.add(d.toString());
    }
    if (erpProductId) {
      terr.products.set(erpProductId, (terr.products.get(erpProductId) || 0) + row.visit_count);
    }
  }

  // ── Sales aggregation ──
  const salesPipeline = [
    {
      $match: {
        entity_id: eId,
        status: 'POSTED',
        csi_date: { $gte: start, $lt: end },
      },
    },
    { $unwind: '$line_items' },
    {
      $group: {
        _id: { bdm_id: '$bdm_id', product_id: '$line_items.product_id' },
        sales_qty: { $sum: '$line_items.qty' },
        sales_revenue: { $sum: '$line_items.line_total' },
      },
    },
  ];

  const salesResults = await SalesLine.aggregate(salesPipeline);

  // Map sales by territory
  const salesByTerritory = new Map(); // territory_id → { total_qty, total_revenue, products: Map }

  for (const row of salesResults) {
    const bdmId = row._id.bdm_id?.toString();
    const productId = row._id.product_id?.toString();
    const territoryId = bdmId ? bdmToTerritory.get(bdmId) : null;
    if (!territoryId) continue;
    if (filters.territory_id && territoryId !== filters.territory_id.toString()) continue;

    if (!salesByTerritory.has(territoryId)) {
      salesByTerritory.set(territoryId, { total_qty: 0, total_revenue: 0, products: new Map() });
    }
    const terr = salesByTerritory.get(territoryId);
    terr.total_qty += row.sales_qty || 0;
    terr.total_revenue += row.sales_revenue || 0;
    if (productId) {
      const existing = terr.products.get(productId) || { qty: 0, revenue: 0 };
      existing.qty += row.sales_qty || 0;
      existing.revenue += row.sales_revenue || 0;
      terr.products.set(productId, existing);
    }
  }

  // ── Rebate aggregation ──
  const rebatePipeline = [
    {
      $match: {
        entity_id: eId,
        status: 'POSTED',
        cr_date: { $gte: start, $lt: end },
      },
    },
    { $unwind: '$settled_csis' },
    { $unwind: '$settled_csis.partner_tags' },
    {
      $group: {
        _id: '$bdm_id',
        total_rebate: { $sum: '$settled_csis.partner_tags.rebate_amount' },
      },
    },
  ];

  const rebateResults = await Collection.aggregate(rebatePipeline);

  const rebatesByTerritory = new Map();
  for (const row of rebateResults) {
    const bdmId = row._id?.toString();
    const territoryId = bdmId ? bdmToTerritory.get(bdmId) : null;
    if (!territoryId) continue;
    if (filters.territory_id && territoryId !== filters.territory_id.toString()) continue;

    rebatesByTerritory.set(territoryId, (rebatesByTerritory.get(territoryId) || 0) + (row.total_rebate || 0));
  }

  // ── Join all datasets by territory ──
  const allTerritoryIds = new Set([
    ...visitsByTerritory.keys(),
    ...salesByTerritory.keys(),
    ...rebatesByTerritory.keys(),
  ]);

  // Populate territory names — entity-scope to prevent foreign-entity leak
  const territories = await Territory.find({
    entity_id: eId,
    _id: { $in: [...allTerritoryIds].map(id => toObjectId(id)) },
  }).select('territory_code territory_name').lean();

  const territoryMap = new Map();
  for (const t of territories) {
    territoryMap.set(t._id.toString(), t);
  }

  const summaries = [];
  for (const tId of allTerritoryIds) {
    const visitData = visitsByTerritory.get(tId) || { visit_count: 0, unique_doctors: new Set(), products: new Map() };
    const salesData = salesByTerritory.get(tId) || { total_qty: 0, total_revenue: 0 };
    const rebateTotal = rebatesByTerritory.get(tId) || 0;
    const terrInfo = territoryMap.get(tId);

    summaries.push({
      territory_id: tId,
      territory_code: terrInfo?.territory_code || 'UNKNOWN',
      territory_name: terrInfo?.territory_name || 'Unknown Territory',
      visit_count: visitData.visit_count,
      unique_doctors: visitData.unique_doctors.size,
      sales_qty: Math.round(salesData.total_qty * 100) / 100,
      sales_revenue: Math.round(salesData.total_revenue * 100) / 100,
      rebate_amount: Math.round(rebateTotal * 100) / 100,
    });
  }

  summaries.sort((a, b) => b.sales_revenue - a.sales_revenue);
  return { period, filters, summaries };
}

// ─── 2. Partner Detail ─────────────────────────────────────────────────────

/**
 * getPartnerDetail — per-MD partner breakdown of rebates, sales, and visit counts
 */
async function getPartnerDetail(entityId, period, filters = {}) {
  const eId = toObjectId(entityId);
  const { start, end } = periodToDates(period);

  // Find all POSTED collections in period with partner_tags
  const collections = await Collection.find({
    entity_id: eId,
    status: 'POSTED',
    cr_date: { $gte: start, $lt: end },
    'settled_csis.partner_tags.0': { $exists: true },
  }).lean();

  // Aggregate per doctor
  const doctorAgg = new Map(); // doctor_id → { rebate_amount, sales_revenue, hospital_ids }

  for (const col of collections) {
    for (const csi of (col.settled_csis || [])) {
      for (const tag of (csi.partner_tags || [])) {
        if (!tag.doctor_id) continue;
        const docId = tag.doctor_id.toString();

        if (!doctorAgg.has(docId)) {
          doctorAgg.set(docId, {
            doctor_id: docId,
            doctor_name: tag.doctor_name || '',
            rebate_amount: 0,
            sales_revenue: 0,
            hospital_ids: new Set(),
          });
        }
        const agg = doctorAgg.get(docId);
        agg.rebate_amount += tag.rebate_amount || 0;
        agg.sales_revenue += csi.invoice_amount || 0;
        if (col.hospital_id) {
          agg.hospital_ids.add(col.hospital_id.toString());
        }
      }
    }
  }

  // Cross-reference with Visit model for visit counts
  const doctorIds = [...doctorAgg.keys()].map(id => toObjectId(id));
  const visitCounts = await Visit.aggregate([
    {
      $match: {
        monthYear: period,
        status: 'completed',
        doctor: { $in: doctorIds },
      },
    },
    {
      $group: {
        _id: '$doctor',
        visit_count: { $sum: 1 },
      },
    },
  ]);

  const visitCountMap = new Map();
  for (const v of visitCounts) {
    visitCountMap.set(v._id.toString(), v.visit_count);
  }

  // Populate doctor details and territory info
  const doctors = await Doctor.find({
    _id: { $in: doctorIds },
  }).select('firstName lastName specialization clientType assignedTo').lean();

  const doctorInfoMap = new Map();
  for (const d of doctors) {
    doctorInfoMap.set(d._id.toString(), d);
  }

  // Get territory for assigned BDMs
  const bdmToTerritory = await buildBdmToTerritoryMap(entityId);

  const results = [];
  for (const [docId, agg] of doctorAgg) {
    const docInfo = doctorInfoMap.get(docId);
    const assignedBdmId = docInfo?.assignedTo?.toString();
    const territoryId = assignedBdmId ? bdmToTerritory.get(assignedBdmId) : null;

    if (filters.territory_id && territoryId !== filters.territory_id?.toString()) continue;

    results.push({
      doctor_id: docId,
      doctor_name: docInfo
        ? `${docInfo.firstName} ${docInfo.lastName}`.trim()
        : agg.doctor_name,
      specialization: docInfo?.specialization || '',
      client_type: docInfo?.clientType || 'MD',
      territory_id: territoryId || null,
      visit_count: visitCountMap.get(docId) || 0,
      rebate_amount: Math.round(agg.rebate_amount * 100) / 100,
      sales_revenue: Math.round(agg.sales_revenue * 100) / 100,
      hospital_count: agg.hospital_ids.size,
    });
  }

  results.sort((a, b) => b.rebate_amount - a.rebate_amount);
  return { period, partners: results };
}

// ─── 3. Hospital Stakeholder View ──────────────────────────────────────────

/**
 * getHospitalStakeholderView — non-MD stakeholders grouped by hospital
 */
async function getHospitalStakeholderView(entityId, period, filters = {}) {
  const eId = toObjectId(entityId);
  const { start, end } = periodToDates(period);

  // Find stakeholders (non-MD) with hospital affiliations
  const stakeholderMatch = {
    clientType: { $ne: 'MD' },
    isActive: true,
    'hospitals.0': { $exists: true },
  };
  if (filters.territory_id) {
    // Filter by assigned BDMs in this territory — entity-scope to prevent
    // probing a foreign-entity territory's BDM list via the territory_id filter.
    const territory = await Territory.findOne({ _id: filters.territory_id, entity_id: eId })
      .select('assigned_bdms').lean();
    if (territory?.assigned_bdms?.length) {
      stakeholderMatch.assignedTo = { $in: territory.assigned_bdms };
    }
  }

  const stakeholders = await Doctor.find(stakeholderMatch)
    .select('firstName lastName clientType hospitals assignedTo')
    .lean();

  if (!stakeholders.length) return { period, hospitals: [] };

  // Get visit counts for these stakeholders in the period
  const stakeholderIds = stakeholders.map(s => s._id);
  const visitAgg = await Visit.aggregate([
    {
      $match: {
        monthYear: period,
        status: 'completed',
        doctor: { $in: stakeholderIds },
      },
    },
    {
      $lookup: {
        from: 'doctors',
        localField: 'doctor',
        foreignField: '_id',
        as: 'docInfo',
      },
    },
    { $unwind: '$docInfo' },
    {
      $group: {
        _id: {
          doctor: '$doctor',
          clientType: '$docInfo.clientType',
        },
        visit_count: { $sum: 1 },
      },
    },
  ]);

  // Build doctor→visits map
  const doctorVisitMap = new Map(); // doctorId → { clientType, visit_count }
  for (const v of visitAgg) {
    doctorVisitMap.set(v._id.doctor.toString(), {
      clientType: v._id.clientType,
      visit_count: v.visit_count,
    });
  }

  // Group by hospital
  const hospitalAgg = new Map(); // hospital_id → { visits_by_type, stakeholder_count }

  for (const s of stakeholders) {
    const visitInfo = doctorVisitMap.get(s._id.toString());
    const visitCount = visitInfo?.visit_count || 0;

    for (const h of (s.hospitals || [])) {
      const hId = h.hospital_id?.toString();
      if (!hId) continue;

      if (!hospitalAgg.has(hId)) {
        hospitalAgg.set(hId, { visits_by_type: {}, stakeholder_count: 0 });
      }
      const agg = hospitalAgg.get(hId);
      agg.stakeholder_count++;
      const cType = s.clientType || 'OTHER';
      agg.visits_by_type[cType] = (agg.visits_by_type[cType] || 0) + visitCount;
    }
  }

  // Get sales at each hospital
  const hospitalIds = [...hospitalAgg.keys()].map(id => toObjectId(id));
  const salesAgg = await SalesLine.aggregate([
    {
      $match: {
        entity_id: eId,
        status: 'POSTED',
        csi_date: { $gte: start, $lt: end },
        hospital_id: { $in: hospitalIds },
      },
    },
    {
      $group: {
        _id: '$hospital_id',
        sales_revenue: { $sum: '$invoice_total' },
        sales_count: { $sum: 1 },
      },
    },
  ]);

  const salesMap = new Map();
  for (const s of salesAgg) {
    salesMap.set(s._id.toString(), { revenue: s.sales_revenue, count: s.sales_count });
  }

  // Get hospital details (engagement_level, name)
  const hospitalDocs = await Hospital.find({
    _id: { $in: hospitalIds },
  }).select('hospital_name engagement_level').lean();

  const hospitalInfoMap = new Map();
  for (const h of hospitalDocs) {
    hospitalInfoMap.set(h._id.toString(), h);
  }

  const results = [];
  for (const [hId, agg] of hospitalAgg) {
    const hInfo = hospitalInfoMap.get(hId);
    const sales = salesMap.get(hId) || { revenue: 0, count: 0 };

    results.push({
      hospital_id: hId,
      hospital_name: hInfo?.hospital_name || 'Unknown Hospital',
      engagement_level: hInfo?.engagement_level || null,
      stakeholder_count: agg.stakeholder_count,
      visits_by_type: agg.visits_by_type,
      total_visits: Object.values(agg.visits_by_type).reduce((a, b) => a + b, 0),
      sales_revenue: Math.round(sales.revenue * 100) / 100,
      sales_count: sales.count,
    });
  }

  results.sort((a, b) => b.sales_revenue - a.sales_revenue);
  return { period, hospitals: results };
}

// ─── 4. Territory Detail ───────────────────────────────────────────────────

/**
 * getTerritoryDetail — per-product breakdown for a single territory
 */
async function getTerritoryDetail(entityId, territoryId, period) {
  const eId = toObjectId(entityId);
  const tId = toObjectId(territoryId);
  const { start, end } = periodToDates(period);

  // Get BDMs in this territory
  const people = await PeopleMaster.find({
    entity_id: eId,
    is_active: true,
    territory_id: tId,
  }).select('user_id').lean();

  const bdmUserIds = people.map(p => p.user_id).filter(Boolean);
  if (!bdmUserIds.length) {
    const territory = await Territory.findOne({ _id: tId, entity_id: eId })
      .select('territory_code territory_name').lean();
    return {
      period,
      territory_id: territoryId,
      territory_code: territory?.territory_code || 'UNKNOWN',
      territory_name: territory?.territory_name || 'Unknown Territory',
      products: [],
    };
  }

  const crmToErp = await buildCrmToErpMap(entityId);

  // Visit counts per CRM product
  const visitAgg = await Visit.aggregate([
    {
      $match: {
        monthYear: period,
        status: 'completed',
        user: { $in: bdmUserIds },
      },
    },
    { $unwind: '$productsDiscussed' },
    {
      $group: {
        _id: '$productsDiscussed.product',
        visit_count: { $sum: 1 },
      },
    },
  ]);

  // Map CRM→ERP product and aggregate visit counts by ERP product
  const visitsByErpProduct = new Map();
  for (const v of visitAgg) {
    const crmId = v._id?.toString();
    const erpId = crmId ? crmToErp.get(crmId) : null;
    if (!erpId) continue;
    visitsByErpProduct.set(erpId, (visitsByErpProduct.get(erpId) || 0) + v.visit_count);
  }

  // Sales per product for these BDMs
  const salesAgg = await SalesLine.aggregate([
    {
      $match: {
        entity_id: eId,
        status: 'POSTED',
        csi_date: { $gte: start, $lt: end },
        bdm_id: { $in: bdmUserIds },
      },
    },
    { $unwind: '$line_items' },
    {
      $group: {
        _id: '$line_items.product_id',
        sales_qty: { $sum: '$line_items.qty' },
        sales_revenue: { $sum: '$line_items.line_total' },
      },
    },
  ]);

  const salesByProduct = new Map();
  for (const s of salesAgg) {
    salesByProduct.set(s._id.toString(), {
      qty: s.sales_qty,
      revenue: s.sales_revenue,
    });
  }

  // Combine all product IDs
  const allProductIds = new Set([...visitsByErpProduct.keys(), ...salesByProduct.keys()]);

  // Populate product names — entity-scope to prevent foreign-entity leak
  const products = await ProductMaster.find({
    entity_id: eId,
    _id: { $in: [...allProductIds].map(id => toObjectId(id)) },
  }).select('brand_name dosage_strength generic_name').lean();

  const productInfoMap = new Map();
  for (const p of products) {
    productInfoMap.set(p._id.toString(), p);
  }

  const territory = await Territory.findOne({ _id: tId, entity_id: eId })
    .select('territory_code territory_name').lean();

  const productRows = [];
  for (const pId of allProductIds) {
    const pInfo = productInfoMap.get(pId);
    const sales = salesByProduct.get(pId) || { qty: 0, revenue: 0 };
    productRows.push({
      product_id: pId,
      product_name: pInfo
        ? `${pInfo.brand_name} ${pInfo.dosage_strength || ''}`.trim()
        : 'Unknown Product',
      generic_name: pInfo?.generic_name || '',
      visit_count: visitsByErpProduct.get(pId) || 0,
      sales_qty: Math.round(sales.qty * 100) / 100,
      sales_revenue: Math.round(sales.revenue * 100) / 100,
    });
  }

  productRows.sort((a, b) => b.sales_revenue - a.sales_revenue);

  return {
    period,
    territory_id: territoryId,
    territory_code: territory?.territory_code || 'UNKNOWN',
    territory_name: territory?.territory_name || 'Unknown Territory',
    products: productRows,
  };
}

// ─── 5. Time Series ────────────────────────────────────────────────────────

/**
 * getTimeSeries — monthly visits, sales, and rebates for a territory+product
 */
async function getTimeSeries(entityId, territoryId, productId, startMonth, endMonth) {
  const eId = toObjectId(entityId);
  const tId = toObjectId(territoryId);
  const months = generateMonthRange(startMonth, endMonth);

  // Get BDMs in territory
  const people = await PeopleMaster.find({
    entity_id: eId,
    is_active: true,
    territory_id: tId,
  }).select('user_id').lean();
  const bdmUserIds = people.map(p => p.user_id).filter(Boolean);

  // Build CRM→ERP map to find which CRM products map to this ERP product
  const crmToErp = await buildCrmToErpMap(entityId);
  const matchingCrmIds = [];
  for (const [crmId, erpId] of crmToErp) {
    if (erpId === productId.toString()) {
      matchingCrmIds.push(toObjectId(crmId));
    }
  }

  const overallStart = periodToDates(months[0]).start;
  const overallEnd = periodToDates(months[months.length - 1]).end;

  // Parallel aggregations across full range
  const [visitAgg, salesAgg, rebateAgg] = await Promise.all([
    // Visits by month
    Visit.aggregate([
      {
        $match: {
          status: 'completed',
          user: { $in: bdmUserIds },
          monthYear: { $in: months },
          ...(matchingCrmIds.length > 0
            ? { 'productsDiscussed.product': { $in: matchingCrmIds } }
            : {}),
        },
      },
      { $group: { _id: '$monthYear', count: { $sum: 1 } } },
    ]),
    // Sales by month
    SalesLine.aggregate([
      {
        $match: {
          entity_id: eId,
          status: 'POSTED',
          csi_date: { $gte: overallStart, $lt: overallEnd },
          bdm_id: { $in: bdmUserIds },
        },
      },
      { $unwind: '$line_items' },
      ...(productId
        ? [{ $match: { 'line_items.product_id': toObjectId(productId) } }]
        : []),
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$csi_date', timezone: '+08:00' },
          },
          revenue: { $sum: '$line_items.line_total' },
        },
      },
    ]),
    // Rebates by month
    Collection.aggregate([
      {
        $match: {
          entity_id: eId,
          status: 'POSTED',
          cr_date: { $gte: overallStart, $lt: overallEnd },
          bdm_id: { $in: bdmUserIds },
        },
      },
      { $unwind: '$settled_csis' },
      { $unwind: '$settled_csis.partner_tags' },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$cr_date', timezone: '+08:00' },
          },
          rebate: { $sum: '$settled_csis.partner_tags.rebate_amount' },
        },
      },
    ]),
  ]);

  // Index results by month
  const visitMap = new Map(visitAgg.map(r => [r._id, r.count]));
  const salesMap = new Map(salesAgg.map(r => [r._id, r.revenue]));
  const rebateMap = new Map(rebateAgg.map(r => [r._id, r.rebate]));

  const visits = [];
  const sales = [];
  const rebates = [];

  for (const m of months) {
    visits.push(visitMap.get(m) || 0);
    sales.push(Math.round((salesMap.get(m) || 0) * 100) / 100);
    rebates.push(Math.round((rebateMap.get(m) || 0) * 100) / 100);
  }

  return { months, visits, sales, rebates };
}

// ─── 6. Program Effectiveness ──────────────────────────────────────────────

/**
 * getProgramEffectiveness — per-program enrollment, visit coverage, and sales
 */
async function getProgramEffectiveness(entityId, period) {
  const eId = toObjectId(entityId);
  const { start, end } = periodToDates(period);

  // Get all distinct programs
  const programs = await Doctor.distinct('programsToImplement', {
    isActive: true,
    programsToImplement: { $exists: true, $ne: [] },
  });

  if (!programs.length) return { period, programs: [] };

  const bdmToTerritory = await buildBdmToTerritoryMap(entityId);

  const results = [];

  for (const program of programs) {
    // Enrolled doctors
    const enrolledCount = await Doctor.countDocuments({
      isActive: true,
      programsToImplement: program,
    });

    // Visited doctors with this program in the period
    const doctorsWithProgram = await Doctor.find({
      isActive: true,
      programsToImplement: program,
    }).select('_id assignedTo').lean();

    const doctorIds = doctorsWithProgram.map(d => d._id);
    const visitedDoctors = await Visit.distinct('doctor', {
      monthYear: period,
      status: 'completed',
      doctor: { $in: doctorIds },
    });

    // Get territories where these doctors' BDMs operate
    const territoryIds = new Set();
    for (const d of doctorsWithProgram) {
      const bdmId = d.assignedTo?.toString();
      const tId = bdmId ? bdmToTerritory.get(bdmId) : null;
      if (tId) territoryIds.add(tId);
    }

    // Sum sales in those territories
    let totalSales = 0;
    if (territoryIds.size > 0) {
      // Get all BDMs in those territories
      const territoryBdms = await PeopleMaster.find({
        entity_id: eId,
        is_active: true,
        territory_id: { $in: [...territoryIds].map(id => toObjectId(id)) },
      }).select('user_id').lean();

      const bdmIds = territoryBdms.map(p => p.user_id).filter(Boolean);

      if (bdmIds.length) {
        const salesResult = await SalesLine.aggregate([
          {
            $match: {
              entity_id: eId,
              status: 'POSTED',
              csi_date: { $gte: start, $lt: end },
              bdm_id: { $in: bdmIds },
            },
          },
          { $group: { _id: null, total: { $sum: '$invoice_total' } } },
        ]);
        totalSales = salesResult[0]?.total || 0;
      }
    }

    results.push({
      program,
      enrolled_doctors: enrolledCount,
      visited_doctors: visitedDoctors.length,
      visit_coverage_pct: enrolledCount > 0
        ? Math.round((visitedDoctors.length / enrolledCount) * 10000) / 100
        : 0,
      territory_sales: Math.round(totalSales * 100) / 100,
    });
  }

  results.sort((a, b) => b.territory_sales - a.territory_sales);
  return { period, programs: results };
}

// ─── 7. Support Type Effectiveness ─────────────────────────────────────────

/**
 * getSupportTypeEffectiveness — same as program effectiveness but by supportDuringCoverage
 */
async function getSupportTypeEffectiveness(entityId, period) {
  const eId = toObjectId(entityId);
  const { start, end } = periodToDates(period);

  const supportTypes = await Doctor.distinct('supportDuringCoverage', {
    isActive: true,
    supportDuringCoverage: { $exists: true, $ne: [] },
  });

  if (!supportTypes.length) return { period, support_types: [] };

  const bdmToTerritory = await buildBdmToTerritoryMap(entityId);

  const results = [];

  for (const supportType of supportTypes) {
    const enrolledCount = await Doctor.countDocuments({
      isActive: true,
      supportDuringCoverage: supportType,
    });

    const doctorsWithSupport = await Doctor.find({
      isActive: true,
      supportDuringCoverage: supportType,
    }).select('_id assignedTo').lean();

    const doctorIds = doctorsWithSupport.map(d => d._id);
    const visitedDoctors = await Visit.distinct('doctor', {
      monthYear: period,
      status: 'completed',
      doctor: { $in: doctorIds },
    });

    const territoryIds = new Set();
    for (const d of doctorsWithSupport) {
      const bdmId = d.assignedTo?.toString();
      const tId = bdmId ? bdmToTerritory.get(bdmId) : null;
      if (tId) territoryIds.add(tId);
    }

    let totalSales = 0;
    if (territoryIds.size > 0) {
      const territoryBdms = await PeopleMaster.find({
        entity_id: eId,
        is_active: true,
        territory_id: { $in: [...territoryIds].map(id => toObjectId(id)) },
      }).select('user_id').lean();

      const bdmIds = territoryBdms.map(p => p.user_id).filter(Boolean);

      if (bdmIds.length) {
        const salesResult = await SalesLine.aggregate([
          {
            $match: {
              entity_id: eId,
              status: 'POSTED',
              csi_date: { $gte: start, $lt: end },
              bdm_id: { $in: bdmIds },
            },
          },
          { $group: { _id: null, total: { $sum: '$invoice_total' } } },
        ]);
        totalSales = salesResult[0]?.total || 0;
      }
    }

    results.push({
      support_type: supportType,
      enrolled_doctors: enrolledCount,
      visited_doctors: visitedDoctors.length,
      visit_coverage_pct: enrolledCount > 0
        ? Math.round((visitedDoctors.length / enrolledCount) * 10000) / 100
        : 0,
      territory_sales: Math.round(totalSales * 100) / 100,
    });
  }

  results.sort((a, b) => b.territory_sales - a.territory_sales);
  return { period, support_types: results };
}

// ─── 8. Product Mapping CRUD ───────────────────────────────────────────────

/**
 * getProductMappings — list active mappings with populated product names
 */
async function getProductMappings(entityId) {
  const mappings = await ProductMapping.find({
    entity_id: toObjectId(entityId),
    is_active: true,
  })
    .populate('crm_product_id', 'name genericName dosage')
    .populate('erp_product_id', 'brand_name dosage_strength generic_name')
    .sort({ createdAt: -1 })
    .lean();

  return mappings.map(m => ({
    _id: m._id,
    crm_product_id: m.crm_product_id?._id || m.crm_product_id,
    crm_product_name: m.crm_product_id?.name || 'Unknown',
    crm_generic_name: m.crm_product_id?.genericName || '',
    crm_dosage: m.crm_product_id?.dosage || '',
    erp_product_id: m.erp_product_id?._id || m.erp_product_id,
    erp_product_name: m.erp_product_id
      ? `${m.erp_product_id.brand_name} ${m.erp_product_id.dosage_strength || ''}`.trim()
      : 'Unknown',
    erp_generic_name: m.erp_product_id?.generic_name || '',
    match_method: m.match_method,
    confidence: m.confidence,
    mapped_by: m.mapped_by,
    createdAt: m.createdAt,
  }));
}

/**
 * createProductMapping — manual mapping by admin
 */
async function createProductMapping(entityId, data) {
  const mapping = new ProductMapping({
    entity_id: toObjectId(entityId),
    crm_product_id: toObjectId(data.crm_product_id),
    erp_product_id: toObjectId(data.erp_product_id),
    match_method: 'MANUAL',
    confidence: 'HIGH',
    mapped_by: data.mapped_by ? toObjectId(data.mapped_by) : undefined,
  });
  await mapping.save();
  return mapping;
}

/**
 * deleteProductMapping — soft delete (set is_active=false)
 */
async function deleteProductMapping(entityId, mappingId) {
  const result = await ProductMapping.findOneAndUpdate(
    {
      _id: toObjectId(mappingId),
      entity_id: toObjectId(entityId),
    },
    { is_active: false },
    { new: true }
  );
  return result;
}

/**
 * autoMapProducts — auto-match CRM products to ERP products by name/generic
 */
async function autoMapProducts(entityId, userId) {
  const eId = toObjectId(entityId);

  const [crmProducts, erpProducts, existingMappings] = await Promise.all([
    CrmProduct.find({ isActive: true }).select('name genericName dosage').lean(),
    ProductMaster.find({ entity_id: eId, is_active: true })
      .select('brand_name generic_name dosage_strength brand_name_clean').lean(),
    ProductMapping.find({ entity_id: eId, is_active: true }).select('crm_product_id').lean(),
  ]);

  // Already-mapped CRM products
  const mappedCrmIds = new Set(existingMappings.map(m => m.crm_product_id.toString()));

  let mapped = 0;
  let skipped = 0;

  for (const crm of crmProducts) {
    if (mappedCrmIds.has(crm._id.toString())) {
      skipped++;
      continue;
    }

    const crmNameLower = (crm.name || '').toLowerCase().trim();
    const crmGenericLower = (crm.genericName || '').toLowerCase().trim();
    const crmDosageLower = (crm.dosage || '').toLowerCase().trim();

    let bestMatch = null;

    // Try exact brand_name match first
    for (const erp of erpProducts) {
      const erpBrandLower = (erp.brand_name || '').toLowerCase().trim();
      if (crmNameLower === erpBrandLower) {
        bestMatch = erp;
        break;
      }
    }

    // Try generic_name + dosage match
    if (!bestMatch && crmGenericLower) {
      for (const erp of erpProducts) {
        const erpGenericLower = (erp.generic_name || '').toLowerCase().trim();
        const erpDosageLower = (erp.dosage_strength || '').toLowerCase().trim();
        if (crmGenericLower === erpGenericLower && crmDosageLower && crmDosageLower === erpDosageLower) {
          bestMatch = erp;
          break;
        }
      }
    }

    if (bestMatch) {
      try {
        const mapping = new ProductMapping({
          entity_id: eId,
          crm_product_id: crm._id,
          erp_product_id: bestMatch._id,
          match_method: 'AUTO',
          confidence: 'MEDIUM',
          mapped_by: userId ? toObjectId(userId) : undefined,
        });
        await mapping.save();
        mapped++;
      } catch (err) {
        // Duplicate index — skip
        skipped++;
      }
    } else {
      skipped++;
    }
  }

  return { mapped, skipped };
}

/**
 * getUnmappedProducts — CRM products without an active mapping
 */
async function getUnmappedProducts(entityId) {
  const existingMappings = await ProductMapping.find({
    entity_id: toObjectId(entityId),
    is_active: true,
  }).select('crm_product_id').lean();

  const mappedCrmIds = existingMappings.map(m => m.crm_product_id);

  const unmapped = await CrmProduct.find({
    isActive: true,
    _id: { $nin: mappedCrmIds },
  }).select('name genericName dosage category').sort({ name: 1 }).lean();

  return unmapped;
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  // Analytics
  getCorrelationSummary,
  getPartnerDetail,
  getHospitalStakeholderView,
  getTerritoryDetail,
  getTimeSeries,
  getProgramEffectiveness,
  getSupportTypeEffectiveness,
  // Product mapping CRUD
  getProductMappings,
  createProductMapping,
  deleteProductMapping,
  autoMapProducts,
  getUnmappedProducts,
};
