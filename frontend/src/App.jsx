import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Components
import ErrorBoundary from './components/common/ErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner';
import { useAuth } from './hooks/useAuth';

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

// BDM pages
const EmployeeDashboard = lazyRetry(() => import('./pages/employee/EmployeeDashboard'));
const MyVisits = lazyRetry(() => import('./pages/employee/MyVisits'));
const NewVisitPage = lazyRetry(() => import('./pages/employee/NewVisitPage'));
const NewClientVisitPage = lazyRetry(() => import('./pages/employee/NewClientVisitPage'));
const EmployeeInbox = lazyRetry(() => import('./pages/employee/EMP_InboxPage'));
const CallPlanPage = lazyRetry(() => import('./pages/employee/CallPlanPage'));
const DoctorDetailPage = lazyRetry(() => import('./pages/employee/DoctorDetailPage'));
const ProductSpecPage = lazyRetry(() => import('./pages/employee/ProductSpecPage'));

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

// ERP pages
const ErpDashboard = lazyRetry(() => import('./erp/pages/ErpDashboard'));
const SalesEntry = lazyRetry(() => import('./erp/pages/SalesEntry'));
const SalesList = lazyRetry(() => import('./erp/pages/SalesList'));
const MyStock = lazyRetry(() => import('./erp/pages/MyStock'));
const GrnEntry = lazyRetry(() => import('./erp/pages/GrnEntry'));
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

// Phase 25 — Returns, Expiry, Batch Trace, Orphaned Page Routes
const CreditNotes = lazyRetry(() => import('./erp/pages/CreditNotes'));
const ExpiryDashboard = lazyRetry(() => import('./erp/pages/ExpiryDashboard'));
const BatchTrace = lazyRetry(() => import('./erp/pages/BatchTrace'));
// Standalone routes redirect to ControlCenter with the right section param
const AgentSettingsRedirect = () => <Navigate to="/erp/control-center?section=agent-settings" replace />;
const EntityManagerRedirect = () => <Navigate to="/erp/control-center?section=entities" replace />;
const LookupManagerRedirect = () => <Navigate to="/erp/control-center?section=lookups" replace />;

