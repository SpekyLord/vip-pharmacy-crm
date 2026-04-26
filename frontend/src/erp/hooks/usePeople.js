import { useCallback } from 'react';
import useErpApi from './useErpApi';

export default function usePeople() {
  const api = useErpApi();
  // Destructure the stable method refs from useErpApi's memoized methods object.
  // Consumers use these callbacks as useEffect deps (e.g. OwnerPicker); depending
  // on a fresh reference every render would cause effect re-fire storms —
  // infinite /erp/people requests that saturate the browser's concurrent-request
  // cap and stack up 30s axios timeouts. Destructuring (vs api.get in the dep
  // array) also satisfies react-hooks/exhaustive-deps, which can't see through
  // member-expression deps.
  const { get, post, put, del } = api;

  const getPeopleList = useCallback((params) => get('/people', { params }), [get]);
  const getAsUsers = useCallback((params) => get('/people/as-users', { params }), [get]);
  const getPersonById = useCallback((id) => get(`/people/${id}`), [get]);
  const createPerson = useCallback((data) => post('/people', data), [post]);
  const createPersonUnified = useCallback((data) => post('/people/create-with-login', data), [post]);
  const createLoginForPerson = useCallback((personId, data) => post(`/people/${personId}/create-login`, data), [post]);
  const disableLogin = useCallback((personId) => post(`/people/${personId}/disable-login`), [post]);
  const enableLogin = useCallback((personId) => post(`/people/${personId}/enable-login`), [post]);
  const unlinkLogin = useCallback((personId) => post(`/people/${personId}/unlink-login`), [post]);
  const changeSystemRole = useCallback((personId, role) => post(`/people/${personId}/change-role`, { role }), [post]);
  const getLegacyRoleCounts = useCallback(() => get('/people/legacy-role-counts'), [get]);
  const bulkChangeRole = useCallback((from_role, to_role) => post('/people/bulk-change-role', { from_role, to_role }), [post]);
  const updatePerson = useCallback((id, data) => put(`/people/${id}`, data), [put]);
  const deactivatePerson = useCallback((id) => del(`/people/${id}`), [del]);
  const separatePerson = useCallback((id) => post(`/people/${id}/separate`), [post]);
  const reactivatePerson = useCallback((id) => post(`/people/${id}/reactivate`), [post]);

  // Phase G7 — entity lifecycle
  const transferEntity = useCallback((id, new_entity_id, reason) => post(`/people/${id}/transfer-entity`, { new_entity_id, reason }), [post]);
  const grantEntity = useCallback((id, entity_id, reason) => post(`/people/${id}/grant-entity`, { entity_id, reason }), [post]);
  const revokeEntity = useCallback((id, entity_id, reason) => post(`/people/${id}/revoke-entity`, { entity_id, reason }), [post]);

  // Compensation profiles
  const getCompProfile = useCallback((personId) => get(`/people/${personId}/comp`), [get]);
  const createCompProfile = useCallback((personId, data) => post(`/people/${personId}/comp`, data), [post]);
  const updateCompProfile = useCallback((personId, profileId, data) => put(`/people/${personId}/comp/${profileId}`, data), [put]);

  return {
    ...api,
    getPeopleList, getAsUsers,
    getPersonById,
    createPerson,
    createPersonUnified,
    createLoginForPerson,
    disableLogin,
    enableLogin,
    unlinkLogin,
    changeSystemRole,
    getLegacyRoleCounts,
    bulkChangeRole,
    updatePerson,
    deactivatePerson,
    separatePerson,
    reactivatePerson,
    getCompProfile,
    createCompProfile,
    updateCompProfile,
    transferEntity,
    grantEntity,
    revokeEntity,
  };
}
