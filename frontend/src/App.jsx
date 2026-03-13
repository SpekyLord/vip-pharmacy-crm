import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Components
import ErrorBoundary from './components/common/ErrorBoundary';

// Pages
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import MyVisits from './pages/employee/MyVisits';
import NewVisitPage from './pages/employee/NewVisitPage';
import NewClientVisitPage from './pages/employee/NewClientVisitPage';
import EmployeeInbox from './pages/employee/EMP_InboxPage';
import CallPlanPage from './pages/employee/CallPlanPage';
import DoctorDetailPage from './pages/employee/DoctorDetailPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import DoctorsPage from './pages/admin/DoctorsPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import BDMVisitsPage from './pages/admin/BDMVisitsPage';
import ProductsPage from './pages/admin/ProductsPage';
import ReportsPage from './pages/admin/ReportsPage';
import StatisticsPage from './pages/admin/StatisticsPage';
import ActivityMonitor from './pages/admin/ActivityMonitor';
import PendingApprovalsPage from './pages/admin/PendingApprovalsPage';
import GPSVerificationPage from './pages/admin/GPSVerificationPage';

import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" />
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

        {/* Default Route */}
        <Route path="/" element={<LoginPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
