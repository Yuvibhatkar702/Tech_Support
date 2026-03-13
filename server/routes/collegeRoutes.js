const express = require('express');
const router = express.Router();
const collegeController = require('../controllers/collegeController');
const { auth } = require('../middleware/auth');

// Public routes
router.get('/public', collegeController.getAllColleges);
router.get('/public/:code/faculty', collegeController.getCollegeFacultyByCode);
router.get('/public/:code', collegeController.getCollegeByCode);
router.get('/cities', collegeController.getCities);

// Protected routes (admin only)
router.use(auth);

router.get('/', collegeController.getAllColleges);
router.get('/:code', collegeController.getCollegeByCode);
router.post('/', collegeController.createCollege);
router.post('/bulk-import', collegeController.bulkImport);
router.post('/:id/faculty', collegeController.addFacultyToCollege);
router.put('/:id/faculty/:facultyId', collegeController.updateCollegeFaculty);
router.delete('/:id/faculty/:facultyId', collegeController.removeCollegeFaculty);
router.post('/:id/generate-code', collegeController.generateCode);
router.put('/:id', collegeController.updateCollege);
router.delete('/:id', collegeController.deleteCollege);

module.exports = router;
