import { useState, useEffect, useCallback } from 'react';
import useErpApi from './useErpApi';

let cachedEntities = null;

export default function useEntities() {
  const api = useErpApi();
  const [entities, setEntities] = useState(cachedEntities || []);

  const fetchEntities = useCallback(async (force = false) => {
    if (cachedEntities && !force) {
      setEntities(cachedEntities);
      return cachedEntities;
    }
    const res = await api.get('/transfers/entities');
    const data = res?.data || [];
    cachedEntities = data;
    setEntities(data);
    return data;
  }, [api]);

  useEffect(() => {
    if (!cachedEntities) fetchEntities();
  }, [fetchEntities]);

  const getEntityById = useCallback((id) => {
    return entities.find(e => e._id === id) || null;
  }, [entities]);

  return { entities, loading: api.loading, error: api.error, refresh: () => fetchEntities(true), getEntityById };
}
