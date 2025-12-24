/**
 * ProductManagement Component
 *
 * Admin component for managing products:
 * - CRUD operations for products
 * - Image upload
 * - Category management
 * - Price updates
 */

import { useState } from 'react';

const ProductManagement = ({ products = [], onSave, onDelete, loading = false }) => {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = (product) => {
    setSelectedProduct(product);
    setIsEditing(true);
  };

  const handleCreate = () => {
    setSelectedProduct({
      name: '',
      genericName: '',
      category: '',
      description: '',
      dosage: '',
      price: 0,
      manufacturer: '',
      image: '',
      isActive: true,
    });
    setIsEditing(true);
  };

  const handleSave = (productData) => {
    onSave?.(productData);
    setIsEditing(false);
    setSelectedProduct(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedProduct(null);
  };

  return (
    <div className="product-management">
      <div className="management-header">
        <h2>Product Management</h2>
        <button onClick={handleCreate} className="btn btn-primary">
          + Add Product
        </button>
      </div>

      {isEditing ? (
        <div className="product-form">
          {/* Form fields would go here */}
          <p>Product form for: {selectedProduct?.name || 'New Product'}</p>
          <button onClick={() => handleSave(selectedProduct)} disabled={loading}>
            Save
          </button>
          <button onClick={handleCancel}>Cancel</button>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Generic Name</th>
              <th>Category</th>
              <th>Price</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product._id}>
                <td>{product.name}</td>
                <td>{product.genericName}</td>
                <td>{product.category}</td>
                <td>${product.price?.toFixed(2)}</td>
                <td>
                  <span className={product.isActive ? 'status-active' : 'status-inactive'}>
                    {product.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button onClick={() => handleEdit(product)}>Edit</button>
                  <button onClick={() => onDelete?.(product._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ProductManagement;
