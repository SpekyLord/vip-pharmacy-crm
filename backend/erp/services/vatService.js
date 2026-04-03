/**
 * VAT Service — VAT Ledger management and 2550Q computation
 *
 * PRD v5 §11.5 — Finance tags entries INCLUDE/EXCLUDE/DEFER.
 * 2550Q = Sum(Output VAT INCLUDE) - Sum(Input VAT INCLUDE) = Net VAT Payable.
 */
const VatLedger = require('../models/VatLedger');

/**
 * Create a VAT ledger entry (auto-created when collection/supplier invoice posted)
 */
async function createVatEntry(data) {
  return VatLedger.create({
    entity_id: data.entity_id,
    period: data.period,
    vat_type: data.vat_type,
    source_module: data.source_module,
    source_doc_ref: data.source_doc_ref,
    source_event_id: data.source_event_id,
    hospital_or_vendor: data.hospital_or_vendor,
    tin: data.tin,
    gross_amount: data.gross_amount || 0,
    vat_amount: data.vat_amount || 0,
    finance_tag: 'PENDING'
  });
}

/**
 * Finance tags a VAT entry (INCLUDE/EXCLUDE/DEFER)
 */
async function tagVatEntry(entryId, tag, userId) {
  const entry = await VatLedger.findById(entryId);
  if (!entry) throw new Error('VAT entry not found');

  entry.finance_tag = tag;
  entry.tagged_by = userId;
  entry.tagged_at = new Date();
  await entry.save();
  return entry;
}

/**
 * Get VAT ledger for a period with optional finance_tag filter
 */
async function getVatLedger(entityId, period, financeTag) {
  const filter = { entity_id: entityId };
  if (period) filter.period = period;
  if (financeTag) filter.finance_tag = financeTag;

  return VatLedger.find(filter).sort({ created_at: -1 }).lean();
}

/**
 * Compute VAT Return 2550Q
 * Output VAT (INCLUDE) - Input VAT (INCLUDE) = Net VAT Payable
 */
async function computeVatReturn2550Q(entityId, quarter, year) {
  // Map quarter to period months
  const quarterMonths = {
    Q1: ['01', '02', '03'],
    Q2: ['04', '05', '06'],
    Q3: ['07', '08', '09'],
    Q4: ['10', '11', '12']
  };
  const months = quarterMonths[quarter];
  if (!months) throw new Error('Invalid quarter');

  const periods = months.map(m => `${year}-${m}`);

  const pipeline = [
    { $match: { entity_id: entityId, period: { $in: periods }, finance_tag: 'INCLUDE' } },
    {
      $group: {
        _id: '$vat_type',
        total_gross: { $sum: '$gross_amount' },
        total_vat: { $sum: '$vat_amount' },
        count: { $sum: 1 }
      }
    }
  ];

  const results = await VatLedger.aggregate(pipeline);

  const output = results.find(r => r._id === 'OUTPUT') || { total_gross: 0, total_vat: 0, count: 0 };
  const input = results.find(r => r._id === 'INPUT') || { total_gross: 0, total_vat: 0, count: 0 };

  return {
    quarter,
    year,
    periods,
    output_vat: { gross: output.total_gross, vat: output.total_vat, count: output.count },
    input_vat: { gross: input.total_gross, vat: input.total_vat, count: input.count },
    net_vat_payable: output.total_vat - input.total_vat
  };
}

module.exports = {
  createVatEntry,
  tagVatEntry,
  getVatLedger,
  computeVatReturn2550Q
};
