/**
 * Request Validation Middleware
 *
 * This file handles:
 * - Request body validation using express-validator
 * - Query parameter validation
 * - Route parameter validation
 * - Validation error formatting
 * - Custom validation rules for GPS, dates, and ObjectIds
 */

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Validate and return errors if any
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

/**
 * Common validation rules
 */
const isValidObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error('Invalid ID format');
  }
  return true;
};

const isValidEmail = (value) => {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(value)) {
    throw new Error('Invalid email format');
  }
  return true;
};

const isValidPhone = (value) => {
  if (value && !/^[0-9+\-() ]{10,20}$/.test(value)) {
    throw new Error('Invalid phone number format');
  }
  return true;
};

const isValidLatitude = (value) => {
  const lat = parseFloat(value);
  if (isNaN(lat) || lat < -90 || lat > 90) {
    throw new Error('Latitude must be between -90 and 90');
  }
  return true;
};

const isValidLongitude = (value) => {
  const lng = parseFloat(value);
  if (isNaN(lng) || lng < -180 || lng > 180) {
    throw new Error('Longitude must be between -180 and 180');
  }
  return true;
};

const isWorkDay = (value) => {
  const date = new Date(value);
  const day = date.getDay();
  if (day === 0 || day === 6) {
    throw new Error('Date must be a work day (Monday-Friday)');
  }
  return true;
};

/**
 * Auth validation rules
 */
const loginValidation = [
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  validate,
];

const registerValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  body('role')
    .optional()
    .isIn(['admin', 'medrep', 'employee'])
    .withMessage('Role must be admin, medrep, or employee'),
  validate,
];

/**
 * User validation rules
 */
const createUserValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('role')
    .notEmpty()
    .withMessage('Role is required')
    .isIn(['admin', 'medrep', 'employee'])
    .withMessage('Role must be admin, medrep, or employee'),
  body('phone')
    .optional()
    .custom(isValidPhone),
  body('assignedRegions')
    .optional()
    .isArray()
    .withMessage('Assigned regions must be an array'),
  body('assignedRegions.*')
    .optional()
    .custom(isValidObjectId),
  validate,
];

const updateUserValidation = [
  param('id').custom(isValidObjectId),
  body('name')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email'),
  body('role')
    .optional()
    .isIn(['admin', 'medrep', 'employee'])
    .withMessage('Role must be admin, medrep, or employee'),
  body('phone')
    .optional()
    .custom(isValidPhone),
  validate,
];

/**
 * Doctor validation rules
 */
const createDoctorValidation = [
  body('name')
    .notEmpty()
    .withMessage('Doctor name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('specialization')
    .notEmpty()
    .withMessage('Specialization is required'),
  body('hospital')
    .notEmpty()
    .withMessage('Hospital/Clinic name is required')
    .isLength({ max: 200 })
    .withMessage('Hospital name cannot exceed 200 characters'),
  body('region')
    .notEmpty()
    .withMessage('Region is required')
    .custom(isValidObjectId),
  body('visitFrequency')
    .optional()
    .isIn([2, 4])
    .withMessage('Visit frequency must be 2 or 4'),
  body('phone')
    .optional()
    .custom(isValidPhone),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email'),
  validate,
];

const updateDoctorValidation = [
  param('id').custom(isValidObjectId),
  body('name')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('hospital')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Hospital name cannot exceed 200 characters'),
  body('visitFrequency')
    .optional()
    .isIn([2, 4])
    .withMessage('Visit frequency must be 2 or 4'),
  body('phone')
    .optional()
    .custom(isValidPhone),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email'),
  validate,
];

/**
 * Visit validation rules
 */
const createVisitValidation = [
  body('doctor')
    .notEmpty()
    .withMessage('Doctor is required')
    .custom(isValidObjectId),
  body('visitDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format')
    .custom(isWorkDay),
  body('location.latitude')
    .notEmpty()
    .withMessage('GPS latitude is required')
    .custom(isValidLatitude),
  body('location.longitude')
    .notEmpty()
    .withMessage('GPS longitude is required')
    .custom(isValidLongitude),
  body('visitType')
    .optional()
    .isIn(['regular', 'follow-up', 'emergency'])
    .withMessage('Visit type must be regular, follow-up, or emergency'),
  body('purpose')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Purpose cannot exceed 500 characters'),
  body('doctorFeedback')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Feedback cannot exceed 1000 characters'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  body('productsDiscussed')
    .optional()
    .isArray()
    .withMessage('Products discussed must be an array'),
  body('productsDiscussed.*.product')
    .optional()
    .custom(isValidObjectId),
  validate,
];

/**
 * Product validation rules
 */
const createProductValidation = [
  body('name')
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('category')
    .notEmpty()
    .withMessage('Category is required'),
  body('briefDescription')
    .notEmpty()
    .withMessage('Brief description is required')
    .isLength({ max: 200 })
    .withMessage('Brief description cannot exceed 200 characters'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('keyBenefits')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Maximum 10 key benefits allowed'),
  body('usageInformation')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Usage information cannot exceed 1000 characters'),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  validate,
];

const updateProductValidation = [
  param('id').custom(isValidObjectId),
  body('name')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('briefDescription')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Brief description cannot exceed 200 characters'),
  body('description')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  validate,
];

/**
 * Product Assignment validation rules
 */
const createAssignmentValidation = [
  body('product')
    .notEmpty()
    .withMessage('Product is required')
    .custom(isValidObjectId),
  body('doctor')
    .notEmpty()
    .withMessage('Doctor is required')
    .custom(isValidObjectId),
  body('priority')
    .optional()
    .isIn([1, 2, 3])
    .withMessage('Priority must be 1, 2, or 3'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  validate,
];

/**
 * Region validation rules
 */
const createRegionValidation = [
  body('name')
    .notEmpty()
    .withMessage('Region name is required')
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('code')
    .notEmpty()
    .withMessage('Region code is required')
    .isLength({ max: 20 })
    .withMessage('Code cannot exceed 20 characters'),
  body('level')
    .notEmpty()
    .withMessage('Region level is required')
    .isIn(['country', 'province', 'city', 'district', 'area'])
    .withMessage('Invalid region level'),
  body('parent')
    .optional()
    .custom(isValidObjectId),
  validate,
];

/**
 * Query validation rules
 */
const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  validate,
];

const monthYearValidation = [
  query('monthYear')
    .optional()
    .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    .withMessage('Month year must be in YYYY-MM format'),
  validate,
];

/**
 * Param validation rules
 */
const objectIdParamValidation = [
  param('id').custom(isValidObjectId),
  validate,
];

module.exports = {
  validate,
  isValidObjectId,
  isValidEmail,
  isValidPhone,
  isValidLatitude,
  isValidLongitude,
  isWorkDay,
  loginValidation,
  registerValidation,
  createUserValidation,
  updateUserValidation,
  createDoctorValidation,
  updateDoctorValidation,
  createVisitValidation,
  createProductValidation,
  updateProductValidation,
  createAssignmentValidation,
  createRegionValidation,
  paginationValidation,
  monthYearValidation,
  objectIdParamValidation,
};
