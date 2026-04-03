import useErpApi from './useErpApi';

export default function usePeople() {
  const api = useErpApi();

  const getPeopleList = (params) => api.get('/people', { params });
  const getPersonById = (id) => api.get(`/people/${id}`);
  const createPerson = (data) => api.post('/people', data);
  const updatePerson = (id, data) => api.put(`/people/${id}`, data);
  const deactivatePerson = (id) => api.del(`/people/${id}`);

  // Compensation profiles
  const getCompProfile = (personId) => api.get(`/people/${personId}/comp`);
  const createCompProfile = (personId, data) => api.post(`/people/${personId}/comp`, data);
  const updateCompProfile = (personId, profileId, data) => api.put(`/people/${personId}/comp/${profileId}`, data);

  return {
    ...api,
    getPeopleList,
    getPersonById,
    createPerson,
    updatePerson,
    deactivatePerson,
    getCompProfile,
    createCompProfile,
    updateCompProfile,
  };
}
