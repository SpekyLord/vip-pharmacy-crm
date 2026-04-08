import { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from './AuthContext';
import api from '../services/api';
import { setWorkingEntityHeader } from '../services/api';

const STORAGE_KEY = 'vip_working_entity_id';

export const EntityContext = createContext(null);

export const EntityProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [entities, setEntities] = useState([]);
  const [workingEntityId, setWorkingEntityIdRaw] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Multi-entity: president/ceo OR users with entity_ids > 1
  const isMultiEntity = user?.role === 'president' || user?.role === 'ceo'
    || (Array.isArray(user?.entity_ids) && user.entity_ids.length > 1);

  // Fetch entities for multi-entity users; for others just use their fixed entity_id
  useEffect(() => {
    if (!user) {
      setWorkingEntityIdRaw(null);
      setWorkingEntityHeader(null);
      setLoaded(true);
      return;
    }

    if (!isMultiEntity) {
      const eid = user.entity_id?._id || user.entity_id || null;
      setWorkingEntityIdRaw(eid);
      setWorkingEntityHeader(eid);
      setLoaded(true);
      return;
    }

    // Multi-entity user: president fetches all entities, others fetch their allowed list
    const endpoint = (user.role === 'president' || user.role === 'ceo')
      ? '/erp/transfers/entities'
      : '/users/my-entities';

    api.get(endpoint)
      .then(res => {
        const list = res.data?.data || res.data || [];
        setEntities(list);

        const stored = sessionStorage.getItem(STORAGE_KEY);
        const valid = list.find(e => e._id === stored);
        const selected = valid ? stored : list[0]?._id || null;

        setWorkingEntityIdRaw(selected);
        setWorkingEntityHeader(selected);
        if (selected) sessionStorage.setItem(STORAGE_KEY, selected);
        setLoaded(true);
      })
      .catch(() => {
        // Fallback to user's own entity_id if entity fetch fails
        const eid = user.entity_id?._id || user.entity_id || null;
        setWorkingEntityIdRaw(eid);
        setWorkingEntityHeader(eid);
        setLoaded(true);
      });
  }, [user, isMultiEntity]);

  const setWorkingEntityId = useCallback((id) => {
    setWorkingEntityIdRaw(id);
    setWorkingEntityHeader(id);
    if (id) {
      sessionStorage.setItem(STORAGE_KEY, id);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  return (
    <EntityContext.Provider value={{ entities, workingEntityId, setWorkingEntityId, isMultiEntity, loaded }}>
      {children}
    </EntityContext.Provider>
  );
};
