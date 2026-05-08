#!/usr/bin/env node
/**
 * healthcheckStorefrontRebateWiring — Phase R-Storefront Phase 1 + Phase 2 (May 8 2026)
 *
 * Verifies the full wiring chain for the manual MD rebate + BDM commission
 * attribution feature on storefront cash sales (CASH_RECEIPT + SERVICE_INVOICE
 * routed through petty_cash_fund).
 *
 * Run: node backend/scripts/healthcheckStorefrontRebateWiring.js
 * Exits 1 on first failure so it can serve as a CI gate.
 *
 * Phase 1 coverage (gates 1–10):
 *   1. SalesLine schema — partnerTagSchema + lineItem.partner_tags + top-level
 *      partner_tags + commission_pct/_amount + total_partner_rebates + audit fields
 *   2. SalesLine pre-save calc — MAX_MD_REBATE_PCT cap + per-line/top-level branches
 *   3. RolePerms — SALES__PROXY_REBATE_ENTRY definition
 *   4. Lookup categories — PROXY_ENTRY_ROLES.SALES_REBATE_ENTRY +
 *      VALID_OWNER_ROLES.SALES_REBATE_ENTRY + STOREFRONT_REBATE_SCOPE.DEFAULT
 *   5. Route mount — POST /:id/storefront-rebate-attribution
 *   6. Controller export — attachStorefrontRebate
 *   7. Permission gate — canProxyEntry call with SALES_REBATE_ENTRY lookupCode
 *   8. Predicate gate — STOREFRONT_REBATE_SCOPE lookup read in controller
 *   9. Audit — partner_rebate_entry_mode + ErpAuditLog SALES_REBATE_ATTRIBUTION
 *  10. Doctor model imported for partner_tag denorm
 *
 * Phase 2 coverage (gates 11–22):
 *  11. autoPrfRoutingForSale.js — service exports + idempotency keys
 *  12. RebatePayout.source_kind enum extended with STOREFRONT_MANUAL
 *  13. CommissionPayout.source_kind enum extended with STOREFRONT_BDM
 *  14. PrfCalf.linked_sales_line_id field + sparse index + idempotency index
 *  15. postSaleRow CASH_RECEIPT branch calls routePrfsForSale
 *  16. postSaleRow SERVICE_INVOICE early-return branch calls routePrfsForSale
 *  17. submitSales loop calls routePrfsForSale (atomicity contract)
 *  18. Period-lock guard on attachStorefrontRebate (Option A)
 *  19. attachStorefrontRebate routes after save (post-POSTED path)
 *  20. Period-close batch sweep route + handler + audit
 *  21. SalesEntry banner additions for storefront cash sales
 *  22. WorkflowGuide updated for sales-list (Phase 2) + sales-entry callout
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const errors = [];
const warnings = [];

function read(file) {
  try {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch (err) {
    errors.push(`MISSING FILE: ${file} — ${err.message}`);
    return '';
  }
}

function expect(condition, message) {
  if (!condition) errors.push(`FAIL: ${message}`);
  else process.stdout.write('.');
}

function warn(condition, message) {
  if (!condition) warnings.push(`WARN: ${message}`);
}

console.log('Phase R-Storefront Phase 1 + Phase 2 wiring health check\n──────────────────────────────────────────────────');

// ── 1. SalesLine schema fields ─────────────────────────────────────────────
const slSrc = read('backend/erp/models/SalesLine.js');
expect(slSrc.includes('const partnerTagSchema = new mongoose.Schema'), 'SalesLine.partnerTagSchema defined');
expect(/partner_tags:\s*\[partnerTagSchema\]/.test(slSrc), 'SalesLine top-level partner_tags references partnerTagSchema');
expect(/lineItemSchema[\s\S]{0,2000}partner_tags:\s*\[partnerTagSchema\]/.test(slSrc), 'lineItemSchema.partner_tags references partnerTagSchema');
expect(slSrc.includes('commission_pct:'), 'SalesLine.commission_pct field present');
expect(slSrc.includes('commission_amount:'), 'SalesLine.commission_amount field present');
expect(slSrc.includes('total_partner_rebates:'), 'SalesLine.total_partner_rebates field present');
expect(slSrc.includes("partner_rebate_entry_mode"), 'SalesLine.partner_rebate_entry_mode audit field present');
expect(slSrc.includes('proxy_rebate_entered_by'), 'SalesLine.proxy_rebate_entered_by audit field present');
expect(slSrc.includes('proxy_rebate_entered_at'), 'SalesLine.proxy_rebate_entered_at audit field present');
expect(slSrc.includes('proxy_rebate_edit_history'), 'SalesLine.proxy_rebate_edit_history audit log field present');
expect(slSrc.includes("'STOREFRONT_LINE_NET'"), 'partnerTagSchema.calculation_mode default STOREFRONT_LINE_NET present');

// ── 2. SalesLine pre-save calc ─────────────────────────────────────────────
expect(slSrc.includes('MAX_MD_REBATE_PCT'), 'pre-save reads MAX_MD_REBATE_PCT cap');
expect(slSrc.includes('Settings.getSettings()'), 'pre-save uses Settings.getSettings() for cap');
expect(/totalPartnerRebates\s*\+=/.test(slSrc), 'pre-save accumulates per-line totalPartnerRebates');
expect(/total_partner_rebates\s*=\s*Math\.round/.test(slSrc), 'pre-save writes rounded total_partner_rebates');
expect(/commission_amount\s*=\s*Math\.round/.test(slSrc), 'pre-save writes rounded commission_amount');
expect(/sale_type === 'SERVICE_INVOICE'[\s\S]{0,1500}partner_tags/.test(slSrc), 'pre-save SERVICE_INVOICE branch handles top-level partner_tags');

// ── 3. RolePerms sub-perm definition ───────────────────────────────────────
const lookupCtrl = read('backend/erp/controllers/lookupGenericController.js');
expect(lookupCtrl.includes("code: 'SALES__PROXY_REBATE_ENTRY'"), 'RolePerms code SALES__PROXY_REBATE_ENTRY defined');
expect(/SALES__PROXY_REBATE_ENTRY[\s\S]{0,400}module:\s*'sales',\s*key:\s*'proxy_rebate_entry'/.test(lookupCtrl), 'SALES__PROXY_REBATE_ENTRY metadata maps to sales.proxy_rebate_entry');

// ── 4. Lookup category seeds ───────────────────────────────────────────────
expect(/PROXY_ENTRY_ROLES:[\s\S]{0,8000}code:\s*'SALES_REBATE_ENTRY'[\s\S]{0,400}roles:\s*\[\s*'admin',\s*'finance',\s*'president'\s*\]/.test(lookupCtrl), 'PROXY_ENTRY_ROLES.SALES_REBATE_ENTRY seeded with admin/finance/president defaults');
expect(/VALID_OWNER_ROLES:[\s\S]{0,8000}code:\s*'SALES_REBATE_ENTRY'[\s\S]{0,400}roles:\s*\[\s*'staff'\s*\]/.test(lookupCtrl), 'VALID_OWNER_ROLES.SALES_REBATE_ENTRY seeded with staff');
expect(/STOREFRONT_REBATE_SCOPE:[\s\S]{0,2000}code:\s*'DEFAULT'/.test(lookupCtrl), 'STOREFRONT_REBATE_SCOPE.DEFAULT seeded');
expect(/STOREFRONT_REBATE_SCOPE:[\s\S]{0,2000}sale_types:\s*\[\s*'CASH_RECEIPT',\s*'SERVICE_INVOICE'\s*\]/.test(lookupCtrl), 'STOREFRONT_REBATE_SCOPE.DEFAULT.sale_types defaults [CASH_RECEIPT, SERVICE_INVOICE]');
expect(/STOREFRONT_REBATE_SCOPE:[\s\S]{0,2000}require_petty_cash_fund:\s*true/.test(lookupCtrl), 'STOREFRONT_REBATE_SCOPE.DEFAULT.require_petty_cash_fund defaults true (anti-double-count)');
expect(/STOREFRONT_REBATE_SCOPE:[\s\S]{0,4000}insert_only_metadata:\s*true/.test(lookupCtrl), 'STOREFRONT_REBATE_SCOPE has insert_only_metadata:true (admin edits survive auto-seed)');

// ── 5. Route mount ─────────────────────────────────────────────────────────
const routesSrc = read('backend/erp/routes/salesRoutes.js');
expect(/router\.post\(\s*'\/:id\/storefront-rebate-attribution'\s*,\s*c\.attachStorefrontRebate\s*\)/.test(routesSrc), 'POST /:id/storefront-rebate-attribution mounted to attachStorefrontRebate');

// ── 6. Controller export ───────────────────────────────────────────────────
const ctrlSrc = read('backend/erp/controllers/salesController.js');
expect(/^const attachStorefrontRebate = catchAsync/m.test(ctrlSrc), 'attachStorefrontRebate controller defined');
expect(/module\.exports\s*=\s*\{[\s\S]{0,2000}attachStorefrontRebate/.test(ctrlSrc), 'attachStorefrontRebate exported from salesController');

// ── 7. Permission gate via canProxyEntry ───────────────────────────────────
expect(/canProxyEntry\(\s*req\s*,\s*'sales'\s*,\s*\{\s*subKey:\s*'proxy_rebate_entry',\s*lookupCode:\s*'SALES_REBATE_ENTRY'/.test(ctrlSrc), 'attachStorefrontRebate calls canProxyEntry with SALES_REBATE_ENTRY lookupCode + proxy_rebate_entry subKey');

// ── 8. Predicate gate reads STOREFRONT_REBATE_SCOPE ────────────────────────
expect(/category:\s*['"]STOREFRONT_REBATE_SCOPE['"]/.test(ctrlSrc), 'attachStorefrontRebate reads STOREFRONT_REBATE_SCOPE lookup');
expect(/STOREFRONT_REBATE_NOT_APPLICABLE/.test(ctrlSrc), 'attachStorefrontRebate emits STOREFRONT_REBATE_NOT_APPLICABLE for unsupported sale_types');
expect(/STOREFRONT_REBATE_REQUIRES_PETTY_CASH_FUND/.test(ctrlSrc), 'attachStorefrontRebate emits STOREFRONT_REBATE_REQUIRES_PETTY_CASH_FUND when fund missing and required');

// ── 9. Audit hooks ─────────────────────────────────────────────────────────
expect(/partner_rebate_entry_mode\s*=\s*['"]MANUAL_PROXY['"]/.test(ctrlSrc), 'attachStorefrontRebate stamps partner_rebate_entry_mode=MANUAL_PROXY');
expect(/proxy_rebate_edit_history\.push/.test(ctrlSrc), 'attachStorefrontRebate appends to proxy_rebate_edit_history');
expect(/log_type:\s*['"]SALES_REBATE_ATTRIBUTION['"]/.test(ctrlSrc), 'attachStorefrontRebate writes ErpAuditLog SALES_REBATE_ATTRIBUTION');

// ── 10. Doctor model imported for partner denorm ───────────────────────────
expect(/require\(['"]\.\.\/\.\.\/models\/Doctor['"]\)/.test(ctrlSrc), 'salesController imports Doctor model for partner_tag denorm');

// ═══════════════════════════════════════════════════════════════════════════
// Phase R-Storefront Phase 2 — autoPrfRoutingForSale + period-close sweep +
// real-time routing + period-lock guard + SalesEntry banner
// ═══════════════════════════════════════════════════════════════════════════

// ── 11. autoPrfRoutingForSale service ──────────────────────────────────────
const routingSrc = read('backend/erp/services/autoPrfRoutingForSale.js');
expect(/^function deriveSalePeriod/m.test(routingSrc), 'autoPrfRoutingForSale.deriveSalePeriod defined');
expect(/^function aggregatePartnerTagsByPayee/m.test(routingSrc), 'autoPrfRoutingForSale.aggregatePartnerTagsByPayee defined');
expect(/^async function writeRebatePayouts/m.test(routingSrc), 'autoPrfRoutingForSale.writeRebatePayouts defined');
expect(/^async function writeBdmCommissionPayout/m.test(routingSrc), 'autoPrfRoutingForSale.writeBdmCommissionPayout defined');
expect(/^async function ensurePrfForBucket/m.test(routingSrc), 'autoPrfRoutingForSale.ensurePrfForBucket defined');
expect(/^async function routePrfsForSale/m.test(routingSrc), 'autoPrfRoutingForSale.routePrfsForSale (main entry) defined');
expect(/^async function storefrontRebateSweep/m.test(routingSrc), 'autoPrfRoutingForSale.storefrontRebateSweep defined');
expect(/source_kind:\s*['"]STOREFRONT_MANUAL['"]/.test(routingSrc), 'RebatePayout writes use source_kind=STOREFRONT_MANUAL');
expect(/source_kind:\s*['"]STOREFRONT_BDM['"]/.test(routingSrc), 'CommissionPayout writes use source_kind=STOREFRONT_BDM');
expect(/payee_role:\s*['"]BDM['"]/.test(routingSrc), 'CommissionPayout payee_role=BDM');
expect(/'metadata\.source_sales_line_id'/.test(routingSrc), 'PrfCalf idempotency keyed on metadata.source_sales_line_id');
expect(/linked_sales_line_id:\s*sale\._id/.test(routingSrc), 'PrfCalf.linked_sales_line_id stamped from sale._id');
expect(/bir_flag:\s*['"]INTERNAL['"]/.test(routingSrc), 'PrfCalf bir_flag=INTERNAL (Phase 0 invariant)');
expect(/payee_type:\s*['"]DOCTOR['"]/.test(routingSrc), 'PrfCalf payee_type=DOCTOR for storefront partner_tags');
expect(/auto_generated_by:\s*['"]autoPrfRoutingForSale['"]/.test(routingSrc), 'PrfCalf metadata.auto_generated_by=autoPrfRoutingForSale (provenance)');
expect(/checkPeriodOpen\(entityId,\s*period\)/.test(routingSrc), 'storefrontRebateSweep calls checkPeriodOpen before routing');
expect(/sale\.status\s*!==\s*['"]POSTED['"]/.test(routingSrc), 'routePrfsForSale rejects non-POSTED sales (defensive)');
expect(/sale\.deletion_event_id/.test(routingSrc), 'routePrfsForSale skips reversed sales');

// ── 12. RebatePayout enum extension ────────────────────────────────────────
const rpSrc = read('backend/erp/models/RebatePayout.js');
expect(/values:\s*\[['"]TIER_A_PRODUCT['"],\s*['"]TIER_B_CAPITATION['"],\s*['"]NON_MD['"],\s*['"]STOREFRONT_MANUAL['"]\]/.test(rpSrc), 'RebatePayout.source_kind enum extended with STOREFRONT_MANUAL');

// ── 13. CommissionPayout enum extension ────────────────────────────────────
const cpSrc = read('backend/erp/models/CommissionPayout.js');
expect(/values:\s*\[['"]ERP_COLLECTION['"],\s*['"]STOREFRONT_ECOMM['"],\s*['"]STOREFRONT_AREA_BDM['"],\s*['"]STOREFRONT_BDM['"]\]/.test(cpSrc), 'CommissionPayout.source_kind enum extended with STOREFRONT_BDM');

// ── 14. PrfCalf — linked_sales_line_id + idempotency index ─────────────────
const pcSrc = read('backend/erp/models/PrfCalf.js');
expect(/linked_sales_line_id:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId,\s*ref:\s*['"]SalesLine['"]/.test(pcSrc), 'PrfCalf.linked_sales_line_id field defined (ref SalesLine)');
expect(/prfCalfSchema\.index\(\s*\{\s*linked_sales_line_id:\s*1\s*\},\s*\{\s*sparse:\s*true\s*\}\)/.test(pcSrc), 'PrfCalf sparse index on linked_sales_line_id');
expect(/'metadata\.source_sales_line_id':\s*1[\s\S]{0,200}name:\s*['"]autoPrfRoutingForSale_idem['"]/.test(pcSrc), 'PrfCalf autoPrfRoutingForSale_idem index defined for storefront idempotency');

// ── 15. Real-time routing wired into postSaleRow (CASH_RECEIPT path) ───────
expect(/CASH_RECEIPT['"],\s*['"]SERVICE_INVOICE['"]\][\s\S]{0,400}row\.petty_cash_fund_id[\s\S]{0,400}routePrfsForSale/.test(ctrlSrc), 'postSaleRow CASH_RECEIPT branch calls routePrfsForSale on storefront cash sales');

// ── 16. Real-time routing wired into postSaleRow (SERVICE_INVOICE branch) ──
expect(/saleType === 'SERVICE_INVOICE'\s*&&\s*row\.petty_cash_fund_id[\s\S]{0,500}routePrfsForSale/.test(ctrlSrc), 'postSaleRow SERVICE_INVOICE early-return branch also calls routePrfsForSale');

// ── 17. Real-time routing wired into submitSales loop ──────────────────────
expect(/\(submit\) \$\{saleType\}/.test(ctrlSrc), 'submitSales console log identifies (submit) routing path');
expect(/autoPrfRoutingForSale failed for/.test(ctrlSrc), 'submitSales rebate routing failure aborts the batch (atomicity contract)');

// ── 18. Period-lock guard on attachStorefrontRebate ────────────────────────
expect(/checkPeriodOpen\(sale\.entity_id,\s*periodOfSale,\s*\{\s*source:\s*sale\.source\s*\}\)/.test(ctrlSrc), 'attachStorefrontRebate calls checkPeriodOpen on sale.csi_date period');
expect(/sub_permissions[\s\S]{0,200}accounting\?\.reverse_posted/.test(ctrlSrc), 'period-lock bypass requires accounting.reverse_posted (or president)');
expect(/log_type:\s*['"]PERIOD_LOCK_BYPASS['"]/.test(ctrlSrc), 'period-lock bypass writes PERIOD_LOCK_BYPASS audit row');
expect(/code:\s*['"]PERIOD_LOCKED['"]/.test(ctrlSrc), 'period-lock 403 carries code=PERIOD_LOCKED');

// ── 19. attachStorefrontRebate routes after save (post-POSTED path) ────────
expect(/await sale\.save\(\{\s*session\s*\}\)/.test(ctrlSrc), 'attachStorefrontRebate save uses transaction session');
expect(/sale\.status === ['"]POSTED['"][\s\S]{0,200}routePrfsForSale/.test(ctrlSrc), 'attachStorefrontRebate post-POSTED routing wired (POSTED-only fast path)');
expect(/routing:\s*routingResult/.test(ctrlSrc), 'attachStorefrontRebate response includes routing summary');

// ── 20. Period-close batch sweep route + handler ───────────────────────────
expect(/router\.post\(\s*'\/storefront-rebate-sweep'\s*,\s*c\.storefrontRebateSweepHandler\s*\)/.test(routesSrc), 'POST /storefront-rebate-sweep mounted to storefrontRebateSweepHandler');
expect(/^const storefrontRebateSweepHandler = catchAsync/m.test(ctrlSrc), 'storefrontRebateSweepHandler controller defined');
expect(/storefrontRebateSweepHandler/.test(ctrlSrc.split('module.exports')[1] || ''), 'storefrontRebateSweepHandler exported');
expect(/log_type:\s*['"]STOREFRONT_REBATE_SWEEP['"]/.test(ctrlSrc), 'sweep handler writes STOREFRONT_REBATE_SWEEP audit row');
expect(/PERIOD_LOCKED/.test(ctrlSrc), 'sweep handler propagates PERIOD_LOCKED error code');

// ── 21. SalesEntry banner additions ────────────────────────────────────────
const seSrc = read('frontend/src/erp/pages/SalesEntry.jsx');
expect(/Storefront cash sale/.test(seSrc), 'SalesEntry banner mentions "Storefront cash sale"');
expect(/Attach MD Rebate \/ BDM Commission/.test(seSrc), 'SalesEntry banner points users to Sales List → Attach MD Rebate / BDM Commission');

// ── 22. WorkflowGuide updated for sales-list and sales-entry ───────────────
const wgSrc = read('frontend/src/erp/components/WorkflowGuide.jsx');
expect(/Phase 2 \(May 8 2026\) shipped/.test(wgSrc), 'WorkflowGuide sales-list step mentions Phase 2 ship');
expect(/Phase R-Storefront[^\n]*post-POSTED workflow/.test(wgSrc) || /Storefront cash MD attribution \(Phase R-Storefront/.test(wgSrc), 'WorkflowGuide sales-entry step has storefront cash MD attribution callout');

// ── 23. Mongo-compatible partial filter on RebatePayout/CommissionPayout idem index ──
// Atlas rejects $ne in partial filters — Phase R-Storefront Phase 2 surfaced
// this latent Phase VIP-1.B bug. Use $in of allowed statuses instead.
expect(/partialFilterExpression:\s*\{\s*status:\s*\{\s*\$in:\s*\['ACCRUING',\s*'READY_TO_PAY',\s*'PAID'\]\s*\}\s*\}/.test(rpSrc), 'RebatePayout idem index uses Atlas-compatible $in partial filter');
expect(/partialFilterExpression:\s*\{\s*status:\s*\{\s*\$in:\s*\['ACCRUING',\s*'READY_TO_PAY',\s*'PAID'\]\s*\}\s*\}/.test(cpSrc), 'CommissionPayout idem index uses Atlas-compatible $in partial filter');
// Defense — neither model should still ship $ne in the partial filter
expect(!/partialFilterExpression:\s*\{\s*status:\s*\{\s*\$ne:/.test(rpSrc), 'RebatePayout no longer uses unsupported $ne in partial filter');
expect(!/partialFilterExpression:\s*\{\s*status:\s*\{\s*\$ne:/.test(cpSrc), 'CommissionPayout no longer uses unsupported $ne in partial filter');

// ── 24. ErpAuditLog enum carries Phase R-Storefront codes ───────────────────
const elSrc = read('backend/erp/models/ErpAuditLog.js');
expect(/'SALES_REBATE_ATTRIBUTION'/.test(elSrc), 'ErpAuditLog.log_type enum includes SALES_REBATE_ATTRIBUTION');
expect(/'STOREFRONT_REBATE_SWEEP'/.test(elSrc), 'ErpAuditLog.log_type enum includes STOREFRONT_REBATE_SWEEP');
expect(/'PERIOD_LOCK_BYPASS'/.test(elSrc), 'ErpAuditLog.log_type enum includes PERIOD_LOCK_BYPASS');

// ── 25. Migration script present (idempotency repair) ──────────────────────
const migSrc = read('backend/scripts/migrateRebateCommissionPayoutIndexes.js');
expect(/syncIndexes/.test(migSrc), 'migration script calls syncIndexes()');
expect(/'\$in'/.test(migSrc) || /\$in/.test(migSrc), 'migration script references $in fix path');
expect(/--apply/.test(migSrc), 'migration script supports --apply flag (DRY-RUN by default)');

console.log('\n');
if (warnings.length) {
  console.log(`\n${warnings.length} WARNINGS:`);
  warnings.forEach(w => console.log('  ' + w));
}
if (errors.length) {
  console.log(`\n${errors.length} FAILURES:`);
  errors.forEach(e => console.log('  ' + e));
  console.log('\nPhase R-Storefront Phase 1 + Phase 2 health check FAILED.');
  process.exit(1);
}
console.log('Phase R-Storefront Phase 1 + Phase 2 health check PASSED — schema + lookups + endpoint + audit + autoPrfRoutingForSale + period-lock + sweep all wired.');
