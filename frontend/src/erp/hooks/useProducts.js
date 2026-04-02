import { useState, useEffect, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Fetch ProductMaster for dropdowns. Caches products for the session.
 */
let cachedProducts = null;

export default function useProducts() {
  const api = useErpApi();
  const [products, setProducts] = useState(cachedProducts || []);

  const fetchProducts = useCallback(async (force = false) => {
    if (cachedProducts && !force) {
      setProducts(cachedProducts);
      return cachedProducts;
    }
    const res = await api.get('/products');
    const data = res?.data || [];
    cachedProducts = data;
    setProducts(data);
    return data;
  }, [api]);

  useEffect(() => {
    if (!cachedProducts) fetchProducts();
  }, [fetchProducts]);

  return { products, loading: api.loading, error: api.error, refresh: () => fetchProducts(true) };
}
