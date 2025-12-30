/**
 * RegionManagement Component
 *
 * Admin component for managing regions:
 * - Hierarchical tree view
 * - CRUD operations
 * - Region statistics
 * - Add/Edit modal
 */

import { useState, useEffect, useMemo } from 'react';

const regionManagementStyles = `
  .region-management {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .management-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .management-header h2 {
    margin: 0;
    font-size: 20px;
    color: #1f2937;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
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

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover {
    background: #4b5563;
  }

  .btn-danger {
    background: #dc2626;
    color: white;
  }

  .btn-danger:hover {
    background: #b91c1c;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 12px;
  }

  .btn-icon {
    padding: 6px 10px;
    background: transparent;
    border: 1px solid #d1d5db;
    color: #374151;
  }

  .btn-icon:hover {
    background: #f3f4f6;
  }

  /* Filters */
  .filters-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .filters-bar input,
  .filters-bar select {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
  }

  .filters-bar input {
    flex: 1;
    min-width: 200px;
  }

  .filters-bar select {
    min-width: 150px;
  }

  .filters-bar input:focus,
  .filters-bar select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  /* Tree View */
  .region-tree {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  }

  .tree-header {
    display: grid;
    grid-template-columns: 1fr 100px 100px 80px 180px;
    gap: 12px;
    padding: 12px 16px;
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
    font-size: 14px;
    border-bottom: 1px solid #e5e7eb;
  }

  .tree-node {
    display: grid;
    grid-template-columns: 1fr 100px 100px 80px 180px;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    align-items: center;
    transition: background 0.2s;
  }

  .tree-node:last-child {
    border-bottom: none;
  }

  .tree-node:hover {
    background: #f9fafb;
  }

  .tree-node-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tree-indent {
    display: inline-block;
    width: 24px;
  }

  .tree-toggle {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #6b7280;
    transition: transform 0.2s;
  }

  .tree-toggle.expanded {
    transform: rotate(90deg);
  }

  .tree-toggle.no-children {
    visibility: hidden;
  }

  .region-name {
    font-weight: 500;
    color: #1f2937;
  }

  .region-code {
    color: #6b7280;
    font-size: 12px;
    margin-left: 8px;
  }

  /* Level Badges */
  .level-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
  }

  .level-badge.level-country {
    background: #f3e8ff;
    color: #7c3aed;
  }

  .level-badge.level-region {
    background: #fce7f3;
    color: #be185d;
  }

  .level-badge.level-province {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .level-badge.level-city {
    background: #dcfce7;
    color: #16a34a;
  }

  .level-badge.level-district {
    background: #ffedd5;
    color: #ea580c;
  }

  .level-badge.level-area {
    background: #f3f4f6;
    color: #4b5563;
  }

  /* Stats */
  .stats-cell {
    font-size: 13px;
    color: #6b7280;
  }

  .stats-cell strong {
    color: #1f2937;
  }

  /* Status Badge */
  .status-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .status-badge.active {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-badge.inactive {
    background: #fee2e2;
    color: #dc2626;
  }

  /* Actions */
  .actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 48px 24px;
    color: #6b7280;
  }

  .empty-state h3 {
    margin: 0 0 8px 0;
    color: #374151;
  }

  /* Loading State */
  .tree-loading {
    text-align: center;
    padding: 48px 24px;
    color: #6b7280;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #1f2937;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6b7280;
    padding: 0;
    line-height: 1;
  }

  .modal-close:hover {
    color: #374151;
  }

  .modal-body {
    padding: 24px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-group.full-width {
    grid-column: span 2;
  }

  .form-group label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .form-group .checkbox-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-group .checkbox-wrapper input[type="checkbox"] {
    width: 18px;
    height: 18px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 24px;
    border-top: 1px solid #e5e7eb;
  }

  /* Confirm Modal */
  .confirm-modal .modal-content {
    max-width: 400px;
  }

  .confirm-modal .modal-body {
    text-align: center;
  }

  .confirm-modal .modal-body p {
    margin: 0 0 8px 0;
    color: #374151;
  }

  .confirm-modal .modal-body .warning {
    color: #dc2626;
    font-size: 13px;
    margin-top: 12px;
  }

  /* Stats Modal */
  .stats-modal .modal-content {
    max-width: 450px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .stat-card {
    background: #f9fafb;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }

  .stat-card .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .stat-card .stat-label {
    font-size: 13px;
    color: #6b7280;
  }

  .stats-details {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #e5e7eb;
  }

  .stats-details h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #374151;
  }

  .stats-details ul {
    margin: 0;
    padding: 0 0 0 20px;
    color: #6b7280;
    font-size: 13px;
  }

  .stats-details li {
    margin-bottom: 4px;
  }
`;

const LEVEL_ORDER = ['country', 'region', 'province', 'city', 'district', 'area'];

