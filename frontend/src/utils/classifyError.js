/**
 * classifyError — Classifies an axios/network error into a user-friendly message.
 *
 * Mirrors the classification logic in erp/utils/errorToast.js but returns
 * structured data instead of showing toasts, so callers decide how to display.
 *
 * Returns { type, message } where type is one of:
 *   'network'    — no response, connectivity issue (CORS, offline, DNS)
 *   'timeout'    — request timed out or was aborted
 *   'auth'       — 401/423 authentication or lockout error
 *   'server'     — 500+ server error
 *   'validation' — 400 bad request
 *   'forbidden'  — 403 access denied
 *   'not_found'  — 404
 *   'conflict'   — 409
 *   'unknown'    — unclassified
 */
export function classifyError(err, fallback = 'Operation failed') {
  const status = err?.response?.status;
  const serverMsg = err?.response?.data?.message;
  const serverErrors = err?.response?.data?.errors;
  const errorCode = err?.code;
  const errorMessage = String(err?.message || '').toLowerCase();

  // Field-level validation errors (array from express-validator)
  if (serverErrors?.length > 0) {
    const details = serverErrors.map((e) => e.message || e.field || e).join('. ');
    return { type: 'validation', message: `${serverMsg || fallback}: ${details}` };
  }

  // Server returned a specific message — trust it (most specific info available)
  if (serverMsg) {
    let type = 'server';
    if (status === 401) type = 'auth';
    else if (status === 423) type = 'auth';
    else if (status === 403) type = 'forbidden';
    else if (status === 400) type = 'validation';
    else if (status === 404) type = 'not_found';
    else if (status === 409) type = 'conflict';
    return { type, message: serverMsg };
  }

  // Timeout / abort — must check before the generic no-response branch
  if (
    errorCode === 'ECONNABORTED' ||
    err?.name === 'AbortError' ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('aborted')
  ) {
    return {
      type: 'timeout',
      message: 'Request timed out. The server may be slow or unreachable — please try again.',
    };
  }

  // Network error (no response at all — CORS failure, offline, DNS, server down)
  if (!err?.response) {
    return {
      type: 'network',
      message: 'Cannot reach the server. Please check your internet connection and try again.',
    };
  }

  // Status-based fallbacks (server responded but without a message body)
  if (status === 401) return { type: 'auth', message: 'Invalid credentials. Please try again.' };
  if (status === 423) return { type: 'auth', message: 'Account locked. Please try again later.' };
  if (status === 403) return { type: 'forbidden', message: 'Access denied.' };
  if (status === 400) return { type: 'validation', message: fallback };
  if (status === 404) return { type: 'not_found', message: 'Resource not found.' };
  if (status === 409) return { type: 'conflict', message: 'Conflict — record was modified by another user.' };
  if (status >= 500) return { type: 'server', message: 'Server error — please try again in a moment.' };

  return { type: 'unknown', message: fallback };
}
