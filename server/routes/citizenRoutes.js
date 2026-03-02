const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const citizenController = require('../controllers/citizenController');
const { citizenAuth } = require('../middleware/citizenAuth');
const { validate } = require('../middleware');

/**
 * Public Routes
 */

// Request OTP
router.post(
  '/request-otp',
  [
    body('phoneNumber')
      .notEmpty()
      .matches(/^\+?[1-9]\d{9,14}$/)
      .withMessage('Invalid phone number'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Invalid email'),
  ],
  validate,
  citizenController.requestOTP
);

// Verify OTP
router.post(
  '/verify-otp',
  [
    body('phoneNumber')
      .notEmpty()
      .matches(/^\+?[1-9]\d{9,14}$/)
      .withMessage('Invalid phone number'),
    body('otp')
      .notEmpty()
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits'),
  ],
  validate,
  citizenController.verifyOTP
);

/**
 * Protected Routes
 */

// Get profile
router.get('/profile', citizenAuth, citizenController.getProfile);

// Update profile
router.patch(
  '/profile',
  citizenAuth,
  [
    body('name').optional().isLength({ max: 100 }),
    body('email').optional().isEmail(),
    body('preferences').optional().isObject(),
  ],
  validate,
  citizenController.updateProfile
);

// Get my complaints
router.get(
  '/complaints',
  citizenAuth,
  [
    query('status').optional().isIn(['pending', 'in_progress', 'closed', 'rejected']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  validate,
  citizenController.getMyComplaints
);

// Submit feedback
router.post(
  '/complaints/:complaintId/feedback',
  citizenAuth,
  [
    param('complaintId').notEmpty(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional().isLength({ max: 500 }),
  ],
  validate,
  citizenController.submitFeedback
);

// Register push subscription
router.post(
  '/push-subscription',
  citizenAuth,
  [
    body('subscription').isObject(),
    body('subscription.endpoint').notEmpty(),
  ],
  validate,
  citizenController.registerPushSubscription
);

// Logout
router.post('/logout', citizenAuth, citizenController.logout);

module.exports = router;
