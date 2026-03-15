import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Components
import ErrorBoundary from './components/common/ErrorBoundary';
import LoadingSpinner from './components/common/LoadingSpinner';

// Eagerly loaded pages (always needed)
import LoginPage from './pages/LoginPage';
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

// Redirect legacy /employee/* paths to /bdm/*
const EmployeeRedirect = () => {
  const location = useLocation();
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

          {/* Legacy /employee redirects → /bdm */}
          <Route path="/employee/*" element={<EmployeeRedirect />} />
          <Route path="/employee" element={<Navigate to="/bdm" replace />} />

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
