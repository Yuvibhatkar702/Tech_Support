const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Complaint = require('../models/Complaint');
const Department = require('../models/Department');
const AuditLog = require('../models/AuditLog');
const config = require('../config');
const smsService = require('../services/smsService');
const { getProgressPercentage, getStatusLabel, getStatusTimeline } = require('../utils/progressTracker');
const { calculateRemainingTime } = require('../utils/resolutionConfig');

/**
 * Generate JWT token for official
 */
const generateToken = (official) => {
  return jwt.sign(
    { id: official._id, email: official.email, role: official.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
};

// ─── ADMIN: Create department head ─────────────────────────────────
exports.createDepartmentHead = async (req, res) => {
  try {
    const { name, email, phone, designation, employeeId, departmentCode, isActive } = req.body;

    if (!name || !email || !phone || !designation || !departmentCode) {
      return res.status(400).json({
        success: false,
        message: 'name, email, phone, designation, and departmentCode are required',
      });
    }

    const dept = await Department.findOne({ code: departmentCode, isActive: true });
    if (!dept) {
      return res.status(400).json({ success: false, message: 'Invalid department code' });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const head = await Admin.create({
      name,
      email,
      password: 'Pass@123',
      phone,
      designation,
      employeeId: employeeId || '',
      role: 'department_head',
      department: departmentCode,
      departmentCode,
      departmentRef: dept._id,
      isActive: isActive !== undefined ? isActive : true,
      permissions: {
        canViewComplaints: true,
        canUpdateStatus: true,
        canAssignComplaints: true,
        canDeleteComplaints: false,
        canManageAdmins: false,
        canViewAnalytics: true,
        canExportData: true,
      },
    });

    await AuditLog.log('department_head_created', {
      admin: req.admin._id,
      details: { headId: head._id, department: departmentCode, designation },
    });

    res.status(201).json({ success: true, data: head.toJSON() });
  } catch (error) {
    console.error('Create dept head error:', error);
    res.status(500).json({ success: false, message: 'Failed to create department head' });
  }
};

// ─── ADMIN: Create officer ─────────────────────────────────────────
exports.createOfficer = async (req, res) => {
  try {
    const { name, email, phone, designation, employeeId, departmentCode, department, role, isActive } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'name and email are required',
      });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Determine role - support 'support' and 'developer' roles directly
    const finalRole = role || 'developer';
    const finalDepartment = departmentCode || department || finalRole;
    const finalDesignation = designation || (finalRole === 'support' ? 'Support Engineer' : 'Developer');

    const officer = await Admin.create({
      name,
      email,
      password: 'TechSupport@123',
      phone: phone || '',
      designation: finalDesignation,
      employeeId: employeeId || '',
      role: finalRole,
      department: finalDepartment,
      departmentCode: finalDepartment,
      isActive: isActive !== undefined ? isActive : true,
      permissions: {
        canViewComplaints: true,
        canUpdateStatus: true,
        canAssignComplaints: finalRole === 'support',
        canDeleteComplaints: finalRole === 'developer',
        canManageAdmins: false,
        canViewAnalytics: true,
        canExportData: true,
      },
    });

    await AuditLog.log('officer_created', {
      admin: req.admin._id,
      details: { officerId: officer._id, role: finalRole, designation: finalDesignation },
    });

    res.status(201).json({ success: true, data: officer.toJSON() });
  } catch (error) {
    console.error('Create officer error:', error);
    res.status(500).json({ success: false, message: 'Failed to create officer' });
  }
};

// ─── OFFICIAL: Login (email + password) ─────────────────────────────
exports.officialLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const official = await Admin.findByCredentials(email, password);

    const token = generateToken(official);

    await AuditLog.log('official_login', {
      admin: official._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        official: official.toJSON(),
        token,
      },
    });
  } catch (error) {
    console.error('Official login error:', error);
    res.status(401).json({ success: false, message: error.message || 'Authentication failed' });
  }
};

