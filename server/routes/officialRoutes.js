const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const officialController = require('../controllers/officialController');
const { auth, authorize, validate, upload, handleUploadError } = require('../middleware');

// ─── Public: Official login ─────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  officialController.officialLogin
);

// ─── All routes below require authentication ────────────────────────
router.use(auth);

// ─── OFFICIAL: Get own profile (verify token validity) ──────────────
router.get('/profile', officialController.getOfficialProfile);

// ─── ADMIN: Create department head ──────────────────────────────────
router.post(
  '/department-heads',
  authorize('super_admin', 'admin'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
    body('departmentCode').notEmpty().withMessage('Department code is required'),
    body('phone').optional(),
  ],
  validate,
  officialController.createDepartmentHead
);

// ─── ADMIN: Create officer ──────────────────────────────────────────
router.post(
  '/officers',
  authorize('super_admin', 'admin'),
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
    body('departmentCode').notEmpty().withMessage('Department code is required'),
    body('phone').optional(),
  ],
  validate,
  officialController.createOfficer
);

// ─── ADMIN: Get all officials ───────────────────────────────────────
router.get(
  '/all',
  authorize('super_admin', 'admin'),
  officialController.getAllOfficials
);

// ─── DEPARTMENT HEAD: Get department officers ───────────────────────
router.get(
  '/officers',
  authorize('department_head'),
  officialController.getDepartmentOfficers
);

// ─── DEPARTMENT HEAD: Department complaints ─────────────────────────
router.get(
  '/department/complaints',
  authorize('department_head'),
  officialController.getDepartmentComplaints
);

// ─── DEPARTMENT HEAD: Department stats ──────────────────────────────
router.get(
  '/department/stats',
  authorize('department_head'),
  officialController.getDepartmentStats
);

// ─── DEPARTMENT HEAD: Assign officer ────────────────────────────────
router.patch(
  '/complaints/:id/assign',
  authorize('department_head'),
  [
    param('id').isMongoId().withMessage('Invalid complaint ID'),
    body('officerId').isMongoId().withMessage('Valid officer ID is required'),
  ],
  validate,
  officialController.assignOfficer
);

// ─── OFFICER: Get assigned complaints ───────────────────────────────
router.get(
  '/officer/complaints',
  authorize('officer'),
  officialController.getOfficerComplaints
);

// ─── OFFICER: Stats ─────────────────────────────────────────────────
router.get(
  '/officer/stats',
  authorize('officer'),
  officialController.getOfficerStats
);

// ─── OFFICER: Start work ────────────────────────────────────────────
router.patch(
  '/complaints/:id/start',
  authorize('officer'),
  [param('id').isMongoId().withMessage('Invalid complaint ID')],
  validate,
  officialController.startWork
);

// ─── OFFICER: Close complaint ─────────────────────────────────────
router.patch(
  '/complaints/:id/resolve',
  authorize('officer'),
  upload.array('proof', 5),
  handleUploadError,
  [param('id').isMongoId().withMessage('Invalid complaint ID')],
  validate,
  officialController.resolveComplaint
);

// ─── ADMIN: Reassign complaint ──────────────────────────────────────
router.patch(
  '/complaints/:id/reassign',
  authorize('super_admin', 'admin'),
  [
    param('id').isMongoId().withMessage('Invalid complaint ID'),
    body('officerId').optional().isMongoId(),
    body('departmentCode').optional().isString(),
  ],
  validate,
  officialController.reassignComplaint
);

// ─── ADMIN: Delete (deactivate) an official ─────────────────────────
router.delete(
  '/:id',
  authorize('super_admin', 'admin'),
  [param('id').isMongoId().withMessage('Invalid official ID')],
  validate,
  officialController.deleteOfficial
);

module.exports = router;
