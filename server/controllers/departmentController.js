const Department = require('../models/Department');
const CategoryMapping = require('../models/CategoryMapping');
const AuditLog = require('../models/AuditLog');

/**
 * Get all departments
 */
exports.getAllDepartments = async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true }).sort({ name: 1 });
    res.json({
      success: true,
      data: departments,
    });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch departments' });
  }
};

/**
 * Get single department by code
 */
exports.getDepartmentByCode = async (req, res) => {
  try {
    const department = await Department.findOne({ code: req.params.code, isActive: true });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }
    res.json({ success: true, data: department });
  } catch (error) {
    console.error('Get department error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch department' });
  }
};

/**
 * Create a new department (admin only)
 * Auto-generates department code from name.
 * Creates CategoryMapping entries for each subcategory.
 */
exports.createDepartment = async (req, res) => {
  try {
    const {
      name, description,
      subcategories,
      priority, isActive,
    } = req.body;

    // Auto-generate code from department name
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    // Check for duplicate department
    const existing = await Department.findOne({ $or: [{ name }, { code }] });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Department name already exists' });
    }

    // Create the department
    const department = await Department.create({
      name,
      code,
      description: description || '',
      supportedCategories: (subcategories || []).map(s => ({ name: s.name, sla: s.sla || '3-5 Days' })),
      priority: priority || 'medium',
      isActive: isActive !== undefined ? isActive : true,
    });

    // Auto-create CategoryMapping entries for each subcategory (with per-subcategory SLA)
    const mappingsCreated = [];
    if (subcategories && subcategories.length > 0) {
      for (const sub of subcategories) {
        try {
          const mapping = await CategoryMapping.findOneAndUpdate(
            { categoryName: sub.name },
            {
              categoryName: sub.name,
              departmentId: department._id,
              departmentName: name,
              departmentCode: code,
              slaDuration: sub.sla || '3-5 Days',
              source: 'manual',
              isActive: true,
            },
            { upsert: true, new: true }
          );
          mappingsCreated.push(mapping.categoryName);
        } catch (_err) {
          // Skip duplicates silently
        }
      }
    }

    await AuditLog.log('department_created', {
      admin: req.admin._id,
      details: {
        departmentId: department._id,
        name,
        code,
        subcategories: mappingsCreated,
      },
    });

    res.status(201).json({
      success: true,
      data: department,
      mappingsCreated: mappingsCreated.length,
      message: `Department "${name}" created${mappingsCreated.length > 0 ? ` with ${mappingsCreated.length} subcategory mapping(s)` : ''}`,
    });
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ success: false, message: 'Failed to create department' });
  }
};

/**
 * Update a department (admin only)
 */
exports.updateDepartment = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    if (name !== undefined) department.name = name;
    if (description !== undefined) department.description = description;
    if (isActive !== undefined) department.isActive = isActive;
    await department.save();

    res.json({ success: true, data: department });
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ success: false, message: 'Failed to update department' });
  }
};

/**
 * Delete (deactivate) a department (admin only)
 */
exports.deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found' });
    }

    // Check if department has associated complaints
    const Complaint = require('../models/Complaint');
    const complaintCount = await Complaint.countDocuments({ department: department.code });
    if (complaintCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: this department has ${complaintCount} complaint(s). Reassign or resolve them first.`,
      });
    }

    // Check if department has assigned officials
    const Admin = require('../models/Admin');
    const officialCount = await Admin.countDocuments({ departmentCode: department.code, isActive: true });
    if (officialCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: this department has ${officialCount} active official(s). Remove them first.`,
      });
    }

    await Department.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: `Department "${department.name}" has been permanently deleted` });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete department' });
  }
};
