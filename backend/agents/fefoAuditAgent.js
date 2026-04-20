/**
 * FEFO / Supply Chain Expiry Audit Agent (P2-7) — Phase G8
 * Schedule: daily 7:30 AM Asia/Manila.
 *
 * Rule-based:
 *   - Expired-in-stock: batches past expiry_date with qty > 0
 *   - Near-expiry: batches expiring in next 90 days with qty > 0
 *   - FEFO violations (optional): recent GRN/Transfer issued an out-of-FEFO batch
 *     for a product that had an earlier-expiring batch still in stock
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function tryModel(name) { try { return mongoose.model(name); } catch { return null; } }

async function batchesSnapshot() {
  const Batch = tryModel('Batch') || tryModel('StockBatch') || tryModel('InventoryBatch');
  if (!Batch) return { expired: [], soon: [], totalExpiredQty: 0 };
  const now = new Date();
  const ninetyOut = new Date(Date.now() + 90 * 24 * 3600 * 1000);

  const expired = await Batch.find({ expiry_date: { $lt: now }, qty_on_hand: { $gt: 0 } })
    .sort({ expiry_date: 1 })
    .limit(10)
    .select('batch_no product_name expiry_date qty_on_hand warehouse_name')
    .lean();
  const soon = await Batch.find({ expiry_date: { $gte: now, $lte: ninetyOut }, qty_on_hand: { $gt: 0 } })
    .sort({ expiry_date: 1 })
    .limit(10)
    .select('batch_no product_name expiry_date qty_on_hand warehouse_name')
    .lean();
  const totalExpiredQty = expired.reduce((s, b) => s + (Number(b.qty_on_hand) || 0), 0);
  return { expired, soon, totalExpiredQty };
}

function fmtExpiry(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toISOString().slice(0, 10);
}

async function run() {
  try {
    const { expired, soon, totalExpiredQty } = await batchesSnapshot();

    const lines = [];
    lines.push(`Expired stock still on hand: ${expired.length} batch(es), ${totalExpiredQty} units total.`);
    expired.slice(0, 3).forEach(b => lines.push(`  ${b.batch_no || '(no batch)'} ${b.product_name || 'product?'} exp ${fmtExpiry(b.expiry_date)} qty=${b.qty_on_hand}`));
    lines.push(`Expiring in 90 days: ${soon.length} batch(es).`);
    soon.slice(0, 3).forEach(b => lines.push(`  ${b.batch_no || '(no batch)'} ${b.product_name || 'product?'} exp ${fmtExpiry(b.expiry_date)} qty=${b.qty_on_hand}`));

    const alerts = expired.length + soon.length;
    if (alerts === 0) lines.push('No FEFO/expiry flags today. ✓');

    const body = lines.join('\n');
    const results = await notify({
      recipient_id: 'PRESIDENT',
      title: expired.length > 0 ? `⚠ FEFO Audit — ${expired.length} expired in stock` : `FEFO Audit — ${soon.length} near-expiry`,
      body,
      category: 'inventory_alert',
      priority: expired.length > 0 ? 'high' : 'normal',
      channels: ['in_app', 'email'],
      agent: 'fefo_audit',
    });

    return {
      status: 'success',
      summary: { alerts_generated: alerts, messages_sent: countSuccessfulChannels(results, 'in_app'), key_findings: lines.slice(0, 6) },
      message_ids: getInAppMessageIds(results),
    };
  } catch (err) {
    console.error('[FEFO] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = { run };
