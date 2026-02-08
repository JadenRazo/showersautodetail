import { body, param, validationResult } from 'express-validator';

export const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export const quoteValidation = [
  body('customerName')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be between 2 and 200 characters')
    .escape(),
  body('customerEmail')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('customerPhone')
    .matches(/^[\d\s\-\+\(\)]{10,20}$/)
    .withMessage('Valid phone number is required'),
  body('vehicleType')
    .isIn(['sedan', 'suv', 'commercial'])
    .withMessage('Vehicle type must be sedan, suv, or commercial'),
  body('serviceLevel')
    .optional()
    .isIn(['exterior', 'interior', 'deep-interior', 'package-deal', 'disaster'])
    .withMessage('Service level must be exterior, interior, deep-interior, package-deal, or disaster'),
  body('message')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Message cannot exceed 1000 characters')
    .escape(),
  handleValidation
];

export const bookingValidation = [
  body('customerName')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be between 2 and 200 characters')
    .escape(),
  body('customerEmail')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('customerPhone')
    .matches(/^[\d\s\-\+\(\)]{10,20}$/)
    .withMessage('Valid phone number is required'),
  body('vehicleType')
    .isIn(['sedan', 'suv', 'commercial'])
    .withMessage('Vehicle type must be sedan, suv, or commercial'),
  body('packageId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid package ID is required'),
  body('serviceId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid service ID is required'),
  body('bookingDate')
    .isISO8601()
    .withMessage('Valid date is required')
    .toDate(),
  body('bookingTime')
    .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .withMessage('Valid time in HH:MM format is required'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address cannot exceed 500 characters')
    .escape(),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
    .escape(),
  handleValidation
];

export const reviewValidation = [
  body('customerName')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be between 2 and 200 characters')
    .escape(),
  body('customerEmail')
    .optional()
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('reviewText')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Review text cannot exceed 2000 characters')
    .escape(),
  body('bookingId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid booking ID is required'),
  handleValidation
];

export const idParamValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid ID is required'),
  handleValidation
];

export const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('rememberMe')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be a boolean'),
  handleValidation
];
