#!/usr/bin/env node
/**
 * healthcheckStorefrontRebateWiring — Phase R-Storefront Phase 1 (May 8 2026)
 *
 * Verifies the full wiring chain for the manual MD rebate + BDM commission
 * attribution feature on storefront cash sales (CASH_RECEIPT + SERVICE_INVOICE
 * routed through petty_cash_fund).
 *
 * Run: node backend/scripts/healthcheckStorefrontRebateWiring.js
 * Exits 1 on first failure so it can serve as a CI gate.
 *
 * Coverage:
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

console.log('Phase R-Storefront Phase 1 wiring health check\n──────────────────────────────────────────────');

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

console.log('\n');
if (warnings.length) {
  console.log(`\n${warnings.length} WARNINGS:`);
  warnings.forEach(w => console.log('  ' + w));
}
if (errors.length) {
  console.log(`\n${errors.length} FAILURES:`);
  errors.forEach(e => console.log('  ' + e));
  console.log('\nPhase R-Storefront Phase 1 health check FAILED.');
  process.exit(1);
}
console.log('Phase R-Storefront Phase 1 health check PASSED — schema + lookups + endpoint + audit all wired.');
