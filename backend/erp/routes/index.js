const express = require('express');
const { protect } = require('../../middleware/auth');
const tenantFilter = require('../middleware/tenantFilter');
const { erpAccessCheck } = require('../middleware/erpAccessCheck');

const router = express.Router();

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

// ═══ Phase 3 — Sales & Inventory ═══
router.use('/sales', erpAccessCheck('sales'), require('./salesRoutes'));
router.use('/inventory', erpAccessCheck('inventory'), require('./inventoryRoutes'));

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
router.use('/', erpAccessCheck('reports'), require('./incomeRoutes'));

// ═══ Phase 8 — Dashboard & Reports ═══
router.use('/dashboard', erpAccessCheck('reports'), require('./dashboardRoutes'));

// ═══ Phase 14 — New Reports & Analytics ═══
router.use('/reports', erpAccessCheck('reports'), require('./erpReportRoutes'));

// ═══ Phase 9 — Integration & Document Flow ═══
router.use('/documents', erpAccessCheck('reports'), require('./documentRoutes'));
router.use('/crm-bridge', require('./crmBridgeRoutes'));

// ═══ Phase 10 — ERP Access Control, People & Payroll ═══
router.use('/erp-access', require('./erpAccessRoutes'));
router.use('/people', erpAccessCheck('people'), require('./peopleRoutes'));
router.use('/payroll', erpAccessCheck('payroll'), require('./payrollRoutes'));

// ═══ Phase 11 — Accounting Engine ═══
router.use('/credit-cards', require('./creditCardRoutes'));
router.use('/coa', erpAccessCheck('accounting'), require('./coaRoutes'));
router.use('/accounting', erpAccessCheck('accounting'), require('./accountingRoutes'));
router.use('/month-end-close', erpAccessCheck('accounting'), require('./monthEndCloseRoutes'));

// ═══ Phase 12 — Purchasing & AP ═══
router.use('/purchasing', erpAccessCheck('purchasing'), require('./purchasingRoutes'));

// ═══ Phase 13 — Banking & Cash ═══
router.use('/banking', erpAccessCheck('accounting'), require('./bankingRoutes'));

// ═══ Phase 15 — SAP-Equivalent Improvements ═══
router.use('/csi-booklets', erpAccessCheck('sales'), require('./csiBookletRoutes'));
router.use('/cycle-reports', erpAccessCheck('reports'), require('./cycleReportRoutes'));
router.use('/cost-centers', erpAccessCheck('accounting'), require('./costCenterRoutes'));
router.use('/archive', erpAccessCheck('accounting'), require('./archiveRoutes'));

module.exports = router;
