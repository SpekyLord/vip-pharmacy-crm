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

// Lazy-loaded pages — split by role for smaller bundles
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

// BDM pages
const EmployeeDashboard = lazy(() => import('./pages/employee/EmployeeDashboard'));
const MyVisits = lazy(() => import('./pages/employee/MyVisits'));
const NewVisitPage = lazy(() => import('./pages/employee/NewVisitPage'));
const NewClientVisitPage = lazy(() => import('./pages/employee/NewClientVisitPage'));
const EmployeeInbox = lazy(() => import('./pages/employee/EMP_InboxPage'));
const CallPlanPage = lazy(() => import('./pages/employee/CallPlanPage'));
const DoctorDetailPage = lazy(() => import('./pages/employee/DoctorDetailPage'));
const ProductSpecPage = lazy(() => import('./pages/employee/ProductSpecPage'));

// Admin pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const DoctorsPage = lazy(() => import('./pages/admin/DoctorsPage'));
const EmployeesPage = lazy(() => import('./pages/admin/EmployeesPage'));
const BDMVisitsPage = lazy(() => import('./pages/admin/BDMVisitsPage'));
const ProductsPage = lazy(() => import('./pages/admin/ProductsPage'));
const ReportsPage = lazy(() => import('./pages/admin/ReportsPage'));
const StatisticsPage = lazy(() => import('./pages/admin/StatisticsPage'));
const ActivityMonitor = lazy(() => import('./pages/admin/ActivityMonitor'));
const PendingApprovalsPage = lazy(() => import('./pages/admin/PendingApprovalsPage'));
const GPSVerificationPage = lazy(() => import('./pages/admin/GPSVerificationPage'));
const PhotoAuditPage = lazy(() => import('./pages/admin/PhotoAuditPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));

// ERP pages
const ErpDashboard = lazy(() => import('./erp/pages/ErpDashboard'));
const OcrTest = lazy(() => import('./erp/pages/OcrTest'));
const SalesEntry = lazy(() => import('./erp/pages/SalesEntry'));
const SalesList = lazy(() => import('./erp/pages/SalesList'));
const MyStock = lazy(() => import('./erp/pages/MyStock'));
const GrnEntry = lazy(() => import('./erp/pages/GrnEntry'));
const DrEntry = lazy(() => import('./erp/pages/DrEntry'));
const ConsignmentDashboard = lazy(() => import('./erp/pages/ConsignmentDashboard'));
const Collections = lazy(() => import('./erp/pages/Collections'));
const CollectionSession = lazy(() => import('./erp/pages/CollectionSession'));
const AccountsReceivable = lazy(() => import('./erp/pages/AccountsReceivable'));
const SoaGenerator = lazy(() => import('./erp/pages/SoaGenerator'));
const IcArDashboard = lazy(() => import('./erp/pages/IcArDashboard'));
const IcSettlement = lazy(() => import('./erp/pages/IcSettlement'));
const Expenses = lazy(() => import('./erp/pages/Expenses'));
const Smer = lazy(() => import('./erp/pages/Smer'));
const CarLogbook = lazy(() => import('./erp/pages/CarLogbook'));
const PrfCalf = lazy(() => import('./erp/pages/PrfCalf'));
const ErpReports = lazy(() => import('./erp/pages/ErpReports'));
const TransferOrders = lazy(() => import('./erp/pages/TransferOrders'));
const TransferReceipt = lazy(() => import('./erp/pages/TransferReceipt'));
const TransferPriceManager = lazy(() => import('./erp/pages/TransferPriceManager'));
const WarehouseManager = lazy(() => import('./erp/pages/WarehouseManager'));
const Income = lazy(() => import('./erp/pages/Income'));
const Pnl = lazy(() => import('./erp/pages/Pnl'));
const ProfitSharing = lazy(() => import('./erp/pages/ProfitSharing'));
const MonthlyArchivePage = lazy(() => import('./erp/pages/MonthlyArchive'));
const AuditLogs = lazy(() => import('./erp/pages/AuditLogs'));
// Phase 10 — ERP Access Control, People & Payroll
const AccessTemplateManager = lazy(() => import('./erp/pages/AccessTemplateManager'));
const PeopleList = lazy(() => import('./erp/pages/PeopleList'));
const PersonDetail = lazy(() => import('./erp/pages/PersonDetail'));
const PayrollRun = lazy(() => import('./erp/pages/PayrollRun'));
const PayslipView = lazy(() => import('./erp/pages/PayslipView'));
const ThirteenthMonth = lazy(() => import('./erp/pages/ThirteenthMonth'));
// Phase 11 — Accounting Engine + Card Management
const CreditCardManager = lazy(() => import('./erp/pages/CreditCardManager'));
const ChartOfAccounts = lazy(() => import('./erp/pages/ChartOfAccounts'));
const JournalEntries = lazy(() => import('./erp/pages/JournalEntries'));
const TrialBalance = lazy(() => import('./erp/pages/TrialBalance'));
const ProfitAndLoss = lazy(() => import('./erp/pages/ProfitAndLoss'));
const VatCompliance = lazy(() => import('./erp/pages/VatCompliance'));
const CashflowStatement = lazy(() => import('./erp/pages/CashflowStatement'));
const FixedAssetsPage = lazy(() => import('./erp/pages/FixedAssets'));
const LoansPage = lazy(() => import('./erp/pages/Loans'));
const OwnerEquity = lazy(() => import('./erp/pages/OwnerEquity'));
const MonthEndClose = lazy(() => import('./erp/pages/MonthEndClose'));

// Phase 21 — Government Rates, Period Locks, Recurring Journals, BIR Calculator
const GovernmentRates = lazy(() => import('./erp/pages/GovernmentRates'));
const PeriodLocks = lazy(() => import('./erp/pages/PeriodLocks'));
const RecurringJournals = lazy(() => import('./erp/pages/RecurringJournals'));
const BirCalculator = lazy(() => import('./erp/pages/BirCalculator'));

// Phase 13 — Banking & Cash
const BankAccounts = lazy(() => import('./erp/pages/BankAccounts'));
const BankReconciliation = lazy(() => import('./erp/pages/BankReconciliation'));
const CreditCardLedger = lazy(() => import('./erp/pages/CreditCardLedger'));

// Phase 12 — Purchasing & AP
const VendorList = lazy(() => import('./erp/pages/VendorList'));
const PurchaseOrders = lazy(() => import('./erp/pages/PurchaseOrders'));
const SupplierInvoices = lazy(() => import('./erp/pages/SupplierInvoices'));
const AccountsPayable = lazy(() => import('./erp/pages/AccountsPayable'));

// Phase 14 — New Reports & Analytics
const PerformanceRanking = lazy(() => import('./erp/pages/PerformanceRanking'));
const ConsignmentAging = lazy(() => import('./erp/pages/ConsignmentAging'));
const ExpenseAnomalies = lazy(() => import('./erp/pages/ExpenseAnomalies'));
const FuelEfficiency = lazy(() => import('./erp/pages/FuelEfficiency'));
const CycleStatusDashboard = lazy(() => import('./erp/pages/CycleStatusDashboard'));

const BudgetAllocations = lazy(() => import('./erp/pages/BudgetAllocations'));

// Phase 15 — SAP-Equivalent Improvements
const CsiBooklets = lazy(() => import('./erp/pages/CsiBooklets'));
const CycleReports = lazy(() => import('./erp/pages/CycleReports'));
const CostCenters = lazy(() => import('./erp/pages/CostCenters'));
const DataArchive = lazy(() => import('./erp/pages/DataArchive'));

// Phase 18 — Service Revenue & Cost Center Expenses
const HospitalList = lazy(() => import('./erp/pages/HospitalList'));
const CustomerList = lazy(() => import('./erp/pages/CustomerList'));
const ProductMasterPage = lazy(() => import('./erp/pages/ProductMaster'));

// Phase 19 — Petty Cash, Office Supplies & Collaterals
const PettyCash = lazy(() => import('./erp/pages/PettyCash'));
const OfficeSupplies = lazy(() => import('./erp/pages/OfficeSupplies'));
const Collaterals = lazy(() => import('./erp/pages/Collaterals'));

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
            path="/erp/ocr-test"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <OcrTest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/sales"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <SalesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/sales/entry"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <SalesEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/my-stock"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <MyStock />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/grn"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <GrnEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/dr"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <DrEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/consignment"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <ConsignmentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <Collections />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/session"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <CollectionSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/ar"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <AccountsReceivable />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/collections/soa"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
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
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}>
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/smer"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}>
                <Smer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/car-logbook"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}>
                <CarLogbook />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/prf-calf"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}>
                <PrfCalf />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/reports"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
                <ErpReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/transfers"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
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
              <ProtectedRoute allowedRoles={['employee', 'admin']}>
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
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <Income />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/pnl"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
                <Pnl />
              </ProtectedRoute>
            }
          />
          <Route
            path="/erp/profit-sharing"
            element={
              <ProtectedRoute allowedRoles={['employee', 'admin', 'finance']}>
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
            path="/erp/payroll"
            element={
              <ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="payroll">
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
              <ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="payroll">
                <ThirteenthMonth />
              </ProtectedRoute>
            }
          />

          {/* Phase 11 — Accounting Engine + Card Management */}
          <Route path="/erp/credit-cards" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><CreditCardManager /></ProtectedRoute>} />
          <Route path="/erp/coa" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><ChartOfAccounts /></ProtectedRoute>} />
          <Route path="/erp/journals" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><JournalEntries /></ProtectedRoute>} />
          <Route path="/erp/trial-balance" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><TrialBalance /></ProtectedRoute>} />
          <Route path="/erp/profit-loss" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><ProfitAndLoss /></ProtectedRoute>} />
          <Route path="/erp/vat-compliance" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><VatCompliance /></ProtectedRoute>} />
          <Route path="/erp/cashflow" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><CashflowStatement /></ProtectedRoute>} />
          <Route path="/erp/fixed-assets" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><FixedAssetsPage /></ProtectedRoute>} />
          <Route path="/erp/loans" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><LoansPage /></ProtectedRoute>} />
          <Route path="/erp/owner-equity" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><OwnerEquity /></ProtectedRoute>} />
          <Route path="/erp/month-end-close" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><MonthEndClose /></ProtectedRoute>} />

          {/* Phase 21 — Government Rates, Period Locks, Recurring Journals, BIR Calculator */}
          <Route path="/erp/government-rates" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><GovernmentRates /></ProtectedRoute>} />
          <Route path="/erp/period-locks" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><PeriodLocks /></ProtectedRoute>} />
          <Route path="/erp/recurring-journals" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><RecurringJournals /></ProtectedRoute>} />
          <Route path="/erp/bir-calculator" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']}><BirCalculator /></ProtectedRoute>} />

          {/* Phase 12 — Purchasing & AP */}
          <Route path="/erp/vendors" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="purchasing"><VendorList /></ProtectedRoute>} />
          <Route path="/erp/purchase-orders" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="purchasing"><PurchaseOrders /></ProtectedRoute>} />
          <Route path="/erp/supplier-invoices" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="purchasing"><SupplierInvoices /></ProtectedRoute>} />
          <Route path="/erp/accounts-payable" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="purchasing"><AccountsPayable /></ProtectedRoute>} />

          {/* Phase 13 — Banking & Cash */}
          <Route path="/erp/bank-accounts" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><BankAccounts /></ProtectedRoute>} />
          <Route path="/erp/bank-recon" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><BankReconciliation /></ProtectedRoute>} />
          <Route path="/erp/credit-card-ledger" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><CreditCardLedger /></ProtectedRoute>} />

          {/* Phase 14 — New Reports & Analytics */}
          <Route path="/erp/performance-ranking" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><PerformanceRanking /></ProtectedRoute>} />
          <Route path="/erp/consignment-aging" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><ConsignmentAging /></ProtectedRoute>} />
          <Route path="/erp/expense-anomalies" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><ExpenseAnomalies /></ProtectedRoute>} />
          <Route path="/erp/fuel-efficiency" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><FuelEfficiency /></ProtectedRoute>} />
          <Route path="/erp/cycle-status" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><CycleStatusDashboard /></ProtectedRoute>} />
          <Route path="/erp/budget-allocations" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="reports"><BudgetAllocations /></ProtectedRoute>} />

          {/* Phase 15 — SAP-Equivalent Improvements */}
          <Route path="/erp/csi-booklets" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="sales"><CsiBooklets /></ProtectedRoute>} />
          <Route path="/erp/cycle-reports" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="reports"><CycleReports /></ProtectedRoute>} />
          <Route path="/erp/cost-centers" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><CostCenters /></ProtectedRoute>} />
          <Route path="/erp/data-archive" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><DataArchive /></ProtectedRoute>} />

          {/* Phase 18 — Service Revenue & Cost Center Expenses */}
          <Route path="/erp/hospitals" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}><HospitalList /></ProtectedRoute>} />
          <Route path="/erp/customers" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}><CustomerList /></ProtectedRoute>} />
          <Route path="/erp/products" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']}><ProductMasterPage /></ProtectedRoute>} />

          {/* Phase 19 — Petty Cash, Office Supplies & Collaterals */}
          <Route path="/erp/petty-cash" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><PettyCash /></ProtectedRoute>} />
          <Route path="/erp/office-supplies" element={<ProtectedRoute allowedRoles={['admin', 'finance', 'president']} requiredErpModule="accounting"><OfficeSupplies /></ProtectedRoute>} />
          <Route path="/erp/collaterals" element={<ProtectedRoute allowedRoles={['employee', 'admin', 'finance', 'president']} requiredErpModule="inventory"><Collaterals /></ProtectedRoute>} />

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
