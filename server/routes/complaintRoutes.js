const express = require('express');
const { body, query, param } = require('express-validator');
const router = express.Router();
const { complaintController } = require('../controllers');
const { auth, checkPermission, upload, handleUploadError, validate } = require('../middleware');

/**
 * Public Routes (for citizen complaint submission)
 */

// POST /complaints/classify  — proxy to Python AI classifier
// Called by the React frontend; forwards the image to FastAPI and returns the predicted category.
router.post(
  '/classify',
  upload.single('image'),
  handleUploadError,
  complaintController.classifyImage
);

// Create a new complaint
router.post(
  '/',
  upload.single('image'),
  handleUploadError,
  [
    body('phoneNumber')
      .optional()
      .matches(/^\+?[1-9]\d{9,14}$/)
      .withMessage('Invalid phone number format'),
    body('category')
      .notEmpty()
      .withMessage('Category is required')
      .isIn([
        // Current categories
        'Damaged Road Issue', 'Fallen Trees', 'Garbage and Trash Issue',
        'Illegal Drawing on Walls', 'Street Light Issue', 'Other',
        // Legacy categories (backward compatibility)
        'DamagedRoads', 'ElectricityIssues', 'GarbageAndSanitation',
        'road_damage', 'street_light', 'water_supply', 'sewage', 'garbage',
        'encroachment', 'noise_pollution', 'illegal_construction', 'traffic',
        'roads', 'water', 'electricity', 'sanitation', 'public_safety', 
        'environment', 'transportation', 'healthcare', 'education', 'other'
      ])
      .withMessage('Invalid category'),
    body('latitude')
      .notEmpty()
      .withMessage('Latitude is required')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Invalid latitude'),
    body('longitude')
      .notEmpty()
      .withMessage('Longitude is required')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Invalid longitude'),
    body('description')
      .optional()
      .isLength({ max: 2000 })
      .withMessage('Description cannot exceed 2000 characters'),
    body('preferredLanguage')
      .optional()
      .isIn(['en', 'hi', 'mr'])
      .withMessage('Invalid language'),
  ],
  validate,
  complaintController.createComplaint
);

// Check for duplicate complaints
router.post(
  '/check-duplicates',
  [
    body('latitude').notEmpty().isFloat({ min: -90, max: 90 }),
    body('longitude').notEmpty().isFloat({ min: -180, max: 180 }),
    body('category').notEmpty(),
  ],
  validate,
  complaintController.checkDuplicates
);

// Reverse geocode coordinates
router.get(
  '/geocode',
  [
    query('latitude').notEmpty().isFloat({ min: -90, max: 90 }),
    query('longitude').notEmpty().isFloat({ min: -180, max: 180 }),
  ],
  validate,
  complaintController.reverseGeocode
);

// ─── Track by Mobile Number (OTP-protected) ─────────────────────────

// Send OTP for mobile-number tracking
router.post(
  '/track/send-otp',
  [
    body('phoneNumber')
      .notEmpty()
      .matches(/^[1-9]\d{9}$/)
      .withMessage('Phone number must be exactly 10 digits'),
  ],
  validate,
  complaintController.trackSendOTP
);

// Verify OTP and get all complaints for the number
router.post(
  '/track/verify-otp',
  [
    body('phoneNumber')
      .notEmpty()
      .matches(/^[1-9]\d{9}$/)
      .withMessage('Phone number must be exactly 10 digits'),
    body('otp')
      .notEmpty()
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits'),
  ],
  validate,
  complaintController.trackVerifyOTP
);

// Get complaint status (public, with phone verification)
router.get(
  '/status/:complaintId',
  [
    param('complaintId').notEmpty().withMessage('Complaint ID is required'),
  ],
  validate,
  complaintController.getComplaintStatus
);

// Reopen a closed complaint (public)
router.post(
  '/status/:complaintId/reopen',
  upload.single('reopenImage'),
  [
    param('complaintId').notEmpty().withMessage('Complaint ID is required'),
    body('reason').notEmpty().withMessage('Reopen reason is required').isLength({ max: 500 }),
    body('phone').optional(),
  ],
  validate,
  complaintController.reopenComplaint
);

// Rate the officer after resolution (public)
router.post(
  '/status/:complaintId/rate',
  [
    param('complaintId').notEmpty().withMessage('Complaint ID is required'),
    body('rating').notEmpty().isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
    body('comment').optional().isLength({ max: 500 }),
    body('phone').optional(),
  ],
  validate,
  complaintController.rateOfficer
);

/**
 * Admin Routes (protected)
 */

// Get all complaints
router.get(
  '/',
  auth,
  checkPermission('canViewComplaints'),
  complaintController.getAllComplaints
);

// Get complaints for map view
router.get(
  '/map',
  auth,
  checkPermission('canViewComplaints'),
  complaintController.getComplaintsForMap
);

// Get complaint statistics
router.get(
  '/stats',
  auth,
  checkPermission('canViewAnalytics'),
  complaintController.getComplaintStats
);

// Get single complaint
router.get(
  '/:id',
  auth,
  checkPermission('canViewComplaints'),
  [
    param('id').isMongoId().withMessage('Invalid complaint ID'),
  ],
  validate,
  complaintController.getComplaint
);

// Get complaint image
router.get(
  '/:id/image',
  auth,
  checkPermission('canViewComplaints'),
  complaintController.getComplaintImage
);

// Update complaint status
router.patch(
  '/:id/status',
  auth,
  checkPermission('canUpdateStatus'),
  [
    param('id').isMongoId().withMessage('Invalid complaint ID'),
    body('status')
      .notEmpty()
      .isIn(['pending', 'in_progress', 'closed', 'rejected', 'duplicate'])
      .withMessage('Invalid status'),
    body('remarks').optional().isLength({ max: 500 }),
  ],
  validate,
  complaintController.updateComplaintStatus
);

// Assign complaint to admin
router.patch(
  '/:id/assign',
  auth,
  checkPermission('canAssignComplaints'),
  [
    param('id').isMongoId().withMessage('Invalid complaint ID'),
    body('adminId').isMongoId().withMessage('Invalid admin ID'),
  ],
  validate,
  complaintController.assignComplaint
);

// Update complaint (general update)
router.patch(
  '/:id',
  auth,
  checkPermission('canUpdateStatus'),
  [
    param('id').isMongoId().withMessage('Invalid complaint ID'),
    body('status')
      .optional()
      .isIn(['pending', 'in_progress', 'closed', 'rejected', 'duplicate'])
      .withMessage('Invalid status'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high', 'urgent'])
      .withMessage('Invalid priority'),
    body('internalNotes').optional().isLength({ max: 1000 }),
    body('remarks').optional().isLength({ max: 500 }),
  ],
  validate,
  complaintController.updateComplaint
);

module.exports = router;