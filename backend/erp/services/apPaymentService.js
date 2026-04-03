/**
 * AP Payment Service — Phase 12.5
 *
 * Records payments against supplier invoices.
 * COA resolved at runtime via resolveFundingCoa() — no hardcoded COA codes.
 * Auto-posts JE: DR 2000 AP Trade, CR Cash/Bank (resolved).
 */
const SupplierInvoice = require('../models/SupplierInvoice');
const ApPayment = require('../models/ApPayment');
const { resolveFundingCoa } = require('./autoJournal');
const { createAndPostJournal } = require('./journalEngine');

/**
 * Helper: format period from Date
 */
function dateToPeriod(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Record a payment against a supplier invoice
 * @param {String} invoiceId
 * @param {Object} paymentData — { amount, payment_date, payment_mode, check_no, check_date, bank_account_id, funding_card_id, reference, notes }
 * @param {String} entityId
 * @param {String} userId
 * @returns {Object} ApPayment document with je_id
 */
async function recordApPayment(invoiceId, paymentData, entityId, userId) {
  const invoice = await SupplierInvoice.findById(invoiceId);
  if (!invoice) throw new Error('Supplier invoice not found');
  if (invoice.status !== 'POSTED') throw new Error('Can only pay POSTED invoices');
  if (invoice.payment_status === 'PAID') throw new Error('Invoice is already fully paid');

  const remaining = Math.round((invoice.total_amount - invoice.amount_paid) * 100) / 100;
  if (paymentData.amount > remaining) {
    throw new Error(`Payment amount (${paymentData.amount}) exceeds remaining balance (${remaining})`);
  }

  // Resolve Cash/Bank COA from payment method
  const { coa_code, coa_name } = await resolveFundingCoa(paymentData);

  // Create JE: DR 2000 AP Trade, CR Cash/Bank
  const jeData = {
    je_date: paymentData.payment_date || new Date(),
    period: dateToPeriod(paymentData.payment_date || new Date()),
    description: `AP Payment: ${invoice.vendor_name || ''} — ${invoice.invoice_ref || ''}`,
    source_module: 'AP',
    source_doc_ref: invoice.invoice_ref || String(invoice._id),
    lines: [
      {
        account_code: '2000',
        account_name: 'Accounts Payable — Trade',
        debit: paymentData.amount,
        credit: 0,
        description: `Payment on SI: ${invoice.invoice_ref || ''}`
      },
      {
        account_code: coa_code,
        account_name: coa_name,
        debit: 0,
        credit: paymentData.amount,
        description: `Payment on SI: ${invoice.invoice_ref || ''}`
      }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    created_by: userId
  };

  const je = await createAndPostJournal(entityId, jeData);

  // Create payment record
  const payment = await ApPayment.create({
    entity_id: entityId,
    supplier_invoice_id: invoice._id,
    vendor_id: invoice.vendor_id,
    payment_date: paymentData.payment_date || new Date(),
    amount: paymentData.amount,
    payment_mode: paymentData.payment_mode,
    check_no: paymentData.check_no,
    check_date: paymentData.check_date,
    bank_account_id: paymentData.bank_account_id,
    funding_card_id: paymentData.funding_card_id,
    reference: paymentData.reference,
    je_id: je._id,
    notes: paymentData.notes,
    created_by: userId
  });

  // Update invoice
  invoice.amount_paid = Math.round((invoice.amount_paid + paymentData.amount) * 100) / 100;
  invoice.payment_status = invoice.amount_paid >= invoice.total_amount ? 'PAID' : 'PARTIAL';
  await invoice.save();

  return payment;
}

/**
 * Get payment history, optionally filtered by vendor
 */
async function getPaymentHistory(entityId, vendorId) {
  const filter = { entity_id: entityId };
  if (vendorId) filter.vendor_id = vendorId;

  return ApPayment.find(filter)
    .populate('supplier_invoice_id', 'invoice_ref invoice_date total_amount')
    .populate('vendor_id', 'vendor_name')
    .sort({ payment_date: -1 })
    .lean();
}

module.exports = { recordApPayment, getPaymentHistory };
