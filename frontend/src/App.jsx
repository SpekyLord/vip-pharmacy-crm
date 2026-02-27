import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Components
import ErrorBoundary from './components/common/ErrorBoundary';

// Pages
import LoginPage from './pages/LoginPage';

import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import MyVisits from './pages/employee/MyVisits';
import NewVisitPage from './pages/employee/NewVisitPage';
import NewClientVisitPage from './pages/employee/NewClientVisitPage';
import EmployeeInbox from './pages/employee/EMP_InboxPage';
import MyPerformancePage from './pages/employee/MyPerformancePage';
import SchedulePage from './pages/employee/SchedulePage';
import DoctorDetailPage from './pages/employee/DoctorDetailPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import DoctorsPage from './pages/admin/DoctorsPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import RegionsPage from './pages/admin/RegionsPage';
import ReportsPage from './pages/admin/ReportsPage';
import StatisticsPage from './pages/admin/StatisticsPage';
import ActivityMonitor from './pages/admin/ActivityMonitor';
import PendingApprovalsPage from './pages/admin/PendingApprovalsPage';
import GPSVerificationPage from './pages/admin/GPSVerificationPage';
import NotificationPreferences from './pages/common/NotificationPreferences';

import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  return (
    <ErrorBoundary>
      <Toaster position="top-right" />
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Employee Routes */}
        <Route
          path="/employee"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <EmployeeDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/visits"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <MyVisits />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/visit/new"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <NewVisitPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/regular-visit/new"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <NewClientVisitPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/inbox"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <EmployeeInbox />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/performance"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <MyPerformancePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/doctor/:id"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <DoctorDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employee/schedule"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <SchedulePage />
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
          path="/admin/regions"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <RegionsPage />
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

        {/* Notification Preferences (All Roles) */}
        <Route
          path="/notifications/preferences"
          element={
            <ProtectedRoute allowedRoles={['employee', 'admin']}>
              <NotificationPreferences />
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