// ─── OFFICIAL: Get own profile (verify token is still valid) ────────
exports.getOfficialProfile = async (req, res) => {
  try {
    // req.admin is populated by auth middleware if token is valid
    const official = req.admin;
    res.json({
      success: true,
      data: {
        official: official.toJSON(),
      },
    });
  } catch (error) {
    console.error('Get official profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
};

// ─── OFFICIAL: Change password ──────────────────────────────────────
exports.changeOfficialPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const official = await Admin.findById(req.admin._id);

    if (!official) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Verify current password
    const isMatch = await official.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Update password (model's pre-save hook will hash it)
    official.password = newPassword;
    await official.save();

    // Log the password change
    await AuditLog.log('password_changed', {
      admin: official._id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

// ─── Get all officers of a department (for dept head) ──────────────
exports.getDepartmentOfficers = async (req, res) => {
  try {
    // For Tech Support Portal: support/dev users see all developers and support
    const officers = await Admin.find({
      role: { $in: ['developer', 'support'] },
      isActive: true,
    }).select('name email phone role departmentCode designation');

    // Count active (non-closed/rejected) complaints per developer
    const activeStatuses = ['assigned', 'in_progress', 'reopened'];
    const counts = await Complaint.aggregate([
      { $match: { status: { $in: activeStatuses }, assignedTo: { $ne: null } } },
      { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => { countMap[c._id.toString()] = c.count; });

    const enriched = officers.map((o) => {
      const obj = o.toObject();
      obj.activeComplaints = countMap[o._id.toString()] || 0;
      return obj;
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('Get officers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch officers' });
  }
};

// ─── Get all officials (admin) ─────────────────────────────────────
exports.getAllOfficials = async (req, res) => {
  try {
    const filter = { role: { $in: ['developer', 'support'] } };
    if (req.query.department) filter.departmentCode = req.query.department;
    if (req.query.role) filter.role = req.query.role;

    const officials = await Admin.find(filter)
      .select('name email phone designation employeeId role departmentCode department isActive createdAt')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: officials });
  } catch (error) {
    console.error('Get officials error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch officials' });
  }
};

// ─── SUPPORT: Get all complaints (Tech Support Portal) ─────────────
exports.getDepartmentComplaints = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    // For Tech Support Portal: support users see ALL complaints
    const filter = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .populate('assignedTo', 'name email phone')
        .populate('assignedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Complaint.countDocuments(filter),
    ]);

    // Enrich with progress + countdown
    const enriched = complaints.map((c) => {
      const obj = c.toObject();
      obj.progress = getProgressPercentage(c.status);
      obj.statusLabel = getStatusLabel(c.status);
      if (c.expectedResolveAt) {
        obj.countdown = calculateRemainingTime(c.expectedResolveAt);
      }
      return obj;
    });

    res.json({
      success: true,
      data: enriched,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('Dept complaints error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch department complaints' });
  }
};

// ─── DEPARTMENT HEAD: Assign officer to complaint ───────────────────
exports.assignOfficer = async (req, res) => {
  try {
    const { id } = req.params;
    const { officerId } = req.body;

    if (!officerId) {
      return res.status(400).json({ success: false, message: 'officerId is required' });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // For admin/super_admin: allow assigning any active officer or department_head
    // For department_head: restrict to officers in their department
    let officer;
    if (['super_admin', 'admin'].includes(req.admin.role)) {
      officer = await Admin.findOne({
        _id: officerId,
        role: { $in: ['officer', 'developer', 'support', 'department_head'] },
        isActive: true,
      });
    } else {
      const deptCode = req.admin.departmentCode || req.admin.department;
      officer = await Admin.findOne({
        _id: officerId,
        role: { $in: ['officer', 'developer', 'support'] },
        $or: [{ departmentCode: deptCode }, { department: deptCode }],
        isActive: true,
      });
    }

    if (!officer) {
      return res.status(400).json({ success: false, message: 'Official not found or inactive' });
    }

    complaint.assignedTo = officer._id;
    complaint.assignedBy = req.admin._id;
    complaint.assignedAt = new Date();
    complaint.status = 'assigned';

    // Track in assignment history
    complaint.assignmentHistory.push({
      assignedTo: officer._id,
      assignedBy: req.admin._id,
      assignedAt: new Date(),
      remarks: `Assigned to ${officer.name} by ${req.admin.name}`,
    });

    complaint.statusHistory.push({
      status: 'assigned',
      changedAt: new Date(),
      changedBy: req.admin._id,
      remarks: `Assigned to ${officer.name} by ${req.admin.name}`,
    });
    await complaint.save();

    await AuditLog.log('complaint_assigned', {
      admin: req.admin._id,
      complaint: complaint._id,
      details: { officerId: officer._id, officerName: officer.name },
    });

    res.json({
      success: true,
      message: `Complaint assigned to ${officer.name}`,
      data: {
        complaintId: complaint.complaintId,
        status: complaint.status,
        assignedTo: { _id: officer._id, name: officer.name, email: officer.email },
        assignedAt: complaint.assignedAt,
      },
    });
  } catch (error) {
    console.error('Assign officer error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign officer' });
  }
};

// ─── OFFICER: Get assigned complaints ──────────────────────────────
exports.getOfficerComplaints = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { assignedTo: req.admin._id };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .populate('assignedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Complaint.countDocuments(filter),
    ]);

    const enriched = complaints.map((c) => {
      const obj = c.toObject();
      obj.progress = getProgressPercentage(c.status);
      obj.statusLabel = getStatusLabel(c.status);
      if (c.expectedResolveAt) {
        obj.countdown = calculateRemainingTime(c.expectedResolveAt);
      }
      return obj;
    });

    res.json({
      success: true,
      data: enriched,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    console.error('Officer complaints error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assigned complaints' });
  }
};

// ─── OFFICER: Start work on complaint ──────────────────────────────
exports.startWork = async (req, res) => {
  try {
    const { id } = req.params;
    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    if (String(complaint.assignedTo) !== String(req.admin._id)) {
      return res.status(403).json({ success: false, message: 'Not assigned to you' });
    }

    if (complaint.status !== 'assigned') {
      return res.status(400).json({ success: false, message: `Cannot start work — current status is "${complaint.status}"` });
    }

    complaint.status = 'in_progress';
    complaint.startedAt = new Date();
    complaint.statusHistory.push({
      status: 'in_progress',
      changedAt: new Date(),
      changedBy: req.admin._id,
      remarks: `Work started by ${req.admin.name}`,
    });
    await complaint.save();

    await AuditLog.log('complaint_work_started', {
      admin: req.admin._id,
      complaint: complaint._id,
    });

    res.json({
      success: true,
      message: 'Work started',
      data: {
        complaintId: complaint.complaintId,
        status: complaint.status,
        startedAt: complaint.startedAt,
        progress: getProgressPercentage(complaint.status),
      },
    });
  } catch (error) {
    console.error('Start work error:', error);
    res.status(500).json({ success: false, message: 'Failed to start work' });
  }
};

// ─── OFFICER: Resolve complaint ─────────────────────────────────────
exports.resolveComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    if (String(complaint.assignedTo) !== String(req.admin._id)) {
      return res.status(403).json({ success: false, message: 'Not assigned to you' });
    }

    if (!['assigned', 'in_progress'].includes(complaint.status)) {
      return res.status(400).json({ success: false, message: `Cannot resolve — current status is "${complaint.status}"` });
    }

    // Handle proof images if uploaded
    if (req.files && req.files.length > 0) {
      complaint.resolutionProof = req.files.map((f) => ({
        fileName: f.filename,
        filePath: f.path,
        uploadedAt: new Date(),
      }));
    }

    complaint.status = 'closed';
    complaint.resolvedAt = new Date();
    complaint.resolution = {
      description: remarks || 'Issue closed',
      resolvedAt: new Date(),
    };
    complaint.statusHistory.push({
      status: 'closed',
      changedAt: new Date(),
      changedBy: req.admin._id,
      remarks: remarks || 'Closed by officer',
    });
    await complaint.save();

    await AuditLog.log('complaint_closed', {
      admin: req.admin._id,
      complaint: complaint._id,
      details: { hasProof: !!(req.files && req.files.length) },
    });

    // Send SMS notification
    try {
      await smsService.notifyComplaintClosed(complaint);
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
    }

    res.json({
      success: true,
      message: 'Complaint closed',
      data: {
        complaintId: complaint.complaintId,
        status: complaint.status,
        resolvedAt: complaint.resolvedAt,
        progress: getProgressPercentage(complaint.status),
      },
    });
  } catch (error) {
    console.error('Resolve error:', error);
    res.status(500).json({ success: false, message: 'Failed to close complaint' });
  }
};

