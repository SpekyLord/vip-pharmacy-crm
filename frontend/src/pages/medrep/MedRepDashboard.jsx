/**
 * MedRepDashboard Page
 *
 * Med Rep dashboard with:
 * - Product assignments overview
 * - Doctor-product mapping management
 * - Assignment statistics
 * - Create/edit/delete assignments
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import ProductAssignment from '../../components/medrep/ProductAssignment';
import DoctorProductMapping from '../../components/medrep/DoctorProductMapping';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import { useAuth } from '../../hooks/useAuth';
import assignmentService from '../../services/assignmentService';
import doctorService from '../../services/doctorService';
import productService from '../../services/productService';

const medrepDashboardStyles = `
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
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
  }

  .page-header p {
    margin: 8px 0 0;
    color: #6b7280;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .stat-card .stat-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    margin-bottom: 12px;
  }

  .stat-card .stat-icon.blue { background: #dbeafe; }
  .stat-card .stat-icon.green { background: #dcfce7; }
  .stat-card .stat-icon.purple { background: #f3e8ff; }
  .stat-card .stat-icon.orange { background: #ffedd5; }

  .stat-card .stat-value {
    font-size: 32px;
    font-weight: 700;
    color: #1f2937;
    display: block;
  }

  .stat-card .stat-label {
    font-size: 14px;
    color: #6b7280;
  }

  .dashboard-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 0;
  }

  .tab-btn {
    padding: 12px 24px;
    background: transparent;
    border: none;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    position: relative;
    transition: color 0.2s;
  }

  .tab-btn:hover {
    color: #1f2937;
  }

  .tab-btn.active {
    color: #2563eb;
  }

  .tab-btn.active::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: #2563eb;
  }

  .tab-content {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 20px;
    color: #1f2937;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6b7280;
  }

  .modal-body {
    padding: 24px;
  }

  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }

  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: #374151;
  }

  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
  }

  .form-group textarea {
    min-height: 100px;
    resize: vertical;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  .btn-primary:disabled {
    background: #93c5fd;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #e5e7eb;
    color: #374151;
  }

  .btn-secondary:hover {
    background: #d1d5db;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .assignment-info {
    display: grid;
    gap: 16px;
  }

  .assignment-info .info-row {
    display: flex;
    gap: 12px;
  }

  .assignment-info .info-label {
    font-weight: 500;
    color: #6b7280;
    min-width: 120px;
  }

  .assignment-info .info-value {
    color: #1f2937;
  }

  .priority-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .priority-badge.high { background: #fee2e2; color: #dc2626; }
  .priority-badge.medium { background: #fef3c7; color: #d97706; }
  .priority-badge.low { background: #dcfce7; color: #16a34a; }

  .status-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.active { background: #dcfce7; color: #16a34a; }
  .status-badge.inactive { background: #f3f4f6; color: #6b7280; }
`;

const MedRepDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();

  // Determine tab based on URL path
  const getTabFromPath = (pathname) => {
    if (pathname === '/medrep/assignments') {
      return 'assignments';
    }
    // /medrep shows dashboard view (stats only, no tab content)
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(() => getTabFromPath(location.pathname));
  const [assignments, setAssignments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync tab with URL changes
  useEffect(() => {
    setActiveTab(getTabFromPath(location.pathname));
  }, [location.pathname]);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalAssignments: 0,
    activeAssignments: 0,
    totalDoctors: 0,
    totalProducts: 0,
  });

  // Modal states
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ priority: 2, notes: '' });
  const [saving, setSaving] = useState(false);

  // Fetch all data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [assignmentsRes, doctorsRes, productsRes] = await Promise.allSettled([
        assignmentService.getMyAssignments({ limit: 100 }),
        doctorService.getAll({ limit: 500 }),
        productService.getAll({ limit: 100 }),
      ]);

      // Handle assignments
      if (assignmentsRes.status === 'fulfilled') {
        const assignmentData = assignmentsRes.value.data || [];
        setAssignments(assignmentData);

        const active = assignmentData.filter(a => a.status === 'active').length;
        setStats(prev => ({
          ...prev,
          totalAssignments: assignmentData.length,
          activeAssignments: active,
        }));
      }

      // Handle doctors
      if (doctorsRes.status === 'fulfilled') {
        const doctorData = doctorsRes.value.data || [];
        setDoctors(doctorData);
        setStats(prev => ({
          ...prev,
          totalDoctors: doctorData.length,
        }));
      }

      // Handle products
      if (productsRes.status === 'fulfilled') {
        const productData = productsRes.value.data || [];
        setProducts(productData);
        setStats(prev => ({
          ...prev,
          totalProducts: productData.length,
        }));
      }

    } catch {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // View assignment details
  const handleViewDetails = (assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailsModal(true);
  };

  // Open edit modal
  const handleEditAssignment = (assignment) => {
    setSelectedAssignment(assignment);
    setEditForm({
      priority: assignment.priority || 2,
      notes: assignment.notes || '',
    });
    setShowEditModal(true);
  };

  // Save assignment changes
  const handleSaveAssignment = async () => {
    if (!selectedAssignment) return;

    try {
      setSaving(true);
      await assignmentService.update(selectedAssignment._id, editForm);
      toast.success('Assignment updated successfully');
      setShowEditModal(false);
      fetchData(); // Refresh data
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update assignment');
    } finally {
      setSaving(false);
    }
  };

  // Deactivate assignment
  const handleDeactivateAssignment = async (assignment, reason = '') => {
    if (!window.confirm('Are you sure you want to deactivate this assignment?')) return;

    try {
      await assignmentService.delete(assignment._id, reason);
      toast.success('Assignment deactivated');
      setShowDetailsModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate assignment');
    }
  };

  // Map product to doctor
  const handleMapProduct = async (doctorId, productId, priority = 2) => {
    try {
      await assignmentService.create({
        doctor: doctorId,
        product: productId,
        priority,
      });
      toast.success('Product assigned successfully');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign product');
    }
  };

  // Unmap product from doctor
  const handleUnmapProduct = async (doctorId, productId) => {
    // Find the assignment
    const assignment = assignments.find(
      a => a.doctor?._id === doctorId && a.product?._id === productId && a.status === 'active'
    );

    if (!assignment) {
      toast.error('Assignment not found');
      return;
    }

    try {
      await assignmentService.delete(assignment._id);
      toast.success('Product unassigned');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unassign product');
    }
  };

  // Get priority label
  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 1: return 'High';
      case 2: return 'Medium';
      case 3: return 'Low';
      default: return 'Medium';
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  // Transform assignments to mappings format for DoctorProductMapping
  const mappings = assignments
    .filter(a => a.status === 'active')
    .map(a => ({
      doctor: a.doctor?._id,
      product: a.product?._id,
      assignmentId: a._id,
    }));

  return (
    <div className="dashboard-layout">
      <style>{medrepDashboardStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>Welcome, {user?.name}</h1>
            <p>Manage your product assignments and doctor mappings</p>
          </div>

          {error && (
            <div className="error-banner">
              {error}
              <button onClick={fetchData} style={{ marginLeft: 12 }}>Retry</button>
            </div>
          )}

          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue">📦</div>
              <span className="stat-value">{stats.activeAssignments}</span>
              <span className="stat-label">Active Assignments</span>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">👨‍⚕️</div>
              <span className="stat-value">{stats.totalDoctors}</span>
              <span className="stat-label">Total VIP Clients</span>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple">💊</div>
              <span className="stat-value">{stats.totalProducts}</span>
              <span className="stat-label">Available Products</span>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange">📋</div>
              <span className="stat-value">{stats.totalAssignments}</span>
              <span className="stat-label">Total Assignments</span>
            </div>
          </div>

          {/* Only show tabs and content when on assignments page */}
          {(activeTab === 'assignments' || activeTab === 'mapping') && (
            <>
              {/* Tabs */}
              <div className="dashboard-tabs">
                <button
                  className={`tab-btn ${activeTab === 'assignments' ? 'active' : ''}`}
                  onClick={() => setActiveTab('assignments')}
                >
                  My Assignments
                </button>
                <button
                  className={`tab-btn ${activeTab === 'mapping' ? 'active' : ''}`}
                  onClick={() => setActiveTab('mapping')}
                >
                  VIP Client-Product Mapping
                </button>
              </div>

              {/* Tab Content */}
              <div className="tab-content">
                {activeTab === 'assignments' && (
                  <ProductAssignment
                    assignments={assignments}
                    onViewDetails={handleViewDetails}
                    onEdit={handleEditAssignment}
                    onDeactivate={handleDeactivateAssignment}
                  />
                )}

                {activeTab === 'mapping' && (
                  <DoctorProductMapping
                    doctors={doctors}
                    products={products}
                    mappings={mappings}
                    onMapProduct={handleMapProduct}
                    onUnmapProduct={handleUnmapProduct}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedAssignment && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Assignment Details</h2>
              <button className="modal-close" onClick={() => setShowDetailsModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="assignment-info">
                <div className="info-row">
                  <span className="info-label">Product:</span>
                  <span className="info-value">{selectedAssignment.product?.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Category:</span>
                  <span className="info-value">{selectedAssignment.product?.category || 'N/A'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">VIP Client:</span>
                  <span className="info-value">{selectedAssignment.doctor?.name}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Specialization:</span>
                  <span className="info-value">{selectedAssignment.doctor?.specialization || 'N/A'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Priority:</span>
                  <span className="info-value">
                    <span className={`priority-badge ${getPriorityLabel(selectedAssignment.priority).toLowerCase()}`}>
                      {getPriorityLabel(selectedAssignment.priority)}
                    </span>
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Status:</span>
                  <span className="info-value">
                    <span className={`status-badge ${selectedAssignment.status}`}>
                      {selectedAssignment.status}
                    </span>
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Assigned Date:</span>
                  <span className="info-value">
                    {new Date(selectedAssignment.assignedDate || selectedAssignment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {selectedAssignment.notes && (
                  <div className="info-row">
                    <span className="info-label">Notes:</span>
                    <span className="info-value">{selectedAssignment.notes}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDetailsModal(false)}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowDetailsModal(false);
                  handleEditAssignment(selectedAssignment);
                }}
              >
                Edit
              </button>
              {selectedAssignment.status === 'active' && (
                <button
                  className="btn btn-danger"
                  onClick={() => handleDeactivateAssignment(selectedAssignment)}
                >
                  Deactivate
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedAssignment && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Assignment</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Product</label>
                <input
                  type="text"
                  value={selectedAssignment.product?.name || ''}
                  disabled
                  style={{ background: '#f3f4f6', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', width: '100%' }}
                />
              </div>
              <div className="form-group">
                <label>VIP Client</label>
                <input
                  type="text"
                  value={selectedAssignment.doctor?.name || ''}
                  disabled
                  style={{ background: '#f3f4f6', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', width: '100%' }}
                />
              </div>
              <div className="form-group">
                <label>Priority</label>
                <select
                  value={editForm.priority}
                  onChange={e => setEditForm({ ...editForm, priority: Number(e.target.value) })}
                >
                  <option value={1}>High</option>
                  <option value={2}>Medium</option>
                  <option value={3}>Low</option>
                </select>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Add notes about this assignment..."
                  maxLength={500}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowEditModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveAssignment}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedRepDashboard;
