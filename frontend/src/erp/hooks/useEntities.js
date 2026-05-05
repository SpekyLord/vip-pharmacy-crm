import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import useErpApi from './useErpApi';

let cachedEntities = null;

export default function useEntities() {
  const { get, loading, error } = useErpApi();
  const { user } = useAuth();
  const [entities, setEntities] = useState(cachedEntities || []);

  // /transfers/entities is gated by inventory.transfers sub-permission. BDMs
  // (staff) without that grant get 403, which produces console-noise on every
  // page mount that uses this hook. Skip the network call when the user can't
  // possibly succeed; fall back to a single-entity stub built from auth state
  // so getEntityById() can still resolve the user's own entity for display.
  const fetchEntities = useCallback(async (force = false) => {
    if (cachedEntities && !force) {
      setEntities(cachedEntities);
      return cachedEntities;
    }
    const u = user;
    const allowedEntityIds = (u?.entity_ids?.length ? u.entity_ids : [u?.entity_id]).filter(Boolean);
    const isMultiEntity = (u?.entity_ids?.length || 0) > 1
      || ['president', 'ceo', 'admin', 'finance'].includes(u?.role)
      || !!u?.erp_access?.sub_permissions?.inventory?.transfers;
    if (!isMultiEntity) {
      // Single-entity user with no transfers sub-perm — synthesize from auth.
      // Display label may be missing (entity name lives on Entity model), but
      // _id matching is what callers like OpeningArList use to scope rows.
      const stub = allowedEntityIds.map(id => ({ _id: String(id) }));
      cachedEntities = stub;
      setEntities(stub);
      return stub;
    }
    const res = await get('/transfers/entities');
    const data = res?.data || [];
    cachedEntities = data;
    setEntities(data);
    return data;
  }, [get, user]);

  useEffect(() => {
    if (!cachedEntities) fetchEntities();
  }, [fetchEntities]);

  const getEntityById = useCallback((id) => {
    return entities.find(e => e._id === id) || null;
  }, [entities]);

  return { entities, loading, error, refresh: () => fetchEntities(true), getEntityById };
}
