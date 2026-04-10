import { useState, useEffect, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Fetch ProductMaster for dropdowns. Caches products for the session.
 */
let cachedProducts = null;

export default function useProducts() {
  const { get, loading, error } = useErpApi();
  const [products, setProducts] = useState(cachedProducts || []);

  const fetchProducts = useCallback(async (force = false) => {
    if (cachedProducts && !force) {
      setProducts(cachedProducts);
      return cachedProducts;
    }
    const res = await get('/products', { params: { limit: 0 } });
    const data = res?.data || [];
    cachedProducts = data;
    setProducts(data);
    return data;
  }, [get]);

  useEffect(() => {
    if (!cachedProducts) fetchProducts();
  }, [fetchProducts]);

  return { products, loading, error, refresh: () => fetchProducts(true) };
}
