const express = require('express');
const { protect } = require('../../middleware/auth');
const tenantFilter = require('../middleware/tenantFilter');
const { erpAccessCheck } = require('../middleware/erpAccessCheck');

const router = express.Router();

// ═══ Public routes (no auth required) ═══
router.get('/po/share/:token', require('../controllers/printController').getSharedPOHtml);

// ═══ Phase VIP-1.J — BIR inbound-email webhook (no auth, shared-secret) ═══
// Receives forwarded BIR confirmation emails from SendGrid Inbound Parse /
// Cloudflare Email Workers / Mailgun. Auth is via X-Webhook-Secret header
// matched against process.env.BIR_INBOUND_EMAIL_SECRET. Mounted ABOVE the
// protect/tenantFilter wall because email providers don't carry session
// cookies. Body parser limits the payload to standard email size.
router.post('/bir/inbound-email', require('../controllers/birController').inboundEmail);

// ═══ Phase 1 — OCR (no tenant filter needed for OCR test) ═══
router.use('/ocr', require('./ocrRoutes'));

// ═══ Phase 2+ — ERP Data Routes (auth + tenant-filtered) ═══
// protect MUST run before tenantFilter so req.user is available
router.use(protect, tenantFilter);

// Shared infrastructure — no module-level erpAccessCheck (accessible to all ERP users)
router.use('/settings', require('./settingsRoutes'));
router.use('/government-rates', require('./governmentRatesRoutes'));
router.use('/hospitals', require('./hospitalRoutes'));
router.use('/products', require('./productMasterRoutes'));
router.use('/vendors', require('./vendorRoutes'));
router.use('/lookups', require('./lookupRoutes'));
router.use('/budget-allocations', require('./budgetAllocationRoutes'));
router.use('/classify', require('./classificationRoutes'));
router.use('/customers', require('./customerRoutes'));
router.use('/print', require('./printRoutes'));

// ═══ Phase 24 — ERP Control Center ═══
router.use('/entities', require('./entityRoutes'));
router.use('/control-center', require('./controlCenterRoutes'));
router.use('/lookup-values', require('./lookupGenericRoutes'));

// ═══ Phase H3 — OCR Settings & Usage Metering (per-entity, subscription-ready) ═══
router.use('/ocr-settings', require('./ocrSettingsRoutes'));

// ═══ Phase H5 — Vendor Auto-Learn Review (admin queue for Claude-learned vendors) ═══
router.use('/vendor-learnings', require('./vendorLearningRoutes'));

// ═══ Phase 24 — Agent Intelligence ═══
router.use('/agents', require('./agentRoutes'));

// ═══ Phase 24B — Partner Scorecards ═══
router.use('/scorecards', require('./scorecardRoutes'));

// ═══ Phase 28 — Sales Goals & KPI ═══
router.use('/sales-goals', erpAccessCheck('sales_goals'), require('./salesGoalRoutes'));

// ═══ Phase SG-3R — KPI Template (advisory defaults consumed by createPlan) ═══
// Mounted outside /sales-goals so the admin UI can list/curate templates without
// needing plan context. Access still gated by erpAccessCheck('sales_goals') inside
// the route file so non-Sales-Goals users can't enumerate another team's library.
router.use('/kpi-templates', erpAccessCheck('sales_goals'), require('./kpiTemplateRoutes'));

// ═══ Phase SG-Q2 W2 — Incentive Payout Ledger (sibling of sales-goals) ═══
// Mounted at its own path so payroll/finance can consume `/payable` without
// granting Sales Goals module access; route file still enforces
// erpAccessCheck('sales_goals', ...) since payouts are derived from plans.
router.use('/incentive-payouts', require('./incentivePayoutRoutes'));

// ═══ Phase SG-4 #22 — Credit Rules (SAP Commissions pattern) ═══
// Engine runs inside salesController.postSaleRow on every sale post.
// These routes expose CRUD on rules + read-only credit ledger to admins.
router.use('/credit-rules', require('./creditRuleRoutes'));

// ═══ Phase SG-4 #24 — Incentive Disputes (Oracle Fusion workflow pattern) ═══
// Multi-stage dispute flow with SLA escalation. Each transition routes
// through gateApproval('INCENTIVE_DISPUTE'). Background agent (#DSP) walks
// the SLA clock daily.
router.use('/incentive-disputes', require('./incentiveDisputeRoutes'));

// ═══ Phase SG-5 #27 — Variance Alert Center (persisted KPI variance alerts) ═══
// Coaching signal: list / resolve alerts produced by kpiVarianceAgent. Not
// a financial document — no gateApproval; BDMs resolve their own, managers
// resolve their direct reports', admin/finance/president resolve any.
router.use('/variance-alerts', require('./varianceAlertRoutes'));

// ═══ Phase P1 — BDM Mobile Capture + Office Proxy Queue ═══
// Cross-cutting capture pipeline — no module-level erpAccessCheck (every ERP
// user can create captures; proxy endpoints gated inside the controller via
// canProxyEntry). Entity scoping enforced in every endpoint.
router.use('/capture-submissions', require('./captureSubmissionRoutes'));

