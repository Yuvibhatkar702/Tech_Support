const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  // Unique complaint ID (human-readable)
  complaintId: {
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  
  // User Information
  user: {
    phoneNumber: {
      type: String,
      required: false,
    },
    name: String,
    preferredLanguage: {
      type: String,
      default: 'en',
      enum: ['en', 'hi', 'mr'],
    },
    collegeCode: String,
    collegeName: String,
    collegeCity: String,
    facultyName: String,
    facultyNumber: String,
  },
  
  // Ticket Details
  websiteName: {
    type: String,
    trim: true,
    default: '',
  },

  category: {
    type: String,
    required: true,
    index: true,
  },

  issueType: {
    type: String,
    enum: ['bug', 'error', 'page_not_loading', 'login_issue', 'performance', 'ui_ux', 'data_issue', 'other'],
    default: 'bug',
  },
  
  description: {
    type: String,
  },

  // Additional file attachments
  additionalFiles: [{
    originalName: String,
    fileName: String,
    filePath: String,
    mimeType: String,
    size: Number,
  }],
  
  // Location Data (optional for tech support tickets)
  location: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
    },
    accuracy: Number,
    timestamp: Date,
  },
  
  // Resolved Address from Reverse Geocoding
  address: {
    street: String,
    area: String,
    city: String,
    district: String,
    state: String,
    postalCode: String,
    fullAddress: String,
    raw: mongoose.Schema.Types.Mixed, // Store raw API response for debugging
  },
  
  // Image Data (legacy single image — backward compatible)
  image: {
    originalName: String,
    fileName: String,
    filePath: String,
    mimeType: String,
    size: Number,           // Original size in bytes
    compressedSize: Number, // Compressed size in bytes
    capturedAt: Date,
  },

  // Multiple images
  images: [{
    originalName: String,
    fileName: String,
    filePath: String,
    mimeType: String,
    size: Number,
    compressedSize: Number,
    capturedAt: Date,
  }],
  
  // Status Tracking
  status: {
    type: String,
    enum: ['pending', 'assigned', 'in_progress', 'reopened', 'closed', 'rejected', 'duplicate'],
    default: 'pending',
    index: true,
  },
  
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending', 'assigned', 'in_progress', 'reopened', 'closed', 'rejected', 'duplicate'],
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    remarks: String,
    whatsappNotificationSent: {
      type: Boolean,
      default: false,
    },
    whatsappMessageId: String,
  }],
  
  // Duplicate Detection
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint',
  },
  
  duplicateWarningShown: {
    type: Boolean,
    default: false,
  },
  
  userConfirmedNotDuplicate: {
    type: Boolean,
    default: false,
  },
  
  // Admin Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },

  // Department assignment (auto-routed from category)
  department: {
    type: String,
    trim: true,
    index: true,
  },

  // Department snapshot (preserved even if departments are reorganised)
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
  },

  departmentName: {
    type: String,
    trim: true,
  },

  // Who assigned the officer (department_head)
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
  },

  // Full assignment history trail
  assignmentHistory: [{
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    remarks: String,
  }],

  // Workflow timestamps
  assignedAt: Date,
  startedAt: Date,
  resolvedAt: Date,
  closedAt: Date,

  // Resolution proof images (uploaded by officer)
  resolutionProof: [{
    fileName: String,
    filePath: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }],

  // Reopen tracking
  reopenReason: String,
  reopenedAt: Date,
  reopenCount: {
    type: Number,
    default: 0,
  },
  reopenProof: [{
    fileName: String,
    filePath: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }],

  // Officer rating (given by citizen after resolution)
  officerRating: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    comment: String,
    submittedAt: Date,
  },
  
  // Estimated Resolution Time (dynamic per category)
  estimatedResolution: {
    type: String,
    default: '3-5 working days',
  },
  
  // Resolution countdown fields
  resolutionDays: {
    type: Number,
    default: 5,
  },
  
  expectedResolveAt: {
    type: Date,
  },
  
  // Resolution Details
  resolution: {
    description: String,
    resolvedAt: Date,
    images: [String], // Paths to resolution images
  },
  
  // Priority (calculated or set by admin)
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  
  // Metadata
  source: {
    type: String,
    enum: ['whatsapp', 'web', 'mobile_app'],
    default: 'whatsapp',
  },
  
  whatsappSessionId: String, // For tracking WhatsApp conversation
  
  // Audit Fields
  ipAddress: String,
  userAgent: String,
  
  // Community Features
  upvotes: [{
    oderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Citizen',
    },
    phoneHash: String, // Hashed phone for anonymous upvotes
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  upvoteCount: {
    type: Number,
    default: 0,
    index: true,
  },
  
  // Multiple Images Support
  images: [{
    originalName: String,
    fileName: String,
    filePath: String,
    mimeType: String,
    size: Number,
    compressedSize: Number,
    capturedAt: Date,
    isResolution: {
      type: Boolean,
      default: false,
    },
  }],
  
  // Voice Recording
  voiceNote: {
    fileName: String,
    filePath: String,
    duration: Number, // in seconds
    transcription: String, // AI transcribed text
    language: String,
  },
  
  // AI Features
  aiClassification: {
     suggestedCategory: String,
     confidence: Number,
     keywords: [String],
     sentiment: {
       type: String,
       enum: ['positive', 'neutral', 'negative', 'urgent'],
      },
      urgencyScore: {
       type: Number,
       min: 0,
       max: 100,
     },
     processedAt: Date,
   },
 
   // AI Image Classification — MobileNetV2 model (FullProject integration)
   aiImageClassification: {
     predictedCategory: {
       type: String,
       enum: [
         'road_damage', 'street_light', 'water_supply', 'sewage',
        'garbage', 'encroachment', 'noise_pollution',
        'illegal_construction', 'traffic', 'other',
      ],
    },
    rawLabel:    String,
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low', 'none'],
      default: 'high',
    },
    classifiedAt: Date,
  },
  
  // SLA Management
  sla: {
    targetResolutionDate: Date,
    isOverdue: {
      type: Boolean,
      default: false,
    },
    escalationLevel: {
      type: Number,
      default: 0,
    },
    escalationHistory: [{
      level: Number,
      escalatedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
      },
      escalatedAt: Date,
      reason: String,
    }],
  },
  
  // Citizen Feedback
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    comment: String,
    submittedAt: Date,
  },
  
  // Public Visibility
  isPublic: {
    type: Boolean,
    default: true,
  },
  
}, {
  timestamps: true,
});

