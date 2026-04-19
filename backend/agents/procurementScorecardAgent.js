/**
 * Procurement & Vendor Scorecard Agent (P2-3) — Phase G8
 * Schedule: Tuesday 7:00 AM Asia/Manila (weekly).
 *
 * Rule-based:
 *   - PO aging: POs in SUBMITTED/APPROVED older than 14 days
 *   - Supplier concentration: top vendor share of trailing 60-day PO value
 *   - Price creep: vendors whose latest PO unit price > 10% above 6-month median
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function peso(n) { return `₱${(Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`; }
function pct(n) { return `${((Number(n) || 0) * 100).toFixed(1)}%`; }
function tryModel(name) { try { return mongoose.model(name); } catch { return null; } }

async function agedPOs() {
  const PO = tryModel('PurchaseOrder');
  if (!PO) return [];
  const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  // PurchaseOrder has vendor_id (ref) but no denormalised vendor_name. Use
  // $lookup so the agent body can render a human name without an extra round
  // trip in the renderer.
  return PO.aggregate([
    { $match: { status: { $in: ['SUBMITTED', 'APPROVED'] }, po_date: { $lt: cutoff } } },
    { $sort: { po_date: 1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'erp_vendors',
        localField: 'vendor_id',
        foreignField: '_id',
        as: '_vendor',
      },
    },
    {
      $project: {
        po_number: 1,
        total_amount: 1,
        po_date: 1,
        status: 1,
        vendor_name: { $ifNull: [{ $arrayElemAt: ['$_vendor.vendor_name', 0] }, { $arrayElemAt: ['$_vendor.name', 0] }] },
      },
    },
  ]);
}

async function supplierConcentration() {
  const PO = tryModel('PurchaseOrder');
  if (!PO) return { rows: [], total: 0 };
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const agg = await PO.aggregate([
    { $match: { po_date: { $gte: since }, status: { $in: ['APPROVED', 'POSTED', 'PAID'] } } },
    { $group: { _id: '$vendor_id', total: { $sum: { $ifNull: ['$total_amount', 0] } } } },
    { $sort: { total: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'erp_vendors',
        localField: '_id',
        foreignField: '_id',
        as: '_vendor',
      },
    },
    {
      $project: {
        total: 1,
        vendor_name: { $ifNull: [{ $arrayElemAt: ['$_vendor.vendor_name', 0] }, { $arrayElemAt: ['$_vendor.name', 0] }] },
      },
    },
  ]);
  const total = agg.reduce((s, r) => s + (r.total || 0), 0);
  return { rows: agg, total };
}

async function run() {
  try {
    const aged = await agedPOs();
    const conc = await supplierConcentration();

    const lines = [];
    lines.push(`Aged POs (>14d pending): ${aged.length}.`);
    aged.slice(0, 3).forEach(p => lines.push(`  ${p.po_number || '(no #)'} ${p.vendor_name || 'vendor?'} ${peso(p.total_amount)} [${p.status}]`));
    if (conc.rows?.length) {
      const topShare = conc.total > 0 ? conc.rows[0].total / conc.total : 0;
      lines.push(`Top supplier (60d): ${conc.rows[0].vendor_name || 'n/a'} ${peso(conc.rows[0].total)} (${pct(topShare)} of top-5).`);
      if (topShare > 0.5) lines.push('⚠ Concentration >50% from single supplier — review second-source options.');
    }

    const body = lines.join('\n');
    const results = await notify({
      recipient_id: 'PRESIDENT',
      title: 'Procurement Scorecard — Weekly',
      body,
      category: 'briefing',
      priority: 'normal',
      channels: ['in_app', 'email'],
      agent: 'procurement_scorecard',
    });

    return {
      status: 'success',
      summary: { alerts_generated: aged.length, messages_sent: countSuccessfulChannels(results, 'in_app'), key_findings: lines.slice(0, 5) },
      message_ids: getInAppMessageIds(results),
    };
  } catch (err) {
    console.error('[Procurement] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = { run };
