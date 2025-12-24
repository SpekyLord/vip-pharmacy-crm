/**
 * DoctorsPage
 *
 * Admin page for doctor management:
 * - Doctor list with CRUD
 * - Search and filter
 * - Bulk operations
 * - Import/Export
 */

import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import DoctorManagement from '../../components/admin/DoctorManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const DoctorsPage = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch doctors data
    setLoading(false);
  }, []);

  const handleSaveDoctor = async (doctorData) => {
    // TODO: Implement save doctor
    console.log('Saving doctor:', doctorData);
  };

  const handleDeleteDoctor = async (doctorId) => {
    // TODO: Implement delete doctor
    console.log('Deleting doctor:', doctorId);
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
          <DoctorManagement
            doctors={doctors}
            onSave={handleSaveDoctor}
            onDelete={handleDeleteDoctor}
            loading={loading}
          />
        </main>
      </div>
    </div>
  );
};

export default DoctorsPage;