// Compound index for queries
complaintSchema.index({ 
  category: 1,
  createdAt: -1 
});

// Text index for search
complaintSchema.index({
  description: 'text',
  'address.fullAddress': 'text',
});

// Generate unique complaint ID (resets yearly)
complaintSchema.statics.generateComplaintId = async function() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  // Find the count of complaints this year (counter resets each year)
  const startOfYear = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  const endOfYear = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
  
  const count = await this.countDocuments({
    createdAt: { $gte: startOfYear, $lte: endOfYear }
  });
  
  const sequence = (count + 1).toString().padStart(4, '0');
  return `GRV${year}${month}${day}${sequence}`;
};

// Find potential duplicates
complaintSchema.statics.findPotentialDuplicates = async function(
  longitude, 
  latitude, 
  category, 
  radiusMeters = 100, 
  timeWindowHours = 24
) {
  const timeThreshold = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  
  return this.find({
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        $maxDistance: radiusMeters,
      },
    },
    category: category,
    createdAt: { $gte: timeThreshold },
    status: { $nin: ['rejected', 'duplicate'] },
  }).limit(5);
};

// Instance method to add status history
complaintSchema.methods.updateStatus = function(newStatus, adminId, remarks = '') {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    changedAt: new Date(),
    changedBy: adminId,
    remarks: remarks,
    whatsappNotificationSent: false,
  });
  return this;
};

const Complaint = mongoose.model('Complaint', complaintSchema, 'tickets');

module.exports = Complaint;