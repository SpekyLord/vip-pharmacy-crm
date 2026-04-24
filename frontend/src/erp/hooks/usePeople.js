import { useCallback } from 'react';
import useErpApi from './useErpApi';

export default function usePeople() {
  const api = useErpApi();

  // Functions are memoized against api.get/post/put/del (which are stable via
  // useErpApi's useCallback). Consumers use these as useEffect deps (e.g.
  // OwnerPicker), so a fresh reference every render would cause effect re-fire
  // storms — infinite /erp/people requests that saturate the browser's
  // concurrent-request cap and stack up 30s axios timeouts.
  const getPeopleList = useCallback((params) => api.get('/people', { params }), [api.get]);
  const getAsUsers = useCallback((params) => api.get('/people/as-users', { params }), [api.get]);
  const getPersonById = useCallback((id) => api.get(`/people/${id}`), [api.get]);
  const createPerson = useCallback((data) => api.post('/people', data), [api.post]);
  const createPersonUnified = useCallback((data) => api.post('/people/create-with-login', data), [api.post]);
  const createLoginForPerson = useCallback((personId, data) => api.post(`/people/${personId}/create-login`, data), [api.post]);
  const disableLogin = useCallback((personId) => api.post(`/people/${personId}/disable-login`), [api.post]);
  const enableLogin = useCallback((personId) => api.post(`/people/${personId}/enable-login`), [api.post]);
  const unlinkLogin = useCallback((personId) => api.post(`/people/${personId}/unlink-login`), [api.post]);
  const changeSystemRole = useCallback((personId, role) => api.post(`/people/${personId}/change-role`, { role }), [api.post]);
  const getLegacyRoleCounts = useCallback(() => api.get('/people/legacy-role-counts'), [api.get]);
  const bulkChangeRole = useCallback((from_role, to_role) => api.post('/people/bulk-change-role', { from_role, to_role }), [api.post]);
  const updatePerson = useCallback((id, data) => api.put(`/people/${id}`, data), [api.put]);
  const deactivatePerson = useCallback((id) => api.del(`/people/${id}`), [api.del]);
  const separatePerson = useCallback((id) => api.post(`/people/${id}/separate`), [api.post]);
  const reactivatePerson = useCallback((id) => api.post(`/people/${id}/reactivate`), [api.post]);

  // Compensation profiles
  const getCompProfile = useCallback((personId) => api.get(`/people/${personId}/comp`), [api.get]);
  const createCompProfile = useCallback((personId, data) => api.post(`/people/${personId}/comp`, data), [api.post]);
  const updateCompProfile = useCallback((personId, profileId, data) => api.put(`/people/${personId}/comp/${profileId}`, data), [api.put]);

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
  };
}
