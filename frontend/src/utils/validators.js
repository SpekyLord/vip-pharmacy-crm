/**
 * Validation Utilities
 *
 * Common validation functions for:
 * - Email format
 * - Phone numbers
 * - Required fields
 * - Password strength
 * - Custom validators
 */

export const validators = {
  // Email validation
  isValidEmail: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  // Phone validation (basic)
  isValidPhone: (phone) => {
    const phoneRegex = /^\+?[\d\s-()]{10,}$/;
    return phoneRegex.test(phone);
  },

  // Required field validation
  isRequired: (value) => {
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return value !== null && value !== undefined;
  },

  // Password strength validation
  isStrongPassword: (password) => {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    return passwordRegex.test(password);
  },

  // Min length validation
  minLength: (value, min) => {
    return value && value.length >= min;
  },

  // Max length validation
  maxLength: (value, max) => {
    return !value || value.length <= max;
  },

  // Number range validation
  isInRange: (value, min, max) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= min && num <= max;
  },

  // URL validation
  isValidUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  // Date validation
  isValidDate: (date) => {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d);
  },

  // Future date validation
  isFutureDate: (date) => {
    const d = new Date(date);
    return d > new Date();
  },
};

// Form validation helper
export const validateForm = (data, rules) => {
  const errors = {};

  Object.keys(rules).forEach((field) => {
    const fieldRules = rules[field];
    const value = data[field];

    fieldRules.forEach((rule) => {
      if (errors[field]) return; // Skip if already has error

      if (rule.required && !validators.isRequired(value)) {
        errors[field] = rule.message || `${field} is required`;
      } else if (rule.email && value && !validators.isValidEmail(value)) {
        errors[field] = rule.message || 'Invalid email format';
      } else if (rule.phone && value && !validators.isValidPhone(value)) {
        errors[field] = rule.message || 'Invalid phone number';
      } else if (rule.minLength && !validators.minLength(value, rule.minLength)) {
        errors[field] = rule.message || `Minimum ${rule.minLength} characters required`;
      } else if (rule.maxLength && !validators.maxLength(value, rule.maxLength)) {
        errors[field] = rule.message || `Maximum ${rule.maxLength} characters allowed`;
      } else if (rule.custom && !rule.custom(value, data)) {
        errors[field] = rule.message || 'Invalid value';
      }
    });
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

export default validators;
