const Complaint = require('../models/Complaint');
const AuditLog = require('../models/AuditLog');
const config = require('../config');
const geocodingService = require('./geocodingService');

class DuplicateDetectionService {
  constructor() {
    this.radiusMeters = config.duplicateDetection.radiusMeters;
    this.timeWindowHours = config.duplicateDetection.timeWindowHours;
  }

  /**
   * Check for potential duplicate complaints
   * @param {number} longitude - GPS longitude
   * @param {number} latitude - GPS latitude
   * @param {string} category - Complaint category
   * @returns {Object} Detection result with potential duplicates
   */
  async checkForDuplicates(longitude, latitude, category) {
    try {
      // Find complaints within the radius and time window
      const potentialDuplicates = await Complaint.findPotentialDuplicates(
        longitude,
        latitude,
        category,
        this.radiusMeters,
        this.timeWindowHours
      );

      if (potentialDuplicates.length === 0) {
        return {
          isDuplicate: false,
          duplicates: [],
          message: null,
        };
      }

      // Calculate distances and prepare response
      const duplicatesWithDistance = potentialDuplicates.map(complaint => {
        const distance = geocodingService.calculateDistance(
          latitude,
          longitude,
          complaint.location.coordinates[1],
          complaint.location.coordinates[0]
        );

        return {
          complaintId: complaint.complaintId,
          _id: complaint._id,
          category: complaint.category,
          status: complaint.status,
          address: complaint.address?.fullAddress || 'Address not available',
          distance: Math.round(distance),
          createdAt: complaint.createdAt,
          imageUrl: complaint.image?.filePath,
        };
      });

      // Sort by distance
      duplicatesWithDistance.sort((a, b) => a.distance - b.distance);

      // Log the detection event
      await AuditLog.log('duplicate_detected', {
        details: {
          coordinates: [longitude, latitude],
          category,
          potentialDuplicatesCount: duplicatesWithDistance.length,
          closestDistance: duplicatesWithDistance[0]?.distance,
        },
        duplicateDetection: {
          originalComplaint: duplicatesWithDistance[0]?._id,
          distance: duplicatesWithDistance[0]?.distance,
          category,
        },
      });

      return {
        isDuplicate: true,
        duplicates: duplicatesWithDistance,
        message: this.generateWarningMessage(duplicatesWithDistance, category),
        closestComplaint: duplicatesWithDistance[0],
      };
    } catch (error) {
      console.error('Duplicate detection error:', error);
      // Don't block submission on detection failure
      return {
        isDuplicate: false,
        duplicates: [],
        message: null,
        error: error.message,
      };
    }
  }

  /**
   * Generate user-friendly warning message
   */
  generateWarningMessage(duplicates, category) {
    const categoryNames = {
      road_damage: 'road damage',
      street_light: 'street light issue',
      water_supply: 'water supply issue',
      sewage: 'sewage problem',
      garbage: 'garbage/waste issue',
      encroachment: 'encroachment',
      noise_pollution: 'noise pollution',
      illegal_construction: 'illegal construction',
      traffic: 'traffic issue',
      other: 'similar issue',
    };

    const categoryName = categoryNames[category] || 'similar issue';
    const closest = duplicates[0];
    
    let message = `A ${categoryName} complaint was already filed within ${closest.distance} meters of this location`;
    
    if (closest.status === 'pending') {
      message += ' and is currently pending review.';
    } else if (closest.status === 'in_progress') {
      message += ' and is currently being addressed.';
    } else if (closest.status === 'closed') {
      message += ` and was closed on ${new Date(closest.createdAt).toLocaleDateString()}.`;
    }

    if (duplicates.length > 1) {
      message += ` There are ${duplicates.length - 1} other similar complaint(s) in this area.`;
    }

    return message;
  }

  /**
   * Log user's decision after seeing duplicate warning
   */
  async logUserDecision(complaintId, userAction, duplicateComplaintId, userPhone) {
    await AuditLog.log(
      userAction === 'confirmed_not_duplicate' ? 'duplicate_confirmed' : 'duplicate_detected',
      {
        complaintId,
        userPhone,
        details: {
          userAction,
          duplicateComplaintId,
        },
        duplicateDetection: {
          originalComplaint: duplicateComplaintId,
          userAction,
        },
      }
    );
  }

  /**
   * Mark a complaint as duplicate
   */
  async markAsDuplicate(complaintId, originalComplaintId, adminId) {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) {
      throw new Error('Complaint not found');
    }

    complaint.status = 'duplicate';
    complaint.duplicateOf = originalComplaintId;
    complaint.statusHistory.push({
      status: 'duplicate',
      changedAt: new Date(),
      changedBy: adminId,
      remarks: `Marked as duplicate of ${originalComplaintId}`,
    });

    await complaint.save();

    await AuditLog.log('status_changed', {
      complaint: complaint._id,
      complaintId: complaint.complaintId,
      admin: adminId,
      previousValue: complaint.status,
      newValue: 'duplicate',
      details: {
        duplicateOf: originalComplaintId,
      },
    });

    return complaint;
  }

  /**
   * Get duplicate statistics for admin dashboard
   */
  async getDuplicateStats(startDate, endDate) {
    const match = {
      action: 'duplicate_detected',
    };

    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = new Date(startDate);
      if (endDate) match.createdAt.$lte = new Date(endDate);
    }

    const stats = await AuditLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            category: '$duplicateDetection.category',
            userAction: '$duplicateDetection.userAction',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.category',
          actions: {
            $push: {
              action: '$_id.userAction',
              count: '$count',
            },
          },
          total: { $sum: '$count' },
        },
      },
    ]);

    return stats;
  }
}

module.exports = new DuplicateDetectionService();
