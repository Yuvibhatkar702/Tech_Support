const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Complaint = require('../models/Complaint');
const College = require('../models/College');
const AuditLog = require('../models/AuditLog');
const { geocodingService, duplicateDetectionService, whatsappService } = require('../services');
const smsService = require('../services/smsService');
const config = require('../config');
const { initializeSLA } = require('../services/slaService');
const { notifyNewComplaint, notifyStatusUpdate } = require('../services/socketService');
const { getEstimatedResolution, calculateExpectedResolution, calculateRemainingTime } = require('../utils/resolutionTime');
const { getDepartmentByCategory, getDepartmentByCategoryAsync } = require('../utils/departmentMapper');
const { getProgressPercentage, getStatusLabel, getStatusTimeline } = require('../utils/progressTracker');
const { normalizeUploadPath } = require('../utils/uploadPath');

/**
 * Classify image endpoint (deprecated - AI model removed)
 * POST /complaints/classify   (multipart, field: "image")
 */
exports.classifyImage = async (req, res) => {
  return res.status(410).json({ success: false, message: 'AI classification has been removed. Please select a category manually.' });
};

/**
 * Create a new complaint
 */
exports.createComplaint = async (req, res) => {
  try {
    const {
      phoneNumber,
      name,
      category,
      description,
      latitude,
      longitude,
      accuracy,
      gpsTimestamp,
      preferredLanguage,
      confirmNotDuplicate,
      sessionId,
      websiteName,
      issueType,
      priority,
      collegeCode,
      collegeName,
      collegeCity,
      facultyName,
      facultyNumber,
    } = req.body;

    // Validate required fields
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: category',
      });
    }

    // Check for duplicates (skip if no coordinates)
    if (!confirmNotDuplicate && latitude && longitude) {
      const duplicateCheck = await duplicateDetectionService.checkForDuplicates(
        parseFloat(longitude),
        parseFloat(latitude),
        category
      );

      if (duplicateCheck.isDuplicate) {
        return res.status(409).json({
          success: false,
          isDuplicate: true,
          message: duplicateCheck.message,
          duplicates: duplicateCheck.duplicates,
        });
      }
    }

    // Reverse geocode the location (only if coordinates provided)
    let geocodeResult = { success: false };
    if (latitude && longitude) {
      geocodeResult = await geocodingService.reverseGeocode(
        parseFloat(latitude),
        parseFloat(longitude)
      );
    }

    // Generate complaint ID
    const complaintId = await Complaint.generateComplaintId();

    // Process uploaded screenshot images (multiple)
    let imageData = null;
    let imagesData = [];
    const uploadedImages = req.files && req.files.image;
    if (uploadedImages && uploadedImages.length > 0) {
      for (const uploadedImage of uploadedImages) {
        const originalPath = uploadedImage.path;
        const compressedFileName = `compressed-${uploadedImage.filename}`;
        const compressedPath = path.join(path.dirname(originalPath), compressedFileName);

        // Compress image using sharp
        await sharp(originalPath)
          .resize(1920, 1920, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: config.image.compressedQuality })
          .toFile(compressedPath);

        const compressedStats = fs.statSync(compressedPath);

        // Remove original if compression successful
        fs.unlinkSync(originalPath);

        const entry = {
          originalName: uploadedImage.originalname,
          fileName: compressedFileName,
          filePath: normalizeUploadPath(compressedPath),
          mimeType: 'image/jpeg',
          size: uploadedImage.size,
          compressedSize: compressedStats.size,
          capturedAt: gpsTimestamp ? new Date(gpsTimestamp) : new Date(),
        };

        imagesData.push(entry);
      }

      // Keep first image in legacy `image` field for backward compatibility
      imageData = imagesData[0];

      // Log image compression
      await AuditLog.log('image_compressed', {
        complaintId,
        details: {
          count: imagesData.length,
          totalOriginalSize: uploadedImages.reduce((s, f) => s + f.size, 0),
          totalCompressedSize: imagesData.reduce((s, f) => s + f.compressedSize, 0),
        },
      });
    }

    // Process additional files
    let additionalFilesData = [];
    const uploadedAdditionalFiles = req.files && req.files.additionalFiles;
    if (uploadedAdditionalFiles && uploadedAdditionalFiles.length > 0) {
      additionalFilesData = uploadedAdditionalFiles.map(file => ({
        originalName: file.originalname,
        fileName: file.filename,
        filePath: normalizeUploadPath(file.path),
        mimeType: file.mimetype,
        size: file.size,
      }));
    }

    // All complaints go directly to Admin — no auto-department routing

    // Create the ticket
    const complaintData = {
      complaintId,
      user: {
        phoneNumber,
        name: name || '',
        preferredLanguage: preferredLanguage || 'en',
        collegeCode: collegeCode || '',
        collegeName: collegeName || '',
        collegeCity: collegeCity || '',
        facultyName: facultyName || '',
        facultyNumber: facultyNumber || '',
      },
      category,
      description: description || '',
      websiteName: websiteName || '',
      issueType: issueType || 'other',
      image: imageData,
      images: imagesData,
      additionalFiles: additionalFilesData,
      status: 'pending',
      statusHistory: [{
        status: 'pending',
        changedAt: new Date(),
        remarks: 'Ticket submitted — awaiting admin review',
      }],
      duplicateWarningShown: confirmNotDuplicate || false,
      userConfirmedNotDuplicate: confirmNotDuplicate || false,
      whatsappSessionId: sessionId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      estimatedResolution: getEstimatedResolution(category),
    };

    // Priority is set by admin only — always default to 'medium'
    complaintData.priority = 'medium';

    // Add location if coordinates provided
    if (latitude && longitude) {
      complaintData.location = {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
        accuracy: accuracy ? parseFloat(accuracy) : null,
        timestamp: gpsTimestamp ? new Date(gpsTimestamp) : new Date(),
      };
      complaintData.address = geocodeResult.success ? geocodeResult.address : {
        fullAddress: `${latitude}, ${longitude}`,
      };
    }

    const complaint = new Complaint(complaintData);

    // Set resolution countdown fields
    const { resolutionDays, expectedResolveAt } = calculateExpectedResolution(
      complaint.createdAt || new Date(),
      category
    );
    complaint.resolutionDays = resolutionDays;
    complaint.expectedResolveAt = expectedResolveAt;

    // Initialize SLA
    try {
      await initializeSLA(complaint);
    } catch (slaError) {
      console.error('SLA initialization failed:', slaError);
    }

    await complaint.save();

    // Notify admins in real-time
    notifyNewComplaint(complaint);

    // Log complaint creation
    await AuditLog.log('complaint_created', {
      complaint: complaint._id,
      complaintId: complaint.complaintId,
      userPhone: phoneNumber,
      details: {
        category,
        hasImage: !!imageData,
        geocodingSuccess: geocodeResult.success,
      },
    });

    // Send WhatsApp confirmation
    try {
      await whatsappService.sendStatusUpdate(complaint, 'pending');
    } catch (whatsappError) {
      console.error('WhatsApp notification failed:', whatsappError);
      // Don't fail the request if WhatsApp fails
    }

    // Send SMS confirmation
    try {
      await smsService.notifyComplaintSubmitted(complaint);
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
    }

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: {
        complaintId: complaint.complaintId,
        status: complaint.status,
        estimatedResolution: complaint.estimatedResolution,
        resolutionDays: complaint.resolutionDays,
        expectedResolveAt: complaint.expectedResolveAt,
        address: geocodingService.formatAddressForDisplay(complaint.address),
        createdAt: complaint.createdAt,
      },
    });
  } catch (error) {
    console.error('Create complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit complaint. Please try again.',
      error: config.nodeEnv === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Check for duplicate complaints
 */
exports.checkDuplicates = async (req, res) => {
  try {
    const { latitude, longitude, category } = req.body;

    if (!latitude || !longitude || !category) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: latitude, longitude, category',
      });
    }

    const result = await duplicateDetectionService.checkForDuplicates(
      parseFloat(longitude),
      parseFloat(latitude),
      category
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Check duplicates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check for duplicates',
    });
  }
};

