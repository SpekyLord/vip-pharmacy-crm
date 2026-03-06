/**
 * Notification Preference Service
 *
 * API calls for user notification preferences.
 */

import api from './api';

const notificationPreferenceService = {
  /**
   * Get current user's notification preferences
   */
  getPreferences: async () => {
    const response = await api.get('/notification-preferences');
    return response.data;
  },

  /**
   * Update notification preferences
   * @param {Object} data - Preference fields to update
   */
  updatePreferences: async (data) => {
    const response = await api.put('/notification-preferences', data);
    return response.data;
  },
};

export default notificationPreferenceService;
