import { useState, useEffect, useRef, useContext } from 'react';
import api from '../../services/api';
import { EntityContext } from '../../context/EntityContext';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = {}; // { [entityId:category]: { data, ts } }

/**
 * Hook to fetch and cache lookup values by category.
 * Replaces hardcoded frontend arrays with database-driven lookups.
 * Cache is entity-aware — switching entities fetches fresh data.
 *
 * Usage:
 *   const { options, loading } = useLookupOptions('EXPENSE_CATEGORY');
 *   // options = [{ code: 'TRANSPORTATION', label: 'Transportation' }, ...]
 *
 * Falls back to empty array if API fails or no data exists.
 */
export function useLookupOptions(category) {
  const entityCtx = useContext(EntityContext);
  const entityId = entityCtx?.workingEntityId || 'default';
  const cacheKey = `${entityId}:${category}`;

  const [options, setOptions] = useState(cache[cacheKey]?.data || []);
  const [loading, setLoading] = useState(!cache[cacheKey]?.data);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!category) {
      setLoading(false);
      return;
    }

    // Return cached if fresh
    if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL) {
      setOptions(cache[cacheKey].data);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/erp/lookup-values/${category}?active_only=true`);
        const data = (res.data?.data || []).map(item => ({
          code: item.code,
          label: item.label,
          value: item.code, // convenience alias
          metadata: item.metadata
        }));
        cache[cacheKey] = { data, ts: Date.now() };
        if (mounted.current) {
          setOptions(data);
        }
      } catch {
        // Silently fall back to empty
        if (mounted.current) setOptions([]);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => { mounted.current = false; };
  }, [category, cacheKey]);

  return { options, loading };
}

/**
 * Invalidate cache for a specific category or all categories.
 * Pass entityId to scope invalidation, or omit to clear all.
 */
export function invalidateLookupCache(category, entityId) {
  if (category && entityId) {
    delete cache[`${entityId}:${category}`];
  } else if (category) {
    // Clear this category across all entities
    Object.keys(cache).forEach(k => { if (k.endsWith(`:${category}`)) delete cache[k]; });
  } else {
    Object.keys(cache).forEach(k => delete cache[k]);
  }
}

/**
 * Batch-fetch multiple lookup categories in a single API call.
 * Returns a map: { CATEGORY: [{ code, label, value, metadata }], ... }
 *
 * Usage:
 *   const { data, loading } = useLookupBatch(['CIVIL_STATUS', 'SALARY_TYPE', ...]);
 *   const CIVIL_STATUSES = data.CIVIL_STATUS?.map(o => o.code) || [];
 */
export function useLookupBatch(categories) {
  const entityCtx = useContext(EntityContext);
  const entityId = entityCtx?.workingEntityId || 'default';
  const keyStr = [...categories].sort().join(',');

  const [data, setData] = useState(() => {
    // Init from individual caches if available
    const init = {};
    for (const cat of categories) {
      const ck = `${entityId}:${cat}`;
      if (cache[ck]?.data) init[cat] = cache[ck].data;
    }
    return init;
  });
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!categories.length) { setLoading(false); return; }

    // Check if ALL categories are cached and fresh
    const now = Date.now();
    const allCached = categories.every(cat => {
      const ck = `${entityId}:${cat}`;
      return cache[ck] && now - cache[ck].ts < CACHE_TTL;
    });

    if (allCached) {
      const fromCache = {};
      for (const cat of categories) fromCache[cat] = cache[`${entityId}:${cat}`].data;
      setData(fromCache);
      setLoading(false);
      return;
    }

    // Fetch uncached categories in one call
    const uncached = categories.filter(cat => {
      const ck = `${entityId}:${cat}`;
      return !cache[ck] || now - cache[ck].ts >= CACHE_TTL;
    });

    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/erp/lookup-values/batch?categories=${uncached.join(',')}&active_only=true`);
        const serverData = res.data?.data || {};

        // Update individual caches
        for (const [cat, items] of Object.entries(serverData)) {
          const mapped = (items || []).map(item => ({
            code: item.code, label: item.label, value: item.code, metadata: item.metadata,
          }));
          cache[`${entityId}:${cat}`] = { data: mapped, ts: Date.now() };
        }

        // Build full result from cache (includes already-cached + freshly-fetched)
        if (mounted.current) {
          const result = {};
          for (const cat of categories) result[cat] = cache[`${entityId}:${cat}`]?.data || [];
          setData(result);
        }
      } catch {
        if (mounted.current) {
          const fallback = {};
          for (const cat of categories) fallback[cat] = cache[`${entityId}:${cat}`]?.data || [];
          setData(fallback);
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => { mounted.current = false; };
  }, [keyStr, entityId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}

export default useLookupOptions;