/**
 * Reverse geocode coordinates
 */
exports.reverseGeocode = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: latitude, longitude',
      });
    }

    const result = await geocodingService.reverseGeocode(
      parseFloat(latitude),
      parseFloat(longitude)
    );

    res.json({
      success: true,
      address: result.address,
      formattedAddress: geocodingService.formatAddressForDisplay(result.address),
    });
  } catch (error) {
    console.error('Reverse geocode error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get address',
    });
  }
};

/**
 * Get complaint status by ID (public endpoint)
 */
exports.getComplaintStatus = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { phone } = req.query;

    const complaint = await Complaint.findOne({ complaintId })
      .populate('assignedTo', 'name email phone')
      .populate('assignedBy', 'name email');

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
      });
    }

    // Verify phone number for privacy
    if (phone && complaint.user.phoneNumber !== phone) {
      return res.status(403).json({
        success: false,
        message: 'Phone number does not match',
      });
    }

    // Calculate remaining time dynamically
    let countdown = null;
    if (complaint.expectedResolveAt && !['closed', 'rejected'].includes(complaint.status)) {
      countdown = calculateRemainingTime(complaint.expectedResolveAt);
      countdown.expectedResolveAt = complaint.expectedResolveAt;
      countdown.resolutionDays = complaint.resolutionDays;
      countdown.estimatedResolution = complaint.estimatedResolution;
    }

    // Progress tracking
    const progress = getProgressPercentage(complaint.status);
    const statusLabel = getStatusLabel(complaint.status);
    const timeline = getStatusTimeline();

    // Ensure college details are available in response (fallback by college code lookup)
    let resolvedCollegeName = complaint.user?.collegeName || '';
    let resolvedCollegeCity = complaint.user?.collegeCity || '';
    const resolvedCollegeCode = complaint.user?.collegeCode || '';

    if ((!resolvedCollegeName || !resolvedCollegeCity) && resolvedCollegeCode) {
      const college = await College.findOne({ code: resolvedCollegeCode.toUpperCase() }).select('name city').lean();
      if (college) {
        if (!resolvedCollegeName) resolvedCollegeName = college.name || '';
        if (!resolvedCollegeCity) resolvedCollegeCity = college.city || '';
      }
    }

    res.json({
      success: true,
      data: {
        complaint: {
          complaintId: complaint.complaintId,
          status: complaint.status,
          statusLabel,
          progress,
          timeline,
          category: complaint.category,
          description: complaint.description,
          department: complaint.department || null,
          assignedTo: complaint.assignedTo ? {
            name: complaint.assignedTo.name,
            email: complaint.assignedTo.email,
            phone: complaint.assignedTo.phone,
          } : null,
          assignedBy: complaint.assignedBy ? {
            name: complaint.assignedBy.name,
          } : null,
          assignedAt: complaint.assignedAt || null,
          startedAt: complaint.startedAt || null,
          resolvedAt: complaint.resolvedAt || null,
          user: {
            name: complaint.user?.name || '',
            phoneNumber: complaint.user?.phoneNumber || '',
            preferredLanguage: complaint.user?.preferredLanguage || 'en',
            collegeCode: resolvedCollegeCode,
            collegeName: resolvedCollegeName,
            collegeCity: resolvedCollegeCity,
            facultyName: complaint.user?.facultyName || '',
            facultyNumber: complaint.user?.facultyNumber || '',
          },
          location: {
            address: geocodingService.formatAddressForDisplay(complaint.address),
            coordinates: complaint.location?.coordinates,
          },
          address: geocodingService.formatAddressForDisplay(complaint.address),
          createdAt: complaint.createdAt,
          updatedAt: complaint.updatedAt,
          statusHistory: complaint.statusHistory.map(h => ({
            status: h.status,
            changedAt: h.changedAt,
            remarks: h.remarks,
          })),
          resolution: complaint.status === 'closed' ? complaint.resolution : null,
          resolutionProof: (complaint.resolutionProof || []).map(p => {
            const normalized = normalizeUploadPath(p.filePath || p.fileName || '');
            const afterUploads = normalized.split('uploads/')[1] || p.fileName;
            return {
              fileName: p.fileName,
              url: `/uploads/${afterUploads}`,
              filePath: normalized,
              uploadedAt: p.uploadedAt,
            };
          }),
          officerRating: complaint.officerRating || null,
          reopenCount: complaint.reopenCount || 0,
          reopenReason: complaint.reopenReason || null,
          image: complaint.image?.filePath ? {
            fileName: complaint.image.fileName,
            filePath: normalizeUploadPath(complaint.image.filePath),
          } : null,
          images: (complaint.images || [])
            .filter((img) => img.filePath)
            .map((img) => ({
              fileName: img.fileName,
              filePath: normalizeUploadPath(img.filePath),
            })),
          countdown,
        },
      },
    });
  } catch (error) {
    console.error('Get complaint status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get complaint status',
    });
  }
};

