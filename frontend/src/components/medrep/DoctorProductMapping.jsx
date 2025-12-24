/**
 * DoctorProductMapping Component
 *
 * Med Rep component for:
 * - Mapping products to doctors
 * - Viewing doctor-product relationships
 * - Tracking product discussions per doctor
 * - Recommendation history
 */

import { useState } from 'react';

const DoctorProductMapping = ({
  doctors = [],
  products = [],
  mappings = [],
  onMapProduct,
  onUnmapProduct,
}) => {
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState('');

  const getDoctorProducts = (doctorId) => {
    return mappings
      .filter((m) => m.doctor === doctorId)
      .map((m) => products.find((p) => p._id === m.product))
      .filter(Boolean);
  };

  const handleMapProduct = () => {
    if (selectedDoctor && selectedProduct) {
      onMapProduct?.(selectedDoctor._id, selectedProduct);
      setSelectedProduct('');
    }
  };

  return (
    <div className="doctor-product-mapping">
      <h2>Doctor Product Mapping</h2>

      <div className="mapping-container">
        <div className="doctor-list-panel">
          <h3>Select Doctor</h3>
          <ul className="doctor-select-list">
            {doctors.map((doctor) => (
              <li
                key={doctor._id}
                className={`doctor-item ${
                  selectedDoctor?._id === doctor._id ? 'selected' : ''
                }`}
                onClick={() => setSelectedDoctor(doctor)}
              >
                <span className="doctor-name">{doctor.name}</span>
                <span className="doctor-specialization">
                  {doctor.specialization}
                </span>
                <span className="product-count">
                  {getDoctorProducts(doctor._id).length} products
                </span>
              </li>
            ))}
          </ul>
        </div>

        {selectedDoctor && (
          <div className="product-mapping-panel">
            <h3>Products for {selectedDoctor.name}</h3>

            <div className="add-product">
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">Select product to add</option>
                {products
                  .filter(
                    (p) =>
                      !getDoctorProducts(selectedDoctor._id).find(
                        (dp) => dp._id === p._id
                      )
                  )
                  .map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.name}
                    </option>
                  ))}
              </select>
              <button
                onClick={handleMapProduct}
                disabled={!selectedProduct}
                className="btn btn-primary"
              >
                Add Product
              </button>
            </div>

            <ul className="mapped-products">
              {getDoctorProducts(selectedDoctor._id).map((product) => (
                <li key={product._id} className="mapped-product-item">
                  <span className="product-name">{product.name}</span>
                  <span className="product-category">{product.category}</span>
                  <button
                    onClick={() =>
                      onUnmapProduct?.(selectedDoctor._id, product._id)
                    }
                    className="btn-remove"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            {getDoctorProducts(selectedDoctor._id).length === 0 && (
              <p className="no-products">No products mapped to this doctor</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DoctorProductMapping;
