import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cachedSettings = null;
let cacheTimestamp = 0;

/**
 * Hook to fetch and cache ERP settings.
 * Settings are cached globally (shared across components) with 5-minute TTL.
 */
export default function useSettings() {
  const [settings, setSettings] = useState(cachedSettings);
  const [loading, setLoading] = useState(!cachedSettings);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const fetchSettings = async () => {
      // Return cached if still fresh
      if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
        setSettings(cachedSettings);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await api.get('/erp/settings');
        if (mounted.current) {
          cachedSettings = res.data.data;
          cacheTimestamp = Date.now();
          setSettings(cachedSettings);
          setError(null);
        }
      } catch (err) {
        if (mounted.current) {
          setError(err.response?.data?.message || 'Failed to load settings');
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    fetchSettings();

    return () => { mounted.current = false; };
  }, []);

  // Force refresh (invalidates cache)
  const refresh = async () => {
    cachedSettings = null;
    cacheTimestamp = 0;
    setLoading(true);
    try {
      const res = await api.get('/erp/settings');
      cachedSettings = res.data.data;
      cacheTimestamp = Date.now();
      setSettings(cachedSettings);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  return { settings, loading, error, refresh };
}
