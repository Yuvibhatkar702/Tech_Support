const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Faculty name is required'],
    trim: true,
  },
  number: {
    type: String,
    required: [true, 'Faculty number is required'],
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  _id: true,
  timestamps: true,
});

const collegeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'College name is required'],
    trim: true,
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
  },
  code: {
    type: String,
    unique: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  faculty: {
    type: [facultySchema],
    default: [],
  },
}, {
  timestamps: true,
});

// Generate unique 10-digit numeric college code
collegeSchema.statics.generateUniqueCode = async function() {
  let code;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 100) {
    // Generate 10-digit number (first digit 1-9, rest 0-9)
    code = String(Math.floor(1000000000 + Math.random() * 9000000000));
    const existing = await this.findOne({ code });
    exists = !!existing;
    attempts++;
  }

  return code;
};

// Index for faster lookups
collegeSchema.index({ code: 1 });
collegeSchema.index({ name: 'text', city: 'text' });

module.exports = mongoose.model('College', collegeSchema);
