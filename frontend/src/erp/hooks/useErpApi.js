import { useState, useCallback } from 'react';
import api from '../../services/api';

/**
 * Hook for ERP API calls with loading/error state.
 * Prefixes all paths with /erp/.
 */
export default function useErpApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (method, path, data = null, config = {}) => {
    const url = path.startsWith('/erp/') ? path : `/erp${path}`;
    setLoading(true);
    setError(null);
    try {
      const res = await api({ method, url, data, ...config });
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'API error';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback((path, config) => request('get', path, null, config), [request]);
  const post = useCallback((path, data, config) => request('post', path, data, config), [request]);
  const put = useCallback((path, data, config) => request('put', path, data, config), [request]);
  const patch = useCallback((path, data, config) => request('patch', path, data, config), [request]);
  const del = useCallback((path, config) => request('delete', path, null, config), [request]);

  return { get, post, put, patch, del, loading, error };
}
