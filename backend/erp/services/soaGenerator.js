/**
 * SOA Generator — Statement of Account per Hospital (Excel)
 * Shows invoices, collections, aging breakdown.
 */
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const Hospital = require('../models/Hospital');
const Entity = require('../models/Entity');
const { getOpenCsis } = require('./arEngine');

async function generateSoaWorkbook(hospitalId, entityId, bdmId) {
  const hospital = await Hospital.findById(hospitalId).lean();
  if (!hospital) throw new Error('Hospital not found');

  const entity = entityId ? await Entity.findById(entityId).lean() : null;

  // Fetch all posted sales for this hospital
  const salesFilter = { hospital_id: new mongoose.Types.ObjectId(hospitalId), status: 'POSTED', deletion_event_id: { $exists: false } };
  if (entityId) salesFilter.entity_id = new mongoose.Types.ObjectId(entityId);
  if (bdmId) salesFilter.bdm_id = new mongoose.Types.ObjectId(bdmId);
  const sales = await SalesLine.find(salesFilter).sort({ csi_date: 1 }).lean();

  // Fetch all posted collections for this hospital
  const collFilter = { hospital_id: new mongoose.Types.ObjectId(hospitalId), status: 'POSTED' };
  if (entityId) collFilter.entity_id = new mongoose.Types.ObjectId(entityId);
  if (bdmId) collFilter.bdm_id = new mongoose.Types.ObjectId(bdmId);
  const collections = await Collection.find(collFilter).sort({ cr_date: 1 }).lean();

  // Open CSIs for aging
  const openCsis = await getOpenCsis(entityId, bdmId, hospitalId);

  // Build workbook
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Statement of Account ---
  const soaData = [];
  soaData.push(['STATEMENT OF ACCOUNT']);
  soaData.push([entity?.entity_name || 'VIP Pharmacy']);
  soaData.push([]);
  soaData.push(['Hospital:', hospital.hospital_name]);
  soaData.push(['TIN:', hospital.tin || '—']);
  soaData.push(['Payment Terms:', `${hospital.payment_terms || 30} days`]);
  soaData.push(['Generated:', new Date().toLocaleDateString('en-PH')]);
  soaData.push([]);
  soaData.push(['Date', 'Document', 'Description', 'Debit (Invoice)', 'Credit (Collection)', 'Balance']);

  let runningBalance = 0;
  // Merge and sort all transactions by date
  const transactions = [];
  for (const s of sales) {
    transactions.push({ date: s.csi_date, type: 'INV', ref: s.doc_ref, amount: s.invoice_total, desc: `CSI #${s.doc_ref}` });
  }
  for (const c of collections) {
    transactions.push({ date: c.cr_date, type: 'CR', ref: c.cr_no, amount: c.cr_amount, desc: `CR #${c.cr_no}` });
  }
  transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const t of transactions) {
    if (t.type === 'INV') {
      runningBalance += t.amount;
      soaData.push([new Date(t.date).toLocaleDateString('en-PH'), t.ref, t.desc, t.amount, '', runningBalance]);
    } else {
      runningBalance -= t.amount;
      soaData.push([new Date(t.date).toLocaleDateString('en-PH'), t.ref, t.desc, '', t.amount, runningBalance]);
    }
  }

  soaData.push([]);
  soaData.push(['', '', 'Outstanding Balance:', '', '', runningBalance]);

  // Aging summary
  soaData.push([]);
  soaData.push(['AGING BREAKDOWN']);
  soaData.push(['Current (0-30)', '31-60 days', '61-90 days', '91-120 days', '120+ days', 'Total']);
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d120: 0 };
  for (const csi of openCsis) {
    const days = csi.days_outstanding || 0;
    if (days <= 30) buckets.current += csi.balance_due;
    else if (days <= 60) buckets.d30 += csi.balance_due;
    else if (days <= 90) buckets.d60 += csi.balance_due;
    else if (days <= 120) buckets.d90 += csi.balance_due;
    else buckets.d120 += csi.balance_due;
  }
  const totalAging = Object.values(buckets).reduce((s, v) => s + v, 0);
  soaData.push([buckets.current, buckets.d30, buckets.d60, buckets.d90, buckets.d120, totalAging]);

  const ws = XLSX.utils.aoa_to_sheet(soaData);
  ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Statement of Account');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generateSoaWorkbook };