// ─── ADMIN: Reassign complaint ──────────────────────────────────────
exports.reassignComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { officerId, departmentCode, remarks } = req.body;

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // If changing department
    if (departmentCode) {
      complaint.department = departmentCode;
    }

    // Process reassign images
    let reassignImages = [];
    const uploadedFiles = req.files;
    if (uploadedFiles && uploadedFiles.length > 0) {
      reassignImages = uploadedFiles.map(file => ({
        originalName: file.originalname,
        fileName: file.filename,
        filePath: file.path,
        mimeType: file.mimetype,
        size: file.size,
      }));
    }

    if (officerId) {
      const officer = await Admin.findOne({ _id: officerId, role: { $in: ['officer', 'developer', 'support'] }, isActive: true });
      if (!officer) {
        return res.status(400).json({ success: false, message: 'Officer not found' });
      }
      complaint.assignedTo = officer._id;
      complaint.assignedBy = req.admin._id;
      complaint.assignedAt = new Date();
      complaint.status = 'assigned';

      const historyRemarks = remarks
        ? `Reassigned to ${officer.name} by ${req.admin.name}: ${remarks}`
        : `Reassigned to ${officer.name} by ${req.admin.name}`;

      // Track in assignment history (visible on admin panel)
      complaint.assignmentHistory.push({
        assignedTo: officer._id,
        assignedBy: req.admin._id,
        assignedAt: new Date(),
        remarks: historyRemarks,
      });

      const historyEntry = {
        status: 'assigned',
        changedAt: new Date(),
        changedBy: req.admin._id,
        remarks: historyRemarks,
      };
      if (reassignImages.length > 0) {
        historyEntry.attachments = reassignImages;
      }
      complaint.statusHistory.push(historyEntry);
    }

    await complaint.save();

    res.json({ success: true, message: 'Complaint reassigned', data: complaint });
  } catch (error) {
    console.error('Reassign error:', error);
    res.status(500).json({ success: false, message: 'Failed to reassign' });
  }
};

