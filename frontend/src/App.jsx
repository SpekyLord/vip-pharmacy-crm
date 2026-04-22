import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Components
import ErrorBoundary from './components/common/ErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner';
import { useAuth } from './hooks/useAuth';
import { ROLES, ROLE_SETS } from './constants/roles';

// Eagerly loaded pages (always needed)
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Auto-retry dynamic imports: on chunk-hash mismatch after deploy, reload once
const lazyRetry = (importFn) =>
  lazy(() =>
    importFn().catch(() => {
      const reloaded = sessionStorage.getItem('chunk_reload');
      if (!reloaded) {
        sessionStorage.setItem('chunk_reload', '1');
        window.location.reload();
        return new Promise(() => {}); // never resolves — page is reloading
      }
      sessionStorage.removeItem('chunk_reload');
      return importFn(); // second attempt after reload — let it fail naturally
    })
  );

// Lazy-loaded pages — split by role for smaller bundles
const ForgotPasswordPage = lazyRetry(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazyRetry(() => import('./pages/ResetPasswordPage'));
const PrivacyPolicyPage = lazyRetry(() => import('./pages/PrivacyPolicyPage'));
const TermsOfServicePage = lazyRetry(() => import('./pages/TermsOfServicePage'));
const DataDeletionPage = lazyRetry(() => import('./pages/DataDeletionPage'));
const DataDeletionStatusPage = lazyRetry(() => import('./pages/DataDeletionStatusPage'));

// BDM pages
const EmployeeDashboard = lazyRetry(() => import('./pages/employee/EmployeeDashboard'));
const MyVisits = lazyRetry(() => import('./pages/employee/MyVisits'));
const NewVisitPage = lazyRetry(() => import('./pages/employee/NewVisitPage'));
const NewClientVisitPage = lazyRetry(() => import('./pages/employee/NewClientVisitPage'));
const EmployeeInbox = lazyRetry(() => import('./pages/employee/EMP_InboxPage'));
// Phase G9.R5 — unified inbox surface for ALL roles. EMP_InboxPage now
// re-exports this so /bdm/inbox keeps the same component.
const InboxPage = lazyRetry(() => import('./pages/common/InboxPage'));
const CallPlanPage = lazyRetry(() => import('./pages/employee/CallPlanPage'));
const DoctorDetailPage = lazyRetry(() => import('./pages/employee/DoctorDetailPage'));
const ProductSpecPage = lazyRetry(() => import('./pages/employee/ProductSpecPage'));
const CommLogPage = lazyRetry(() => import('./pages/employee/CommLogPage'));
// CLM — Closed Loop Marketing (Partnership Presentation)
const PartnershipCLM = lazyRetry(() => import('./pages/employee/PartnershipCLM'));

// Admin pages
const AdminDashboard = lazyRetry(() => import('./pages/admin/AdminDashboard'));
const DoctorsPage = lazyRetry(() => import('./pages/admin/DoctorsPage'));
const EmployeesPage = lazyRetry(() => import('./pages/admin/EmployeesPage'));
const BDMVisitsPage = lazyRetry(() => import('./pages/admin/BDMVisitsPage'));
const ProductsPage = lazyRetry(() => import('./pages/admin/ProductsPage'));
const ReportsPage = lazyRetry(() => import('./pages/admin/ReportsPage'));
const StatisticsPage = lazyRetry(() => import('./pages/admin/StatisticsPage'));
const ActivityMonitor = lazyRetry(() => import('./pages/admin/ActivityMonitor'));
const PendingApprovalsPage = lazyRetry(() => import('./pages/admin/PendingApprovalsPage'));
const GPSVerificationPage = lazyRetry(() => import('./pages/admin/GPSVerificationPage'));
const PhotoAuditPage = lazyRetry(() => import('./pages/admin/PhotoAuditPage'));
const SettingsPage = lazyRetry(() => import('./pages/admin/SettingsPage'));
const CommLogsPage = lazyRetry(() => import('./pages/admin/CommLogsPage'));
const MessageTemplatesPage = lazyRetry(() => import('./pages/admin/MessageTemplatesPage'));
const InvitesPage = lazyRetry(() => import('./pages/admin/InvitesPage'));
const CLMSessionsPage = lazyRetry(() => import('./pages/admin/CLMSessionsPage'));

// ERP pages
const ErpDashboard = lazyRetry(() => import('./erp/pages/ErpDashboard'));
const SalesEntry = lazyRetry(() => import('./erp/pages/SalesEntry'));
const OpeningArEntry = lazyRetry(() => import('./erp/pages/OpeningArEntry'));
const OpeningArList = lazyRetry(() => import('./erp/pages/OpeningArList'));
const SalesList = lazyRetry(() => import('./erp/pages/SalesList'));
const MyStock = lazyRetry(() => import('./erp/pages/MyStock'));
const GrnEntry = lazyRetry(() => import('./erp/pages/GrnEntry'));
// Phase 32 — Auto-Undertaking (receipt confirmation, sibling of GRN)
const UndertakingList = lazyRetry(() => import('./erp/pages/UndertakingList'));
const UndertakingDetail = lazyRetry(() => import('./erp/pages/UndertakingDetail'));
const GrnAuditView = lazyRetry(() => import('./erp/pages/GrnAuditView'));
const DrEntry = lazyRetry(() => import('./erp/pages/DrEntry'));
const ConsignmentDashboard = lazyRetry(() => import('./erp/pages/ConsignmentDashboard'));
const Collections = lazyRetry(() => import('./erp/pages/Collections'));
const CollectionSession = lazyRetry(() => import('./erp/pages/CollectionSession'));
const AccountsReceivable = lazyRetry(() => import('./erp/pages/AccountsReceivable'));
const SoaGenerator = lazyRetry(() => import('./erp/pages/SoaGenerator'));
const IcArDashboard = lazyRetry(() => import('./erp/pages/IcArDashboard'));
const IcSettlement = lazyRetry(() => import('./erp/pages/IcSettlement'));
const Expenses = lazyRetry(() => import('./erp/pages/Expenses'));
const Smer = lazyRetry(() => import('./erp/pages/Smer'));
const CarLogbook = lazyRetry(() => import('./erp/pages/CarLogbook'));
const PrfCalf = lazyRetry(() => import('./erp/pages/PrfCalf'));
const ErpReports = lazyRetry(() => import('./erp/pages/ErpReports'));
const TransferOrders = lazyRetry(() => import('./erp/pages/TransferOrders'));
const TransferReceipt = lazyRetry(() => import('./erp/pages/TransferReceipt'));
const TransferPriceManager = lazyRetry(() => import('./erp/pages/TransferPriceManager'));
const WarehouseManager = lazyRetry(() => import('./erp/pages/WarehouseManager'));
const Income = lazyRetry(() => import('./erp/pages/Income'));
const MyIncome = lazyRetry(() => import('./erp/pages/MyIncome'));
const Pnl = lazyRetry(() => import('./erp/pages/Pnl'));
const ProfitSharing = lazyRetry(() => import('./erp/pages/ProfitSharing'));
const MonthlyArchivePage = lazyRetry(() => import('./erp/pages/MonthlyArchive'));
const AuditLogs = lazyRetry(() => import('./erp/pages/AuditLogs'));
// Phase 10 — ERP Access Control, People & Payroll
const AccessTemplateManager = lazyRetry(() => import('./erp/pages/AccessTemplateManager'));
const PeopleList = lazyRetry(() => import('./erp/pages/PeopleList'));
const OrgChart = lazyRetry(() => import('./erp/pages/OrgChart'));
const PersonDetail = lazyRetry(() => import('./erp/pages/PersonDetail'));
const PayrollRun = lazyRetry(() => import('./erp/pages/PayrollRun'));
const PayslipView = lazyRetry(() => import('./erp/pages/PayslipView'));
const ThirteenthMonth = lazyRetry(() => import('./erp/pages/ThirteenthMonth'));
// Phase 11 — Accounting Engine + Card Management
const CreditCardManager = lazyRetry(() => import('./erp/pages/CreditCardManager'));
const ChartOfAccounts = lazyRetry(() => import('./erp/pages/ChartOfAccounts'));
const JournalEntries = lazyRetry(() => import('./erp/pages/JournalEntries'));
const TrialBalance = lazyRetry(() => import('./erp/pages/TrialBalance'));
const ProfitAndLoss = lazyRetry(() => import('./erp/pages/ProfitAndLoss'));
const VatCompliance = lazyRetry(() => import('./erp/pages/VatCompliance'));
const CashflowStatement = lazyRetry(() => import('./erp/pages/CashflowStatement'));
const FixedAssetsPage = lazyRetry(() => import('./erp/pages/FixedAssets'));
const LoansPage = lazyRetry(() => import('./erp/pages/Loans'));
const OwnerEquity = lazyRetry(() => import('./erp/pages/OwnerEquity'));
const MonthEndClose = lazyRetry(() => import('./erp/pages/MonthEndClose'));

// Phase 21 — Government Rates, Period Locks, Recurring Journals, BIR Calculator
const GovernmentRates = lazyRetry(() => import('./erp/pages/GovernmentRates'));
const PaymentModes = lazyRetry(() => import('./erp/pages/PaymentModes'));
const PeriodLocks = lazyRetry(() => import('./erp/pages/PeriodLocks'));
const RecurringJournals = lazyRetry(() => import('./erp/pages/RecurringJournals'));
const BirCalculator = lazyRetry(() => import('./erp/pages/BirCalculator'));

// Phase 13 — Banking & Cash
const BankAccounts = lazyRetry(() => import('./erp/pages/BankAccounts'));
const BankReconciliation = lazyRetry(() => import('./erp/pages/BankReconciliation'));
const CreditCardLedger = lazyRetry(() => import('./erp/pages/CreditCardLedger'));

// Phase 12 — Purchasing & AP
const VendorList = lazyRetry(() => import('./erp/pages/VendorList'));
const PurchaseOrders = lazyRetry(() => import('./erp/pages/PurchaseOrders'));
const SupplierInvoices = lazyRetry(() => import('./erp/pages/SupplierInvoices'));
const AccountsPayable = lazyRetry(() => import('./erp/pages/AccountsPayable'));

// Phase 14 — New Reports & Analytics
const PerformanceRanking = lazyRetry(() => import('./erp/pages/PerformanceRanking'));
// Gap 9 — Rx Correlation
const RxCorrelation = lazyRetry(() => import('./erp/pages/RxCorrelation'));
const ConsignmentAging = lazyRetry(() => import('./erp/pages/ConsignmentAging'));
const ExpenseAnomalies = lazyRetry(() => import('./erp/pages/ExpenseAnomalies'));
const FuelEfficiency = lazyRetry(() => import('./erp/pages/FuelEfficiency'));
const CycleStatusDashboard = lazyRetry(() => import('./erp/pages/CycleStatusDashboard'));

const BudgetAllocations = lazyRetry(() => import('./erp/pages/BudgetAllocations'));

// Phase 15 — SAP-Equivalent Improvements
const CsiBooklets = lazyRetry(() => import('./erp/pages/CsiBooklets'));
const CycleReports = lazyRetry(() => import('./erp/pages/CycleReports'));
const CostCenters = lazyRetry(() => import('./erp/pages/CostCenters'));
const DataArchive = lazyRetry(() => import('./erp/pages/DataArchive'));

// Phase 18 — Service Revenue & Cost Center Expenses
const HospitalList = lazyRetry(() => import('./erp/pages/HospitalList'));
const CustomerList = lazyRetry(() => import('./erp/pages/CustomerList'));
const ProductMasterPage = lazyRetry(() => import('./erp/pages/ProductMaster'));

// Phase 19 — Petty Cash, Office Supplies & Collaterals
const PettyCash = lazyRetry(() => import('./erp/pages/PettyCash'));
const OfficeSupplies = lazyRetry(() => import('./erp/pages/OfficeSupplies'));
const Collaterals = lazyRetry(() => import('./erp/pages/Collaterals'));

// Phase 24 — ERP Control Center + Agent Intelligence
const ControlCenter = lazyRetry(() => import('./erp/pages/ControlCenter'));
const AgentDashboard = lazyRetry(() => import('./erp/pages/AgentDashboard'));

// Phase 28 — Approval Workflow
const ApprovalManager = lazyRetry(() => import('./erp/pages/ApprovalManager'));

// Phase 31 — President Reversal Console (cross-module SAP Storno dispatch)
const PresidentReversalsPage = lazyRetry(() => import('./erp/pages/PresidentReversalsPage'));

// Phase 31 — Functional Role Assignments
const RoleAssignmentManager = lazyRetry(() => import('./erp/pages/RoleAssignmentManager'));

// Phase 32 — KPI Self-Rating & Performance Review
const KpiLibrary = lazyRetry(() => import('./erp/pages/KpiLibrary'));
const KpiSelfRating = lazyRetry(() => import('./erp/pages/KpiSelfRating'));

// Phase 25 — Returns, Expiry, Batch Trace, Orphaned Page Routes
const CreditNotes = lazyRetry(() => import('./erp/pages/CreditNotes'));
const ExpiryDashboard = lazyRetry(() => import('./erp/pages/ExpiryDashboard'));
const BatchTrace = lazyRetry(() => import('./erp/pages/BatchTrace'));

// Phase 28 — Sales Goals & KPI
const SalesGoalDashboard = lazyRetry(() => import('./erp/pages/SalesGoalDashboard'));
const SalesGoalSetup = lazyRetry(() => import('./erp/pages/SalesGoalSetup'));
const SalesGoalBdmView = lazyRetry(() => import('./erp/pages/SalesGoalBdmView'));
const IncentiveTracker = lazyRetry(() => import('./erp/pages/IncentiveTracker'));
// Phase SG-Q2 W2 — Incentive Payout Ledger (accrued → approved → paid → reversed)
const IncentivePayoutLedger = lazyRetry(() => import('./erp/pages/IncentivePayoutLedger'));
// Phase SG-3R — KPI Template Library (reusable plan defaults)
const KpiTemplateManager = lazyRetry(() => import('./erp/pages/KpiTemplateManager'));
// Phase SG-4 #22, #24 — Credit Rules + Dispute Center
const CreditRuleManager = lazyRetry(() => import('./erp/pages/CreditRuleManager'));
const DisputeCenter = lazyRetry(() => import('./erp/pages/DisputeCenter'));
// Phase SG-5 #26, #27 — Scenario Planner + Variance Alert Center
const ScenarioPlanner = lazyRetry(() => import('./erp/pages/ScenarioPlanner'));
const VarianceAlertCenter = lazyRetry(() => import('./erp/pages/VarianceAlertCenter'));
// Phase SG-6 #29 — SOX Control Matrix (admin/finance/president only)
const SoxControlMatrix = lazyRetry(() => import('./erp/pages/SoxControlMatrix'));

// Phase G7 — President's Copilot + Cmd+K palette (ERP-only, role-gated by lookup)
const PresidentCopilot = lazyRetry(() => import('./erp/components/PresidentCopilot'));
const CommandPalette   = lazyRetry(() => import('./erp/components/CommandPalette'));

// Phase G8 (P2-9) — Tasks page (backs CREATE_TASK / LIST_OVERDUE_ITEMS Copilot tools)
const TasksPage = lazyRetry(() => import('./erp/pages/TasksPage'));

// Standalone routes redirect to ControlCenter with the right section param
const AgentSettingsRedirect = () => <Navigate to="/erp/control-center?section=agent-settings" replace />;
const EntityManagerRedirect = () => <Navigate to="/erp/control-center?section=entities" replace />;
const LookupManagerRedirect = () => <Navigate to="/erp/control-center?section=lookups" replace />;
// Phase G9.R8 — deep-link for Inbox Retention admin (alias of the ControlCenter section).
const InboxRetentionRedirect = () => <Navigate to="/erp/control-center?section=inbox-retention" replace />;

// Phase G7 — Mount Copilot widget + Cmd+K palette only on ERP routes so the
// chunks aren't downloaded on /admin or /bdm pages. Components themselves also
// guard with useLocation + lookup-driven role gate, but the path check here
// avoids the network round-trip entirely on non-ERP pages.
//
// Wrapped in its OWN Suspense with a null fallback so the floating widget
// chunks loading in the background don't block the ERP page from rendering
// (parent Suspense's fallback would otherwise hide the page until both chunks
// resolve). On chunk error, the ErrorBoundary higher up catches it without
// nuking navigation.
const ErpAddons = () => {
  const location = useLocation();
  if (!location.pathname.startsWith('/erp')) return null;
  return (
    <Suspense fallback={null}>
      <PresidentCopilot />
      <CommandPalette />
    </Suspense>
  );
};

// Redirect legacy /employee/* paths to /bdm/*
const EmployeeRedirect = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (ROLE_SETS.ADMIN_LIKE.includes(user?.role)) {
    return <Navigate to="/admin" replace />;
  }

  const newPath = location.pathname.replace('/employee', '/bdm') + location.search;
  return <Navigate to={newPath} replace />;
};

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/home" element={<ProtectedRoute allowedRoles={ROLE_SETS.ALL}><HomePage /></ProtectedRoute>} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/data-deletion" element={<DataDeletionPage />} />
          <Route path="/data-deletion/status/:code" element={<DataDeletionStatusPage />} />

          {/* Employee Routes */}
          <Route
            path="/bdm"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <EmployeeDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/visits"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <MyVisits />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/visit/new"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <NewVisitPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/regular-visit/new"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <NewClientVisitPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/inbox"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <EmployeeInbox />
              </ProtectedRoute>
            }
          />
          {/* Phase G9.R5 — unified inbox for every authenticated role */}
          <Route
            path="/inbox"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ALL}>
                <InboxPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inbox/thread/:thread_id"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ALL}>
                <InboxPage />
              </ProtectedRoute>
            }
          />
          <Route path="/bdm/performance" element={<Navigate to="/bdm/cpt" replace />} />
          <Route
            path="/bdm/doctor/:id"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <DoctorDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/bdm/schedule" element={<Navigate to="/bdm/cpt" replace />} />
          <Route
            path="/bdm/products"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <ProductSpecPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/cpt"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <CallPlanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/comm-log"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <CommLogPage />
              </ProtectedRoute>
            }
          />
          {/* CLM — Partnership Presentation */}
          <Route
            path="/bdm/partnership"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <PartnershipCLM />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/doctors"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <DoctorsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/employees"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <EmployeesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/employees/:id/visits"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <BDMVisitsPage />
              </ProtectedRoute>
            }
          />
          {/* CLM Admin — Partnership Session Analytics */}
          <Route
            path="/admin/clm-sessions"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <CLMSessionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <ProductsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/statistics"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <StatisticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/activity"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <ActivityMonitor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <PendingApprovalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/gps-verification"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <GPSVerificationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/photo-audit"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <PhotoAuditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/comm-logs"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <CommLogsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/message-templates"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <MessageTemplatesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/invites"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <InvitesPage />
              </ProtectedRoute>
            }
          />

          {/* Legacy /employee redirects → /bdm */}
          {/* ERP Routes */}
          <Route
            path="/erp"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN}>
                <ErpDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/sales"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="sales">
                <SalesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/sales/entry"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN} requiredErpModule="sales">
                <SalesEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/sales/opening-ar"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN} requiredErpModule="sales">
                <OpeningArEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/sales/opening-ar/list"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN} requiredErpModule="sales">
                <OpeningArList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/my-stock"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="inventory">
                <MyStock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/grn"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule={["inventory", "purchasing"]}>
                <GrnEntry />
              </ProtectedRoute>
            }
          />
          {/* Phase 32 — Undertaking (receipt confirmation, sibling of GRN) */}
          <Route
            path="/erp/undertaking"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="inventory">
                <UndertakingList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/undertaking/:id"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="inventory">
                <UndertakingDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/grn/:id/audit"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="inventory">
                <GrnAuditView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/dr"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN} requiredErpModule="sales">
                <DrEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/consignment"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="inventory">
                <ConsignmentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="collections">
                <Collections />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/session"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="collections">
                <CollectionSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/ar"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="collections">
                <AccountsReceivable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/soa"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="collections">
                <SoaGenerator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/ic-settlements"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}>
                <IcArDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/ic-settlements/new"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}>
                <IcSettlement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/expenses"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="expenses">
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/smer"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="expenses">
                <Smer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/car-logbook"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="expenses">
                <CarLogbook />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/prf-calf"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="expenses">
                <PrfCalf />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/reports"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN} requiredErpModule="reports">
                <ErpReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/transfers"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN} requiredErpModule="inventory">
                <TransferOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/warehouses"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <WarehouseManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/transfers/receive"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.BDM_ADMIN} requiredErpModule="inventory">
                <TransferReceipt />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/transfers/prices"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ADMIN_ONLY}>
                <TransferPriceManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/my-income"
            element={
              <ProtectedRoute allowedRoles={[ROLES.CONTRACTOR]} requiredErpModule="reports">
                <MyIncome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/income"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="people">
                <Income />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/pnl"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="people">
                <Pnl />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/profit-sharing"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE} requiredErpModule="people">
                <ProfitSharing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/monthly-archive"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_FINANCE}>
                <MonthlyArchivePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/audit-logs"
            element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.FINANCE]}>
                <AuditLogs />
              </ProtectedRoute>
            }
          />

          {/* Phase 10 — ERP Access Control, People & Payroll */}
          <Route
            path="/erp/access-templates"
            element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.PRESIDENT]}>
                <AccessTemplateManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/people"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="people">
                <PeopleList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/people/:id"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="people">
                <PersonDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/org-chart"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="people">
                <OrgChart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/payroll"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="payroll">
                <PayrollRun />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/payslip/:id"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="payroll">
                <PayslipView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/thirteenth-month"
            element={
              <ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="payroll">
                <ThirteenthMonth />
              </ProtectedRoute>
            }
          />

          {/* Phase 11 — Accounting Engine + Card Management */}
          <Route path="/erp/credit-cards" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><CreditCardManager /></ProtectedRoute>} />
          <Route path="/erp/coa" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><ChartOfAccounts /></ProtectedRoute>} />
          <Route path="/erp/journals" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><JournalEntries /></ProtectedRoute>} />
          <Route path="/erp/trial-balance" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><TrialBalance /></ProtectedRoute>} />
          <Route path="/erp/profit-loss" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><ProfitAndLoss /></ProtectedRoute>} />
          <Route path="/erp/vat-compliance" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><VatCompliance /></ProtectedRoute>} />
          <Route path="/erp/cashflow" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><CashflowStatement /></ProtectedRoute>} />
          <Route path="/erp/fixed-assets" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><FixedAssetsPage /></ProtectedRoute>} />
          <Route path="/erp/loans" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><LoansPage /></ProtectedRoute>} />
          <Route path="/erp/owner-equity" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><OwnerEquity /></ProtectedRoute>} />
          <Route path="/erp/month-end-close" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><MonthEndClose /></ProtectedRoute>} />

          {/* Phase 21 — Government Rates, Period Locks, Recurring Journals, BIR Calculator */}
          <Route path="/erp/government-rates" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><GovernmentRates /></ProtectedRoute>} />
          <Route path="/erp/payment-modes" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><PaymentModes /></ProtectedRoute>} />
          <Route path="/erp/period-locks" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><PeriodLocks /></ProtectedRoute>} />
          <Route path="/erp/recurring-journals" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><RecurringJournals /></ProtectedRoute>} />
          <Route path="/erp/bir-calculator" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><BirCalculator /></ProtectedRoute>} />

          {/* Phase 12 — Purchasing & AP */}
          <Route path="/erp/vendors" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="purchasing"><VendorList /></ProtectedRoute>} />
          <Route path="/erp/purchase-orders" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="purchasing"><PurchaseOrders /></ProtectedRoute>} />
          <Route path="/erp/supplier-invoices" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="purchasing"><SupplierInvoices /></ProtectedRoute>} />
          <Route path="/erp/accounts-payable" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="purchasing"><AccountsPayable /></ProtectedRoute>} />

          {/* Phase 13 — Banking & Cash */}
          <Route path="/erp/bank-accounts" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><BankAccounts /></ProtectedRoute>} />
          <Route path="/erp/bank-recon" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><BankReconciliation /></ProtectedRoute>} />
          <Route path="/erp/credit-card-ledger" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><CreditCardLedger /></ProtectedRoute>} />

          {/* Phase 14 — New Reports & Analytics */}
          <Route path="/erp/performance-ranking" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="reports"><PerformanceRanking /></ProtectedRoute>} />
          <Route path="/erp/consignment-aging" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="reports"><ConsignmentAging /></ProtectedRoute>} />
          <Route path="/erp/expense-anomalies" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="reports"><ExpenseAnomalies /></ProtectedRoute>} />
          <Route path="/erp/fuel-efficiency" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="reports"><FuelEfficiency /></ProtectedRoute>} />
          <Route path="/erp/cycle-status" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="reports"><CycleStatusDashboard /></ProtectedRoute>} />
          <Route path="/erp/budget-allocations" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="reports"><BudgetAllocations /></ProtectedRoute>} />
          {/* Gap 9 — Rx Correlation */}
          <Route path="/erp/rx-correlation" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="reports"><RxCorrelation /></ProtectedRoute>} />

          {/* Phase 15 — SAP-Equivalent Improvements */}
          <Route path="/erp/csi-booklets" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="inventory"><CsiBooklets /></ProtectedRoute>} />
          <Route path="/erp/cycle-reports" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="reports"><CycleReports /></ProtectedRoute>} />
          <Route path="/erp/cost-centers" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><CostCenters /></ProtectedRoute>} />
          <Route path="/erp/data-archive" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><DataArchive /></ProtectedRoute>} />

          {/* Phase 18 — Service Revenue & Cost Center Expenses */}
          <Route path="/erp/hospitals" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL}><HospitalList /></ProtectedRoute>} />
          <Route path="/erp/customers" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL}><CustomerList /></ProtectedRoute>} />
          <Route path="/erp/products" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL}><ProductMasterPage /></ProtectedRoute>} />

          {/* Phase 19 — Petty Cash, Office Supplies & Collaterals */}
          <Route path="/erp/petty-cash" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="accounting"><PettyCash /></ProtectedRoute>} />
          <Route path="/erp/office-supplies" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="inventory"><OfficeSupplies /></ProtectedRoute>} />
          <Route path="/erp/collaterals" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="inventory"><Collaterals /></ProtectedRoute>} />

          {/* Phase 24 — ERP Control Center + Agent Intelligence */}
          <Route path="/erp/control-center" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><ControlCenter /></ProtectedRoute>} />
          <Route path="/erp/agent-dashboard" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><AgentDashboard /></ProtectedRoute>} />
          <Route path="/erp/approvals" element={<ProtectedRoute requiredErpModule="approvals"><ApprovalManager /></ProtectedRoute>} />
          <Route path="/erp/role-assignments" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><RoleAssignmentManager /></ProtectedRoute>} />

          {/* Phase 31 — President Reversal Console (gated by accounting.reversal_console + accounting.reverse_posted) */}
          <Route path="/erp/president/reversals" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><PresidentReversalsPage /></ProtectedRoute>} />

          {/* Phase 32 — KPI Self-Rating & Performance Review */}
          <Route path="/erp/kpi-library" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><KpiLibrary /></ProtectedRoute>} />
          <Route path="/erp/self-rating" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL}><KpiSelfRating /></ProtectedRoute>} />

          {/* Phase 25 — Returns, Expiry, Batch Trace */}
          <Route path="/erp/credit-notes" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="sales"><CreditNotes /></ProtectedRoute>} />
          <Route path="/erp/expiry-dashboard" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="inventory"><ExpiryDashboard /></ProtectedRoute>} />
          <Route path="/erp/batch-trace" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule={["inventory", "purchasing"]}><BatchTrace /></ProtectedRoute>} />

          {/* Phase 28 — Sales Goals & KPI */}
          <Route path="/erp/sales-goals" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="sales_goals"><SalesGoalDashboard /></ProtectedRoute>} />
          <Route path="/erp/sales-goals/setup" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.PRESIDENT]} requiredErpModule="sales_goals"><SalesGoalSetup /></ProtectedRoute>} />
          <Route path="/erp/sales-goals/bdm/:bdmId" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="sales_goals"><SalesGoalBdmView /></ProtectedRoute>} />
          <Route path="/erp/sales-goals/my" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="sales_goals"><SalesGoalBdmView /></ProtectedRoute>} />
          <Route path="/erp/sales-goals/incentives" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="sales_goals"><IncentiveTracker /></ProtectedRoute>} />
          {/* Phase SG-Q2 W2 — Incentive Payout Ledger */}
          <Route path="/erp/incentive-payouts" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="sales_goals"><IncentivePayoutLedger /></ProtectedRoute>} />
          {/* Phase SG-3R — KPI Template Library */}
          <Route path="/erp/kpi-templates" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.PRESIDENT]} requiredErpModule="sales_goals"><KpiTemplateManager /></ProtectedRoute>} />
          {/* Phase SG-4 #22 — Credit Rules (admin-only); BDMs view their own credits via the Goal Dashboard */}
          <Route path="/erp/credit-rules" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.PRESIDENT, ROLES.FINANCE]} requiredErpModule="sales_goals"><CreditRuleManager /></ProtectedRoute>} />
          {/* Phase SG-4 #24 — Dispute Center (everyone with sales_goals VIEW; reviewer actions gated by sub-perm + gateApproval) */}
          <Route path="/erp/disputes" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="sales_goals"><DisputeCenter /></ProtectedRoute>} />
          {/* Phase SG-5 #26 — Scenario Planner (admin/finance/president only) */}
          <Route path="/erp/sales-goals/scenario" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.PRESIDENT, ROLES.FINANCE]} requiredErpModule="sales_goals"><ScenarioPlanner /></ProtectedRoute>} />
          {/* Phase SG-5 #27 — Variance Alert Center (all with sales_goals VIEW; contractor scoped to own) */}
          <Route path="/erp/variance-alerts" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL} requiredErpModule="sales_goals"><VarianceAlertCenter /></ProtectedRoute>} />
          {/* Phase SG-6 #29 — SOX Control Matrix (admin/finance/president only) */}
          <Route path="/erp/sales-goals/sox" element={<ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.PRESIDENT, ROLES.FINANCE]} requiredErpModule="sales_goals"><SoxControlMatrix /></ProtectedRoute>} />

          {/* Phase G8 (P2-9) — Tasks (cross-cutting productivity; every ERP user) */}
          <Route path="/erp/tasks" element={<ProtectedRoute allowedRoles={ROLE_SETS.ERP_ALL}><TasksPage /></ProtectedRoute>} />

          {/* Orphaned page direct routes — redirect to Control Center with correct section */}
          <Route path="/erp/agent-settings" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><AgentSettingsRedirect /></ProtectedRoute>} />
          <Route path="/erp/entity-manager" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><EntityManagerRedirect /></ProtectedRoute>} />
          <Route path="/erp/lookup-manager" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><LookupManagerRedirect /></ProtectedRoute>} />
          {/* Phase G9.R8 — Inbox Retention deep-link. Matches the Control
              Center's own MANAGEMENT gate because the redirect lands there;
              showing the shortcut to a role that can't render Control Center
              would be a UX footgun. Backend's erpSubAccessCheck enforces the
              sub-perm on every Save/Run/Preview call. */}
          <Route path="/admin/control-center/inbox-retention" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><InboxRetentionRedirect /></ProtectedRoute>} />
          <Route path="/erp/inbox-retention" element={<ProtectedRoute allowedRoles={ROLE_SETS.MANAGEMENT}><InboxRetentionRedirect /></ProtectedRoute>} />

          <Route path="/employee/*" element={<EmployeeRedirect />} />
          <Route path="/employee" element={<EmployeeRedirect />} />

          {/* Default Route */}
          <Route path="/" element={<LoginPage />} />

          {/* 404 catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        {/* Phase G7 — Floating Copilot widget + Cmd+K palette. ErpAddons wrapper
            checks the path BEFORE rendering the lazy chunks so non-ERP pages
            never download these bundles. Components themselves also guard via
            lookup-driven PRESIDENT_COPILOT.allowed_roles (role gate in backend
            /status response). Mounted at App level so the chat persists across
            ERP page navigation. */}
        <ErpAddons />
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
