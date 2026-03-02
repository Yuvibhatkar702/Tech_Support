const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { adminController } = require('../controllers');
const { auth, authorize, validate } = require('../middleware');

// Initialize first super admin (works only once)
router.post(
  '/initialize',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('name').notEmpty().withMessage('Name is required'),
  ],
  validate,
  adminController.initializeSuperAdmin
);

// Seed all default accounts (admin + dept heads + officers)
// Protected: only super_admin can re-seed; if no admins exist yet it's allowed
router.post('/seed', async (req, res, next) => {
  const Admin = require('../models/Admin');
  const count = await Admin.countDocuments();
  if (count > 0) {
    // Admins exist — require super_admin auth
    return auth(req, res, (err) => {
      if (err) return next(err);
      if (req.admin?.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      next();
    });
  }
  next(); // No admins yet — allow initial seed without auth
}, adminController.seedAccounts);

// Admin login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  adminController.login
);

// Protected routes
router.use(auth);

// Get current admin profile
router.get('/profile', adminController.getProfile);

// Update current admin profile
router.patch(
  '/profile',
  [
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('phone').optional().matches(/^\+?[1-9]\d{9,14}$/).withMessage('Invalid phone'),
    body('preferredLanguage')
      .optional()
      .isIn(['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa']),
  ],
  validate,
  adminController.updateProfile
);

// Change password
router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters'),
  ],
  validate,
  adminController.changePassword
);

// Logout
router.post('/logout', adminController.logout);

// Super admin only routes
router.get(
  '/all',
  authorize('super_admin'),
  adminController.getAllAdmins
);

router.post(
  '/',
  authorize('super_admin'),
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('name').notEmpty().withMessage('Name is required'),
    body('role')
      .optional()
      .isIn(['super_admin', 'admin', 'moderator', 'viewer', 'department_head', 'officer'])
      .withMessage('Invalid role'),
    body('department')
      .optional()
      .isIn(['roads', 'electricity', 'water', 'sanitation', 'general', 'all',
        'road_department', 'sanitation_department', 'electricity_department',
        'garden_department', 'enforcement_department'])
      .withMessage('Invalid department'),
  ],
  validate,
  adminController.createAdmin
);

router.patch(
  '/:id',
  authorize('super_admin'),
  [
    param('id').isMongoId().withMessage('Invalid admin ID'),
  ],
  validate,
  adminController.updateAdmin
);

router.delete(
  '/:id',
  authorize('super_admin'),
  [
    param('id').isMongoId().withMessage('Invalid admin ID'),
  ],
  validate,
  adminController.deleteAdmin
);

module.exports = router;