// ═══ Phase G8 (P2-9) — Tasks (Secretary Copilot backing store) ═══
// Cross-cutting productivity collection — no erpAccessCheck (every ERP user
// can maintain their own tasks). Controller enforces Rule #21 entity scoping.
router.use('/tasks', require('./taskRoutes'));

// ═══ Phase 28 — Approval Workflow (Authority Matrix) ═══
router.use('/approvals', require('./approvalRoutes'));

// ═══ Phase G6.10 — AI Cowork (Claude-powered approval/rejection assist) ═══
// Lookup-driven: AI_COWORK_FEATURES rows control prompts, models, role gates,
// rate limits per-entity. Subscription opt-in (rows seeded as is_active: false).
router.use('/ai-cowork', require('./aiCoworkRoutes'));

// ═══ Phase G7 — President's Copilot (chat widget + Cmd+K) ═══
// Lookup-driven tool registry (COPILOT_TOOLS) + lookup-driven feature row
// (PRESIDENT_COPILOT). Spend cap (AI_SPEND_CAPS) blocks calls at budget.
// Write-confirm tools route through existing controllers (Rule #20: no bypass).
router.use('/copilot', require('./copilotRoutes'));

// ═══ Phase 3 — Sales & Inventory ═══
router.use('/sales', erpAccessCheck('sales'), require('./salesRoutes'));
router.use('/credit-notes', erpAccessCheck('sales'), require('./creditNoteRoutes'));
router.use('/inventory', erpAccessCheck('inventory'), require('./inventoryRoutes'));

// Phase 32 — Undertaking (GRN receipt confirmation)
router.use('/undertaking', erpAccessCheck('inventory'), require('./undertakingRoutes'));

// ═══ Phase 4 — Consignment ═══
router.use('/consignment', erpAccessCheck('inventory'), require('./consignmentRoutes'));

// ═══ Phase 4B — Inter-Company Transfers ═══
router.use('/transfers', erpAccessCheck('inventory'), require('./interCompanyRoutes'));

// ═══ Phase 5 — Collections & AR ═══
router.use('/collections', erpAccessCheck('collections'), require('./collectionRoutes'));

// ═══ Phase 5.6 — IC Settlements (VIP collects from subsidiaries) ═══
router.use('/ic-settlements', erpAccessCheck('collections'), require('./icSettlementRoutes'));

// ═══ Phase 6 — Territories & Expenses ═══
router.use('/territories', erpAccessCheck('expenses'), require('./territoryRoutes'));
router.use('/expenses', erpAccessCheck('expenses'), require('./expenseRoutes'));

// ═══ Phase 7 — Income, PNL & Year-End Close ═══
// Note: incomeRoutes uses absolute paths (/income/*, /pnl/*, /profit-sharing/*, /archive/*)
// so it must be mounted at '/'. erpAccessCheck runs as passthrough for non-matching routes.
router.use('/', erpAccessCheck('reports'), require('./incomeRoutes'));

// ═══ Phase E.2 — Deduction Schedules (Recurring + Non-Recurring) ═══
router.use('/deduction-schedules', erpAccessCheck('reports'), require('./deductionScheduleRoutes'));

// ═══ Phase 8 — Dashboard & Reports ═══
router.use('/dashboard', erpAccessCheck('reports'), require('./dashboardRoutes'));

// ═══ Phase EC-1 — Executive Cockpit (CFO/CEO/COO at-a-glance) ═══
// Page-level gate is lookup-driven (EXECUTIVE_COCKPIT_ROLES.VIEW_COCKPIT) per
// Rule #3, applied inside cockpitRoutes via requireCockpitRole. No
// erpAccessCheck wrapper here — the cockpit is its own access surface and
// shouldn't be coupled to the 'reports' module flag (a finance user without
// the reports module should still see their financial cockpit).
router.use('/cockpit', require('./cockpitRoutes'));

// ═══ Phase 14 — New Reports & Analytics ═══
router.use('/reports', erpAccessCheck('reports'), require('./erpReportRoutes'));

// ═══ Gap 9 — Rx Correlation (Visit vs Sales + Rebates + Programs) ═══
router.use('/rx-correlation', erpAccessCheck('reports'), require('./rxCorrelationRoutes'));

// ═══ Phase 9 — Integration & Document Flow ═══
router.use('/documents', erpAccessCheck('reports'), require('./documentRoutes'));
router.use('/crm-bridge', require('./crmBridgeRoutes'));

// ═══ Phase 10 — ERP Access Control, People & Payroll ═══
router.use('/erp-access', require('./erpAccessRoutes'));
// as-users is a lightweight lookup needed by tagging UIs — no module check
router.get('/people/as-users', require('../controllers/peopleController').getAsUsers);
router.use('/people', erpAccessCheck('people'), require('./peopleRoutes'));
router.use('/role-assignments', erpAccessCheck('people'), require('./functionalRoleRoutes'));
router.use('/self-ratings', erpAccessCheck('people'), require('./kpiSelfRatingRoutes'));
router.use('/payroll', erpAccessCheck('payroll'), require('./payrollRoutes'));

