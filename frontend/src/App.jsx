import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Pages
import LoginPage from './pages/LoginPage';
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import MyVisits from './pages/employee/MyVisits';
import NewVisitPage from './pages/employee/NewVisitPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import DoctorsPage from './pages/admin/DoctorsPage';
import EmployeesPage from './pages/admin/EmployeesPage';
import RegionsPage from './pages/admin/RegionsPage';
import ReportsPage from './pages/admin/ReportsPage';
import MedRepDashboard from './pages/medrep/MedRepDashboard';

// Components
import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  return (
    <>
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

        {/* Med Rep Routes */}
        <Route
          path="/medrep"
          element={
            <ProtectedRoute allowedRoles={['medrep', 'admin']}>
              <MedRepDashboard />
            </ProtectedRoute>
          }
        />

        {/* Default Route */}
        <Route path="/" element={<LoginPage />} />
      </Routes>
    </>
  );
}

export default App;