const RegionManagement = ({
  regions = [],
  flatRegions = [],
  loading = false,
  onSave,
  onDelete,
  onGetStats,
}) => {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [editingRegion, setEditingRegion] = useState(null);
  const [deletingRegion, setDeletingRegion] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [statsRegion, setStatsRegion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [parentForNew, setParentForNew] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    level: 'city',
    parent: '',
    description: '',
    isActive: true,
  });

  // Initialize expanded nodes (expand first 2 levels)
  useEffect(() => {
    if (regions.length > 0) {
      const initialExpanded = new Set();
      const expandFirstLevels = (nodes, depth = 0) => {
        if (depth >= 2) return;
        nodes.forEach((node) => {
          if (node.children && node.children.length > 0) {
            initialExpanded.add(node._id);
            expandFirstLevels(node.children, depth + 1);
          }
        });
      };
      expandFirstLevels(regions);
      setExpandedNodes(initialExpanded);
    }
  }, [regions]);

  // Filter regions based on search and level
  const filterRegions = (nodes) => {
    if (!searchTerm && !levelFilter) return nodes;

    const matchesFilter = (node) => {
      const matchesSearch = !searchTerm ||
        node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLevel = !levelFilter || node.level === levelFilter;
      return matchesSearch && matchesLevel;
    };

    const filterTree = (nodes) => {
      return nodes.reduce((acc, node) => {
        const nodeMatches = matchesFilter(node);
        const filteredChildren = node.children ? filterTree(node.children) : [];

        if (nodeMatches || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren,
            _highlighted: nodeMatches,
          });
        }
        return acc;
      }, []);
    };

    return filterTree(nodes);
  };

  const filteredRegions = useMemo(() => filterRegions(regions), [regions, searchTerm, levelFilter]);

  // Toggle node expansion
  const toggleNode = (nodeId) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Get valid parent options based on selected level
  const getParentOptions = () => {
    if (!formData.level) return [];
    const levelIndex = LEVEL_ORDER.indexOf(formData.level);
    if (levelIndex <= 0) return []; // country has no parent

    // Parents must be from higher levels
    const validLevels = LEVEL_ORDER.slice(0, levelIndex);
    return flatRegions.filter((r) => validLevels.includes(r.level) && r.isActive);
  };

  // Open add modal
  const handleAdd = (parent = null) => {
    setEditingRegion(null);
    setParentForNew(parent);

    // Determine default level based on parent
    let defaultLevel = 'city';
    if (parent) {
      const parentLevelIndex = LEVEL_ORDER.indexOf(parent.level);
      if (parentLevelIndex < LEVEL_ORDER.length - 1) {
        defaultLevel = LEVEL_ORDER[parentLevelIndex + 1];
      }
    } else {
      defaultLevel = 'country';
    }

    setFormData({
      name: '',
      code: '',
      level: defaultLevel,
      parent: parent?._id || '',
      description: '',
      isActive: true,
    });
    setShowModal(true);
  };

  // Open edit modal
  const handleEdit = (region) => {
    setEditingRegion(region);
    setParentForNew(null);
    setFormData({
      name: region.name,
      code: region.code,
      level: region.level,
      parent: region.parent?._id || region.parent || '',
      description: region.description || '',
      isActive: region.isActive !== false,
    });
    setShowModal(true);
  };

  // Open delete confirmation
  const handleDeleteClick = (region) => {
    setDeletingRegion(region);
    setShowDeleteModal(true);
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!deletingRegion) return;
    setSaving(true);
    const success = await onDelete(deletingRegion._id);
    setSaving(false);
    if (success) {
      setShowDeleteModal(false);
      setDeletingRegion(null);
    }
  };

  // View stats
  const handleViewStats = async (region) => {
    setStatsRegion(region);
    setStatsData(null);
    setShowStatsModal(true);

    const stats = await onGetStats(region._id);
    setStatsData(stats);
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const dataToSave = {
      ...formData,
      code: formData.code.toUpperCase(),
    };

    if (editingRegion) {
      dataToSave._id = editingRegion._id;
    }

    // Remove empty parent
    if (!dataToSave.parent) {
      delete dataToSave.parent;
    }

    const success = await onSave(dataToSave);
    setSaving(false);

    if (success) {
      setShowModal(false);
      setEditingRegion(null);
      setParentForNew(null);
    }
  };

  // Render tree recursively
  const renderTree = (nodes, depth = 0) => {
    return nodes.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedNodes.has(node._id);

      return (
        <div key={node._id}>
          <div className="tree-node">
            <div className="tree-node-content">
              {/* Indentation */}
              {Array.from({ length: depth }).map((_, i) => (
                <span key={i} className="tree-indent" />
              ))}

              {/* Toggle */}
              <span
                className={`tree-toggle ${isExpanded ? 'expanded' : ''} ${!hasChildren ? 'no-children' : ''}`}
                onClick={() => hasChildren && toggleNode(node._id)}
              >
                {hasChildren ? '>' : ''}
              </span>

              {/* Name and Code */}
              <span className="region-name">{node.name}</span>
              <span className="region-code">({node.code})</span>
            </div>

            {/* Level */}
            <div>
              <span className={`level-badge level-${node.level}`}>{node.level}</span>
            </div>

            {/* Stats */}
            <div className="stats-cell">
              <strong>{node.doctorCount || 0}</strong> doctors
            </div>

            {/* Status */}
            <div>
              <span className={`status-badge ${node.isActive !== false ? 'active' : 'inactive'}`}>
                {node.isActive !== false ? 'Active' : 'Inactive'}
              </span>
            </div>

            {/* Actions */}
            <div className="actions">
              <button className="btn btn-icon btn-sm" onClick={() => handleViewStats(node)} title="View Stats">
                Stats
              </button>
              <button className="btn btn-icon btn-sm" onClick={() => handleAdd(node)} title="Add Child">
                + Child
              </button>
              <button className="btn btn-icon btn-sm" onClick={() => handleEdit(node)} title="Edit">
                Edit
              </button>
              <button
                className="btn btn-icon btn-sm"
                onClick={() => handleDeleteClick(node)}
                title="Deactivate"
                style={{ color: '#dc2626' }}
              >
                Del
              </button>
            </div>
          </div>

          {/* Children */}
          {hasChildren && isExpanded && renderTree(node.children, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="region-management">
      <style>{regionManagementStyles}</style>

      {/* Header */}
      <div className="management-header">
        <h2>Regions ({flatRegions.length})</h2>
        <button className="btn btn-primary" onClick={() => handleAdd()}>
          + Add Region
        </button>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <input
          type="text"
          placeholder="Search by name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">All Levels</option>
          <option value="country">Country</option>
          <option value="region">Region</option>
          <option value="province">Province</option>
          <option value="city">City</option>
          <option value="district">District</option>
          <option value="area">Area</option>
        </select>
      </div>

      {/* Tree View */}
      <div className="region-tree">
        <div className="tree-header">
          <div>Region</div>
          <div>Level</div>
          <div>VIP Clients</div>
          <div>Status</div>
          <div>Actions</div>
        </div>

        {loading ? (
          <div className="tree-loading">Loading regions...</div>
        ) : filteredRegions.length === 0 ? (
          <div className="empty-state">
            <h3>No regions found</h3>
            <p>
              {searchTerm || levelFilter
                ? 'Try adjusting your filters'
                : 'Click "Add Region" to create your first region'}
            </p>
          </div>
        ) : (
          renderTree(filteredRegions)
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRegion ? 'Edit Region' : parentForNew ? `Add Child to ${parentForNew.name}` : 'Add Region'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="e.g., Metro Manila"
                    />
                  </div>
                  <div className="form-group">
                    <label>Code *</label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      required
                      placeholder="e.g., NCR"
                      maxLength={20}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Level *</label>
                    <select
                      value={formData.level}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value, parent: '' })}
                      required
                    >
                      <option value="country">Country</option>
                      <option value="region">Region</option>
                      <option value="province">Province</option>
                      <option value="city">City</option>
                      <option value="district">District</option>
                      <option value="area">Area</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Parent Region</label>
                    <select
                      value={formData.parent}
                      onChange={(e) => setFormData({ ...formData, parent: e.target.value })}
                      disabled={formData.level === 'country'}
                    >
                      <option value="">No Parent (Top Level)</option>
                      {getParentOptions().map((r) => (
                        <option key={r._id} value={r._id}>
                          {r.name} ({r.level})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional description..."
                      maxLength={500}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Status</label>
                    <div className="checkbox-wrapper">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      />
                      <span>Active</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingRegion ? 'Update Region' : 'Create Region'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && deletingRegion && (
        <div className="modal-overlay confirm-modal" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Deactivate Region</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to deactivate <strong>{deletingRegion.name}</strong>?
              </p>
              <p className="warning">
                Note: Regions with child regions or assigned doctors cannot be deactivated.
              </p>
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmDelete} disabled={saving}>
                {saving ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {showStatsModal && statsRegion && (
        <div className="modal-overlay stats-modal" onClick={() => setShowStatsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{statsRegion.name} - Statistics</h3>
              <button className="modal-close" onClick={() => setShowStatsModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              {!statsData ? (
                <div className="tree-loading">Loading statistics...</div>
              ) : (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-value">{statsData.doctorCount || 0}</div>
                      <div className="stat-label">VIP Clients</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{statsData.employeeCount || 0}</div>
                      <div className="stat-label">BDMs</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{statsData.childRegionCount || 0}</div>
                      <div className="stat-label">Child Regions</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{statsData.totalVisits || 0}</div>
                      <div className="stat-label">Total Visits</div>
                    </div>
                  </div>

                  {statsData.doctorsByFrequency && (
                    <div className="stats-details">
                      <h4>VIP Clients by Visit Frequency</h4>
                      <ul>
                        <li>2x per month: {statsData.doctorsByFrequency['2'] || 0}</li>
                        <li>4x per month: {statsData.doctorsByFrequency['4'] || 0}</li>
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setShowStatsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegionManagement;