// Redirect legacy /employee/* paths to /bdm/*
const EmployeeRedirect = () => {
  const { user } = useAuth();
  const location = useLocation();

  if (['admin', 'finance', 'president', 'ceo'].includes(user?.role)) {
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
          <Route path="/home" element={<ProtectedRoute allowedRoles={['admin', 'president', 'ceo', 'finance', 'employee', 'medrep']}><HomePage /></ProtectedRoute>} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          {/* Employee Routes */}
          <Route
            path="/bdm"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <EmployeeDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/visits"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <MyVisits />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/visit/new"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <NewVisitPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/regular-visit/new"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <NewClientVisitPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/inbox"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <EmployeeInbox />
              </ProtectedRoute>
            }
          />
          <Route path="/bdm/performance" element={<Navigate to="/bdm/cpt" replace />} />
          <Route
            path="/bdm/doctor/:id"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <DoctorDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/bdm/schedule" element={<Navigate to="/bdm/cpt" replace />} />
          <Route
            path="/bdm/products"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <ProductSpecPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bdm/cpt"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <CallPlanPage />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/doctors"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <DoctorsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/employees"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <EmployeesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/employees/:id/visits"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <BDMVisitsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/products"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ProductsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/statistics"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <StatisticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/activity"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <ActivityMonitor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PendingApprovalsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/gps-verification"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <GPSVerificationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/photo-audit"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <PhotoAuditPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Legacy /employee redirects → /bdm */}
          {/* ERP Routes */}
          <Route
            path="/erp"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <ErpDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/sales"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="sales">
                <SalesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/sales/entry"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']} requiredErpModule="sales">
                <SalesEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/my-stock"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="inventory">
                <MyStock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/grn"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="inventory">
                <GrnEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/dr"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']} requiredErpModule="sales">
                <DrEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/consignment"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="inventory">
                <ConsignmentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="collections">
                <Collections />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/session"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="collections">
                <CollectionSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/ar"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="collections">
                <AccountsReceivable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/soa"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="collections">
                <SoaGenerator />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/ic-settlements"
            element={
              <ProtectedRoute allowedRoles={['president', 'admin', 'finance']}>
                <IcArDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/ic-settlements/new"
            element={
              <ProtectedRoute allowedRoles={['president', 'admin', 'finance']}>
                <IcSettlement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/expenses"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="expenses">
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/smer"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="expenses">
                <Smer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/car-logbook"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="expenses">
                <CarLogbook />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/prf-calf"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="expenses">
                <PrfCalf />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/reports"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']} requiredErpModule="reports">
                <ErpReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/transfers"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']} requiredErpModule="inventory">
                <TransferOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/warehouses"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <WarehouseManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/transfers/receive"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']} requiredErpModule="inventory">
                <TransferReceipt />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/transfers/prices"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <TransferPriceManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/income"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="people">
                <Income />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/pnl"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="people">
                <Pnl />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/profit-sharing"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']} requiredErpModule="people">
                <ProfitSharing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/monthly-archive"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <MonthlyArchivePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/audit-logs"
            element={
              <ProtectedRoute allowedRoles={['admin', 'finance']}>
                <AuditLogs />
              </ProtectedRoute>
            }
          />

          {/* Phase 10 — ERP Access Control, People & Payroll */}
          <Route
            path="/erp/access-templates"
            element={
              <ProtectedRoute allowedRoles={['admin', 'president']}>
                <AccessTemplateManager />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/people"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="people">
                <PeopleList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/people/:id"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="people">
                <PersonDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/org-chart"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="people">
                <OrgChart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/payroll"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="payroll">
                <PayrollRun />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/payslip/:id"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="payroll">
                <PayslipView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/thirteenth-month"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="payroll">
                <ThirteenthMonth />
              </ProtectedRoute>
            }
          />

          {/* Phase 11 — Accounting Engine + Card Management */}
          <Route path="/erp/credit-cards" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><CreditCardManager /></ProtectedRoute>} />
          <Route path="/erp/coa" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><ChartOfAccounts /></ProtectedRoute>} />
          <Route path="/erp/journals" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><JournalEntries /></ProtectedRoute>} />
          <Route path="/erp/trial-balance" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><TrialBalance /></ProtectedRoute>} />
          <Route path="/erp/profit-loss" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><ProfitAndLoss /></ProtectedRoute>} />
          <Route path="/erp/vat-compliance" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><VatCompliance /></ProtectedRoute>} />
          <Route path="/erp/cashflow" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><CashflowStatement /></ProtectedRoute>} />
          <Route path="/erp/fixed-assets" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><FixedAssetsPage /></ProtectedRoute>} />
          <Route path="/erp/loans" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><LoansPage /></ProtectedRoute>} />
          <Route path="/erp/owner-equity" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><OwnerEquity /></ProtectedRoute>} />
          <Route path="/erp/month-end-close" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><MonthEndClose /></ProtectedRoute>} />

          {/* Phase 21 — Government Rates, Period Locks, Recurring Journals, BIR Calculator */}
          <Route path="/erp/government-rates" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><GovernmentRates /></ProtectedRoute>} />
          <Route path="/erp/payment-modes" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><PaymentModes /></ProtectedRoute>} />
          <Route path="/erp/period-locks" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><PeriodLocks /></ProtectedRoute>} />
          <Route path="/erp/recurring-journals" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><RecurringJournals /></ProtectedRoute>} />
          <Route path="/erp/bir-calculator" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><BirCalculator /></ProtectedRoute>} />

          {/* Phase 12 — Purchasing & AP */}
          <Route path="/erp/vendors" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="purchasing"><VendorList /></ProtectedRoute>} />
          <Route path="/erp/purchase-orders" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="purchasing"><PurchaseOrders /></ProtectedRoute>} />
          <Route path="/erp/supplier-invoices" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="purchasing"><SupplierInvoices /></ProtectedRoute>} />
          <Route path="/erp/accounts-payable" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="purchasing"><AccountsPayable /></ProtectedRoute>} />

          {/* Phase 13 — Banking & Cash */}
          <Route path="/erp/bank-accounts" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><BankAccounts /></ProtectedRoute>} />
          <Route path="/erp/bank-recon" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><BankReconciliation /></ProtectedRoute>} />
          <Route path="/erp/credit-card-ledger" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><CreditCardLedger /></ProtectedRoute>} />

          {/* Phase 14 — New Reports & Analytics */}
          <Route path="/erp/performance-ranking" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><PerformanceRanking /></ProtectedRoute>} />
          <Route path="/erp/consignment-aging" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><ConsignmentAging /></ProtectedRoute>} />
          <Route path="/erp/expense-anomalies" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><ExpenseAnomalies /></ProtectedRoute>} />
          <Route path="/erp/fuel-efficiency" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><FuelEfficiency /></ProtectedRoute>} />
          <Route path="/erp/cycle-status" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><CycleStatusDashboard /></ProtectedRoute>} />
          <Route path="/erp/budget-allocations" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><BudgetAllocations /></ProtectedRoute>} />

          {/* Phase 15 — SAP-Equivalent Improvements */}
          <Route path="/erp/csi-booklets" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="sales"><CsiBooklets /></ProtectedRoute>} />
          <Route path="/erp/cycle-reports" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><CycleReports /></ProtectedRoute>} />
          <Route path="/erp/cost-centers" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><CostCenters /></ProtectedRoute>} />
          <Route path="/erp/data-archive" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><DataArchive /></ProtectedRoute>} />

          {/* Phase 18 — Service Revenue & Cost Center Expenses */}
          <Route path="/erp/hospitals" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}><HospitalList /></ProtectedRoute>} />
          <Route path="/erp/customers" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}><CustomerList /></ProtectedRoute>} />
          <Route path="/erp/products" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}><ProductMasterPage /></ProtectedRoute>} />

          {/* Phase 19 — Petty Cash, Office Supplies & Collaterals */}
          <Route path="/erp/petty-cash" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><PettyCash /></ProtectedRoute>} />
          <Route path="/erp/office-supplies" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="accounting"><OfficeSupplies /></ProtectedRoute>} />
          <Route path="/erp/collaterals" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="inventory"><Collaterals /></ProtectedRoute>} />

          {/* Phase 24 — ERP Control Center + Agent Intelligence */}
          <Route path="/erp/control-center" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><ControlCenter /></ProtectedRoute>} />
          <Route path="/erp/agent-dashboard" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><AgentDashboard /></ProtectedRoute>} />

          {/* Phase 25 — Returns, Expiry, Batch Trace */}
          <Route path="/erp/credit-notes" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="sales"><CreditNotes /></ProtectedRoute>} />
          <Route path="/erp/expiry-dashboard" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="inventory"><ExpiryDashboard /></ProtectedRoute>} />
          <Route path="/erp/batch-trace" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="inventory"><BatchTrace /></ProtectedRoute>} />

          {/* Orphaned page direct routes — redirect to Control Center with correct section */}
          <Route path="/erp/agent-settings" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><AgentSettingsRedirect /></ProtectedRoute>} />
          <Route path="/erp/entity-manager" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><EntityManagerRedirect /></ProtectedRoute>} />
          <Route path="/erp/lookup-manager" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><LookupManagerRedirect /></ProtectedRoute>} />

          <Route path="/employee/*" element={<EmployeeRedirect />} />
          <Route path="/employee" element={<EmployeeRedirect />} />

          {/* Default Route */}
          <Route path="/" element={<LoginPage />} />

          {/* 404 catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
