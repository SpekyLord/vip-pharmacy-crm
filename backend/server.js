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
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { connectWebsiteDB } = require('./config/websiteDb');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

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

  // SECURITY: Validate JWT secret strength (minimum 32 characters)
  const MIN_SECRET_LENGTH = 32;
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
};

validateEnv();

// Initialize Express app
const app = express();

// Security middleware with HSTS for HTTPS enforcement
app.use(
  helmet({
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true,
    },
    contentSecurityPolicy: process.env.NODE_ENV === 'production',
  })
);

// CORS configuration - MUST be before rate limiter so CORS headers are included on 429 responses
const corsOptions = {
  origin: function (origin, callback) {
    // In production, use explicit allowed origins from env
    if (process.env.NODE_ENV === 'production') {
      // In production, require Origin header (prevents CORS bypass)
      if (!origin) {
        return callback(new Error('Origin header required in production'));
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

// Request logging (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
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

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Body parsing middleware
// Cookie parsing (so protect middleware can read req.cookies)
app.use(cookieParser());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));


// Request timeout middleware (30 seconds)
app.use((req, res, next) => {
  req.setTimeout(30000, () => {
    res.status(408).json({
      success: false,
      message: 'Request timeout',
    });
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
    },
  };

  // Return 503 if database is not connected
  const statusCode = mongoose.connection.readyState === 1 ? 200 : 503;

  res.status(statusCode).json(healthStatus);
});

// Mount route handlers
// Apply stricter rate limiting to auth routes
app.use('/api/auth', authLimiter, require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/doctors', require('./routes/doctorRoutes'));
app.use('/api/visits', require('./routes/visitRoutes'));
app.use('/api/messages', require('./routes/messageInbox')); // if file is messageInbox.js


app.use('/api/clients', require('./routes/clientRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/regions', require('./routes/regionRoutes'));
app.use('/api/assignments', require('./routes/productAssignmentRoutes'));
app.use('/api/schedules', require('./routes/scheduleRoutes'));

// 404 handler for undefined routes
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Server configuration
const PORT = process.env.PORT || 5000;

// Connect to database and start server
const startServer = async () => {
  try {
    // Connect to CRM database (primary)
    await connectDB();

    // Connect to website database (for products - read-only)
    await connectWebsiteDB();

    // Listen on all network interfaces (0.0.0.0) to allow access from phone
    app.listen(PORT, '0.0.0.0', () => {
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.message);
  // Close server gracefully
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;
