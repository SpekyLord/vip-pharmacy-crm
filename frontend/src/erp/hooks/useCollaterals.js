import api from '../../services/api';

export default function useCollaterals() {
  const getAll = async (params) => { const { data } = await api.get('/erp/collaterals', { params }); return data; };
  const getById = async (id) => { const { data } = await api.get(`/erp/collaterals/${id}`); return data; };
  const create = async (body) => { const { data } = await api.post('/erp/collaterals', body); return data; };
  const update = async (id, body) => { const { data } = await api.put(`/erp/collaterals/${id}`, body); return data; };
  const recordDistribution = async (body) => { const { data } = await api.post('/erp/collaterals/distributions', body); return data; };
  const recordReturn = async (body) => { const { data } = await api.post('/erp/collaterals/returns', body); return data; };

  return { getAll, getById, create, update, recordDistribution, recordReturn };
}
