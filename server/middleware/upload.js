const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Use /tmp on Vercel (serverless has read-only filesystem)
const uploadDir = process.env.VERCEL ? '/tmp/uploads' : config.uploadDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dateDir = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const destDir = path.join(uploadDir, dateDir);
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `complaint-${uniqueSuffix}${ext}`);
  },
});

// File filter for images only
const imageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

// File filter for additional files (images + documents)
const multiFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDF, DOC, DOCX, and TXT files are allowed.'), false);
  }
};

// Configure multer for single image upload
const upload = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: config.image.maxSizeMB * 1024 * 1024,
    files: 1,
  },
});

// Configure multer for ticket submission (screenshot + additional files)
const uploadTicketFiles = multer({
  storage,
  fileFilter: multiFileFilter,
  limits: {
    fileSize: config.image.maxSizeMB * 1024 * 1024,
    files: 15, // up to 10 screenshots + up to 5 additional files
  },
});

// Error handling middleware for multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${config.image.maxSizeMB}MB.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Only one image is allowed.',
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed.',
    });
  }
  
  next();
};

module.exports = {
  upload,
  uploadTicketFiles,
  handleUploadError,
};
