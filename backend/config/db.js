/**
 * MongoDB Database Connection Configuration
 *
 * This file handles:
 * - MongoDB connection using Mongoose
 * - Connection error handling
 * - Connection events logging
 * - Graceful shutdown handling
 */

const mongoose = require('mongoose');
const dns = require('dns');
const { logInfo, logWarn, logError } = require('../utils/logger');

// Use Google DNS to resolve MongoDB Atlas SRV records reliably
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
    });

    logInfo(`MongoDB Connected: ${conn.connection.host}`);

    // Connection event handlers
    mongoose.connection.on('error', (err) => {
      logError(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logWarn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logInfo('MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    logError(`MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
