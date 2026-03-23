import api from './api';

const programService = {
  getAll: async (params = {}) => {
    const response = await api.get('/programs', { params });
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/programs', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/programs/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/programs/${id}`);
    return response.data;
  },

  seed: async () => {
    const response = await api.post('/programs/seed');
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/programs/stats');
    return response.data;
  },
};

export default programService;
