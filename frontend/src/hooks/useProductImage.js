/**
 * useProductImage Hook — Resolves product image with offline fallback
 *
 * Problem: Product images use S3 signed URLs that expire in 1 hour (SEC-007).
 *          If the BDM is offline, the signed URL is useless.
 *
 * Solution: When online, render the S3 URL directly (fast, CDN-cached).
 *           On <img> error OR when offline, fall back to the IndexedDB blob cache.
 *           The blob was fetched and stored while the BDM was still online.
 *
 * Usage:
 *   const { src, loading } = useProductImage(product._id, product.image);
 *   <img src={src} />
 */
import { useState, useEffect, useRef } from 'react';
import { offlineStore } from '../utils/offlineStore';

export function useProductImage(productId, s3Url) {
  const [src, setSrc] = useState(s3Url || null);
  const [loading, setLoading] = useState(false);
  const objectUrlRef = useRef(null);

  // Cleanup object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // When offline or no S3 URL, try IndexedDB immediately
  useEffect(() => {
    if (!productId) return;

    if (!navigator.onLine || !s3Url) {
      setLoading(true);
      offlineStore.getProductImageUrl(productId).then((blobUrl) => {
        if (blobUrl) {
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = blobUrl;
          setSrc(blobUrl);
        }
        setLoading(false);
      });
    } else {
      setSrc(s3Url);
    }
  }, [productId, s3Url]);

  /**
   * Call this from <img onError> to fall back to IndexedDB blob.
   * Handles the case where the S3 signed URL has expired.
   */
  const handleError = async () => {
    if (!productId) return;
    try {
      const blobUrl = await offlineStore.getProductImageUrl(productId);
      if (blobUrl) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = blobUrl;
        setSrc(blobUrl);
      } else {
        setSrc(null); // No cached version available
      }
    } catch {
      setSrc(null);
    }
  };

  return { src, loading, handleError };
}

export default useProductImage;
