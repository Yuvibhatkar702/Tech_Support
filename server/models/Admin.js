const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  // Authentication
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  
  password: {
    type: String,
    required: true,
    minlength: 8,
  },
  
  // Profile
  name: {
    type: String,
    required: true,
    trim: true,
  },
  
  phone: {
    type: String,
    trim: true,
  },
  
  // Role & Permissions
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'moderator', 'viewer', 'department_head', 'officer', 'developer', 'support'],
    default: 'moderator',
  },
  
  permissions: {
    canViewComplaints: { type: Boolean, default: true },
    canUpdateStatus: { type: Boolean, default: true },
    canAssignComplaints: { type: Boolean, default: false },
    canDeleteComplaints: { type: Boolean, default: false },
    canManageAdmins: { type: Boolean, default: false },
    canViewAnalytics: { type: Boolean, default: true },
    canExportData: { type: Boolean, default: false },
  },
  
  // Department/Area Assignment (free-form — matches Department.code)
  department: {
    type: String,
    trim: true,
    lowercase: true,
    default: 'general',
  },

  // Reference to Department collection (for department_head / officer)
  departmentRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
  },

  // Department code string (matches Department.code)
  departmentCode: {
    type: String,
    trim: true,
    lowercase: true,
  },

  // Designation (e.g. Executive Engineer, Sanitary Inspector)
  designation: {
    type: String,
    trim: true,
  },

  // Employee ID (optional, for HR tracking)
  employeeId: {
    type: String,
    trim: true,
    default: '',
  },
  
  // Assigned area (optional, for area-based filtering)
  assignedArea: {
    type: {
      type: String,
      enum: ['Polygon'],
    },
    coordinates: [[[Number]]],
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Login Tracking
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: Date,
  
  // Preferences
  preferredLanguage: {
    type: String,
    default: 'en',
  },
  
  notificationPreferences: {
    emailNotifications: { type: Boolean, default: true },
    newComplaintAlert: { type: Boolean, default: true },
    statusChangeAlert: { type: Boolean, default: false },
  },
  
  // Password Reset
  passwordResetToken: String,
  passwordResetExpires: Date,
  
}, {
  timestamps: true,
});

// Index for geospatial queries on assigned area
adminSchema.index({ assignedArea: '2dsphere' });

// Virtual for checking if account is locked
adminSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to handle failed login attempts
adminSchema.methods.incLoginAttempts = function() {
  // Reset if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Static method to get admin by credentials
adminSchema.statics.findByCredentials = async function(email, password) {
  const admin = await this.findOne({ email, isActive: true });
  
  if (!admin) {
    throw new Error('Invalid credentials');
  }
  
  if (admin.isLocked) {
    throw new Error('Account is temporarily locked. Please try again later.');
  }
  
  const isMatch = await admin.comparePassword(password);
  
  if (!isMatch) {
    await admin.incLoginAttempts();
    throw new Error('Invalid credentials');
  }
  
  // Reset login attempts on successful login
  if (admin.loginAttempts > 0) {
    await admin.updateOne({
      $set: { loginAttempts: 0, lastLogin: new Date() },
      $unset: { lockUntil: 1 },
    });
  } else {
    await admin.updateOne({ $set: { lastLogin: new Date() } });
  }
  
  return admin;
};

// Remove sensitive fields when converting to JSON
adminSchema.methods.toJSON = function() {
  const admin = this.toObject();
  delete admin.password;
  delete admin.passwordResetToken;
  delete admin.passwordResetExpires;
  delete admin.loginAttempts;
  delete admin.lockUntil;
  return admin;
};

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;
