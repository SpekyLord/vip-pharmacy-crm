import api from './api';

const supportTypeService = {
  getAll: async (params = {}) => {
    const response = await api.get('/support-types', { params });
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/support-types', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/support-types/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/support-types/${id}`);
    return response.data;
  },

  seed: async () => {
    const response = await api.post('/support-types/seed');
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/support-types/stats');
    return response.data;
  },
};

export default supportTypeService;