/**
 * Get all complaints (admin)
 */
exports.getAllComplaints = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      category,
      department,
      priority,
      startDate,
      endDate,
      search,
      sla,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    // Build query
    const query = {};

    // Handle SLA filter for overdue complaints
    if (sla === 'overdue') {
      query.expectedResolveAt = { $lt: new Date() };
      query.status = { $nin: ['closed', 'rejected'] };
    } else if (status) {
      query.status = status;
    }

    if (category) {
      query.category = category;
    }

    if (department) {
      query.department = department;
    }

    if (priority) {
      query.priority = priority;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { complaintId: { $regex: search, $options: 'i' } },
        { 'user.phoneNumber': { $regex: search, $options: 'i' } },
        { 'address.fullAddress': { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Status priority: pending/reopened first → in_progress → assigned → closed/rejected last
    const STATUS_ORDER = { pending: 0, reopened: 1, in_progress: 2, assigned: 3, closed: 4, rejected: 5, duplicate: 6 };

    const [rawComplaints, total] = await Promise.all([
      Complaint.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedTo', 'name email')
        .populate('assignmentHistory.assignedTo', 'name email role')
        .populate('assignmentHistory.assignedBy', 'name email role')
        .lean(),
      Complaint.countDocuments(query),
    ]);

    // Sort: pending on top, closed/assigned at bottom, then by newest
    const complaints = rawComplaints.sort((a, b) => {
      const oa = STATUS_ORDER[a.status] ?? 3;
      const ob = STATUS_ORDER[b.status] ?? 3;
      if (oa !== ob) return oa - ob;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({
      success: true,
      data: {
        complaints: complaints.map(c => ({
          ...c,
          formattedAddress: geocodingService.formatAddressForDisplay(c.address),
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error('Get all complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints',
    });
  }
};

/**
 * Get single complaint (admin)
 */
exports.getComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .populate('assignmentHistory.assignedTo', 'name email role')
      .populate('assignmentHistory.assignedBy', 'name email role')
      .populate('statusHistory.changedBy', 'name email')
      .populate('duplicateOf', 'complaintId status');

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
      });
    }

    const complaintObj = complaint.toObject();
    const withMediaUrl = (file) => {
      if (!file) return file;
      const normalizedPath = normalizeUploadPath(file.filePath || file.url || file.fileName || '');
      if (!normalizedPath) return file;
      const afterUploads = normalizedPath.split('uploads/')[1] || '';
      return {
        ...file,
        filePath: normalizedPath,
        url: afterUploads ? `/uploads/${afterUploads}` : normalizedPath,
      };
    };

    const normalizedResolution = complaintObj.resolution
      ? {
          ...complaintObj.resolution,
          images: Array.isArray(complaintObj.resolution.images)
            ? complaintObj.resolution.images.map(withMediaUrl)
            : complaintObj.resolution.images,
        }
      : complaintObj.resolution;

    res.json({
      success: true,
      data: {
        complaint: {
          ...complaintObj,
          image: complaintObj.image ? withMediaUrl(complaintObj.image) : complaintObj.image,
          images: Array.isArray(complaintObj.images) ? complaintObj.images.map(withMediaUrl) : complaintObj.images,
          additionalFiles: Array.isArray(complaintObj.additionalFiles)
            ? complaintObj.additionalFiles.map(withMediaUrl)
            : complaintObj.additionalFiles,
          resolutionProof: Array.isArray(complaintObj.resolutionProof)
            ? complaintObj.resolutionProof.map(withMediaUrl)
            : complaintObj.resolutionProof,
          voiceNote: complaintObj.voiceNote ? withMediaUrl(complaintObj.voiceNote) : complaintObj.voiceNote,
          resolution: normalizedResolution,
          formattedAddress: geocodingService.formatAddressForDisplay(complaint.address),
        },
      },
    });
  } catch (error) {
    console.error('Get complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint',
    });
  }
};

/**
 * Update complaint status (admin)
 */
exports.updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const validStatuses = ['pending', 'assigned', 'in_progress', 'closed', 'rejected', 'duplicate'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
      });
    }

    const previousStatus = complaint.status;
    complaint.updateStatus(status, req.admin._id, remarks);

    if (status === 'closed') {
      complaint.resolution = {
        description: remarks,
        resolvedAt: new Date(),
      };
    }

    await complaint.save();

    // Log status change
    await AuditLog.log('status_changed', {
      complaint: complaint._id,
      complaintId: complaint.complaintId,
      admin: req.admin._id,
      previousValue: previousStatus,
      newValue: status,
      details: { remarks },
    });

    // Send WhatsApp notification
    try {
      const result = await whatsappService.sendStatusUpdate(complaint, status);
      
      // Update the status history with WhatsApp notification result
      const lastHistory = complaint.statusHistory[complaint.statusHistory.length - 1];
      lastHistory.whatsappNotificationSent = result.success;
      lastHistory.whatsappMessageId = result.messageId;
      await complaint.save();
    } catch (whatsappError) {
      console.error('WhatsApp notification failed:', whatsappError);
    }

    // Send SMS notification
    try {
      if (status === 'closed' || status === 'rejected') {
        await smsService.notifyComplaintClosed(complaint);
      } else {
        await smsService.notifyStatusUpdate(complaint, status);
      }
    } catch (smsError) {
      console.error('SMS notification failed:', smsError);
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      data: {
        complaintId: complaint.complaintId,
        status: complaint.status,
        previousStatus,
      },
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
    });
  }
};

