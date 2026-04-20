/**
 * Global Error Handler Middleware
 *
 * This file handles:
 * - Centralized error handling
 * - Error response formatting
 * - Error logging
 * - Different error types (validation, auth, database)
 * - Production vs development error details
 */

const { logError } = require('../utils/logger');

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Not Found Error (404)
 */
class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

/**
 * Validation Error (400)
 */
class ValidationError extends ApiError {
  constructor(message = 'Validation failed', errors = []) {
    super(400, message);
    this.errors = errors;
  }
}

/**
 * Unauthorized Error (401)
 */
class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized access') {
    super(401, message);
  }
}

/**
 * Forbidden Error (403)
 */
class ForbiddenError extends ApiError {
  constructor(message = 'Access forbidden') {
    super(403, message);
  }
}

/**
 * Handle CastError (invalid MongoDB ObjectId)
 */
const handleCastError = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new ApiError(400, message);
};

/**
 * Handle MongoDB duplicate key error
 */
const handleDuplicateKeyError = (err) => {
  // Check if this is a visit duplicate (compound key: doctor + user + yearWeekKey)
  if (err.keyValue && err.keyValue.doctor && err.keyValue.user && err.keyValue.yearWeekKey) {
    return new ApiError(400, 'You have already visited this doctor this week. Only one visit per doctor per week is allowed.');
  }

  const field = Object.keys(err.keyValue)[0];
  const message = `${field} already exists. Please use a different value.`;
  return new ApiError(400, message);
};

/**
 * Handle Mongoose validation error
 */
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map((el) => ({
    field: el.path,
    message: el.message,
  }));
  const message = 'Validation failed. Please check your input.';
  const error = new ValidationError(message, errors);
  return error;
};

/**
 * Handle JWT errors
 */
const handleJWTError = () => {
  return new UnauthorizedError('Invalid token. Please log in again.');
};

/**
 * Handle JWT expired error
 */
const handleJWTExpiredError = () => {
  return new UnauthorizedError('Token expired. Please log in again.');
};

/**
 * Send error response for development environment
 */
const sendErrorDev = (err, req, res) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
    error: err,
    stack: err.stack,
    errors: err.errors, // Include validation errors if present
    requestId: req.requestId,
  });
};

/**
 * Send error response for production environment
 */
const sendErrorProd = (err, req, res) => {
  // Operational errors: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors, // Include validation errors if present
      requestId: req.requestId,
    });
  } else {
    // Programming/unknown errors: don't leak details
    logError('unhandled_application_error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      error: err.message,
      stack: err.stack,
    });

    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.',
      requestId: req.requestId,
    });
  }
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Set default values
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  logError('request_error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: err.stack,
  });

  // Handle specific error types
  let error = { ...err };
  error.message = err.message;
  error.stack = err.stack;

  // MongoDB CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    error = handleCastError(err);
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    error = handleDuplicateKeyError(err);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    error = handleValidationError(err);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = handleJWTError();
  }

  if (err.name === 'TokenExpiredError') {
    error = handleJWTExpiredError();
  }

  // Send appropriate response based on environment
  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
};

/**
 * Catch async errors wrapper
 * Wraps async route handlers to catch errors
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle 404 Not Found for undefined routes
 */
const notFound = (req, res, next) => {
  const error = new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`);
  next(error);
};

module.exports = {
  errorHandler,
  catchAsync,
  notFound,
  ApiError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
};
