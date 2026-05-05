#!/usr/bin/env node
/**
 * Phase G4.7 — Unified Approval History (audit-trail mirror) wiring contract
 *
 * Verifies that "module-native" approval decisions get mirrored into
 * ApprovalRequest so the Approval History tab (frontend/src/erp/pages/ApprovalManager.jsx)
 * surfaces them. Closes the gap where decisions on income reports, finance-
 * auto-created deduction schedules, and schedule cancellations only lived on
 * the module record (status + approved_by + approved_at) and were invisible to
 * the unified history view.
 *
 * Static contract verifier — does NOT hit the live cluster. Run before any
 * commit that touches:
 *   - backend/erp/services/approvalService.js (mirrorApprovalDecision)
 *   - backend/erp/services/deductionScheduleService.js (closeApprovalRequest, createSchedule, cancelSchedule)
 *   - backend/erp/services/incomeCalc.js (transitionIncomeStatus)
 *   - backend/erp/controllers/universalApprovalController.js (income_report)
 *
 * Exit 0 = wiring intact; exit 1 = at least one assertion failed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, condition, hint = '') {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push({ label, hint });
    console.log(`  FAIL  ${label}${hint ? `\n        hint: ${hint}` : ''}`);
  }
}

function read(rel) {
  const full = path.resolve(REPO, rel);
  if (!fs.existsSync(full)) return '';
  return fs.readFileSync(full, 'utf8');
}

function section(title, body) {
  console.log(`\n=== ${title} ===`);
  body();
}

// ────────────────────────────────────────────────────────────────────────────
section('1. mirrorApprovalDecision helper exists in approvalService', () => {
  const src = read('backend/erp/services/approvalService.js');
  assert('approvalService.js exports mirrorApprovalDecision', /mirrorApprovalDecision,/.test(src),
    'add `mirrorApprovalDecision` to module.exports');
  assert('mirrorApprovalDecision function defined', /const mirrorApprovalDecision = async \(\{/.test(src),
    'function signature must accept a destructured options object');
  assert('helper validates required args', /if \(!entityId \|\| !module \|\| !docType \|\| !docId \|\| !decision \|\| !decidedBy\)/.test(src),
    'must skip silently when required args missing');
  assert('helper validates decision enum', /\['APPROVED', 'REJECTED', 'CANCELLED'\]\.includes\(decision\)/.test(src),
    'decision must be one of APPROVED/REJECTED/CANCELLED');
  assert('helper attempts CLOSE first (PENDING → decision)', /findOneAndUpdate\(\s*\{[^}]*status: 'PENDING'/.test(src),
    'must try to close an existing PENDING ApprovalRequest first');
  assert('helper has idempotency guard via metadata.action_label', /'metadata\.action_label': actionLabel,/.test(src),
    'duplicate-decision guard keys on (entity_id, module, doc_id, action_label, recent decided_at)');
  assert('helper CREATEs closed audit row when no PENDING exists', /ApprovalRequest\.create\(\{[\s\S]{0,400}status: decision/.test(src),
    'fallback path must INSERT with status set to the decision directly');
  assert('helper is non-fatal (try/catch + console.error)', /\[mirrorApprovalDecision\] failed/.test(src),
    'audit-write failures must be logged + swallowed');
  assert('helper writes history entry with by + reason', /history: \[\{[\s\S]{0,200}status: decision[\s\S]{0,200}by: decidedBy/.test(src),
    'created row must seed the history array with one entry');
});

// ────────────────────────────────────────────────────────────────────────────
section('2. transitionIncomeStatus mirrors every state transition', () => {
  const src = read('backend/erp/services/incomeCalc.js');
  assert('incomeCalc.js requires mirrorApprovalDecision lazily', /const \{ mirrorApprovalDecision \} = require\('\.\/approvalService'\)/.test(src),
    'lazy require avoids circular dep with approvalService');
  assert('ACTION_TO_DECISION maps all 4 actions', /review: 'APPROVED'[\s\S]{0,200}return: 'REJECTED'[\s\S]{0,200}confirm: 'APPROVED'[\s\S]{0,200}credit: 'APPROVED'/.test(src),
    'all VALID_TRANSITIONS keys (review/return/confirm/credit) must map to a decision');
  assert('mirror call uses module=INCOME', /module: 'INCOME',/.test(src), '');
  assert('mirror call uses docType=INCOME_REPORT', /docType: 'INCOME_REPORT',/.test(src), '');
  assert('mirror call passes actionLabel for idempotency', /actionLabel: action,/.test(src),
    'passes the raw action string (review|return|confirm|credit) as actionLabel');
  assert('mirror call is non-blocking (try/catch)', /\[transitionIncomeStatus\] audit mirror failed/.test(src),
    'mirror failure must NOT roll back the income state machine');
  assert('mirror runs AFTER report.save()', /await report\.save\(\);[\s\S]{0,1500}mirrorApprovalDecision\(\{[\s\S]{0,200}entityId: report\.entity_id,/.test(src),
    'business mutation must persist before the audit row is written');
  assert('mirror passes from_status + to_status metadata', /from_status: transition\.from\.join\('\|'\),[\s\S]{0,80}to_status: transition\.to,/.test(src),
    'history row should preserve the transition for forensics');
});

// ────────────────────────────────────────────────────────────────────────────
section('3. universalApprovalController income_report Hub-reject path', () => {
  const src = read('backend/erp/controllers/universalApprovalController.js');
  assert('Hub reject calls mirrorApprovalDecision with REJECTED', /\[income_report Hub reject\] audit mirror failed/.test(src),
    'Hub reject path must drop a REJECTED audit row (bypasses transitionIncomeStatus)');
  assert('Hub reject passes actionLabel=hub_reject', /actionLabel: 'hub_reject',/.test(src),
    'distinct actionLabel keeps Hub reject distinct from direct-route return');
  assert('Hub reject preserves from_status in metadata', /from_status: fromStatus, to_status: 'RETURNED'/.test(src),
    'Hub-reject from any status — capture original status for forensics');
  assert('non-reject actions still delegate to transitionIncomeStatus', /return transitionIncomeStatus\(id, action, userId\)/.test(src),
    'review|credit Hub actions go through the central transition (which mirrors itself)');
});

// ────────────────────────────────────────────────────────────────────────────
section('4. deductionScheduleService — close + create + cancel mirror', () => {
  const src = read('backend/erp/services/deductionScheduleService.js');
  assert('closeApprovalRequest delegates to mirrorApprovalDecision', /const \{ mirrorApprovalDecision \} = require\('\.\/approvalService'\)/.test(src),
    'shared helper replaces the inline updateMany');
  assert('closeApprovalRequest accepts optional schedule arg', /async function closeApprovalRequest\(docId, decisionStatus, userId, reason, schedule = null\)/.test(src),
    'optional 5th arg avoids extra DB roundtrip when caller already has the schedule');
  assert('closeApprovalRequest recovers entity_id when not passed', /DeductionSchedule\.findById\(docId\)\.select\('entity_id schedule_code total_amount term_months'\)/.test(src),
    'fallback fetch when caller did not pass schedule (e.g. withdrawSchedule)');
  assert('closeApprovalRequest passes module=DEDUCTION_SCHEDULE', /module: 'DEDUCTION_SCHEDULE',/.test(src), '');
  assert('createSchedule mirrors when isFinance=true', /Finance auto-create — \$\{schedule\.deduction_label\}/.test(src),
    'finance-create path must drop a closed APPROVED audit row');
  assert('finance auto-create uses actionLabel=finance_auto_create', /actionLabel: 'finance_auto_create',/.test(src), '');
  assert('cancelSchedule mirrors a CANCELLED audit row', /closeApprovalRequest\(schedule\._id, 'CANCELLED', userId/.test(src),
    'admin/finance cancellation must surface in Approval History');
  assert('approveSchedule passes schedule to closeApprovalRequest', /closeApprovalRequest\(schedule\._id, 'APPROVED', userId, null, schedule\)/.test(src),
    'avoid extra DB roundtrip on the hot approve path');
  assert('rejectSchedule passes schedule to closeApprovalRequest', /closeApprovalRequest\(schedule\._id, 'REJECTED', userId, reason, schedule\)/.test(src),
    'avoid extra DB roundtrip on the reject path');
});

// ────────────────────────────────────────────────────────────────────────────
section('5. ApprovalRequest model + listRequests query (no schema break)', () => {
  const model = read('backend/erp/models/ApprovalRequest.js');
  assert('status enum includes APPROVED/REJECTED/CANCELLED', /enum: \['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'\]/.test(model),
    'mirror helper writes APPROVED|REJECTED|CANCELLED — model must accept');
  assert('history is append-only array of {status, by, at, reason}', /history: \[\{[\s\S]{0,200}status: String[\s\S]{0,80}by: mongoose\.Schema\.Types\.ObjectId[\s\S]{0,80}reason: String/.test(model),
    'mirror helper $push history rows with this shape');
  assert('metadata is Mixed (action_label nesting safe)', /metadata: \{[\s\S]{0,80}type: mongoose\.Schema\.Types\.Mixed/.test(model),
    'idempotency guard reads metadata.action_label — must be Mixed');

  const ctrl = read('backend/erp/controllers/approvalController.js');
  assert('listRequests is unchanged (still queries ApprovalRequest.find)', /ApprovalRequest\.find\(filter\)[\s\S]{0,400}\.populate\('decided_by', 'name email'\)/.test(ctrl),
    'created audit rows now appear because they ARE ApprovalRequest documents');
});

// ────────────────────────────────────────────────────────────────────────────
section('6. Other Group B handlers still close their own ApprovalRequest', () => {
  const src = read('backend/erp/controllers/universalApprovalController.js');
  assert('petty_cash explicit closure intact', /Approved via Approval Hub[\s\S]{0,300}status: 'APPROVED'/.test(src),
    'Phase G6.7-PC1 closure pattern must not regress');
  assert('purchasing explicit closure intact', /case 'purchasing'|purchasing: async/.test(src), '');
  assert('journal handler intact', /journal: async/.test(src), '');
  assert('banking handler intact', /banking: async/.test(src), '');
  assert('ic_transfer handler intact', /ic_transfer: async/.test(src), '');
  assert('sales_goal_plan handler intact', /sales_goal_plan: async/.test(src), '');
  assert('incentive_payout handler intact', /incentive_payout: async/.test(src), '');
});

// ────────────────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────`);
console.log(`Phase G4.7 Unified Approval History contract: ${pass} pass / ${fail} fail`);
console.log(`────────────────────────────────────────────────────────────`);
if (fail > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.label}${f.hint ? `\n      hint: ${f.hint}` : ''}`);
  process.exit(1);
}
process.exit(0);
