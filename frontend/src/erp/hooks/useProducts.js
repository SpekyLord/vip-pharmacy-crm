import { useState, useEffect, useCallback } from 'react';
import useErpApi from './useErpApi';
import useWorkingEntity from '../../hooks/useWorkingEntity';

/**
 * Fetch ProductMaster for dropdowns.
 * Cache is entity-aware and revalidates on mount/focus so product changes from
 * another device do not remain stale for the whole browser session.
 */
const PRODUCTS_CHANGED_EVENT = 'erp:products-changed';
const productCache = {};

const getCacheKey = (entityId) => entityId || 'default';

export function invalidateProductCache(entityId) {
  if (entityId) {
    delete productCache[getCacheKey(entityId)];
    return;
  }

  Object.keys(productCache).forEach((key) => delete productCache[key]);
}

export function broadcastProductsChanged(entityId) {
  invalidateProductCache(entityId);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRODUCTS_CHANGED_EVENT, {
      detail: { entityId: entityId || null },
    }));
  }
}

export default function useProducts() {
  const { workingEntityId, loaded: entityLoaded, isMultiEntity } = useWorkingEntity();
  const { get, loading, error } = useErpApi();
  const entityReady = entityLoaded && (!isMultiEntity || !!workingEntityId);
  const cacheKey = getCacheKey(workingEntityId);
  const [products, setProducts] = useState(productCache[cacheKey]?.data || []);

  const fetchProducts = useCallback(async (force = false) => {
    if (!entityReady) {
      setProducts([]);
      return [];
    }

    if (productCache[cacheKey] && !force) {
      setProducts(productCache[cacheKey].data);
      return productCache[cacheKey].data;
    }

    const res = await get('/products', { params: { limit: 0 } });
    const data = res?.data || [];
    productCache[cacheKey] = { data, ts: Date.now() };
    setProducts(data);
    return data;
  }, [cacheKey, entityReady, get]);

  useEffect(() => {
    if (!entityReady) {
      setProducts([]);
      return;
    }

    setProducts(productCache[cacheKey]?.data || []);
    fetchProducts(true).catch(() => {});
  }, [cacheKey, entityReady, fetchProducts]);

  useEffect(() => {
    if (!entityReady) return undefined;

    const revalidate = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchProducts(true).catch(() => {});
    };

    const handleProductsChanged = (event) => {
      const changedEntityId = event.detail?.entityId || null;
      if (!changedEntityId || changedEntityId === workingEntityId) {
        revalidate();
      }
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener(PRODUCTS_CHANGED_EVENT, handleProductsChanged);

    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, handleProductsChanged);
    };
  }, [entityReady, fetchProducts, workingEntityId]);

  return {
    products,
    loading: entityReady ? loading : false,
    error,
    refresh: () => fetchProducts(true),
  };
}
