/**
 * ProductImage — Offline-safe product image component
 *
 * Renders a product image that:
 *   1. Uses the S3 signed URL when online and URL is valid
 *   2. Falls back to IndexedDB blob cache when offline or URL expired
 *   3. Shows a placeholder icon when no image is available
 *
 * This solves the S3 signed URL expiry problem (SEC-007: 1-hour expiry).
 * Image bytes are cached in IndexedDB keyed by product._id, not by URL.
 */
import { Pill } from 'lucide-react';
import { useProductImage } from '../../hooks/useProductImage';

const ProductImage = ({ productId, imageUrl, alt, className, placeholderClassName }) => {
  const { src, handleError } = useProductImage(productId, imageUrl);

  if (!src) {
    return (
      <div className={placeholderClassName || className} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f9fafb', borderRadius: '8px',
      }}>
        <Pill size={28} style={{ color: '#9ca3af' }} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || 'Product'}
      className={className}
      onError={handleError}
    />
  );
};

export default ProductImage;
