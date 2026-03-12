const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Action Type
  action: {
    type: String,
    required: true,
    enum: [
      'complaint_created',
      'complaint_updated',
      'status_changed',
      'complaint_assigned',
      'complaint_deleted',
      'duplicate_detected',
      'duplicate_confirmed',
      'whatsapp_sent',
      'whatsapp_failed',
      'admin_login',
      'admin_logout',
      'admin_created',
      'admin_updated',
      'official_login',
      'official_logout',
      'geocoding_success',
      'geocoding_failed',
      'image_uploaded',
      'image_compressed',
    ],
    index: true,
  },
  
  // Associated Complaint
  complaint: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
    index: true,
  },
  
  complaintId: String, // Human-readable complaint ID
  
  // Actor (Admin who performed the action)
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },
  
  // For user actions (from WhatsApp/web)
  userPhone: String,
  
  // Details
  details: {
    type: mongoose.Schema.Types.Mixed,
  },
  
  // Before/After for updates
  previousValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  
  // Duplicate Detection Specific
  duplicateDetection: {
    originalComplaint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Complaint',
    },
    distance: Number, // Distance in meters
    category: String,
    userAction: {
      type: String,
      enum: ['confirmed_not_duplicate', 'cancelled_submission', 'auto_marked_duplicate'],
    },
  },
  
  // Request Metadata
  ipAddress: String,
  userAgent: String,
  
  // Outcome
  success: {
    type: Boolean,
    default: true,
  },
  errorMessage: String,
  
}, {
  timestamps: true,
});

// TTL index to auto-delete old logs (keep for 1 year)
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Compound index for common queries
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ complaint: 1, createdAt: -1 });

// Static method to log an action
auditLogSchema.statics.log = async function(action, data) {
  try {
    return await this.create({
      action,
      ...data,
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break main functionality
    return null;
  }
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