/**
 * Assign complaint to admin
 */
exports.assignComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;

    const Admin = require('../models/Admin');

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Look up the target official
    const targetOfficial = await Admin.findById(adminId).select('name email role departmentCode department');
    if (!targetOfficial) {
      return res.status(400).json({ success: false, message: 'Target official not found' });
    }

    // Set assignment fields
    complaint.assignedTo = targetOfficial._id;
    complaint.assignedBy = req.admin._id;
    complaint.assignedAt = new Date();
    complaint.department = targetOfficial.departmentCode || targetOfficial.department || complaint.department;
    complaint.status = 'assigned';

    // Track in assignment history
    complaint.assignmentHistory.push({
      assignedTo: targetOfficial._id,
      assignedBy: req.admin._id,
      assignedAt: new Date(),
      remarks: `Assigned to ${targetOfficial.name} (${targetOfficial.role}) by Admin`,
    });

    complaint.statusHistory.push({
      status: 'assigned',
      changedAt: new Date(),
      changedBy: req.admin._id,
      remarks: `Assigned to ${targetOfficial.name} (${targetOfficial.role}) by Admin`,
    });

    await complaint.save();
    await complaint.populate('assignedTo', 'name email');

    await AuditLog.log('complaint_assigned', {
      complaint: complaint._id,
      complaintId: complaint.complaintId,
      admin: req.admin._id,
      details: { assignedTo: adminId, assigneeName: targetOfficial.name, assigneeRole: targetOfficial.role },
    });

    res.json({
      success: true,
      message: `Complaint assigned to ${targetOfficial.name}`,
      data: complaint,
    });
  } catch (error) {
    console.error('Assign complaint error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign complaint' });
  }
};

