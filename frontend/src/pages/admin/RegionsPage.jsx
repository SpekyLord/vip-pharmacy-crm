/**
 * RegionsPage
 *
 * Admin page for region management:
 * - Hierarchical region tree view
 * - CRUD operations
 * - Region statistics
 */

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import RegionManagement from '../../components/admin/RegionManagement';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import regionService from '../../services/regionService';

const regionsPageStyles = `
  .dashboard-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .dashboard-content {
    display: flex;
  }

  .main-content {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
  }

  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
  }
`;

const RegionsPage = () => {
  const [regions, setRegions] = useState([]);
  const [flatRegions, setFlatRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch region hierarchy
  const fetchRegions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both hierarchy and flat list
      const [hierarchyResponse, flatResponse] = await Promise.all([
        regionService.getHierarchy(),
        regionService.getAll(),
      ]);

      setRegions(hierarchyResponse.data || []);
      setFlatRegions(flatResponse.data || []);
    } catch (err) {
      console.error('Failed to fetch regions:', err);
      setError('Failed to load regions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegions();
  }, []);

  // Handle create/update region
  const handleSaveRegion = async (regionData) => {
    try {
      if (regionData._id) {
        // Update existing region
        await regionService.update(regionData._id, regionData);
        toast.success('Region updated successfully');
      } else {
        // Create new region
        await regionService.create(regionData);
        toast.success('Region created successfully');
      }
      fetchRegions();
      return true;
    } catch (err) {
      console.error('Failed to save region:', err);
      toast.error(err.response?.data?.message || 'Failed to save region');
      return false;
    }
  };

  // Handle delete region
  const handleDeleteRegion = async (regionId) => {
    try {
      await regionService.delete(regionId);
      toast.success('Region deactivated successfully');
      fetchRegions();
      return true;
    } catch (err) {
      console.error('Failed to delete region:', err);
      toast.error(err.response?.data?.message || 'Failed to delete region');
      return false;
    }
  };

  // Fetch stats for a region
  const handleGetStats = async (regionId) => {
    try {
      const response = await regionService.getStats(regionId);
      return response.data;
    } catch (err) {
      console.error('Failed to fetch region stats:', err);
      toast.error('Failed to load region statistics');
      return null;
    }
  };

  if (loading && regions.length === 0) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{regionsPageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>Region Management</h1>
          </div>

          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}

          <RegionManagement
            regions={regions}
            flatRegions={flatRegions}
            loading={loading}
            onSave={handleSaveRegion}
            onDelete={handleDeleteRegion}
            onGetStats={handleGetStats}
          />
        </main>
      </div>
    </div>
  );
};

export default RegionsPage;
