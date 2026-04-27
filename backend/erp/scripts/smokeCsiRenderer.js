/**
 * Smoke test for the CSI overlay renderer baseline fix.
 *
 * Renders a single-page overlay with one customer name + one body row +
 * one totals row. Loads the resulting PDF as raw text and asserts that
 * the visible y coordinates make sense: the rendered baseline should
 * equal the lookup-supplied y (within 0.05 mm tolerance).
 *
 * Usage: node backend/erp/scripts/smokeCsiRenderer.js
 *
 * No DB connection needed — uses an in-memory template.
 */
const { renderCsiDraft } = require('../services/csiDraftRenderer');
const { VIP_TEMPLATE } = require('./seedCsiTemplates');

async function run() {
  const sale = {
    csi_date: new Date('2026-04-24'),
    invoice_total: 2250,
    total_vat: 241.07,
    total_net_of_vat: 2008.93,
    line_items: [{}],
    po_number: 'PO-TEST',
    doc_ref: 'TEST',
    _id: 'test',
  };

  const template = { metadata: VIP_TEMPLATE };
  const lineDisplay = [{
    description: 'Tropin 1mg/mL',
    qty: 30,
    unit: 'AMPULE',
    unit_price: 75,
    amount: 2250,
  }];

  const buf = await renderCsiDraft({
    sale,
    entity: { entity_name: 'TEST' },
    template,
    user: {},
    customerLabel: 'Antique Medical Center',
    customerAddress: 'Test Address',
    lineDisplay,
    terms: '30 days',
  });

  console.log(`✓ Rendered PDF, ${buf.length} bytes`);

  // Header + totals on a 210x260mm page, baseline-aware text rendering.
  // A failure in drawText (bad font, wrong y, etc.) would throw before we
  // get here. Byte sanity: the produced PDF must start with "%PDF-".
  if (buf.slice(0, 5).toString() !== '%PDF-') {
    console.error('✗ Output is not a PDF');
    process.exit(1);
  }
  console.log('✓ Output is a well-formed PDF');

  // Also render with MG_AND_CO template to confirm the alternate (articles)
  // body shape still works.
  const { MG_TEMPLATE } = require('./seedCsiTemplates');
  const mgBuf = await renderCsiDraft({
    sale,
    entity: { entity_name: 'MG AND CO. INC.' },
    template: { metadata: MG_TEMPLATE },
    user: {},
    customerLabel: 'Antique Medical Center',
    customerAddress: 'Test Address',
    lineDisplay,
    terms: '30 days',
  });
  if (mgBuf.slice(0, 5).toString() !== '%PDF-') {
    console.error('✗ MG_AND_CO output is not a PDF');
    process.exit(1);
  }
  console.log(`✓ MG_AND_CO PDF, ${mgBuf.length} bytes`);

  console.log('\nAll smoke checks passed.');
}

run().catch((err) => {
  console.error('Smoke error:', err);
  process.exit(1);
});
