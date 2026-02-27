/**
 * ProductDetailModal - Full-screen product detail for tablet presentation
 *
 * BDMs use their tablet to present product details to VIP Clients during visits.
 * This modal displays a large product image + full details, optimized for tablet viewing.
 *
 * Props:
 * - product: product object to display
 * - onClose: close callback
 * - products (optional): array of products for prev/next navigation
 * - currentIndex (optional): current position in products array
 */

import { useState, useEffect, useCallback } from 'react';

const modalStyles = `
  .pdm-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: pdm-fade-in 0.2s ease;
  }

  @keyframes pdm-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .pdm-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    max-width: 100vw;
    max-height: 100vh;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .pdm-close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .pdm-close-btn:hover {
    background: rgba(0, 0, 0, 0.8);
  }

  .pdm-body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .pdm-image-section {
    position: relative;
    width: 100%;
    height: 50vh;
    min-height: 280px;
    background: #f8fafc;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .pdm-image-section img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    padding: 20px;
  }

  .pdm-no-image {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #9ca3af;
  }

  .pdm-no-image-icon {
    font-size: 64px;
    line-height: 1;
  }

  .pdm-no-image-text {
    font-size: 16px;
  }

  .pdm-nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    font-size: 22px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    z-index: 5;
  }

  .pdm-nav-btn:hover {
    background: rgba(0, 0, 0, 0.7);
  }

  .pdm-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .pdm-nav-prev {
    left: 12px;
  }

  .pdm-nav-next {
    right: 12px;
  }

  .pdm-content {
    padding: 24px;
  }

  .pdm-title-row {
    margin-bottom: 16px;
  }

  .pdm-product-name {
    margin: 0 0 4px 0;
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
  }

  .pdm-generic-name {
    margin: 0;
    font-size: 16px;
    color: #6b7280;
    font-style: italic;
  }

  .pdm-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
  }

  .pdm-meta-badge {
    display: inline-block;
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
  }

  .pdm-meta-badge.dosage {
    background: #eff6ff;
    color: #1d4ed8;
  }

  .pdm-meta-badge.category {
    background: #f0fdf4;
    color: #16a34a;
  }

  .pdm-meta-badge.price {
    background: #fef3c7;
    color: #92400e;
  }

  .pdm-info-section {
    margin-bottom: 20px;
  }

  .pdm-info-section:last-child {
    margin-bottom: 0;
  }

  .pdm-info-label {
    font-size: 13px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .pdm-info-text {
    font-size: 18px;
    color: #374151;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .pdm-counter {
    text-align: center;
    padding: 8px;
    font-size: 13px;
    color: #9ca3af;
    border-top: 1px solid #f3f4f6;
  }

  /* Landscape tablet: side-by-side layout */
  @media (min-width: 768px) and (orientation: landscape),
         (min-width: 1024px) {
    .pdm-body {
      display: flex;
      flex-direction: row;
      overflow: hidden;
    }

    .pdm-image-section {
      width: 50%;
      height: 100%;
      min-height: unset;
      flex-shrink: 0;
    }

    .pdm-content-wrapper {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .pdm-content {
      padding: 32px;
    }

    .pdm-product-name {
      font-size: 28px;
    }

    .pdm-info-text {
      font-size: 18px;
    }
  }

  /* Small phone: compact layout */
  @media (max-width: 480px) {
    .pdm-image-section {
      height: 35vh;
      min-height: 200px;
    }

    .pdm-content {
      padding: 16px;
    }

    .pdm-product-name {
      font-size: 20px;
    }

    .pdm-info-text {
      font-size: 16px;
    }
  }
`;

const ProductDetailModal = ({ product, onClose, products, currentIndex }) => {
  const [activeIndex, setActiveIndex] = useState(currentIndex ?? 0);

  const hasNavigation = products && products.length > 1;
  const displayProduct = hasNavigation ? products[activeIndex] : product;

  const canGoPrev = hasNavigation && activeIndex > 0;
  const canGoNext = hasNavigation && activeIndex < products.length - 1;

  const goToPrev = useCallback(() => {
    if (canGoPrev) setActiveIndex((i) => i - 1);
  }, [canGoPrev]);

  const goToNext = useCallback(() => {
    if (canGoNext) setActiveIndex((i) => i + 1);
  }, [canGoNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToPrev, goToNext]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!displayProduct) return null;

  const name = displayProduct.name || 'Unknown Product';
  const genericName = displayProduct.genericName;
  const dosage = displayProduct.dosage;
  const category = displayProduct.category;
  const price = displayProduct.price;
  const image = displayProduct.image;
  const description = displayProduct.description;
  const usage = displayProduct.usage;
  const safety = displayProduct.safety;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="pdm-overlay" onClick={handleOverlayClick}>
      <style>{modalStyles}</style>
      <div className="pdm-container" onClick={(e) => e.stopPropagation()}>
        <button className="pdm-close-btn" onClick={onClose} title="Close">
          &times;
        </button>

        <div className="pdm-body">
          {/* Image Section */}
          <div className="pdm-image-section">
            {hasNavigation && (
              <button
                className="pdm-nav-btn pdm-nav-prev"
                onClick={goToPrev}
                disabled={!canGoPrev}
                title="Previous product"
              >
                &#8249;
              </button>
            )}

            {image ? (
              <img src={image} alt={name} />
            ) : (
              <div className="pdm-no-image">
                <span className="pdm-no-image-icon">&#128247;</span>
                <span className="pdm-no-image-text">No product image</span>
              </div>
            )}

            {hasNavigation && (
              <button
                className="pdm-nav-btn pdm-nav-next"
                onClick={goToNext}
                disabled={!canGoNext}
                title="Next product"
              >
                &#8250;
              </button>
            )}
          </div>

          {/* Content Section */}
          <div className="pdm-content-wrapper">
            <div className="pdm-content">
              <div className="pdm-title-row">
                <h2 className="pdm-product-name">{name}</h2>
                {genericName && (
                  <p className="pdm-generic-name">{genericName}</p>
                )}
              </div>

              <div className="pdm-meta-row">
                {dosage && (
                  <span className="pdm-meta-badge dosage">{dosage}</span>
                )}
                {category && (
                  <span className="pdm-meta-badge category">{category}</span>
                )}
                {price != null && (
                  <span className="pdm-meta-badge price">
                    &#8369;{Number(price).toLocaleString()}
                  </span>
                )}
              </div>

              {description && (
                <div className="pdm-info-section">
                  <div className="pdm-info-label">Description</div>
                  <div className="pdm-info-text">{description}</div>
                </div>
              )}

              {usage && (
                <div className="pdm-info-section">
                  <div className="pdm-info-label">Usage</div>
                  <div className="pdm-info-text">{usage}</div>
                </div>
              )}

              {safety && (
                <div className="pdm-info-section">
                  <div className="pdm-info-label">Safety Information</div>
                  <div className="pdm-info-text">{safety}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {hasNavigation && (
          <div className="pdm-counter">
            {activeIndex + 1} of {products.length}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetailModal;