/**
 * Get complaints for map view (admin)
 */
exports.getComplaintsForMap = async (req, res) => {
  try {
    const { status, category, startDate, endDate, bounds } = req.query;

    const query = {};

    if (status) {
      query.status = { $in: status.split(',') };
    }

    if (category) {
      query.category = { $in: category.split(',') };
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Filter by map bounds if provided
    if (bounds) {
      const [swLng, swLat, neLng, neLat] = bounds.split(',').map(Number);
      query.location = {
        $geoWithin: {
          $box: [
            [swLng, swLat],
            [neLng, neLat],
          ],
        },
      };
    }

    const complaints = await Complaint.find(query)
      .select('complaintId category status location address createdAt image')
      .limit(1000)
      .lean();

    // Format for map display
    const mapData = complaints.map(c => ({
      id: c._id,
      complaintId: c.complaintId,
      category: c.category,
      status: c.status,
      coordinates: {
        lat: c.location.coordinates[1],
        lng: c.location.coordinates[0],
      },
      address: geocodingService.formatAddressForDisplay(c.address),
      createdAt: c.createdAt,
      hasImage: !!c.image?.filePath,
    }));

    res.json({
      success: true,
      data: mapData,
    });
  } catch (error) {
    console.error('Get map complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch map data',
    });
  }
};

