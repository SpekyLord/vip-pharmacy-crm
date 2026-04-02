import useErpApi from './useErpApi';

export default function useConsignment() {
  const api = useErpApi();

  const createDR = (data) => api.post('/consignment/dr', data);
  const getDRs = (params = {}) => api.get('/consignment/dr', { params });
  const getConsignmentPool = (params = {}) => api.get('/consignment/pool', { params });
  const convertConsignment = (data) => api.post('/consignment/convert', data);

  return { ...api, createDR, getDRs, getConsignmentPool, convertConsignment };
}
