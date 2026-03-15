import api from './api';

const specializationService = {
  getAll: async (params = {}) => {
    const response = await api.get('/specializations', { params });
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/specializations', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/specializations/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/specializations/${id}`);
    return response.data;
  },

  seed: async () => {
    const response = await api.post('/specializations/seed');
    return response.data;
  },
};

export default specializationService;