/**
 * Get complaint statistics (admin)
 */
exports.getComplaintStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateMatch = {};
    if (startDate || endDate) {
      dateMatch.createdAt = {};
      if (startDate) dateMatch.createdAt.$gte = new Date(startDate);
      if (endDate) dateMatch.createdAt.$lte = new Date(endDate);
    }

    // Today's date range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [
      statusStats,
      categoryStats,
      dailyStats,
      totalCount,
      todayCount,
      overdueCount,
    ] = await Promise.all([
      // Stats by status
      Complaint.aggregate([
        { $match: dateMatch },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      
      // Stats by category
      Complaint.aggregate([
        { $match: dateMatch },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      
      // Daily stats for last 30 days
      Complaint.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      
      // Total count
      Complaint.countDocuments(dateMatch),

      // Today's complaints count
      Complaint.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),

      // Overdue complaints (past SLA and not closed/rejected)
      Complaint.countDocuments({
        expectedResolveAt: { $lt: new Date() },
        status: { $nin: ['closed', 'rejected'] },
      }),
    ]);

    res.json({
      success: true,
      data: {
        total: totalCount,
        todayCount,
        overdueCount,
        byStatus: statusStats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        byCategory: categoryStats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        daily: dailyStats,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
    });
  }
};

/**
 * Serve complaint image
 */
exports.getComplaintImage = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    
    if (!complaint || !complaint.image?.filePath) {
      return res.status(404).json({
        success: false,
        message: 'Image not found',
      });
    }

    const imagePath = complaint.image.filePath;
    
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Image file not found',
      });
    }

    res.sendFile(path.resolve(imagePath));
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch image',
    });
  }
};

/**
 * Update complaint (admin) - general update endpoint
 */
