import toast from 'react-hot-toast';

/**
 * showError - Smart error display for ERP pages.
 *
 * Replaces generic alert('Failed') with contextual toast messages.
 * Automatically extracts server validation messages, handles common
 * HTTP status codes, and shows timeout/network failures clearly.
 *
 * Usage:
 *   import { showError } from '../utils/errorToast';
 *   catch (err) { showError(err, 'Could not save expense'); }
 */
export function showError(err, fallback = 'Operation failed') {
  const status = err?.response?.status;
  const serverMsg = err?.response?.data?.message;
  const serverErrors = err?.response?.data?.errors;
  const errorCode = err?.code;
  const errorName = err?.name;
  const errorMessage = String(err?.message || '').toLowerCase();

  // Field-level validation errors (array)
  if (serverErrors?.length > 0) {
    const details = serverErrors.map((entry) => entry.message || entry.field || entry).join('. ');
    toast.error(`${serverMsg || fallback}: ${details}`, { duration: 6000 });
    return;
  }

  // Server returned a specific message
  if (serverMsg) {
    toast.error(serverMsg, { duration: 5000 });
    return;
  }

  // Axios timeout / abort failures should read differently than offline errors.
  if (
    errorCode === 'ECONNABORTED' ||
    errorName === 'AbortError' ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('aborted')
  ) {
    toast.error(
      'Request timed out - the server is taking longer than expected. If this was a long-running task, refresh in a few seconds to check its status.',
      { duration: 6000 }
    );
    return;
  }

  // Status-based fallbacks
  if (status === 400) {
    toast.error(`Validation error - ${fallback}. Check required fields.`, { duration: 5000 });
  } else if (status === 401) {
    toast.error('Session expired - please log in again.', { duration: 5000 });
  } else if (status === 403) {
    toast.error("Access denied - you don't have permission for this action.", { duration: 5000 });
  } else if (status === 404) {
    toast.error('Record not found - it may have been deleted or moved.', { duration: 5000 });
  } else if (status === 409) {
    toast.error('Conflict - this record was modified by another user. Refresh and try again.', { duration: 5000 });
  } else if (status >= 500) {
    toast.error('Server error - please try again in a moment.', { duration: 5000 });
  } else if (!err?.response) {
    toast.error('Network error - check your internet connection and try again.', { duration: 5000 });
  } else {
    toast.error(fallback, { duration: 4000 });
  }
}

/**
 * showSuccess - Consistent success toast.
 */
export function showSuccess(msg) {
  toast.success(msg, { duration: 3000 });
}

/**
 * showWarning — Amber warning toast for non-fatal alerts (e.g. role mismatches).
 */
export function showWarning(msg, duration = 8000) {
  toast(msg, {
    duration,
    icon: '\u26a0\ufe0f',
    style: {
      background: '#fffbeb',
      color: '#92400e',
      border: '1px solid #f59e0b',
    },
  });
}
