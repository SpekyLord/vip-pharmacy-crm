/**
 * ProductManagement Component
 *
 * Admin component for managing CRM products:
 * - Product table with image thumbnail, specialization tags, status
 * - Create/Edit modal with image upload and specialization tagging
 * - Search and filter by category / specialization
 * - Soft delete confirmation
 */

import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, Tag } from 'lucide-react';
import Pagination from '../common/Pagination';
import productService from '../../services/productService';
import useDebounce from '../../hooks/useDebounce';
import doctorService from '../../services/doctorService';

const pmStyles = `
  .pm-filters {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
    align-items: center;
  }

  .pm-search {
    flex: 1;
    min-width: 200px;
    position: relative;
  }

  .pm-search input {
    width: 100%;
    padding: 10px 12px 10px 36px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .pm-search input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .pm-search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
  }

  .pm-filter-select {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: white;
    min-width: 150px;
  }

  .pm-add-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .pm-add-btn:hover {
    background: #1d4ed8;
  }

  .pm-table-wrap {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow-x: auto;
  }

  .pm-table {
    width: 100%;
    border-collapse: collapse;
  }

  .pm-table th {
    padding: 14px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid #e5e7eb;
    white-space: nowrap;
  }

  .pm-table td {
    padding: 12px 16px;
    font-size: 14px;
    color: #374151;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
  }

  .pm-table tr:hover {
    background: #f9fafb;
  }

  .pm-thumb {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    object-fit: cover;
    background: #f3f4f6;
  }

  .pm-thumb-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: #9ca3af;
  }

  .pm-spec-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .pm-spec-tag {
    padding: 2px 8px;
    background: #eff6ff;
    color: #1d4ed8;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  .pm-status-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .pm-status-active {
    background: #dcfce7;
    color: #15803d;
  }

  .pm-status-inactive {
    background: #fee2e2;
    color: #dc2626;
  }

  .pm-actions {
    display: flex;
    gap: 8px;
  }

  .pm-action-btn {
    padding: 6px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    color: #6b7280;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pm-action-btn:hover {
    background: #f9fafb;
    color: #374151;
  }

  .pm-action-btn.delete:hover {
    color: #dc2626;
    border-color: #fecaca;
    background: #fef2f2;
  }

  .pm-empty {
    text-align: center;
    padding: 60px 20px;
    color: #9ca3af;
  }

  .pm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .pm-modal {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  }

  .pm-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
  }

  .pm-modal-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #111827;
  }

  .pm-modal-close {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px;
  }

  .pm-modal-close:hover {
    color: #374151;
  }

  .pm-modal-body {
    padding: 24px;
  }

  .pm-field {
    margin-bottom: 16px;
  }

  .pm-field label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    font-size: 14px;
    color: #374151;
  }

  .pm-field input[type="text"],
  .pm-field input[type="number"],
  .pm-field select,
  .pm-field textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .pm-field input:focus,
  .pm-field select:focus,
  .pm-field textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .pm-field textarea {
    resize: vertical;
    min-height: 70px;
  }

  .pm-field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .pm-image-preview {
    margin-top: 8px;
  }

  .pm-image-preview img {
    width: 120px;
    height: 120px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }

  .pm-tag-input-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    min-height: 42px;
    align-items: center;
    cursor: text;
  }

  .pm-tag-input-wrap:focus-within {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .pm-tag-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: #eff6ff;
    color: #1d4ed8;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
  }

  .pm-tag-remove {
    background: none;
    border: none;
    color: #93c5fd;
    cursor: pointer;
    padding: 0;
    font-size: 16px;
    line-height: 1;
  }

  .pm-tag-remove:hover {
    color: #dc2626;
  }

  .pm-spec-dropdown-btn {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: #fff;
    font-size: 14px;
    color: #374151;
    cursor: pointer;
    text-align: left;
    display: flex;
    align-items: center;
  }

  .pm-spec-dropdown-btn:hover {
    border-color: #9ca3af;
  }

  .pm-spec-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    max-height: 200px;
    overflow-y: auto;
    z-index: 20;
  }

  .pm-spec-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 14px;
    color: #374151;
    cursor: pointer;
    transition: background 0.1s;
  }

  .pm-spec-dropdown-item:hover {
    background: #f3f4f6;
  }

  .pm-spec-dropdown-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .pm-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pm-toggle {
    width: 44px;
    height: 24px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
  }

  .pm-toggle.on {
    background: #22c55e;
  }

  .pm-toggle.off {
    background: #d1d5db;
  }

  .pm-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    transition: left 0.2s;
  }

  .pm-toggle.on::after {
    left: 22px;
  }

  .pm-toggle.off::after {
    left: 2px;
  }

  .pm-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
  }

  .pm-confirm {
    background: white;
    border-radius: 16px;
    padding: 24px;
    max-width: 400px;
    width: 100%;
    text-align: center;
  }

  .pm-confirm h4 {
    margin: 0 0 8px;
    font-size: 18px;
    color: #111827;
  }

  .pm-confirm p {
    color: #6b7280;
    font-size: 14px;
    margin: 0 0 20px;
  }

  .pm-confirm-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
  }

  /* Mobile card list — hidden by default, shown on mobile */
  .pm-mobile-cards {
    display: none;
  }

  .pm-mobile-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
  }

  .pm-mobile-card-top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .pm-mobile-card-info {
    flex: 1;
    min-width: 0;
  }

  .pm-mobile-card-name {
    font-weight: 600;
    font-size: 15px;
    color: #1f2937;
    margin: 0 0 2px 0;
  }

  .pm-mobile-card-sub {
    font-size: 12px;
    color: #6b7280;
    margin: 0;
  }

  .pm-mobile-card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .pm-mobile-card-actions {
    display: flex;
    gap: 8px;
  }

  .pm-mobile-card-actions .pm-action-btn {
    flex: 1;
    min-height: 44px;
    justify-content: center;
  }

  @media (max-width: 1024px) {
    .pm-table th:nth-child(4),
    .pm-table td:nth-child(4) {
      display: none;
    }
  }

  @media (max-width: 480px) {
    .pm-filters {
      flex-direction: column;
    }

    .pm-search {
      min-width: 0;
      width: 100%;
    }

    .pm-search input {
      min-height: 44px;
      font-size: 16px;
    }

    .pm-filter-select {
      width: 100%;
      min-height: 44px;
      font-size: 16px;
    }

    .pm-add-btn {
      width: 100%;
      min-height: 44px;
      justify-content: center;
    }

    .pm-table-wrap {
      display: none;
    }

    .pm-mobile-cards {
      display: block;
    }

    .pm-modal {
      width: 100%;
      max-width: 100%;
      height: 100vh;
      max-height: 100vh;
      border-radius: 0;
    }

    .pm-modal-body {
      padding: 16px;
    }

    .pm-field input[type="text"],
    .pm-field input[type="number"],
    .pm-field select,
    .pm-field textarea {
      min-height: 44px;
      font-size: 16px;
    }

    .pm-field-row {
      grid-template-columns: 1fr;
    }

    .pm-modal-footer {
      flex-direction: column-reverse;
      padding: 16px;
    }

    .pm-modal-footer .btn {
      width: 100%;
      min-height: 48px;
    }

    .pm-confirm-actions {
      flex-direction: column-reverse;
    }

    .pm-confirm-actions .btn {
      width: 100%;
      min-height: 48px;
    }
  }
`;