exports.updateComplaint = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, internalNotes, remarks } = req.body;

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
      });
    }

    const previousStatus = complaint.status;
    let statusChanged = false;

    // Update status if provided
    if (status && status !== complaint.status) {
      const validStatuses = ['pending', 'assigned', 'in_progress', 'closed', 'rejected', 'duplicate'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status',
        });
      }
      complaint.updateStatus(status, req.admin._id, remarks || internalNotes);
      statusChanged = true;

      if (status === 'closed') {
        complaint.resolution = {
          description: remarks || internalNotes,
          resolvedAt: new Date(),
        };
      }
    }

    // Update priority if provided
    if (priority) {
      const validPriorities = ['low', 'medium', 'high', 'critical', 'urgent'];
      if (validPriorities.includes(priority)) {
        complaint.priority = priority;
      }
    }

    // Update internal notes if provided
    if (internalNotes) {
      complaint.internalNotes = complaint.internalNotes || [];
      complaint.internalNotes.push({
        note: internalNotes,
        addedBy: req.admin._id,
        addedAt: new Date(),
      });
    }

    await complaint.save();

    // Log the update
    await AuditLog.log('complaint_updated', {
      complaint: complaint._id,
      complaintId: complaint.complaintId,
      admin: req.admin._id,
      details: { status, priority, internalNotes, previousStatus },
    });

    // Send WhatsApp notification if status changed
    if (statusChanged) {
      try {
        const result = await whatsappService.sendStatusUpdate(complaint, status);
        const lastHistory = complaint.statusHistory[complaint.statusHistory.length - 1];
        if (lastHistory) {
          lastHistory.whatsappNotificationSent = result.success;
          lastHistory.whatsappMessageId = result.messageId;
          await complaint.save();
        }
      } catch (whatsappError) {
        console.error('WhatsApp notification failed:', whatsappError);
      }
    }

    res.json({
      success: true,
      message: 'Complaint updated successfully',
      data: {
        complaintId: complaint.complaintId,
        status: complaint.status,
        priority: complaint.priority,
        previousStatus,
      },
    });
  } catch (error) {
    console.error('Update complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update complaint',
    });
  }
};

// ─── PUBLIC: Reopen a closed complaint ────────────────────────────
exports.reopenComplaint = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { reason, phone } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reopen reason is required' });
    }

    const complaint = await Complaint.findOne({ complaintId });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Verify phone number for security
    if (phone && complaint.user?.phoneNumber && complaint.user.phoneNumber !== phone) {
      return res.status(403).json({ success: false, message: 'Phone number does not match' });
    }

    if (complaint.status !== 'closed') {
      return res.status(400).json({
        success: false,
        message: `Cannot reopen — current status is "${complaint.status}". Only closed complaints can be reopened.`,
      });
    }

    // Max 3 reopens
    if ((complaint.reopenCount || 0) >= 3) {
      return res.status(400).json({
        success: false,
        message: 'This complaint has already been reopened 3 times. Please file a new complaint.',
      });
    }

    complaint.status = 'reopened';
    complaint.reopenReason = reason.trim();
    complaint.reopenedAt = new Date();
    complaint.reopenCount = (complaint.reopenCount || 0) + 1;

    // Handle reopen proof image if uploaded
    if (req.file) {
      complaint.reopenProof = complaint.reopenProof || [];
      complaint.reopenProof.push({
        fileName: req.file.filename,
        filePath: normalizeUploadPath(req.file.path),
        uploadedAt: new Date(),
      });
    }

    complaint.statusHistory.push({
      status: 'reopened',
      changedAt: new Date(),
      remarks: `Reopened by citizen: ${reason.trim()}${req.file ? ' (with proof image)' : ''}`,
    });

    // Reset back to assigned status so officer can rework
    complaint.status = 'assigned';
    complaint.resolvedAt = null;
    complaint.statusHistory.push({
      status: 'assigned',
      changedAt: new Date(),
      remarks: `Re-assigned after reopen #${complaint.reopenCount}`,
    });

    await complaint.save();

    res.json({
      success: true,
      message: 'Complaint reopened successfully. The officer will review it again.',
      data: {
        complaintId: complaint.complaintId,
        status: complaint.status,
        reopenCount: complaint.reopenCount,
      },
    });
  } catch (error) {
    console.error('Reopen complaint error:', error);
    res.status(500).json({ success: false, message: 'Failed to reopen complaint' });
  }
};

