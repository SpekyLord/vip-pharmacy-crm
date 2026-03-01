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
const VALID_ENGAGEMENT_TYPES = ['TXT_PROMATS', 'MES_VIBER_GIF', 'PICTURE', 'SIGNED_CALL', 'VOICE_CALL'];

const isValidObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error('Invalid ID format');
  }
  return true;
};

// Note: For email validation, prefer using express-validator's built-in isEmail()
// which is RFC 5322 compliant. This custom validator is kept for backward compatibility.
const isValidEmail = (value) => {
  // More permissive regex that handles modern TLDs (.museum, .travel, etc.)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(value)) {
    throw new Error('Invalid email format');
  }
  // Also check max length per RFC 5321
  if (value.length > 254) {
    throw new Error('Email address too long');
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
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character (@$!%*?&)'),
  body('role')
    .optional()
    .isIn(['admin', 'employee'])
    .withMessage('Role must be admin or employee'),
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
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character (@$!%*?&)'),
  body('role')
    .notEmpty()
    .withMessage('Role is required')
    .isIn(['admin', 'employee'])
    .withMessage('Role must be admin or employee'),
  body('phone')
    .optional()
    .custom(isValidPhone),
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
    .isIn(['admin', 'employee'])
    .withMessage('Role must be admin or employee'),
  body('phone')
    .optional()
    .custom(isValidPhone),
  validate,
];

/**
 * Doctor validation rules
 */
const VALID_PROGRAMS = ['CME GRANT', 'REBATES / MONEY', 'REST AND RECREATION', 'MED SOCIETY PARTICIPATION'];
const VALID_SUPPORT_TYPES = ['STARTER DOSES', 'PROMATS', 'FULL DOSE', 'PATIENT DISCOUNT', 'AIR FRESHENER'];

const createDoctorValidation = [
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  body('specialization')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Specialization cannot exceed 100 characters'),
  body('clinicOfficeAddress')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Clinic/Office address cannot exceed 500 characters'),
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
  body('programsToImplement')
    .optional()
    .isArray()
    .withMessage('Programs to implement must be an array'),
  body('programsToImplement.*')
    .optional()
    .isIn(VALID_PROGRAMS)
    .withMessage('Invalid program type'),
  body('supportDuringCoverage')
    .optional()
    .isArray()
    .withMessage('Support during coverage must be an array'),
  body('supportDuringCoverage.*')
    .optional()
    .isIn(VALID_SUPPORT_TYPES)
    .withMessage('Invalid support type'),
  body('levelOfEngagement')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Level of engagement must be between 1 and 5'),
  body('birthday')
    .optional()
    .isISO8601()
    .withMessage('Invalid birthday date format'),
  body('anniversary')
    .optional()
    .isISO8601()
    .withMessage('Invalid anniversary date format'),
  body('targetProducts')
    .optional()
    .isArray({ max: 3 })
    .withMessage('Target products must be an array with max 3 items'),
  body('targetProducts.*.product')
    .optional()
    .custom(isValidObjectId),
  body('targetProducts.*.status')
    .optional()
    .isIn(['showcasing', 'accepted'])
    .withMessage('Product status must be showcasing or accepted'),
  validate,
];

const updateDoctorValidation = [
  param('id').custom(isValidObjectId),
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  body('specialization')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Specialization cannot exceed 100 characters'),
  body('clinicOfficeAddress')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Clinic/Office address cannot exceed 500 characters'),
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
  body('programsToImplement')
    .optional()
    .isArray()
    .withMessage('Programs to implement must be an array'),
  body('programsToImplement.*')
    .optional()
    .isIn(VALID_PROGRAMS)
    .withMessage('Invalid program type'),
  body('supportDuringCoverage')
    .optional()
    .isArray()
    .withMessage('Support during coverage must be an array'),
  body('supportDuringCoverage.*')
    .optional()
    .isIn(VALID_SUPPORT_TYPES)
    .withMessage('Invalid support type'),
  body('levelOfEngagement')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Level of engagement must be between 1 and 5'),
  body('birthday')
    .optional()
    .isISO8601()
    .withMessage('Invalid birthday date format'),
  body('anniversary')
    .optional()
    .isISO8601()
    .withMessage('Invalid anniversary date format'),
  body('targetProducts')
    .optional()
    .isArray({ max: 3 })
    .withMessage('Target products must be an array with max 3 items'),
  body('targetProducts.*.product')
    .optional()
    .custom(isValidObjectId),
  body('targetProducts.*.status')
    .optional()
    .isIn(['showcasing', 'accepted'])
    .withMessage('Product status must be showcasing or accepted'),
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
  body('engagementTypes')
    .optional()
    .isArray()
    .withMessage('Engagement types must be an array'),
  body('engagementTypes.*')
    .optional()
    .isIn(VALID_ENGAGEMENT_TYPES)
    .withMessage('Invalid engagement type'),
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
 * Client validation rules (Regular / Non-VIP Clients)
 */
const createClientValidation = [
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  body('specialization')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Specialization cannot exceed 100 characters'),
  body('clinicOfficeAddress')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Clinic/Office address cannot exceed 500 characters'),
  body('region')
    .notEmpty()
    .withMessage('Region is required')
    .custom(isValidObjectId),
  body('phone')
    .optional()
    .custom(isValidPhone),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  validate,
];

const updateClientValidation = [
  param('id').custom(isValidObjectId),
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  body('specialization')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Specialization cannot exceed 100 characters'),
  body('clinicOfficeAddress')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Clinic/Office address cannot exceed 500 characters'),
  body('phone')
    .optional()
    .custom(isValidPhone),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  validate,
];

const createClientVisitValidation = [
  body('client')
    .notEmpty()
    .withMessage('Client is required')
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
  body('purpose')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Purpose cannot exceed 500 characters'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
  body('engagementTypes')
    .optional()
    .isArray()
    .withMessage('Engagement types must be an array'),
  body('engagementTypes.*')
    .optional()
    .isIn(VALID_ENGAGEMENT_TYPES)
    .withMessage('Invalid engagement type'),
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
  createClientValidation,
  updateClientValidation,
  createClientVisitValidation,
  paginationValidation,
  monthYearValidation,
  objectIdParamValidation,
};
