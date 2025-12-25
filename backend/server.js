/**
 * VIP Pharmacy CRM - Backend Server
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
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { connectWebsiteDB } = require('./config/websiteDb');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet());

// Request logging (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    // Also allow localhost and local network IPs for development
    const allowedOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      /^http:\/\/10\.\d+\.\d+\.\d+:5173$/, // Local network IPs (10.x.x.x)
      /^http:\/\/192\.168\.\d+\.\d+:5173$/, // Local network IPs (192.168.x.x)
    ];

    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some((allowed) =>
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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'VIP Pharmacy CRM API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Mount route handlers
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/doctors', require('./routes/doctorRoutes'));
app.use('/api/visits', require('./routes/visitRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/regions', require('./routes/regionRoutes'));
app.use('/api/assignments', require('./routes/productAssignmentRoutes'));

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
║       VIP Pharmacy CRM - API Server                   ║
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
