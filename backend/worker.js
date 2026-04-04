/**
 * Dedicated worker process entrypoint for scheduled jobs.
 *
 * Intended PM2 process:
 * - ENABLE_SCHEDULER=true
 * - no public HTTP port
 */

const { startWorker } = require('./server');
const { logError } = require('./utils/logger');

startWorker().catch((error) => {
  logError('worker_start_failed', { error: error.message });
  process.exit(1);
});