// ─── PUBLIC: Rate the officer after resolution ──────────────────────
exports.rateOfficer = async (req, res) => {
  try {
    const { complaintId } = req.params;
    const { rating, comment, phone } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    const complaint = await Complaint.findOne({ complaintId });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Verify phone
    if (phone && complaint.user?.phoneNumber && complaint.user.phoneNumber !== phone) {
      return res.status(403).json({ success: false, message: 'Phone number does not match' });
    }

    if (complaint.status !== 'closed') {
      return res.status(400).json({
        success: false,
        message: 'Can only rate a closed complaint.',
      });
    }

    if (complaint.officerRating?.rating) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this complaint.',
      });
    }

    if (!complaint.assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'No officer was assigned to this complaint.',
      });
    }

    complaint.officerRating = {
      rating: Math.round(rating),
      comment: comment?.trim() || '',
      submittedAt: new Date(),
    };

    // Also set the general feedback field for backward compat
    complaint.feedback = {
      rating: Math.round(rating),
      comment: comment?.trim() || '',
      submittedAt: new Date(),
    };

    // Close the complaint after rating (citizen is satisfied)
    complaint.status = 'closed';
    complaint.closedAt = new Date();
    complaint.statusHistory.push({
      status: 'closed',
      changedAt: new Date(),
      remarks: `Closed after citizen rated ${rating}/5`,
    });

    await complaint.save();

    res.json({
      success: true,
      message: 'Thank you for your rating!',
      data: {
        complaintId: complaint.complaintId,
        status: complaint.status,
        officerRating: complaint.officerRating,
      },
    });
  } catch (error) {
    console.error('Rate officer error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit rating' });
  }
};

// ─── Tracking by Mobile Number (OTP-protected) ─────────────────────

/**
 * Get complaints by mobile number (no OTP)
 * POST /complaints/track/mobile
 */
exports.trackByMobile = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required',
      });
    }

    const complaints = await Complaint.find({ 'user.phoneNumber': phoneNumber })
      .sort({ createdAt: -1 })
      .select('complaintId status category description createdAt updatedAt location address department')
      .lean();

    if (complaints.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No complaints found for this phone number',
      });
    }

    const formatted = complaints.map((c) => ({
      complaintId: c.complaintId,
      status: c.status,
      category: c.category,
      description: c.description ? c.description.substring(0, 150) + (c.description.length > 150 ? '...' : '') : '',
      location: c.address ? geocodingService.formatAddressForDisplay(c.address) : null,
      department: c.department || null,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    res.json({
      success: true,
      message: 'Complaints fetched successfully',
      data: {
        phoneNumber,
        totalComplaints: formatted.length,
        complaints: formatted,
      },
    });
  } catch (error) {
    console.error('Track by mobile error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch complaints' });
  }
};


// Get last complaint for a college (public)
exports.getLastFacultyForCollege = async (req, res) => {
  try {
    const { collegeCode } = req.params;
    if (!collegeCode) {
      return res.status(400).json({ success: false, message: 'Missing college code' });
    }
    // Find the most recent complaint for this college
    const lastComplaint = await Complaint.findOne({ 'user.collegeCode': collegeCode })
      .sort({ createdAt: -1 });
    if (!lastComplaint || !lastComplaint.user.facultyName || !lastComplaint.user.facultyNumber) {
      return res.json({ success: true, data: null });
    }
    res.json({
      success: true,
      data: {
        facultyName: lastComplaint.user.facultyName,
        facultyNumber: lastComplaint.user.facultyNumber,
      },
    });
  } catch (error) {
    console.error('Get last faculty error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch faculty info' });
  }
};