import useErpApi from './useErpApi';

export default function useErpAccess() {
  const api = useErpApi();

  // ═══ Self-service ═══
  const getMyAccess = () => api.get('/erp-access/my');

  // ═══ Module & Sub-Permission Keys (Phase A — lookup-driven) ═══
  const getModuleKeys = () => api.get('/erp-access/module-keys');
  const getSubPermissionKeys = () => api.get('/erp-access/sub-permission-keys');

  // ═══ Templates ═══
  const getTemplates = (params) => api.get('/erp-access/templates', { params });
  const createTemplate = (data) => api.post('/erp-access/templates', data);
  const updateTemplate = (id, data) => api.put(`/erp-access/templates/${id}`, data);
  const deleteTemplate = (id) => api.del(`/erp-access/templates/${id}`);

  // ═══ User Access Management ═══
  const getUserAccess = (userId) => api.get(`/erp-access/users/${userId}`);
  const setUserAccess = (userId, data) => api.put(`/erp-access/users/${userId}`, data);
  const applyTemplate = (userId, templateId) =>
    api.post(`/erp-access/users/${userId}/apply-template`, { template_id: templateId });

  return {
    ...api,
    getMyAccess,
    getModuleKeys,
    getSubPermissionKeys,
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getUserAccess,
    setUserAccess,
    applyTemplate,
  };
}
