/**
 * AP Ledger & Aging Service — Phase 12.4
 *
 * Queries against SupplierInvoice and PurchaseOrder collections.
 * Aging buckets: CURRENT (not due), 1-30, 31-60, 61-90, 90+.
 * GRNI: PO lines where qty_received > qty_invoiced.
 */
const mongoose = require('mongoose');
const SupplierInvoice = require('../models/SupplierInvoice');
const PurchaseOrder = require('../models/PurchaseOrder');

/**
 * AP Ledger — all outstanding (posted, unpaid/partial) invoices
 */
async function getApLedger(entityId) {
  const invoices = await SupplierInvoice.find({
    entity_id: entityId,
    status: 'POSTED',
    payment_status: { $ne: 'PAID' }
  })
    .sort({ due_date: 1 })
    .lean();

  return invoices.map(inv => ({
    _id: inv._id,
    vendor_id: inv.vendor_id,
    vendor_name: inv.vendor_name,
    invoice_ref: inv.invoice_ref,
    invoice_date: inv.invoice_date,
    due_date: inv.due_date,
    total_amount: inv.total_amount,
    amount_paid: inv.amount_paid,
    balance: Math.round((inv.total_amount - inv.amount_paid) * 100) / 100,
    payment_status: inv.payment_status,
    days_outstanding: Math.max(0, Math.floor((Date.now() - new Date(inv.invoice_date).getTime()) / 86400000))
  }));
}

/**
 * AP Aging — bucket outstanding invoices by days
 */
async function getApAging(entityId) {
  const ledger = await getApLedger(entityId);
  const now = Date.now();

  const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 };
  const vendorMap = new Map();

  for (const inv of ledger) {
    const balance = inv.balance;
    const dueDate = inv.due_date ? new Date(inv.due_date).getTime() : new Date(inv.invoice_date).getTime();
    const daysOverdue = Math.max(0, Math.floor((now - dueDate) / 86400000));

    // Bucket
    if (daysOverdue <= 0) buckets.current += balance;
    else if (daysOverdue <= 30) buckets.days_1_30 += balance;
    else if (daysOverdue <= 60) buckets.days_31_60 += balance;
    else if (daysOverdue <= 90) buckets.days_61_90 += balance;
    else buckets.days_90_plus += balance;

    // Vendor breakdown
    const vKey = inv.vendor_id?.toString() || 'unknown';
    if (!vendorMap.has(vKey)) {
      vendorMap.set(vKey, { vendor_id: inv.vendor_id, vendor_name: inv.vendor_name, total: 0, count: 0 });
    }
    const v = vendorMap.get(vKey);
    v.total += balance;
    v.count++;
  }

  // Round buckets
  for (const k of Object.keys(buckets)) {
    buckets[k] = Math.round(buckets[k] * 100) / 100;
  }

  const total_outstanding = Math.round(ledger.reduce((s, i) => s + i.balance, 0) * 100) / 100;

  return {
    buckets,
    total_outstanding,
    invoice_count: ledger.length,
    vendor_breakdown: Array.from(vendorMap.values()).sort((a, b) => b.total - a.total)
  };
}

/**
 * AP Consolidated — grouped by vendor
 */
async function getApConsolidated(entityId) {
  const eid = typeof entityId === 'string' ? new mongoose.Types.ObjectId(entityId) : entityId;
  const result = await SupplierInvoice.aggregate([
    { $match: { entity_id: eid, status: 'POSTED', payment_status: { $ne: 'PAID' } } },
    {
      $group: {
        _id: '$vendor_id',
        vendor_name: { $first: '$vendor_name' },
        total_outstanding: { $sum: { $subtract: ['$total_amount', '$amount_paid'] } },
        invoice_count: { $sum: 1 },
        oldest_invoice: { $min: '$invoice_date' },
        newest_invoice: { $max: '$invoice_date' }
      }
    },
    { $sort: { total_outstanding: -1 } }
  ]);

  return result.map(r => ({
    vendor_id: r._id,
    vendor_name: r.vendor_name,
    total_outstanding: Math.round(r.total_outstanding * 100) / 100,
    invoice_count: r.invoice_count,
    oldest_invoice: r.oldest_invoice,
    newest_invoice: r.newest_invoice
  }));
}

/**
 * GRNI — Goods Received Not Invoiced
 * PO lines where qty_received > qty_invoiced
 */
async function getGrni(entityId) {
  const pos = await PurchaseOrder.find({
    entity_id: entityId,
    status: { $in: ['PARTIALLY_RECEIVED', 'RECEIVED'] }
  })
    .populate('vendor_id', 'vendor_name')
    .lean();

  const grniLines = [];
  for (const po of pos) {
    for (const line of po.line_items) {
      const uninvoiced = (line.qty_received || 0) - (line.qty_invoiced || 0);
      if (uninvoiced > 0) {
        grniLines.push({
          po_id: po._id,
          po_number: po.po_number,
          po_date: po.po_date,
          vendor_id: po.vendor_id?._id || po.vendor_id,
          vendor_name: po.vendor_id?.vendor_name || '',
          product_id: line.product_id,
          item_key: line.item_key,
          unit_price: line.unit_price,
          qty_received: line.qty_received,
          qty_invoiced: line.qty_invoiced,
          qty_uninvoiced: uninvoiced,
          estimated_value: Math.round(uninvoiced * line.unit_price * 100) / 100
        });
      }
    }
  }

  return grniLines;
}

module.exports = { getApLedger, getApAging, getApConsolidated, getGrni };
