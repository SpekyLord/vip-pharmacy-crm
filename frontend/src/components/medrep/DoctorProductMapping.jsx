/**
 * DoctorProductMapping Component
 *
 * Med Rep component for:
 * - Mapping products to doctors
 * - Viewing doctor-product relationships
 * - Adding/removing product assignments
 * - Bulk product assignment
 */

import { useState, useMemo } from 'react';

const doctorProductMappingStyles = `
  .doctor-product-mapping {
    width: 100%;
  }

  .mapping-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .mapping-header h2 {
    margin: 0;
    font-size: 20px;
    color: #1f2937;
  }

  .mapping-container {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 24px;
    min-height: 500px;
  }

  @media (max-width: 900px) {
    .mapping-container {
      grid-template-columns: 1fr;
    }
  }

  .doctor-list-panel {
    background: #f9fafb;
    border-radius: 12px;
    padding: 16px;
    max-height: 600px;
    overflow-y: auto;
  }

  .doctor-list-panel h3 {
    margin: 0 0 16px;
    font-size: 16px;
    color: #374151;
  }

  .doctor-search {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .doctor-select-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .doctor-item {
    display: flex;
    flex-direction: column;
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
    margin-bottom: 8px;
    background: white;
    border: 1px solid #e5e7eb;
  }

  .doctor-item:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .doctor-item.selected {
    background: #dbeafe;
    border-color: #2563eb;
  }

  .doctor-item .doctor-name {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .doctor-item .doctor-specialization {
    font-size: 13px;
    color: #6b7280;
  }

  .doctor-item .product-count {
    font-size: 12px;
    color: #2563eb;
    margin-top: 4px;
    font-weight: 500;
  }

  .product-mapping-panel {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 24px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 18px;
    color: #1f2937;
  }

  .doctor-info {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .doctor-info .specialization-badge {
    padding: 4px 12px;
    background: #f3f4f6;
    border-radius: 20px;
    font-size: 12px;
    color: #6b7280;
  }

  .add-product-section {
    background: #f9fafb;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
  }

  .add-product-section h4 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #374151;
  }

  .add-product-row {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .add-product-row select {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: white;
  }

  .add-product-row .priority-select {
    width: 120px;
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

  .mapped-products-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .mapped-products-header h4 {
    margin: 0;
    font-size: 14px;
    color: #374151;
  }

  .product-count-badge {
    padding: 4px 12px;
    background: #dbeafe;
    color: #2563eb;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .mapped-products {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .mapped-product-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 8px;
    transition: box-shadow 0.2s;
  }

  .mapped-product-item:hover {
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }

  .product-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .product-info .product-name {
    font-weight: 500;
    color: #1f2937;
  }

  .product-info .product-category {
    font-size: 12px;
    color: #6b7280;
  }

  .product-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .priority-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .priority-badge.high {
    background: #fee2e2;
    color: #dc2626;
  }

  .priority-badge.medium {
    background: #fef3c7;
    color: #d97706;
  }

  .priority-badge.low {
    background: #dcfce7;
    color: #16a34a;
  }

  .btn-remove {
    padding: 6px 12px;
    background: #fee2e2;
    color: #dc2626;
    border: none;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-remove:hover {
    background: #fecaca;
  }

  .no-products {
    text-align: center;
    padding: 32px;
    color: #6b7280;
  }

  .no-products-icon {
    font-size: 40px;
    margin-bottom: 12px;
  }

  .select-doctor-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px;
    color: #6b7280;
    text-align: center;
    height: 100%;
  }

  .select-doctor-prompt-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .select-doctor-prompt h3 {
    margin: 0 0 8px;
    color: #374151;
  }

  .select-doctor-prompt p {
    margin: 0;
  }

  .no-doctors {
    text-align: center;
    padding: 32px;
    color: #6b7280;
  }
`;

