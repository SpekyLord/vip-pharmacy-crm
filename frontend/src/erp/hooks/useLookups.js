import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache = {}; // { [category]: { data, ts } }

/**
 * Hook to fetch and cache lookup values by category.
 * Replaces hardcoded frontend arrays with database-driven lookups.
 *
 * Usage:
 *   const { options, loading } = useLookupOptions('EXPENSE_CATEGORY');
 *   // options = [{ code: 'TRANSPORTATION', label: 'Transportation' }, ...]
 *
 * Falls back to empty array if API fails or no data exists.
 */
export function useLookupOptions(category) {
  const [options, setOptions] = useState(cache[category]?.data || []);
  const [loading, setLoading] = useState(!cache[category]?.data);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    if (!category) return;

    // Return cached if fresh
    if (cache[category] && Date.now() - cache[category].ts < CACHE_TTL) {
      setOptions(cache[category].data);
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
        cache[category] = { data, ts: Date.now() };
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
  }, [category]);

  return { options, loading };
}

/**
 * Invalidate cache for a specific category or all categories.
 */
export function invalidateLookupCache(category) {
  if (category) {
    delete cache[category];
  } else {
    Object.keys(cache).forEach(k => delete cache[k]);
  }
}

export default useLookupOptions;
