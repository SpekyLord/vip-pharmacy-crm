/**
 * CLM Branding Service
 *
 * Per-entity partnership-presentation branding + slide content.
 * Backend: /api/entities/:id/clm-branding (see backend/erp/routes/entityRoutes.js)
 *
 * Reads: admin/finance/president/contractor (BDMs need to read their entity's
 * branding on CLMPresenter mount). Writes: admin/president only.
 */
import api from './api';

const clmBrandingService = {
  get: async (entityId) => {
    const response = await api.get(`/erp/entities/${entityId}/clm-branding`);
    return response.data;
  },

  /**
   * Update branding. All fields optional; only passed fields are written.
   * @param {string} entityId
   * @param {object} payload
   * @param {string} [payload.primaryColor]    hex color, e.g. "#D4A017"
   * @param {string} [payload.companyName]
   * @param {string} [payload.websiteUrl]
   * @param {string} [payload.salesEmail]
   * @param {string} [payload.phone]
   * @param {File}   [payload.logoCircle]      PNG/JPEG/WebP file
   * @param {File}   [payload.logoTrademark]   PNG/JPEG/WebP file
   * @param {object} [payload.slides]          nested { hero, startup, solution, integrity, products, connect }
   */
  update: async (entityId, payload = {}) => {
    const fd = new FormData();
    const textKeys = ['primaryColor', 'companyName', 'websiteUrl', 'salesEmail', 'phone'];
    for (const key of textKeys) {
      if (payload[key] !== undefined) fd.append(key, payload[key] || '');
    }
    if (payload.logoCircle) fd.append('logoCircle', payload.logoCircle);
    if (payload.logoTrademark) fd.append('logoTrademark', payload.logoTrademark);
    // FormData cannot represent nested objects natively — stringify once;
    // backend parses once on receive.
    if (payload.slides !== undefined) fd.append('slides', JSON.stringify(payload.slides || {}));
    const response = await api.put(`/erp/entities/${entityId}/clm-branding`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

export default clmBrandingService;
