const mongoose = require('mongoose');

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
    uppercase: true,
    minlength: [4, 'Code must be at least 4 characters'],
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
}, {
  timestamps: true,
});

// Generate unique college code
collegeSchema.statics.generateUniqueCode = async function(collegeName) {
  // Create base code from college name initials + random string
  const words = collegeName.split(/\s+/).filter(w => w.length > 1);
  let prefix = '';
  
  // Take first letter of first 2-3 significant words
  for (let i = 0; i < Math.min(words.length, 3); i++) {
    prefix += words[i][0].toUpperCase();
  }
  
  // If prefix is less than 2 chars, pad with 'CL'
  if (prefix.length < 2) {
    prefix = 'CL' + prefix;
  }
  
  // Generate random alphanumeric suffix
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  let exists = true;
  let attempts = 0;
  
  while (exists && attempts < 100) {
    let suffix = '';
    const suffixLength = Math.max(4 - prefix.length, 2);
    for (let i = 0; i < suffixLength; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = prefix + suffix;
    
    // Ensure minimum 4 characters
    while (code.length < 4) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code exists
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
