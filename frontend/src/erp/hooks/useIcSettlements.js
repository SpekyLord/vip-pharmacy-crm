import useErpApi from './useErpApi';

export default function useIcSettlements() {
  const api = useErpApi();

  const getOpenIcTransfers = (debtorEntityId, creditorEntityId) =>
    api.get('/ic-settlements/open-transfers', { params: { debtor_entity_id: debtorEntityId, ...(creditorEntityId && { creditor_entity_id: creditorEntityId }) } });
  const getIcArSummary = (creditorEntityId) =>
    api.get('/ic-settlements/summary', { params: { ...(creditorEntityId && { creditor_entity_id: creditorEntityId }) } });
  const getSettlements = (params) => api.get('/ic-settlements', { params });
  const getSettlementById = (id) => api.get(`/ic-settlements/${id}`);
  const createSettlement = (data) => api.post('/ic-settlements', data);
  const postSettlement = (id) => api.post(`/ic-settlements/${id}/post`, {});

  return {
    ...api,
    getOpenIcTransfers, getIcArSummary,
    getSettlements, getSettlementById,
    createSettlement, postSettlement
  };
}
