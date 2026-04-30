/**
 * Healthcheck: Sales Discount wiring — Phase R2 (Apr 2026)
 *
 * Statically verifies the end-to-end contract for line-level sales discount
 * across model, controller, auto-journal, CSI draft renderer, print template,
 * frontend Sales Entry, lookup-driven cap, and workflow banner.
 *
 * Catches the wiring drift class that bit Phase MD-1 / G6 / G4.5cc — a
 * frontend column with no backend acceptance, a model field nobody reads,
 * or a JE that silently posts wrong VAT.
 *
 * Usage:
 *   node backend/scripts/healthcheckSalesDiscount.js
 *
 * Exit code 0 = green. Exit code 1 = at least one check failed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const checks = [];

function check(label, condition, hint = '') {
  checks.push({ label, ok: !!condition, hint });
}

function readFile(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch (e) {
    return null;
  }
}

// ── 1. SalesLine model: schema fields + pre-save math ──
const model = readFile('backend/erp/models/SalesLine.js');
check(
  'SalesLine.lineItemSchema has line_discount_percent (0..100)',
  model && /line_discount_percent:\s*\{\s*type:\s*Number[^}]*min:\s*0[^}]*max:\s*100/.test(model),
  'Add line_discount_percent: { type: Number, default: 0, min: 0, max: 100 } to lineItemSchema.'
);
check(
  'SalesLine.lineItemSchema has line_discount_amount (computed)',
  model && /line_discount_amount:\s*\{\s*type:\s*Number/.test(model),
  'Add line_discount_amount field for audit/report use.'
);
check(
  'SalesLine.lineItemSchema has line_gross_amount (qty × unit_price)',
  model && /line_gross_amount:\s*\{\s*type:\s*Number/.test(model),
  'Add line_gross_amount so callers can render gross-before-discount cheaply.'
);
check(
  'SalesLine header has total_discount field',
  model && /total_discount:\s*\{\s*type:\s*Number/.test(model),
  'Add total_discount aggregate to salesLineSchema.'
);
check(
  'SalesLine header has total_gross_before_discount field',
  model && /total_gross_before_discount:\s*\{\s*type:\s*Number/.test(model),
  'Add total_gross_before_discount aggregate.'
);
check(
  'pre-save hook computes line_total = gross - discount',
  model && /item\.line_total\s*=\s*Math\.round\(\(gross\s*-\s*item\.line_discount_amount\)/.test(model),
  'In pre-save, set item.line_total = gross - line_discount_amount (VAT base shrinks).'
);
check(
  'pre-save hook computes vat on POST-discount line_total',
  model && /item\.vat_amount\s*=\s*item\.line_total\s*\/\s*\(1\s*\+\s*VAT_RATE\)\s*\*\s*VAT_RATE/.test(model),
  'VAT is computed on the post-discount line_total (BIR RR 16-2005 trade discount).'
);
check(
  'pre-save hook clamps discountPct to 0..100',
  model && /Math\.max\(0,\s*Math\.min\(100,\s*Number\(item\.line_discount_percent\)/.test(model),
  'Defensive clamp in pre-save guards against hand-crafted save() bypassing schema validators.'
);
check(
  'pre-save hook aggregates total_discount + total_gross_before_discount',
  model && /this\.total_discount\s*=/.test(model)
        && /this\.total_gross_before_discount\s*=/.test(model),
  'Set both header aggregates at the end of pre-save.'
);

// ── 2. autoJournal: net method (no contra) — confirm no contra-account drift ──
const autoJournal = readFile('backend/erp/services/autoJournal.js');
check(
  'autoJournal.journalFromSale unchanged for net method (no SALES_DISCOUNT contra)',
  autoJournal
    && /async function journalFromSale\(salesLine, entityId, userId\)/.test(autoJournal)
    && !/SALES_DISCOUNT/.test(autoJournal),
  'Net method intentionally does not book a contra. Do not introduce CR SALES_DISCOUNT here without a COA migration.'
);
check(
  'autoJournal.journalFromSale reads invoice_total + total_vat (after-discount values)',
  autoJournal
    && /salesLine\.invoice_total/.test(autoJournal)
    && /salesLine\.total_vat/.test(autoJournal),
  'JE reads model fields which encode after-discount totals.'
);

// ── 3. salesController: discount cap + VAT-balance check ──
const ctrl = readFile('backend/erp/controllers/salesController.js');
check(
  'salesController imports getDiscountConfig + canBypassDiscountCap',
  ctrl && /require\(['"]\.\.\/\.\.\/utils\/salesDiscountConfig['"]\)/.test(ctrl)
       && /getDiscountConfig/.test(ctrl)
       && /canBypassDiscountCap/.test(ctrl),
  "Add: const { getDiscountConfig, canBypassDiscountCap } = require('../../utils/salesDiscountConfig');"
);
check(
  'createSale rejects discount > max_percent (with bypass for privileged)',
  ctrl && /exceeds cap of \$\{discountCfg\.max_percent\}/.test(ctrl),
  'createSale must HTTP 400 when discount > cap and !bypassCap.'
);
check(
  'validateSales loads discount cfg once at top + uses bypass flag',
  ctrl && /const discountCfg\s*=\s*await getDiscountConfig\(req\.entityId\)/.test(ctrl)
       && /const bypassDiscountCap\s*=\s*canBypassDiscountCap\(req\)/.test(ctrl),
  'Load lookup once before the per-row loop; per-row references discountCfg / bypassDiscountCap.'
);
check(
  'validateSales VAT-balance check accounts for discount',
  ctrl && /Per-line discount\s*=\s*gross\s*×\s*\(pct\s*\/\s*100\)/.test(ctrl),
  'computedTotal must subtract per-line discount before comparing to invoice_total.'
);
check(
  'salesController generateCsiDraft maps lineDisplay.amount = GROSS (qty × unit_price)',
  ctrl && /CSI face shows GROSS line amount/.test(ctrl)
       && /amount:\s*grossAmount/.test(ctrl),
  'Body row amount must be qty × unit_price; discount appears in totals block.'
);

// ── 4. CSI draft renderer: less_discount wired in totals view ──
const renderer = readFile('backend/erp/services/csiDraftRenderer.js');
check(
  'csiDraftRenderer.buildTotalsView populates less_discount from sale.total_discount',
  renderer && /less_discount:\s*discount/.test(renderer)
           && /Number\(sale\.total_discount\)/.test(renderer),
  'less_discount must read sale.total_discount (with derive-from-lines fallback).'
);
check(
  'csiDraftRenderer.buildTotalsView shows total_sales_vat_inclusive = gross-before-discount',
  renderer && /total_sales_vat_inclusive:\s*grossBeforeDiscount/.test(renderer),
  'Top of totals block shows pre-discount gross so the booklet face math reconciles.'
);
check(
  'csiDraftRenderer.buildTotalsView shows amount_due = afterDisc',
  renderer && /amount_due:\s*afterDisc/.test(renderer)
           && /total_amount_due:\s*afterDisc/.test(renderer),
  'Amount Due / Total Amount Due must equal the after-discount invoice_total.'
);

// ── 5. salesReceipt print template: discount row + chip ──
const receipt = readFile('backend/erp/templates/salesReceipt.js');
check(
  'salesReceipt renders Less: Discount row when sale.total_discount > 0',
  receipt && /sale\.total_discount\s*>\s*0/.test(receipt)
          && /Less:\s*Discount/.test(receipt),
  'Discount row must be conditional on total_discount > 0.'
);
check(
  'salesReceipt body shows GROSS per line + per-line discount chip',
  receipt && /line_gross_amount/.test(receipt)
          && /Less\s*\$\{discountPct\}%/.test(receipt),
  'Per-line: show gross amount and a small chip beneath product name when discount > 0.'
);

// ── 6. Frontend SalesEntry.jsx: column + computeLineTotal + grid ──
const entry = readFile('frontend/src/erp/pages/SalesEntry.jsx');
check(
  'SalesEntry.computeLineTotal subtracts discount',
  entry && /computeLineTotal\s*=\s*\(item\)\s*=>\s*\{[\s\S]*?computeLineGross\(item\)\s*-\s*computeLineDiscountAmount\(item\)/.test(entry),
  'computeLineTotal must mirror SalesLine pre-save math.'
);
check(
  'SalesEntry desktop editor has line_discount_percent input',
  entry && /onChange={e\s*=>\s*updateLineItem\(idx,\s*li,\s*'line_discount_percent'/.test(entry),
  'Add a Disc % input cell calling updateLineItem with field=line_discount_percent.'
);
check(
  'SalesEntry CSS grid has 9 columns (added Disc% between Price and Total)',
  entry && /grid-template-columns:\s*minmax\(220px,\s*2\.6fr\)\s*150px\s*110px\s*80px\s*70px\s*90px\s*70px\s*100px\s*32px/.test(entry),
  '.sales-line-item grid: Product · Batch · Expiry · Qty · Unit · Price · Disc% · Total · ×'
);
check(
  'SalesEntry mobile card has Disc % input',
  entry && /<label>Disc %<\/label>/.test(entry),
  'Mobile card flex row needs the Disc % field alongside Qty / Price / Total.'
);
check(
  'SalesEntry line_items default stub includes line_discount_percent',
  entry && /line_discount_percent:\s*''/.test(entry),
  'New rows + addLineItem stubs must seed line_discount_percent.'
);

// ── 7. Lookup-driven cap (Rule #3) ──
const lookup = readFile('backend/erp/controllers/lookupGenericController.js');
check(
  'SALES_DISCOUNT_CONFIG seed entry exists with insert_only_metadata',
  lookup && /SALES_DISCOUNT_CONFIG:\s*\[/.test(lookup)
         && /max_percent:\s*100/.test(lookup)
         && /insert_only_metadata:\s*true/.test(lookup),
  'Add SALES_DISCOUNT_CONFIG to SEED_DEFAULTS so admin tweaks survive re-seeds.'
);
const helper = readFile('backend/utils/salesDiscountConfig.js');
check(
  'salesDiscountConfig helper exists',
  helper && helper.length > 0,
  'Create backend/utils/salesDiscountConfig.js.'
);
check(
  'salesDiscountConfig exports getDiscountConfig + canBypassDiscountCap + DEFAULTS',
  helper && /module\.exports\s*=\s*\{[\s\S]*getDiscountConfig[\s\S]*canBypassDiscountCap[\s\S]*DEFAULTS[\s\S]*\}/.test(helper),
  'Helper must expose all three.'
);
check(
  'salesDiscountConfig caches with 60s TTL keyed by entityId',
  helper && /TTL_MS\s*=\s*60_?000/.test(helper),
  'Match the 60s cache pattern used in teamActivityThresholds + mdPartnerAccess.'
);
check(
  'salesDiscountConfig.canBypassDiscountCap honors president/admin/finance',
  helper && /req\?\.isPresident[\s\S]*req\?\.isAdmin[\s\S]*req\?\.isFinance/.test(helper),
  'Privileged bypass mirrors Rule #21 cross-scope view roles.'
);

// ── 8. Workflow banner update (Rule #1 user-facing pages must have banners) ──
const wfg = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check(
  'WORKFLOW_GUIDES.sales-entry mentions Discount % field + Phase R2',
  wfg && /Discount %[\s\S]*?BIR-standard trade discount/.test(wfg),
  "Update the line-items step under 'sales-entry' to mention the Discount % column."
);
check(
  'WORKFLOW_GUIDES.sales-entry mentions Less: Discount in Draft CSI step',
  wfg && /Less:\s*Discount totals row/.test(wfg),
  'Update the Draft CSI overlay step so users know the totals block adapts.'
);

// ── Phase R2 Apr-30 hardening: Approval Hub / Reversal Console wiring ──
// Closes the gap where buildSalesDetails surfaced post-discount totals only,
// hiding the discount itself from the president before they Acknowledge.
const detailBuilder = readFile('backend/erp/services/documentDetailBuilder.js');
check(
  'documentDetailBuilder.buildSalesDetails surfaces line_discount_percent',
  detailBuilder && /buildSalesDetails[\s\S]*?line_discount_percent:\s*Number\(li\.line_discount_percent\)/.test(detailBuilder),
  'Map li.line_discount_percent → lines[].line_discount_percent in buildSalesDetails so the Approval Hub line table can show Disc %'
);
check(
  'documentDetailBuilder.buildSalesDetails surfaces line_discount_amount + line_gross_amount',
  detailBuilder && /buildSalesDetails[\s\S]*?line_discount_amount:\s*Number\(li\.line_discount_amount\)/.test(detailBuilder)
    && /buildSalesDetails[\s\S]*?line_gross_amount:\s*Number\(li\.line_gross_amount\)/.test(detailBuilder),
  'Map li.line_discount_amount + li.line_gross_amount through buildSalesDetails so the Approval Hub can render the discount audit trail'
);
check(
  'documentDetailBuilder.buildSalesDetails surfaces total_discount + total_gross_before_discount',
  detailBuilder && /buildSalesDetails[\s\S]*?total_discount:\s*Number\(item\.total_discount\)/.test(detailBuilder)
    && /buildSalesDetails[\s\S]*?total_gross_before_discount:/.test(detailBuilder),
  'Add total_discount + total_gross_before_discount to the buildSalesDetails return so the Approval Hub footer can render the BIR-net-method breakdown'
);
const detailPanel = readFile('frontend/src/erp/components/DocumentDetailPanel.jsx');
check(
  'DocumentDetailPanel SALES module reads d.total_discount for Less: Discount footer',
  detailPanel && /Number\(d\.total_discount\)\s*>\s*0[\s\S]{0,400}Less:\s*Discount/.test(detailPanel),
  'Add a "Less: Discount" footer row to DocumentDetailPanel SALES module that renders only when total_discount > 0'
);
check(
  'DocumentDetailPanel SALES module renders per-line Disc % + Gross when any line carries a discount',
  detailPanel && /hasAnyDiscount\s*=[\s\S]{0,400}line_discount_percent/.test(detailPanel)
    && /hasAnyDiscount\s*&&[\s\S]{0,200}Disc\s*%/.test(detailPanel)
    && /hasAnyDiscount\s*&&[\s\S]{0,200}Gross/.test(detailPanel),
  'Add a hasAnyDiscount derived flag and conditionally render Gross + Disc % columns in the SALES line table'
);

// Phase R2 Apr-30 hardening: cache hot-reload on lookup save paths.
// Without this, admin edits to SALES_DISCOUNT_CONFIG.DEFAULT (max_percent etc.)
// take up to 60s to land — inconsistent with PAYSLIP_PROXY_ROSTER /
// PRICE_RESOLVER pattern.
const lookupCtrl = readFile('backend/erp/controllers/lookupGenericController.js');
check(
  'lookupGenericController declares SALES_DISCOUNT_CONFIG_CATEGORIES set + imports invalidateSalesDiscountCache',
  lookupCtrl && /SALES_DISCOUNT_CONFIG_CATEGORIES\s*=\s*new Set\(\[['"]SALES_DISCOUNT_CONFIG['"]\]\)/.test(lookupCtrl)
    && /invalidate(?:SalesDiscountCache)?\s*[:=][\s\S]{0,80}salesDiscountConfig/.test(lookupCtrl),
  'In lookupGenericController.js, declare const SALES_DISCOUNT_CONFIG_CATEGORIES = new Set([\'SALES_DISCOUNT_CONFIG\']) and import { invalidate: invalidateSalesDiscountCache } from ../../utils/salesDiscountConfig'
);
check(
  'lookupGenericController busts salesDiscount cache in all 4 save paths (create/update/remove/seed)',
  lookupCtrl
    && (lookupCtrl.match(/SALES_DISCOUNT_CONFIG_CATEGORIES\.has[\s\S]{0,200}invalidateSalesDiscountCache/g) || []).length >= 4,
  'Add `if (SALES_DISCOUNT_CONFIG_CATEGORIES.has(...)) invalidateSalesDiscountCache(entity_id)` to create + update + remove + seedCategory in lookupGenericController.js (mirror PAYSLIP_PROXY_ROSTER pattern)'
);

// Phase R2 Apr-30 critical bug-fix: createSale payload was DROPPING line_discount_percent.
// The form input + computeLineTotal computed totals client-side, but the payload sent to
// the backend omitted the field, so the persisted row had discount=0 and Total reverted
// to gross. End-to-end the discount silently vanished. Caught by browser smoke as Mae
// Navarro (staff): typed disc=15 → ₱4080 client total → Save → row persisted as ₱4800.
const salesEntry = readFile('frontend/src/erp/pages/SalesEntry.jsx');
check(
  'SalesEntry createSale payload (the live Sales / CSI / Cash Receipt path) includes line_discount_percent',
  salesEntry
    && /line_items:\s*validItems\.map\([\s\S]{0,800}line_discount_percent:[\s\S]{0,200}parseFloat\(li\.line_discount_percent\)/.test(salesEntry),
  'In SalesEntry.jsx handleSaveDrafts, the validItems.map(li => ({...})) MUST include line_discount_percent: parseFloat(li.line_discount_percent) || 0 (clamped 0..100). Without it the field is silently dropped on Save and Phase R2 stops working end-to-end.'
);

// ── Output ──
let failed = 0;
console.log('\nSales Discount (Phase R2) wiring healthcheck');
console.log('=============================================');
checks.forEach((c, i) => {
  const status = c.ok ? '✓' : '✗';
  const line = `${String(i + 1).padStart(2, ' ')}. ${status}  ${c.label}`;
  console.log(line);
  if (!c.ok) {
    failed += 1;
    if (c.hint) console.log(`     hint: ${c.hint}`);
  }
});
console.log('---------------------------------------------');
console.log(`${checks.length - failed} / ${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
