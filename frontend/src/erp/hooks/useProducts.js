import { useState, useEffect, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Fetch ProductMaster for dropdowns. Caches products for the session.
 * Passes catalog=true to bypass BDM warehouse filter (needed for PO creation, etc.)
 */
let cachedProducts = null;

export default function useProducts() {
  const { get, loading, error } = useErpApi();
  const [products, setProducts] = useState(cachedProducts || []);
  const [fetchError, setFetchError] = useState(null);

  const fetchProducts = useCallback(async (force = false) => {
    if (cachedProducts && !force) {
      setProducts(cachedProducts);
      return cachedProducts;
    }
    try {
      setFetchError(null);
      const res = await get('/products', { params: { limit: 0, catalog: 'true' } });
      const data = res?.data || [];
      cachedProducts = data;
      setProducts(data);
      return data;
    } catch (err) {
      console.error('[useProducts] Failed to load products:', err?.response?.status, err?.message);
      setFetchError(err?.response?.data?.message || err?.message || 'Failed to load products');
      return [];
    }
  }, [get]);

  useEffect(() => {
    if (!cachedProducts) fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error: error || fetchError, refresh: () => fetchProducts(true) };
}
