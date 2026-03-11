require('dotenv').config();
// Use Google DNS for SRV lookups (fixes local DNS issues with MongoDB Atlas)
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const config = require('./config');
const { complaintRoutes, adminRoutes, whatsappRoutes } = require('./routes');
const citizenRoutes = require('./routes/citizenRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const officialRoutes = require('./routes/officialRoutes');
const { initializeSocket } = require('./services/socketService');
const { initializeSLACron } = require('./services/slaService');
const { verifyConnection: verifyEmailConnection } = require('./services/emailService');

const app = express();
const server = http.createServer(app);

// Trust first proxy (Render / Vercel) — required for rate-limiting & req.ip
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
}));

// CORS configuration
const PROD_ORIGINS = [
  'https://tech-support-mu.vercel.app',
  'https://tech-support-wwgg-rose.vercel.app',
  'https://griviances.vercel.app',
  config.clientUrl,
].filter(Boolean);

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowed = config.nodeEnv === 'production' ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS];

    if (
      allowed.includes(origin) ||
      /^https:\/\/tech-support[\w-]*\.vercel\.app$/.test(origin) ||
      /^https:\/\/griviances[\w-]*\.vercel\.app$/.test(origin) ||
      /^https:\/\/[\w-]*\.onrender\.com$/.test(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['x-refresh-token'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (for serving images)
const uploadsPath = process.env.VERCEL
  ? '/tmp/uploads'
  : path.join(__dirname, config.uploadDir);
app.use('/uploads', express.static(uploadsPath));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Tech Support API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
    },
  });
});

// Database connection and server start
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(config.mongoUri);
    isConnected = true;
    console.log('✅ Connected to MongoDB');

    // Create indexes
    const { Complaint, Admin, AuditLog, Department, CategoryMapping } = require('./models');
    
    try {
      await mongoose.connection.collection('complaints').dropIndex('user.phoneNumber_1');
    } catch (e) {
      // Index might not exist, ignore error
    }
    
    await Complaint.createIndexes();
    await Admin.createIndexes();
    await AuditLog.createIndexes();
    await Department.createIndexes();
    await CategoryMapping.createIndexes();
    console.log('✅ Database indexes created');

    await autoSeedDepartments(Department, Admin, CategoryMapping);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    isConnected = false;
    throw error;
  }
};

// Ensure DB is connected before handling API requests (needed for Vercel serverless)
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// API Routes
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/citizen', citizenRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/officials', officialRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate entry found',
    });
  }

  // JWT error
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: config.nodeEnv === 'production' 
      ? 'Something went wrong' 
      : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// ══════════════════════════════════════════════════════════════════════
