/**
 * EmployeesPage
 *
 * Admin page for employee management:
 * - Employee list with CRUD
 * - Role assignment
 * - Account status management
 * - Performance overview
 */

import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import EmployeeManagement from '../../components/admin/EmployeeManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const EmployeesPage = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch employees data
    setLoading(false);
  }, []);

  const handleSaveEmployee = async (employeeData) => {
    // TODO: Implement save employee
    console.log('Saving employee:', employeeData);
  };

  const handleDeleteEmployee = async (employeeId) => {
    // TODO: Implement delete employee
    console.log('Deleting employee:', employeeId);
  };

  const handleToggleStatus = async (employeeId) => {
    // TODO: Implement toggle status
    console.log('Toggling status for:', employeeId);
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <EmployeeManagement
            employees={employees}
            onSave={handleSaveEmployee}
            onDelete={handleDeleteEmployee}
            onToggleStatus={handleToggleStatus}
            loading={loading}
          />
        </main>
      </div>
    </div>
  );
};

export default EmployeesPage;
