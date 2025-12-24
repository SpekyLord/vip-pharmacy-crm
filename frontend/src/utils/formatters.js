/**
 * Formatting Utilities
 *
 * Common formatting functions for:
 * - Dates
 * - Numbers
 * - Currency
 * - Phone numbers
 * - Names
 */

export const formatters = {
  // Date formatting
  formatDate: (date, options = {}) => {
    if (!date) return '';
    const d = new Date(date);
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    return d.toLocaleDateString('en-US', { ...defaultOptions, ...options });
  },

  // Time formatting
  formatTime: (date, options = {}) => {
    if (!date) return '';
    const d = new Date(date);
    const defaultOptions = {
      hour: '2-digit',
      minute: '2-digit',
    };
    return d.toLocaleTimeString('en-US', { ...defaultOptions, ...options });
  },

  // Date and time formatting
  formatDateTime: (date) => {
    if (!date) return '';
    return `${formatters.formatDate(date)} ${formatters.formatTime(date)}`;
  },

  // Relative time (e.g., "2 hours ago")
  formatRelativeTime: (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffInSeconds = Math.floor((now - d) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return formatters.formatDate(date);
  },

  // Number formatting
  formatNumber: (number, decimals = 0) => {
    if (number === null || number === undefined) return '';
    return number.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  },

  // Currency formatting
  formatCurrency: (amount, currency = 'USD') => {
    if (amount === null || amount === undefined) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  },

  // Percentage formatting
  formatPercentage: (value, decimals = 1) => {
    if (value === null || value === undefined) return '';
    return `${value.toFixed(decimals)}%`;
  },

  // Phone number formatting
  formatPhone: (phone) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  },

  // Name formatting (capitalize first letter of each word)
  formatName: (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  // Truncate text
  truncate: (text, maxLength = 50, suffix = '...') => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - suffix.length) + suffix;
  },

  // File size formatting
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },
};

export default formatters;