const DoctorProductMapping = ({
  doctors = [],
  products = [],
  mappings = [],
  onMapProduct,
  onUnmapProduct,
}) => {
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedPriority, setSelectedPriority] = useState(2);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Get products for a specific doctor
  const getDoctorProducts = (doctorId) => {
    return mappings
      .filter((m) => m.doctor === doctorId)
      .map((m) => {
        const product = products.find((p) => p._id === m.product);
        return product ? { ...product, assignmentId: m.assignmentId, priority: m.priority } : null;
      })
      .filter(Boolean);
  };

  // Get available products (not yet assigned to selected doctor)
  const getAvailableProducts = () => {
    if (!selectedDoctor) return [];
    const assignedProductIds = getDoctorProducts(selectedDoctor._id).map(p => p._id);
    return products.filter(p => !assignedProductIds.includes(p._id));
  };

  // Filter doctors by search
  const filteredDoctors = useMemo(() => {
    if (!doctorSearch) return doctors;
    const query = doctorSearch.toLowerCase();
    return doctors.filter(d =>
      d.name?.toLowerCase().includes(query) ||
      d.specialization?.toLowerCase().includes(query)
    );
  }, [doctors, doctorSearch]);

  // Handle adding product
  const handleMapProduct = async () => {
    if (selectedDoctor && selectedProduct) {
      setIsAdding(true);
      try {
        await onMapProduct?.(selectedDoctor._id, selectedProduct, selectedPriority);
        setSelectedProduct('');
        setSelectedPriority(2);
      } finally {
        setIsAdding(false);
      }
    }
  };

  // Get priority label
  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 1: return 'high';
      case 2: return 'medium';
      case 3: return 'low';
      default: return 'medium';
    }
  };

  const doctorProducts = selectedDoctor ? getDoctorProducts(selectedDoctor._id) : [];
  const availableProducts = getAvailableProducts();

  return (
    <div className="doctor-product-mapping">
      <style>{doctorProductMappingStyles}</style>

      <div className="mapping-header">
        <h2>VIP Client Product Mapping</h2>
      </div>

      <div className="mapping-container">
        {/* VIP Client List Panel */}
        <div className="doctor-list-panel">
          <h3>Select VIP Client</h3>
          <input
            type="text"
            className="doctor-search"
            placeholder="Search VIP Clients..."
            value={doctorSearch}
            onChange={e => setDoctorSearch(e.target.value)}
          />

          {filteredDoctors.length > 0 ? (
            <ul className="doctor-select-list">
              {filteredDoctors.map((doctor) => {
                const productCount = getDoctorProducts(doctor._id).length;
                return (
                  <li
                    key={doctor._id}
                    className={`doctor-item ${
                      selectedDoctor?._id === doctor._id ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedDoctor(doctor)}
                  >
                    <span className="doctor-name">{doctor.name}</span>
                    <span className="doctor-specialization">
                      {doctor.specialization || 'General'}
                    </span>
                    <span className="product-count">
                      {productCount} product{productCount !== 1 ? 's' : ''} assigned
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="no-doctors">
              {doctorSearch ? 'No VIP Clients match your search' : 'No VIP Clients available'}
            </div>
          )}
        </div>

        {/* Product Mapping Panel */}
        {selectedDoctor ? (
          <div className="product-mapping-panel">
            <div className="panel-header">
              <div className="doctor-info">
                <h3>{selectedDoctor.name}</h3>
                <span className="specialization-badge">
                  {selectedDoctor.specialization || 'General'}
                </span>
              </div>
            </div>

            {/* Add Product Section */}
            <div className="add-product-section">
              <h4>Assign New Product</h4>
              <div className="add-product-row">
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  disabled={availableProducts.length === 0}
                >
                  <option value="">
                    {availableProducts.length === 0
                      ? 'All products assigned'
                      : 'Select a product...'}
                  </option>
                  {availableProducts.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name} {product.category ? `(${product.category})` : ''}
                    </option>
                  ))}
                </select>
                <select
                  className="priority-select"
                  value={selectedPriority}
                  onChange={e => setSelectedPriority(Number(e.target.value))}
                >
                  <option value={1}>High</option>
                  <option value={2}>Medium</option>
                  <option value={3}>Low</option>
                </select>
                <button
                  className="btn btn-primary"
                  onClick={handleMapProduct}
                  disabled={!selectedProduct || isAdding}
                >
                  {isAdding ? 'Adding...' : 'Add Product'}
                </button>
              </div>
            </div>

            {/* Mapped Products */}
            <div className="mapped-products-header">
              <h4>Assigned Products</h4>
              <span className="product-count-badge">
                {doctorProducts.length} product{doctorProducts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {doctorProducts.length > 0 ? (
              <ul className="mapped-products">
                {doctorProducts.map((product) => (
                  <li key={product._id} className="mapped-product-item">
                    <div className="product-info">
                      <span className="product-name">{product.name}</span>
                      <span className="product-category">
                        {product.category || 'Uncategorized'}
                      </span>
                    </div>
                    <div className="product-actions">
                      {product.priority && (
                        <span className={`priority-badge ${getPriorityLabel(product.priority)}`}>
                          {getPriorityLabel(product.priority).charAt(0).toUpperCase() +
                           getPriorityLabel(product.priority).slice(1)}
                        </span>
                      )}
                      <button
                        className="btn-remove"
                        onClick={() => onUnmapProduct?.(selectedDoctor._id, product._id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="no-products">
                <div className="no-products-icon">📦</div>
                <p>No products assigned to this VIP Client yet</p>
              </div>
            )}
          </div>
        ) : (
          <div className="product-mapping-panel">
            <div className="select-doctor-prompt">
              <div className="select-doctor-prompt-icon">👈</div>
              <h3>Select a VIP Client</h3>
              <p>Choose a VIP Client from the list to manage their product assignments</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorProductMapping;
