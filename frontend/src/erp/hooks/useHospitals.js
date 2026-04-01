import { useState, useEffect, useCallback } from 'react';
import useErpApi from './useErpApi';

/**
 * Fetch hospitals for dropdowns. Caches for the session.
 */
let cachedHospitals = null;

export default function useHospitals() {
  const api = useErpApi();
  const [hospitals, setHospitals] = useState(cachedHospitals || []);

  const fetchHospitals = useCallback(async (force = false) => {
    if (cachedHospitals && !force) {
      setHospitals(cachedHospitals);
      return cachedHospitals;
    }
    const res = await api.get('/hospitals');
    const data = res?.data || [];
    cachedHospitals = data;
    setHospitals(data);
    return data;
  }, [api]);

  useEffect(() => {
    if (!cachedHospitals) fetchHospitals();
  }, [fetchHospitals]);

  return { hospitals, loading: api.loading, error: api.error, refresh: () => fetchHospitals(true) };
}
