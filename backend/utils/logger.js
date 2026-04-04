/**
 * Lightweight structured logger for production-like operations.
 * Emits JSON for easier parsing in PM2/log pipelines.
 */

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const threshold = LEVELS[configuredLevel] ?? LEVELS.info;

const shouldLog = (level) => (LEVELS[level] ?? LEVELS.info) <= threshold;

const emit = (level, message, meta = {}) => {
  if (!shouldLog(level)) return;

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
};

const logInfo = (message, meta) => emit('info', message, meta);
const logWarn = (message, meta) => emit('warn', message, meta);
const logError = (message, meta) => emit('error', message, meta);
const logDebug = (message, meta) => emit('debug', message, meta);

module.exports = {
  logInfo,
  logWarn,
  logError,
  logDebug,
};