// ═══ Phase 11 — Accounting Engine ═══
router.use('/credit-cards', require('./creditCardRoutes'));
router.use('/coa', erpAccessCheck('accounting'), require('./coaRoutes'));
router.use('/accounting', erpAccessCheck('accounting'), require('./accountingRoutes'));
router.use('/month-end-close', erpAccessCheck('accounting'), require('./monthEndCloseRoutes'));

// ═══ Phase 31 — President Reversal Console (cross-module SAP Storno dispatch) ═══
// Sub-permission gating happens inside the route file; both `accounting.reversal_console`
// (read-only audit) and `accounting.reverse_posted` (write) are enforced per-endpoint.
router.use('/president/reversals', require('./presidentReversalRoutes'));

// ═══ Phase 12 — Purchasing & AP ═══
router.use('/purchasing', erpAccessCheck('purchasing'), require('./purchasingRoutes'));

// ═══ Phase 13 — Banking & Cash ═══
router.use('/banking', erpAccessCheck('accounting'), require('./bankingRoutes'));

// ═══ Phase 17 — Warehouse Management ═══
router.use('/warehouse', erpAccessCheck('inventory'), require('./warehouseRoutes'));

// ═══ Phase 18 — Service Revenue (routes already under shared infra: /customers, /print) ═══

// ═══ Phase 19 — Petty Cash, Office Supplies & Collaterals ═══
router.use('/petty-cash', erpAccessCheck('accounting'), require('./pettyCashRoutes'));
router.use('/office-supplies', erpAccessCheck('inventory'), require('./officeSupplyRoutes'));
router.use('/collaterals', erpAccessCheck('inventory'), require('./collateralRoutes'));

// ═══ Phase 21 — Insurance Register ═══
router.use('/insurance', erpAccessCheck('people'), require('./insuranceRoutes'));

// ═══ Phase 21.3-21.4 — Period Locks & Recurring Journals ═══
router.use('/period-locks', erpAccessCheck('accounting'), require('./periodLockRoutes'));
router.use('/recurring-journals', erpAccessCheck('accounting'), require('./recurringJournalRoutes'));

// ═══ Phase VIP-1.H — SC/PWD Sales Book + BIR Sales Book exports ═══
// Per RA 9994 + RA 7277/9442 + BIR RR 7-2010. Role gates are lookup-driven
// inside the controller via SCPWD_ROLES (scpwdAccess.js), so no module-level
// erpAccessCheck — the lookup-driven gates supersede module-level auth and
// keep this Rule #3-aligned (subscriber-configurable per entity).
router.use('/scpwd-sales-book', require('./scpwdSalesBookRoutes'));

// ═══ Phase VIP-1.J — BIR Tax Compliance Suite (J0 dashboard + foundation) ═══
// Full form universe: 2550M/Q VAT, 1601-EQ/C, 1606, 2307 in/out, SAWT, QAP,
// 1604-CF/E, 1702/1701, Books of Accounts. J0 ships the dashboard + Data
// Quality Agent + tax-config UI; J1+ add per-form aggregators + serializers.
// Role gates are lookup-driven inside birController via BIR_ROLES
// (birAccess.js) — no module-level erpAccessCheck so subscribers configure
// per-entity gates including the new bookkeeper role without code deploys.
router.use('/bir', require('./birRoutes'));

// ═══ Phase VIP-1.B — Rebate + Commission Matrices + Payout Ledgers ═══
// Tier-A per-MD per-product rebates + Non-MD partner rebates + Tier-B
// capitation + BDM/ECOMM_REP/AREA_BDM commission matrix + read-only payout
// ledgers. Lookup-driven role gates inside each controller via
// REBATE_ROLES + COMMISSION_ROLES (rebateCommissionAccess.js).
// Subscription-ready: subscribers configure per-entity gates via
// Control Center → Lookup Tables. Tenant-isolated via tenantFilter.
router.use('/md-product-rebates', require('./mdProductRebateRoutes'));
router.use('/non-md-partner-rebate-rules', require('./nonMdPartnerRebateRuleRoutes'));
router.use('/md-capitation-rules', require('./mdCapitationRuleRoutes'));
router.use('/staff-commission-rules', require('./staffCommissionRuleRoutes'));
router.use('/rebate-payouts', require('./rebatePayoutRoutes'));
router.use('/commission-payouts', require('./commissionPayoutRoutes'));

// ═══ Phase 15 — SAP-Equivalent Improvements ═══
// CSI Booklets: the inventory gate blocks the management UI from BDMs without
// inventory module access. BDMs still need to see their OWN available numbers
// during Sales Entry, so /my-csi exposes just GET /available without that gate.
router.use('/my-csi', require('./csiBookletPublicRoutes'));
router.use('/csi-booklets', erpAccessCheck('inventory'), require('./csiBookletRoutes'));
router.use('/cycle-reports', erpAccessCheck('reports'), require('./cycleReportRoutes'));
router.use('/cost-centers', erpAccessCheck('accounting'), require('./costCenterRoutes'));
router.use('/archive', erpAccessCheck('accounting'), require('./archiveRoutes'));

module.exports = router;
