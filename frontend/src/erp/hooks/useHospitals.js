import { useState, useEffect, useRef } from 'react';
import useErpApi from './useErpApi';

/**
 * Fetch hospitals for dropdowns. Caches for the session.
 */
let cachedHospitals = null;

export default function useHospitals() {
  const api = useErpApi();
  const [hospitals, setHospitals] = useState(cachedHospitals || []);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (cachedHospitals || fetchedRef.current) {
      if (cachedHospitals) setHospitals(cachedHospitals);
      return;
    }
    fetchedRef.current = true;

    api.get('/hospitals').then(res => {
      const data = res?.data || [];
      cachedHospitals = data;
      setHospitals(data);
    }).catch(() => {
      // fail silently — don't retry on error
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    cachedHospitals = null;
    fetchedRef.current = false;
    return api.get('/hospitals').then(res => {
      const data = res?.data || [];
      cachedHospitals = data;
      setHospitals(data);
      return data;
    });
  };

  return { hospitals, loading: api.loading, error: api.error, refresh };
}