// AUTO-SEED — runs once on startup if data is stale / generic
// ══════════════════════════════════════════════════════════════════════
async function autoSeedDepartments(Department, Admin, CategoryMapping) {
  try {
    // Check if tech support data exists
    const deptCount = await Department.countDocuments();
    const headCount = await Admin.countDocuments({ role: 'department_head' });
    const adminCount = await Admin.countDocuments({ role: 'super_admin' });

    // Check: any dept_head with old @grievance.com or @gmail.com email → stale data
    const staleHead = await Admin.findOne({
      role: 'department_head',
      email: { $not: /@techsupport\.com$/i },
    });

    // Check: broken passwords (double-hashed from previous bug)
    let passwordBroken = false;
    if (headCount > 0) {
      const bcrypt = require('bcryptjs');
      const anyHead = await Admin.findOne({ role: 'department_head' });
      if (anyHead) {
        const canLogin = await bcrypt.compare('Pass@123', anyHead.password);
        if (!canLogin) {
          passwordBroken = true;
          console.log('⚠️  Officer/head passwords appear broken — will re-seed');
        }
      }
    }

    const needsSeed = staleHead || deptCount === 0 || headCount === 0 || adminCount === 0 || passwordBroken;

    if (!needsSeed) {
      console.log('✅ Departments & officials already seeded correctly');
      return;
    }

    console.log('🔄 Stale/missing department data detected — re-seeding…');

    const DEFAULT_PASSWORD = 'Pass@123';
    const ADMIN_PERMISSIONS = {
      canViewComplaints: true, canUpdateStatus: true, canAssignComplaints: true,
      canDeleteComplaints: true, canManageAdmins: true, canViewAnalytics: true, canExportData: true,
    };
    const HEAD_PERMISSIONS = {
      canViewComplaints: true, canUpdateStatus: true, canAssignComplaints: true,
      canDeleteComplaints: false, canManageAdmins: false, canViewAnalytics: true, canExportData: true,
    };
    const OFFICER_PERMISSIONS = {
      canViewComplaints: true, canUpdateStatus: true, canAssignComplaints: false,
      canDeleteComplaints: false, canManageAdmins: false, canViewAnalytics: false, canExportData: false,
    };

    // Delete old data
    await Department.deleteMany({});
    await Admin.deleteMany({ role: { $in: ['department_head', 'officer'] } });

    // Create Support department
    const deptDoc = await Department.create({
      name: 'Support', code: 'support',
      description: 'Support team — triages tickets, assigns to developers, manages SLA and escalations',
      headName: 'Rahul Sharma', headEmail: 'support@techsupport.com', headPhone: '9876500001',
      supportedCategories: [
        { name: 'Homepage Issue', sla: '24h' }, { name: 'Admission Portal Issue', sla: '24h' },
        { name: 'Examination Portal Issue', sla: '24h' }, { name: 'Student Portal Issue', sla: '24h' },
        { name: 'Faculty Portal Issue', sla: '24h' }, { name: 'LMS Issue', sla: '24h' },
        { name: 'Payment Gateway Issue', sla: '24h' }, { name: 'Email System Issue', sla: '24h' },
        { name: 'Mobile App Issue', sla: '24h' }, { name: 'Other', sla: '24h' },
      ],
      priority: 'high', isActive: true,
    });

    // Create admin if not exists
    const existingAdmin = await Admin.findOne({ email: 'admin@techsupport.com' });
    if (!existingAdmin) {
      await Admin.create({
        name: 'Admin', email: 'admin@techsupport.com', password: DEFAULT_PASSWORD,
        phone: '9876500000', role: 'super_admin', designation: 'System Administrator',
        department: 'general', isActive: true, permissions: ADMIN_PERMISSIONS,
      });
    }

    // Create Support Lead
    await Admin.create({
      name: 'Rahul Sharma', email: 'support@techsupport.com', password: DEFAULT_PASSWORD,
      phone: '9876500001', role: 'department_head', department: 'support',
      departmentCode: 'support', departmentRef: deptDoc._id,
      designation: 'Support Lead', isActive: true, permissions: HEAD_PERMISSIONS,
    });

    // Create Developers
    const devs = [
      { name: 'Amit Kumar', email: 'developer@techsupport.com', phone: '9876500002' },
      { name: 'Priya Singh', email: 'priya.dev@techsupport.com', phone: '9876500003' },
    ];
    for (const dev of devs) {
      await Admin.create({
        name: dev.name, email: dev.email, password: DEFAULT_PASSWORD,
        phone: dev.phone, role: 'officer', department: 'support',
        departmentCode: 'support', departmentRef: deptDoc._id,
        designation: 'Developer', employeeId: '', isActive: true, permissions: OFFICER_PERMISSIONS,
      });
    }

    // Seed CategoryMappings
    await CategoryMapping.deleteMany({});
    const categories = [
      'Homepage Issue', 'Admission Portal Issue', 'Examination Portal Issue',
      'Student Portal Issue', 'Faculty Portal Issue', 'LMS Issue',
      'Payment Gateway Issue', 'Email System Issue', 'Mobile App Issue', 'Other',
    ];
    for (const cat of categories) {
      await CategoryMapping.findOneAndUpdate(
        { categoryName: cat, source: 'manual' },
        { categoryName: cat, departmentCode: 'support', departmentRef: deptDoc._id, slaDuration: '24h', source: 'manual', isActive: true },
        { upsert: true, new: true }
      );
    }

    console.log(`✅ Auto-seeded: 1 department, 1 support lead, ${devs.length} developers, ${categories.length} mappings`);
  } catch (err) {
    console.error('⚠️  Auto-seed error (non-fatal):', err.message);
  }
}

const startServer = async () => {
  try {
    await connectDB();

    // Initialize Socket.IO
    initializeSocket(server);
    console.log('✅ WebSocket server initialized');

    // Initialize SLA monitoring
    initializeSLACron();
    
    // Verify email connection
    await verifyEmailConnection();

    // Start server
    const PORT = config.port;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${config.nodeEnv}`);
      console.log(`🔗 Client URL: ${config.clientUrl}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Only start the full server (with listen, Socket.IO, cron) when NOT on Vercel
if (!process.env.VERCEL) {
  startServer();
}

module.exports = app;