// ─── Department stats ──────────────────────────────────────────────
exports.getDepartmentStats = async (req, res) => {
  try {
    // For Tech Support Portal: support users see stats for ALL complaints
    const [total, pending, assigned, inProgress, closed, overdue] = await Promise.all([
      Complaint.countDocuments({}),
      Complaint.countDocuments({ status: 'pending' }),
      Complaint.countDocuments({ status: 'assigned' }),
      Complaint.countDocuments({ status: 'in_progress' }),
      Complaint.countDocuments({ status: 'closed' }),
      Complaint.countDocuments({ expectedResolveAt: { $lt: new Date() }, status: { $nin: ['closed'] } }),
    ]);

    // Developer ratings leaderboard
    const officerRatings = await Complaint.aggregate([
      { $match: { 'officerRating.rating': { $exists: true, $ne: null } } },
      { $group: {
        _id: '$assignedTo',
        avgRating: { $avg: '$officerRating.rating' },
        totalRatings: { $sum: 1 },
      }},
      { $sort: { avgRating: -1 } },
      { $lookup: { from: 'admins', localField: '_id', foreignField: '_id', as: 'officer' } },
      { $unwind: '$officer' },
      { $project: {
        officerId: '$_id',
        name: '$officer.name',
        email: '$officer.email',
        avgRating: { $round: ['$avgRating', 1] },
        totalRatings: 1,
      }},
    ]);

    res.json({
      success: true,
      data: { total, pending, assigned, inProgress, closed, overdue, officerRatings },
    });
  } catch (error) {
    console.error('Dept stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

// ─── Officer stats ──────────────────────────────────────────────────
exports.getOfficerStats = async (req, res) => {
  try {
    const [total, assigned, inProgress, closed] = await Promise.all([
      Complaint.countDocuments({ assignedTo: req.admin._id }),
      Complaint.countDocuments({ assignedTo: req.admin._id, status: 'assigned' }),
      Complaint.countDocuments({ assignedTo: req.admin._id, status: 'in_progress' }),
      Complaint.countDocuments({ assignedTo: req.admin._id, status: 'closed' }),
    ]);

    // Average officer rating
    const ratingAgg = await Complaint.aggregate([
      { $match: { assignedTo: req.admin._id, 'officerRating.rating': { $exists: true, $ne: null } } },
      { $group: { _id: null, avgRating: { $avg: '$officerRating.rating' }, totalRatings: { $sum: 1 } } },
    ]);
    const avgRating = ratingAgg[0]?.avgRating ? Math.round(ratingAgg[0].avgRating * 10) / 10 : null;
    const totalRatings = ratingAgg[0]?.totalRatings || 0;

    res.json({
      success: true,
      data: { total, assigned, inProgress, closed, avgRating, totalRatings },
    });
  } catch (error) {
    console.error('Officer stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

/**
 * Delete (deactivate) an official by ID
 */
exports.deleteOfficial = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-deletion
    if (id === req.admin._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }

    const official = await Admin.findById(id);
    if (!official) {
      return res.status(404).json({ success: false, message: 'Official not found' });
    }

    // Check if official has any associated complaints
    const Complaint = require('../models/Complaint');
    const complaintCount = await Complaint.countDocuments({
      $or: [{ assignedTo: id }, { assignedBy: id }],
    });
    if (complaintCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete: this official has ${complaintCount} associated complaint(s). Reassign or resolve them first.`,
      });
    }

    await Admin.findByIdAndDelete(id);

    res.json({ success: true, message: `${official.name} has been permanently deleted` });
  } catch (error) {
    console.error('Delete official error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete official' });
  }
};
