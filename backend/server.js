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
 * - File upload with Cloudinary
 * - CORS configuration
 * - Error handling
 */

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

// TODO: Initialize Express app
// TODO: Connect to MongoDB
// TODO: Configure middleware (cors, json parser, etc.)
// TODO: Mount route handlers
// TODO: Configure error handling
// TODO: Start server

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
// TODO: Mount routes
// app.use('/api/auth', require('./routes/authRoutes'));
// app.use('/api/users', require('./routes/userRoutes'));
// app.use('/api/doctors', require('./routes/doctorRoutes'));
// app.use('/api/visits', require('./routes/visitRoutes'));
// app.use('/api/products', require('./routes/productRoutes'));
// app.use('/api/regions', require('./routes/regionRoutes'));

// Error Handler
// app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// TODO: Connect to DB and start server
// connectDB().then(() => {
//   app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
//   });
// });

module.exports = app;
