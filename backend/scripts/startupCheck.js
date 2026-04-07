/**
 * CI startup probe:
 * - boots API runtime in "no DB connect" mode
 * - verifies liveness endpoint returns 200
 * - verifies readiness endpoint responds (expected 503 without DB)
 */

const http = require('http');
const { startApiServer } = require('../server');

const ensureEnv = () => {
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
    process.env.NODE_ENV = 'test';
  }
  process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vip-crm-startup-check';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'a'.repeat(64);
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'b'.repeat(64);
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:5173';
  process.env.PORT = '5099';
  process.env.SKIP_DB_CONNECT = 'true';
  process.env.ENABLE_SCHEDULER = 'false';
};

const httpGet = (path) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(process.env.PORT),
        path,
        method: 'GET',
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });

const run = async () => {
  ensureEnv();

  const { server } = await startApiServer({ connectDatabase: false });

  try {
    const live = await httpGet('/api/health/live');
    if (live.statusCode !== 200) {
      throw new Error(`Expected /api/health/live=200, got ${live.statusCode}`);
    }

    const ready = await httpGet('/api/health/ready');
    if (![200, 503].includes(ready.statusCode)) {
      throw new Error(`Expected /api/health/ready to be 200 or 503, got ${ready.statusCode}`);
    }

    console.log('Startup check passed.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

run().catch((error) => {
  console.error(`Startup check failed: ${error.message}`);
  process.exit(1);
});
