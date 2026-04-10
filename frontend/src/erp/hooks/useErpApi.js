import { useState, useCallback, useMemo } from 'react';
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
      // Use method-specific Axios calls to guarantee the HTTP method is correct
      // (api.request() can lose the method during token-refresh retries)
      let res;
      switch (method) {
        case 'get':    res = await api.get(url, config); break;
        case 'post':   res = await api.post(url, data, config); break;
        case 'put':    res = await api.put(url, data, config); break;
        case 'patch':  res = await api.patch(url, data, config); break;
        case 'delete': res = await api.delete(url, config); break;
        default:       res = await api.request({ method, url, data, ...config });
      }
      return res.data;
    } catch (err) {
      console.error('[useErpApi] ERROR on', method.toUpperCase(), url, {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message
      });
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

  // Return a stable object ref for the methods so hooks depending on `api` don't
  // get new callback references every render.  loading/error are attached directly
  // so consumers can still read them, but they are NOT part of the memo deps — this
  // prevents useCallback deps like [api] from changing on every loading toggle.
  const methods = useMemo(() => ({ get, post, put, patch, del }), [get, post, put, patch, del]);
  methods.loading = loading;
  methods.error = error;
  return methods;
}
