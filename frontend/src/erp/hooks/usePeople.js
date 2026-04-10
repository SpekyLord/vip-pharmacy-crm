import useErpApi from './useErpApi';

export default function usePeople() {
  const api = useErpApi();

  const getPeopleList = (params) => api.get('/people', { params });
  const getAsUsers = (params) => api.get('/people/as-users', { params });  // CRM-compatible { _id, name, role }
  const getPersonById = (id) => api.get(`/people/${id}`);
  const createPerson = (data) => api.post('/people', data);
  const createPersonUnified = (data) => api.post('/people/create-with-login', data);
  const createLoginForPerson = (personId, data) => api.post(`/people/${personId}/create-login`, data);
  const disableLogin = (personId) => api.post(`/people/${personId}/disable-login`);
  const enableLogin = (personId) => api.post(`/people/${personId}/enable-login`);
  const unlinkLogin = (personId) => api.post(`/people/${personId}/unlink-login`);
  const changeSystemRole = (personId, role) => api.post(`/people/${personId}/change-role`, { role });
  const getLegacyRoleCounts = () => api.get('/people/legacy-role-counts');
  const bulkChangeRole = (from_role, to_role) => api.post('/people/bulk-change-role', { from_role, to_role });
  const updatePerson = (id, data) => api.put(`/people/${id}`, data);
  const deactivatePerson = (id) => api.del(`/people/${id}`);

  // Compensation profiles
  const getCompProfile = (personId) => api.get(`/people/${personId}/comp`);
  const createCompProfile = (personId, data) => api.post(`/people/${personId}/comp`, data);
  const updateCompProfile = (personId, profileId, data) => api.put(`/people/${personId}/comp/${profileId}`, data);

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
    getCompProfile,
    createCompProfile,
    updateCompProfile,
  };
}
