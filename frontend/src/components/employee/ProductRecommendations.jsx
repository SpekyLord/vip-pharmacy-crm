/**
 * ProductRecommendations Component
 *
 * Displays recommended products for a doctor with:
 * - Product cards with images
 * - Dosage information
 * - Key talking points
 * - Quick select for visit logging
 */

const ProductRecommendations = ({ products = [], onSelectProduct }) => {
  if (products.length === 0) {
    return (
      <div className="product-recommendations empty">
        <p>No product recommendations available</p>
      </div>
    );
  }

  return (
    <div className="product-recommendations">
      <h3>Recommended Products</h3>
      <div className="product-grid">
        {products.map((product) => (
          <div
            key={product._id}
            className="product-card"
            onClick={() => onSelectProduct?.(product)}
          >
            {product.image && (
              <img
                src={product.image}
                alt={product.brand_name || product.name}
                className="product-image"
              />
            )}
            <div className="product-info">
              <h4>{product.brand_name || product.name}{product.dosage_strength ? ` ${product.dosage_strength}` : ''}</h4>
              <p className="product-generic">{product.genericName || product.generic_name || ''}</p>
              <p className="product-dosage">{product.dosage || product.unit_code || ''}</p>
              <span className="product-category">{product.category}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductRecommendations;
