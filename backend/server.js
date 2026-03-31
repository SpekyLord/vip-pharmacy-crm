/**
 * VIP CRM - Backend Server
 *
 * Main entry point for the Express.js API server
 *
 * Features:
 * - Express.js REST API
 * - MongoDB database connection
 * - JWT authentication
 * - Role-based access control
 * - File upload with AWS S3
 * - CORS configuration
 * - Error handling
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Load environment variables from the backend directory (works regardless of CWD)
dotenv.config({ path: path.join(__dirname, '.env') });

// Validate required environment variables at startup
const validateEnv = () => {
  const required = [
    'MONGO_URI',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error('Missing required environment variables:');
    missing.forEach((key) => console.error(`  - ${key}`));
    process.exit(1);
  }

  // SECURITY: Validate JWT secret strength (OWASP recommends 64+ for HS256)
  const MIN_SECRET_LENGTH = 64;
  if (process.env.JWT_SECRET.length < MIN_SECRET_LENGTH) {
    console.error(`SECURITY ERROR: JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters for adequate security.`);
    console.error(`Current length: ${process.env.JWT_SECRET.length} characters.`);
    process.exit(1);
  }
  if (process.env.JWT_REFRESH_SECRET.length < MIN_SECRET_LENGTH) {
    console.error(`SECURITY ERROR: JWT_REFRESH_SECRET must be at least ${MIN_SECRET_LENGTH} characters for adequate security.`);
    console.error(`Current length: ${process.env.JWT_REFRESH_SECRET.length} characters.`);
    process.exit(1);
  }

  // SECURITY: Validate CORS_ORIGINS is set in production
  if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGINS) {
    console.error('SECURITY ERROR: CORS_ORIGINS is required in production.');
    console.error('Set CORS_ORIGINS to a comma-separated list of allowed origins.');
    console.error('Example: CORS_ORIGINS=https://app.vipcrm.com,https://www.vipcrm.com');
    process.exit(1);
  }

  // Warn about optional but recommended variables
  const recommended = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET_NAME'];
  const missingRecommended = recommended.filter((key) => !process.env[key]);

  if (missingRecommended.length > 0) {
    console.warn('Warning: Missing recommended environment variables (S3 uploads may fail):');
    missingRecommended.forEach((key) => console.warn(`  - ${key}`));
  }

  const emailRecommended = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'FRONTEND_URL'];
  const missingEmail = emailRecommended.filter((key) => !process.env[key]);
  if (missingEmail.length > 0) {
    console.warn('Warning: Missing email environment variables (email notifications disabled):');
    missingEmail.forEach((key) => console.warn(`  - ${key}`));
  }
};

validateEnv();

// Initialize Express app
const app = express();

// Trust first proxy (nginx) so req.ip returns the real client IP
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security middleware with HSTS for HTTPS enforcement
app.use(
  helmet({
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
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
    } : false,
    crossOriginEmbedderPolicy: false, // Allow S3 image loading
  })
);

// CORS configuration - MUST be before rate limiter so CORS headers are included on 429 responses
const corsOptions = {
  origin: function (origin, callback) {
    // In production, use explicit allowed origins from env
    if (process.env.NODE_ENV === 'production') {
      // Allow requests with no Origin (server-side curl, health checks, same-origin)
      if (!origin) {
        return callback(null, true);
      }
      if (process.env.CORS_ORIGINS) {
        const allowedOrigins = process.env.CORS_ORIGINS.split(',').map((o) => o.trim());
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
      }
      return callback(new Error('Not allowed by CORS'));
    }

    // Development: Allow localhost and local network IPs
    const devAllowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      /^http:\/\/10\.\d+\.\d+\.\d+:5173$/, // Local network IPs (10.x.x.x)
      /^http:\/\/192\.168\.\d+\.\d+:5173$/, // Local network IPs (192.168.x.x)
    ];

    // In development, allow requests without Origin (e.g., Postman, curl)
    if (!origin) return callback(null, true);

    const isAllowed = devAllowedOrigins.some((allowed) =>
      allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
    );

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting - protect against brute force and DoS attacks
// Applied AFTER CORS so rate limit responses include CORS headers
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-user rate limiting for authenticated endpoints (prevents abuse behind shared IPs/NAT)
// Note: Applied at route level after protect middleware, so req.user is available
const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each user to 300 requests per window
  keyGenerator: (req) => {
    // Use user ID if authenticated, fall back to IP
    return req.user?._id?.toString() || req.ip;
  },
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  message: {
    success: false,
    message: 'Too many requests from your account, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Body parsing middleware
// Cookie parsing (so protect middleware can read req.cookies)
app.use(cookieParser());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// SECURITY: Sanitize user input against NoSQL injection
// Strips $ and . operators from req.body, req.query, req.params
app.use(mongoSanitize());


// Request timeout middleware (30 seconds)
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({
        success: false,
        message: 'Request timeout',
      });
    }
  });
  next();
});

// Health check endpoint with dependency status
const mongoose = require('mongoose');

app.get('/api/health', async (req, res) => {
  const healthStatus = {
    success: true,
    message: 'VIP CRM API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    dependencies: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      s3: process.env.S3_BUCKET_NAME ? 'configured' : 'not_configured',
      email: process.env.RESEND_API_KEY ? (process.env.SES_SANDBOX_MODE !== 'false' ? 'sandbox' : 'configured') : 'not_configured',
    },
  };

  // Return 503 if database is not connected
  const statusCode = mongoose.connection.readyState === 1 ? 200 : 503;

  res.status(statusCode).json(healthStatus);
});

// Cache-Control headers for GET requests to reduce redundant downloads
const cacheControl = (maxAge) => (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', `private, max-age=${maxAge}`);
  }
  next();
};

// Mount route handlers
// Apply stricter rate limiting to auth routes
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
// Apply per-user rate limiting to authenticated routes
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

// ═══ ERP ROUTES ═══
app.use('/api/erp', userLimiter, require('./erp/routes'));

// 404 handler for undefined routes
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Server configuration
const PORT = process.env.PORT || 5000;

// Connect to database and start server
let server;
const startServer = async () => {
  try {
    // Connect to CRM database
    await connectDB();

    // Initialize email scheduler (after DB connection)
    require('./jobs/emailScheduler').initEmailScheduler();

    // Listen on all network interfaces (0.0.0.0) to allow access from phone
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║       VIP CRM - API Server                   ║
╠═══════════════════════════════════════════════════════╣
║  Status:      Running                                 ║
║  Port:        ${PORT.toString().padEnd(40)}║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(40)}║
║  API Base:    /api                                    ║
║  Network:     http://0.0.0.0:${PORT} (accessible from LAN)  ║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed.');
      try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
      } catch (err) {
        console.error('Error closing MongoDB connection:', err.message);
      }
      process.exit(0);
    });
    // Force shutdown after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error('Graceful shutdown timed out, forcing exit.');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.message);
  gracefulShutdown('unhandledRejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;
