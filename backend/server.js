/**
 * VIP CRM API runtime entrypoint.
 *
 * Supports:
 * - API mode (`node server.js`)
 * - Worker mode (`require('./server').startWorker()`)
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose = require('mongoose');
const path = require('path');
const { randomUUID } = require('crypto');
const dotenv = require('dotenv');

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { logInfo, logWarn, logError } = require('./utils/logger');

dotenv.config({ path: path.join(__dirname, '.env') });

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

const isProduction = () => process.env.NODE_ENV === 'production';
const shouldSkipDbConnect = () => parseBooleanEnv('SKIP_DB_CONNECT', false);
const isSchedulerEnabled = () => parseBooleanEnv('ENABLE_SCHEDULER', false);
const shouldExposeHealthDetails = () =>
  parseBooleanEnv('HEALTH_EXPOSE_DETAILS', !isProduction());

const validateEnv = () => {
  const required = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const MIN_SECRET_LENGTH = 64;
  if (process.env.JWT_SECRET.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }
  if (process.env.JWT_REFRESH_SECRET.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_REFRESH_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }

  if (isProduction() && !process.env.CORS_ORIGINS) {
    throw new Error('CORS_ORIGINS is required in production.');
  }
};

const attachRequestId = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.trim()
    ? incoming.trim()
    : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

const structuredHttpLoggingMiddleware = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    const payload = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ip: req.ip,
      userId: req.user?._id?.toString() || null,
    };

    if (level === 'error') {
      logError('http_request', payload);
      return;
    }
    if (level === 'warn') {
      logWarn('http_request', payload);
      return;
    }
    logInfo('http_request', payload);
  });

  next();
};

const buildCorsOptions = () => ({
  origin: (origin, callback) => {
    if (isProduction()) {
      if (!origin) return callback(null, true);

      const allowedOrigins = (process.env.CORS_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }

    const devAllowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      /^http:\/\/10\.\d+\.\d+\.\d+:5173$/,
      /^http:\/\/192\.168\.\d+\.\d+:5173$/,
    ];

    if (!origin) return callback(null, true);

    const isAllowed = devAllowedOrigins.some((allowed) =>
      allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
    );

    if (isAllowed) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
});

const createRateLimiters = () => {
  // Skip rate limiting in development — prevents lockouts during testing
  if (process.env.NODE_ENV !== 'production') {
    const noop = (req, res, next) => next();
    return { generalLimiter: noop, authLimiter: noop, userLimiter: noop };
  }

  const windowMs = parseIntEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
  const generalMax = parseIntEnv('RATE_LIMIT_GENERAL_MAX', 500);
  const authMax = parseIntEnv('RATE_LIMIT_AUTH_MAX', 50);
  const userMax = parseIntEnv('RATE_LIMIT_USER_MAX', 300);

  const limiterOptions = {
    windowMs,
    standardHeaders: true,
    legacyHeaders: false,
  };

  const generalLimiter = rateLimit({
    ...limiterOptions,
    max: generalMax,
    message: { success: false, message: 'Too many requests, please try again later.' },
  });

  const authLimiter = rateLimit({
    ...limiterOptions,
    max: authMax,
    message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  });

  const userLimiter = rateLimit({
    ...limiterOptions,
    max: userMax,
    keyGenerator: (req) => req.user?._id?.toString() || req.ip,
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
    message: { success: false, message: 'Too many requests from your account, please try again later.' },
  });

  return { generalLimiter, authLimiter, userLimiter };
};

const buildReadyHealthPayload = (requestId) => {
  const isReady = mongoose.connection.readyState === 1;
  const payload = {
    success: isReady,
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    requestId,
  };

  if (shouldExposeHealthDetails()) {
    payload.environment = process.env.NODE_ENV;
    payload.dependencies = {
      mongodb: isReady ? 'connected' : 'disconnected',
      s3: process.env.S3_BUCKET_NAME ? 'configured' : 'not_configured',
      email: process.env.RESEND_API_KEY
        ? (process.env.SES_SANDBOX_MODE !== 'false' ? 'sandbox' : 'configured')
        : 'not_configured',
      scheduler: isSchedulerEnabled() ? 'enabled' : 'disabled',
    };
  }

  return { payload, statusCode: isReady ? 200 : 503 };
};

const cacheControl = (maxAge) => (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', `private, max-age=${maxAge}`);
  }
  next();
};

const createApp = () => {
  const app = express();

  if (isProduction()) {
    app.set('trust proxy', 1);
  }

  app.use(attachRequestId);

  app.use(
    helmet({
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      contentSecurityPolicy: isProduction()
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https://*.amazonaws.com'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(cors(buildCorsOptions()));

  if (!isProduction()) {
    app.use(morgan('dev'));
  }

  app.use(structuredHttpLoggingMiddleware);

  const { generalLimiter, authLimiter, userLimiter } = createRateLimiters();
  app.use('/api/', generalLimiter);

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(mongoSanitize());

  app.use((req, res, next) => {
    req.setTimeout(30000, () => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          message: 'Request timeout',
          requestId: req.requestId,
        });
      }
    });
    next();
  });

  app.get('/api/health/live', (req, res) => {
    res.status(200).json({
      success: true,
      status: 'live',
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
  });

  const readyHandler = (req, res) => {
    const { payload, statusCode } = buildReadyHealthPayload(req.requestId);
    res.status(statusCode).json(payload);
  };

  app.get('/api/health/ready', readyHandler);
  app.get('/api/health', readyHandler); // Backward compatibility

  app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
  app.use('/api/users', userLimiter, require('./routes/userRoutes'));
  app.use('/api/doctors', userLimiter, require('./routes/doctorRoutes'));
  app.use('/api/visits', userLimiter, require('./routes/visitRoutes'));
  app.use('/api/messages', userLimiter, require('./routes/messageInbox'));
  app.use('/api/clients', userLimiter, require('./routes/clientRoutes'));
  app.use('/api/products', userLimiter, cacheControl(30), require('./routes/productRoutes'));
  app.use('/api/specializations', userLimiter, cacheControl(300), require('./routes/specializationRoutes'));
  app.use('/api/programs', userLimiter, cacheControl(300), require('./routes/programRoutes'));
  app.use('/api/support-types', userLimiter, cacheControl(300), require('./routes/supportTypeRoutes'));
  app.use('/api/assignments', userLimiter, require('./routes/productAssignmentRoutes'));
  app.use('/api/schedules', userLimiter, require('./routes/scheduleRoutes'));
  app.use('/api/imports', userLimiter, require('./routes/importRoutes'));
  app.use('/api/audit-logs', userLimiter, require('./routes/auditLogRoutes'));
  app.use('/api/notification-preferences', userLimiter, require('./routes/notificationPreferenceRoutes'));
  app.use('/api/reports', userLimiter, require('./routes/reportRoutes'));
  app.use('/api/erp', userLimiter, require('./erp/routes'));

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

const app = createApp();

let server;
let signalHandlersRegistered = false;

const initializeSchedulerIfEnabled = (runtimeMode) => {
  if (!isSchedulerEnabled()) {
    logInfo('scheduler_disabled', { runtimeMode });
    return false;
  }
  require('./jobs/emailScheduler').initEmailScheduler();

  // Phase 18-19: AI agent scheduler (6 free + 6 paid agents)
  try {
    require('./agents/agentScheduler').initAgentScheduler();
  } catch (err) {
    logWarn('agent_scheduler_init_failed', { error: err.message });
  }

  logInfo('scheduler_initialized', { runtimeMode });
  return true;
};

const gracefulShutdown = async (signal) => {
  logWarn('graceful_shutdown_started', { signal });

  const closeDb = async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      logInfo('mongodb_connection_closed');
    }
  };

  if (server) {
    server.close(async () => {
      logInfo('http_server_closed');
      try {
        await closeDb();
      } finally {
        process.exit(0);
      }
    });

    setTimeout(async () => {
      logError('graceful_shutdown_timeout');
      try {
        await closeDb();
      } finally {
        process.exit(1);
      }
    }, 10000);
    return;
  }

  try {
    await closeDb();
  } finally {
    process.exit(0);
  }
};

const registerProcessHandlers = () => {
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    logError('unhandled_promise_rejection', { error: err.message });
    gracefulShutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logError('uncaught_exception', { error: err.message });
    process.exit(1);
  });
};

const startApiServer = async (options = {}) => {
  validateEnv();
  registerProcessHandlers();

  const shouldConnectDb = options.connectDatabase ?? !shouldSkipDbConnect();
  if (shouldConnectDb) {
    await connectDB();
  } else {
    logWarn('db_connect_skipped', { runtimeMode: 'api' });
  }

  initializeSchedulerIfEnabled('api');

  if (options.listen === false) {
    return { app, server: null };
  }

  const port = parseIntEnv('PORT', 5000);
  server = app.listen(port, '0.0.0.0', () => {
    logInfo('api_server_started', {
      port,
      environment: process.env.NODE_ENV || 'development',
      schedulerEnabled: isSchedulerEnabled(),
    });
  });

  return { app, server };
};

const startWorker = async (options = {}) => {
  validateEnv();
  registerProcessHandlers();

  if (!isSchedulerEnabled()) {
    throw new Error('Worker mode requires ENABLE_SCHEDULER=true');
  }

  const shouldConnectDb = options.connectDatabase ?? !shouldSkipDbConnect();
  if (shouldConnectDb) {
    await connectDB();
  } else {
    logWarn('db_connect_skipped', { runtimeMode: 'worker' });
  }

  initializeSchedulerIfEnabled('worker');
  logInfo('worker_started');
  return { schedulerEnabled: true };
};

if (require.main === module) {
  startApiServer().catch((error) => {
    logError('api_start_failed', { error: error.message });
    process.exit(1);
  });
}

module.exports = {
  app,
  createApp,
  validateEnv,
  startApiServer,
  startWorker,
  gracefulShutdown,
  isSchedulerEnabled,
};

