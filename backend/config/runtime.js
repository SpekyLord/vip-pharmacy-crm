const parseIntEnv = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseBooleanEnv = (name, fallback = false) => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
};

const clampMinimum = (value, minimum) => Math.max(minimum, value);

const getRateLimitWindowMs = () =>
  clampMinimum(parseIntEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), 1000);

const getGeneralRateLimitMax = () => {
  const legacyFallback = clampMinimum(parseIntEnv('RATE_LIMIT_MAX_REQUESTS', 500), 1);
  return clampMinimum(parseIntEnv('RATE_LIMIT_GENERAL_MAX', legacyFallback), 1);
};

const getAuthRateLimitMax = () =>
  clampMinimum(parseIntEnv('RATE_LIMIT_AUTH_MAX', 50), 1);

const getUserRateLimitMax = () =>
  clampMinimum(parseIntEnv('RATE_LIMIT_USER_MAX', 300), 1);

const getLoginMaxAttempts = () =>
  clampMinimum(parseIntEnv('LOGIN_MAX_ATTEMPTS', 5), 1);

const getLoginLockoutDurationMinutes = () =>
  clampMinimum(parseIntEnv('LOGIN_LOCKOUT_DURATION', 15), 1);

const getLoginLockoutDurationMs = () =>
  getLoginLockoutDurationMinutes() * 60 * 1000;

const formatMinutesLabel = (minutes) =>
  `${minutes} minute${minutes === 1 ? '' : 's'}`;

const getClientUrl = () => String(process.env.CLIENT_URL || '').trim();

module.exports = {
  parseIntEnv,
  parseBooleanEnv,
  getRateLimitWindowMs,
  getGeneralRateLimitMax,
  getAuthRateLimitMax,
  getUserRateLimitMax,
  getLoginMaxAttempts,
  getLoginLockoutDurationMinutes,
  getLoginLockoutDurationMs,
  formatMinutesLabel,
  getClientUrl,
};
