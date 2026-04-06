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

export default useLookupOptions;
