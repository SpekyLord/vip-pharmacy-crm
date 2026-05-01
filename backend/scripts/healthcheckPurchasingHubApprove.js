/**
 * Healthcheck: Purchasing — Approval Hub Approve/Post wiring (Phase G6.7-PC4, May 01 2026)
 *
 * Statically verifies the Approval Hub's `purchasing` handler can post a PENDING
 * SupplierInvoice (closes the Group B "approve throws → 500" regression for
 * supplier invoices).
 *
 * Mirrors the posture of healthcheckPettyCashHubApprove.js (G6.7-PC1) /
 * healthcheckJournalHubApprove.js (G6.7-PC2) / healthcheckIncentivePayoutHubApprove.js
 * (G6.7-PC3) — same bug class, same fix pattern with a shared lifecycle helper.
 *
 * Usage:
 *   node backend/scripts/healthcheckPurchasingHubApprove.js
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
  } catch {
    return null;
  }
}

// ── universalApprovalController.js: purchasing handler branches on action ──
const univCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
check(
  'universalApprovalController.js exists',
  !!univCtrl,
  'Expected backend/erp/controllers/universalApprovalController.js to be present.'
);
check(
  'approvalHandlers.purchasing is no longer a bare buildGroupBReject delegate',
  univCtrl && !/purchasing:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl),
  "purchasing handler must branch on action — not unconditionally call buildGroupBReject (which throws on approve/post)."
);
check(
  'purchasing handler still routes reject through buildGroupBReject',
  univCtrl && /purchasing:\s*async[\s\S]{0,2500}action\s*===\s*'reject'[\s\S]{0,1000}buildGroupBReject\(/.test(univCtrl),
  "purchasing handler must keep the reject path delegating to buildGroupBReject (terminal-state guard against POSTED/CLOSED/CANCELLED)."
);
check(
  'purchasing handler routes approve OR post through postSingleSupplierInvoice',
  univCtrl && /purchasing:\s*async[\s\S]{0,4000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'[\s\S]{0,1500}postSingleSupplierInvoice\(/.test(univCtrl),
  "purchasing handler must dereference ApprovalRequest.doc_id and call postSingleSupplierInvoice(invoiceId, userId) on approve/post."
);
check(
  'purchasing handler dereferences ApprovalRequest by id (Group B id-semantics)',
  univCtrl && /purchasing:\s*async[\s\S]{0,4000}ApprovalRequest\.findById\(id\)\.lean\(\)/.test(univCtrl),
  "purchasing handler must look up ApprovalRequest by id and read doc_id (id is the request _id, not the SI _id)."
);
check(
  'purchasing handler closes the originating ApprovalRequest to APPROVED',
  univCtrl && /purchasing:\s*async[\s\S]{0,5000}ApprovalRequest\.updateOne\(\s*\{\s*_id:\s*id,\s*status:\s*'PENDING'\s*\}[\s\S]{0,800}'APPROVED'/.test(univCtrl),
  "purchasing handler must explicitly close the ApprovalRequest (the shared auto-resolve at L1130-1160 keys on doc_id, which never matches Group B items)."
);
check(
  'purchasing handler logs decision history on APPROVED',
  univCtrl && /purchasing:\s*async[\s\S]{0,6000}\$push:\s*\{\s*history:\s*\{\s*status:\s*'APPROVED'/.test(univCtrl),
  "purchasing handler must $push a history row when closing the request — keeps the Approval History tab honest."
);
check(
  'purchasing handler throws on unsupported action',
  univCtrl && /purchasing:\s*async[\s\S]{0,7000}Unsupported action for purchasing:/.test(univCtrl),
  "purchasing handler must throw a clear error on actions other than approve/post/reject."
);

// ── purchasingController.js: postSingleSupplierInvoice helper extracted + exported ──
const puCtrl = readFile('backend/erp/controllers/purchasingController.js');
check(
  'purchasingController.js exists',
  !!puCtrl,
  'Expected backend/erp/controllers/purchasingController.js to be present.'
);
check(
  'postSingleSupplierInvoice helper exists',
  puCtrl && /async\s+function\s+postSingleSupplierInvoice\s*\(\s*invoiceId\s*,\s*userId/.test(puCtrl),
  "Expected: async function postSingleSupplierInvoice(invoiceId, userId) in purchasingController.js"
);
check(
  'postSingleSupplierInvoice exported in module.exports',
  puCtrl && /module\.exports\s*=\s*\{[\s\S]{0,3000}postSingleSupplierInvoice/.test(puCtrl),
  "postSingleSupplierInvoice must be exported so the Hub handler can require it."
);
check(
  'postSingleSupplierInvoice is idempotent on POSTED',
  puCtrl && /postSingleSupplierInvoice[\s\S]{0,1500}status\s*===\s*'POSTED'[\s\S]{0,200}already_posted:\s*true/.test(puCtrl),
  "postSingleSupplierInvoice must short-circuit when invoice.status === 'POSTED' — re-approve from Hub must not double-post the AP entry / JE."
);
check(
  'postSingleSupplierInvoice guards against non-DRAFT/non-VALIDATED status',
  puCtrl && /postSingleSupplierInvoice[\s\S]{0,1500}\['DRAFT',\s*'VALIDATED'\]\.includes\(invoice\.status\)/.test(puCtrl),
  "postSingleSupplierInvoice must reject post attempts when status is anything other than DRAFT, VALIDATED, or POSTED (idempotent)."
);
check(
  "postSingleSupplierInvoice period-locks against the invoice's own entity_id",
  puCtrl && /postSingleSupplierInvoice[\s\S]{0,2000}checkPeriodOpen\(\s*invoice\.entity_id/.test(puCtrl),
  "postSingleSupplierInvoice must call checkPeriodOpen(invoice.entity_id, ...) — Hub approvers may be cross-entity privileged users."
);
check(
  'postSingleSupplierInvoice posts the JE atomically (mongoose transaction)',
  puCtrl && /postSingleSupplierInvoice[\s\S]{0,3000}mongoose\.startSession\(\)[\s\S]{0,2000}withTransaction\(/.test(puCtrl),
  "postSingleSupplierInvoice must wrap status flip + JE creation in a withTransaction so a failed JE rolls back the SI status change."
);
check(
  'postSingleSupplierInvoice writes INPUT VAT entry post-commit (best-effort)',
  puCtrl && /postSingleSupplierInvoice[\s\S]{0,4000}createVatEntry\(/.test(puCtrl)
         && /postSingleSupplierInvoice[\s\S]{0,4500}vat_type:\s*'INPUT'/.test(puCtrl),
  "postSingleSupplierInvoice must write an INPUT VAT entry (best-effort — failures are logged + audited but do not roll back the JE)."
);
check(
  'BDM-direct postInvoice route delegates to postSingleSupplierInvoice',
  puCtrl && /const\s+postInvoice\s*=\s*catchAsync[\s\S]{0,2500}postSingleSupplierInvoice\(\s*invoicePre\._id/.test(puCtrl),
  "postInvoice route must delegate to postSingleSupplierInvoice — keeps BDM-direct and Hub paths in lockstep."
);
check(
  'BDM-direct postInvoice route still calls gateApproval first',
  puCtrl && /const\s+postInvoice\s*=\s*catchAsync[\s\S]{0,1500}gateApproval\(/.test(puCtrl),
  "postInvoice must keep its gateApproval guard — non-authority callers route to the Approval Hub via gateApproval (writes ApprovalRequest + 202)."
);

// ── universalApprovalService.js: hub item shape unchanged ──
const univSvc = readFile('backend/erp/services/universalApprovalService.js');
check(
  'PURCHASING module query still uses buildGapModulePendingItems',
  univSvc && /module:\s*'PURCHASING'[\s\S]{0,1500}buildGapModulePendingItems/.test(univSvc),
  "PURCHASING MODULE_QUERIES entry should still surface items via buildGapModulePendingItems (unchanged contract)."
);
check(
  'PURCHASING actionType stays "purchasing" (matches Hub handler key)',
  univSvc && /module:\s*'PURCHASING'[\s\S]{0,2000}actionType:\s*'purchasing'/.test(univSvc),
  "actionType must remain 'purchasing' so the Hub handler key stays in sync."
);
check(
  'approve_purchasing sub-key wired in MODULE_TO_SUB_KEY',
  univSvc && /PURCHASING[\s\S]{0,300}sub_key:\s*'approve_purchasing'/.test(univSvc),
  "PURCHASING MODULE_QUERIES entry must expose sub_key='approve_purchasing' so the sub-perm gate is wired."
);

// ── TYPE_TO_MODULE wiring ──
check(
  "TYPE_TO_MODULE.purchasing maps to 'PURCHASING'",
  univCtrl && /purchasing:\s*'PURCHASING'/.test(univCtrl),
  "TYPE_TO_MODULE.purchasing must map to 'PURCHASING' so the approve_purchasing sub-perm gate fires."
);

// ── Sibling healthchecks still present (no regression) ──
check(
  'Phase G6.7-PC1 petty_cash healthcheck still present (sibling sanity)',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckPettyCashHubApprove.js')),
  "G6.7-PC1 healthcheck file should remain — same bug class, parallel fix."
);
check(
  'Phase G6.7-PC2 journal healthcheck still present (sibling sanity)',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckJournalHubApprove.js')),
  "G6.7-PC2 healthcheck file should remain — same bug class, parallel fix."
);
check(
  'Phase G6.7-PC3 incentive_payout healthcheck still present (sibling sanity)',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckIncentivePayoutHubApprove.js')),
  "G6.7-PC3 healthcheck file should remain — same bug class, parallel fix."
);

// ── Summary ──
let pass = 0;
let fail = 0;
for (const c of checks) {
  if (c.ok) {
    pass++;
    console.log(`  PASS  ${c.label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${c.label}`);
    if (c.hint) console.log(`        Hint: ${c.hint}`);
  }
}
console.log('');
console.log(`Healthcheck: ${pass}/${checks.length} PASS`);
if (fail > 0) {
  console.log(`              ${fail} FAILED`);
  process.exit(1);
}
process.exit(0);