const ProductManagement = ({
  products = [],
  filters = {},
  pagination = {},
  loading = false,
  onSave,
  onDelete,
  onFilterChange,
  onPageChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const debouncedSearch = useDebounce(searchInput, 300);

  // Form state
  const [form, setForm] = useState({
    name: '',
    genericName: '',
    dosage: '',
    category: '',
    description: '',
    usage: '',
    safety: '',
    targetSpecializations: [],
    isActive: true,
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [specDropdownOpen, setSpecDropdownOpen] = useState(false);
  const [specializations, setSpecializations] = useState([]);

  // Fetch distinct specializations from database
  useEffect(() => {
    doctorService.getSpecializations()
      .then((res) => setSpecializations(res.data || []))
      .catch(() => setSpecializations([]));
  }, []);

  // Fetch categories for dropdown
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const catRes = await productService.getCategories();
        setCategories(catRes.data || []);
      } catch {
        // Non-critical
      }
    };
    fetchMeta();
  }, [products]);

  // Debounced search
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFilterChange?.({ ...filters, search: debouncedSearch });
    }
  }, [debouncedSearch]);

  const openCreate = () => {
    setEditProduct(null);
    setForm({
      name: '',
      genericName: '',
      dosage: '',
      category: '',
      description: '',
      usage: '',
      safety: '',
      targetSpecializations: [],
      isActive: true,
    });
    setImageFile(null);
    setImagePreview('');
    setSpecDropdownOpen(false);
    setShowModal(true);
  };

  const openEdit = (product) => {
    setEditProduct(product);
    setForm({
      name: product.name || '',
      genericName: product.genericName || '',
      dosage: product.dosage || '',
      category: product.category || '',
      description: product.description || '',
      usage: product.usage || '',
      safety: product.safety || '',
      targetSpecializations: product.targetSpecializations || [],
      isActive: product.isActive !== false,
    });
    setImageFile(null);
    setImagePreview(product.image || '');
    setSpecDropdownOpen(false);
    setShowModal(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const toggleSpec = (spec) => {
    setForm((prev) => ({
      ...prev,
      targetSpecializations: prev.targetSpecializations.includes(spec)
        ? prev.targetSpecializations.filter((s) => s !== spec)
        : [...prev.targetSpecializations, spec],
    }));
  };

  const removeSpec = (spec) => {
    setForm((prev) => ({
      ...prev,
      targetSpecializations: prev.targetSpecializations.filter((s) => s !== spec),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.category.trim()) return;

    setSaving(true);
    const formData = new FormData();

    if (editProduct) {
      formData.append('_id', editProduct._id);
    }

    formData.append('name', form.name);
    formData.append('genericName', form.genericName);
    formData.append('dosage', form.dosage);
    formData.append('category', form.category);
    formData.append('description', form.description);
    formData.append('usage', form.usage);
    formData.append('safety', form.safety);
    formData.append('targetSpecializations', JSON.stringify(form.targetSpecializations));
    formData.append('isActive', String(form.isActive));

    if (imageFile) {
      formData.append('image', imageFile);
    }

    const success = await onSave?.(formData, !!editProduct);
    setSaving(false);

    if (success) {
      setShowModal(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    await onDelete?.(confirmDelete._id);
    setConfirmDelete(null);
  };

  return (
    <div className="product-management">
      <style>{pmStyles}</style>

      {/* Filters */}
      <div className="pm-filters">
        <div className="pm-search">
          <Search size={16} className="pm-search-icon" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <select
          className="pm-filter-select"
          value={filters.category || ''}
          onChange={(e) => onFilterChange?.({ ...filters, category: e.target.value })}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          className="pm-filter-select"
          value={filters.specialization || ''}
          onChange={(e) => onFilterChange?.({ ...filters, specialization: e.target.value })}
        >
          <option value="">All Specializations</option>
          {specializations.map((spec) => (
            <option key={spec} value={spec}>{spec}</option>
          ))}
        </select>

        <button className="pm-add-btn" onClick={openCreate}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      {/* Table */}
      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Name</th>
              <th>Category</th>
              <th>Specializations</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan="6">
                  <div className="pm-empty">
                    {loading ? 'Loading...' : 'No products found. Click "Add Product" to create one.'}
                  </div>
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product._id}>
                  <td>
                    {product.image ? (
                      <img className="pm-thumb" src={product.image} alt={product.name} />
                    ) : (
                      <div className="pm-thumb-placeholder">&#128138;</div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{product.name}</div>
                    {(product.genericName || product.dosage) && (
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        {[product.genericName, product.dosage].filter(Boolean).join(' - ')}
                      </div>
                    )}
                  </td>
                  <td>{product.category}</td>
                  <td>
                    <div className="pm-spec-tags">
                      {(product.targetSpecializations || []).slice(0, 3).map((spec) => (
                        <span key={spec} className="pm-spec-tag">{spec}</span>
                      ))}
                      {(product.targetSpecializations || []).length > 3 && (
                        <span className="pm-spec-tag">+{product.targetSpecializations.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`pm-status-badge ${product.isActive !== false ? 'pm-status-active' : 'pm-status-inactive'}`}>
                      {product.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="pm-actions">
                      <button className="pm-action-btn" onClick={() => openEdit(product)} title="Edit">
                        <Edit2 size={16} />
                      </button>
                      {product.isActive !== false && (
                        <button className="pm-action-btn delete" onClick={() => setConfirmDelete(product)} title="Deactivate">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="pm-mobile-cards">
        {products.length === 0 ? (
          <div className="pm-empty">
            {loading ? 'Loading...' : 'No products found. Click "Add Product" to create one.'}
          </div>
        ) : (
          products.map((product) => (
            <div key={product._id} className="pm-mobile-card">
              <div className="pm-mobile-card-top">
                {product.image ? (
                  <img className="pm-thumb" src={product.image} alt={product.name} />
                ) : (
                  <div className="pm-thumb-placeholder">&#128138;</div>
                )}
                <div className="pm-mobile-card-info">
                  <p className="pm-mobile-card-name">{product.name}</p>
                  <p className="pm-mobile-card-sub">
                    {[product.genericName, product.dosage].filter(Boolean).join(' - ') || product.category}
                  </p>
                </div>
              </div>
              <div className="pm-mobile-card-meta">
                <span style={{ fontSize: 13, color: '#6b7280' }}>{product.category}</span>
                <span className={`pm-status-badge ${product.isActive !== false ? 'pm-status-active' : 'pm-status-inactive'}`}>
                  {product.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="pm-mobile-card-actions">
                <button className="pm-action-btn" onClick={() => openEdit(product)} title="Edit">
                  <Edit2 size={16} /> <span style={{ marginLeft: 4, fontSize: 13 }}>Edit</span>
                </button>
                {product.isActive !== false && (
                  <button className="pm-action-btn delete" onClick={() => setConfirmDelete(product)} title="Deactivate">
                    <Trash2 size={16} /> <span style={{ marginLeft: 4, fontSize: 13 }}>Deactivate</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ marginTop: 16 }}>
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            onPageChange={onPageChange}
          />
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="pm-overlay" onClick={() => setShowModal(false)}>
          <div className="pm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pm-modal-header">
              <h3>{editProduct ? 'Edit Product' : 'Add Product'}</h3>
              <button className="pm-modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="pm-modal-body">
              <div className="pm-field">
                <label>Product Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Amoxicillin 500mg"
                />
              </div>

              <div className="pm-field-row">
                <div className="pm-field">
                  <label>Generic Name</label>
                  <input
                    type="text"
                    value={form.genericName}
                    onChange={(e) => setForm((p) => ({ ...p, genericName: e.target.value }))}
                    placeholder="e.g. Amoxicillin"
                  />
                </div>
                <div className="pm-field">
                  <label>Dosage</label>
                  <input
                    type="text"
                    value={form.dosage}
                    onChange={(e) => setForm((p) => ({ ...p, dosage: e.target.value }))}
                    placeholder="e.g. 500mg"
                  />
                </div>
              </div>

              <div className="pm-field">
                <label>Category *</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. Antibiotics"
                  list="category-list"
                />
                <datalist id="category-list">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>

              <div className="pm-field">
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Product description"
                  rows={3}
                />
              </div>

              <div className="pm-field">
                <label>Usage Information</label>
                <textarea
                  value={form.usage}
                  onChange={(e) => setForm((p) => ({ ...p, usage: e.target.value }))}
                  placeholder="How to use this product"
                  rows={2}
                />
              </div>

              <div className="pm-field">
                <label>Safety Information</label>
                <textarea
                  value={form.safety}
                  onChange={(e) => setForm((p) => ({ ...p, safety: e.target.value }))}
                  placeholder="Precautions and warnings"
                  rows={2}
                />
              </div>

              <div className="pm-field">
                <label>Product Image</label>
                <input type="file" accept="image/*" onChange={handleImageChange} />
                {imagePreview && (
                  <div className="pm-image-preview">
                    <img src={imagePreview} alt="Preview" />
                  </div>
                )}
              </div>

              <div className="pm-field">
                <label>
                  <Tag size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Target Specializations
                </label>
                {form.targetSpecializations.length > 0 && (
                  <div className="pm-tag-input-wrap" style={{ marginBottom: 8 }}>
                    {form.targetSpecializations.map((spec) => (
                      <span key={spec} className="pm-tag-item">
                        {spec}
                        <button className="pm-tag-remove" onClick={() => removeSpec(spec)} type="button">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    className="pm-spec-dropdown-btn"
                    onClick={() => setSpecDropdownOpen(!specDropdownOpen)}
                  >
                    {form.targetSpecializations.length === 0
                      ? '— Select specializations —'
                      : `${form.targetSpecializations.length} selected`}
                    <span style={{ marginLeft: 'auto' }}>{specDropdownOpen ? '▲' : '▼'}</span>
                  </button>
                  {specDropdownOpen && (
                    <div className="pm-spec-dropdown">
                      {specializations.map((s) => (
                        <label key={s} className="pm-spec-dropdown-item">
                          <input
                            type="checkbox"
                            checked={form.targetSpecializations.includes(s)}
                            onChange={() => toggleSpec(s)}
                          />
                          {s}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pm-field">
                <div className="pm-toggle-row">
                  <label style={{ margin: 0 }}>Active</label>
                  <button
                    type="button"
                    className={`pm-toggle ${form.isActive ? 'on' : 'off'}`}
                    onClick={() => setForm((p) => ({ ...p, isActive: !p.isActive }))}
                  />
                </div>
              </div>
            </div>

            <div className="pm-modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.category.trim()}
              >
                {saving ? 'Saving...' : editProduct ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="pm-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="pm-confirm" onClick={(e) => e.stopPropagation()}>
            <h4>Deactivate Product?</h4>
            <p>
              Are you sure you want to deactivate <strong>{confirmDelete.name}</strong>?
              This product will no longer be visible to BDMs.
            </p>
            <div className="pm-confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagement;
