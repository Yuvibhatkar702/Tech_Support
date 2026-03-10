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
  'https://griviances.vercel.app',
  'https://tech-support-wwgg-rose.vercel.app',
  config.clientUrl,
].filter(Boolean);

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Vercel rewrites, etc.)
    if (!origin) return callback(null, true);

    const allowed = config.nodeEnv === 'production' ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS];

    if (
      allowed.includes(origin) ||
      // Allow Vercel preview deploys for this project
      /^https:\/\/(griviances|tech-support)[\w-]*\.vercel\.app$/.test(origin)
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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Tech Support API is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
    },
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
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
    // Check: any dept_head with a generic @grievance.com email → stale data
    const genericHead = await Admin.findOne({
      role: 'department_head',
      email: /@grievance\.com$/i,
    });
    // Also check: departments that have NO supportedCategories entries
    const emptyDept = await Department.findOne({
      $or: [
        { supportedCategories: { $exists: false } },
        { supportedCategories: { $size: 0 } },
      ],
    });
    // Also check: completely empty DB (no departments or no heads at all)
    const deptCount = await Department.countDocuments();
    const headCount = await Admin.countDocuments({ role: 'department_head' });

    // Also check: broken passwords (double-hashed from previous bug)
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

    const needsSeed = genericHead || emptyDept || deptCount === 0 || headCount === 0 || passwordBroken;

    if (!needsSeed) {
      console.log('✅ Departments & officials already seeded correctly');
      return;
    }

    console.log('🔄 Stale/missing department data detected — re-seeding…');

    const DEFAULT_PASSWORD = 'Pass@123';
    const HEAD_PERMISSIONS = {
      canViewComplaints: true, canUpdateStatus: true, canAssignComplaints: true,
      canDeleteComplaints: false, canManageAdmins: false, canViewAnalytics: true, canExportData: true,
    };
    const OFFICER_PERMISSIONS = {
      canViewComplaints: true, canUpdateStatus: true, canAssignComplaints: false,
      canDeleteComplaints: false, canManageAdmins: false, canViewAnalytics: false, canExportData: false,
    };

    const DEPARTMENTS = [
      {
        name: 'Road Department (PWD)', code: 'road_department',
        description: 'Public Works Department — handles road damage, potholes, signage, dividers, manholes, and infrastructure issues',
        priority: 'medium',
        subcategories: [
          { name: 'Pothole', sla: '2-3 Days' }, { name: 'Surface Damage', sla: '7-15 Days' },
          { name: 'Speed Breaker Repair', sla: '3-7 Days' }, { name: 'Missing Road Signboard', sla: '3-5 Days' },
          { name: 'Divider Damage', sla: '7-15 Days' }, { name: 'Manhole Cover Damage', sla: '1-3 Days' },
          { name: 'Road Marking / Zebra Crossing', sla: '7-15 Days' },
        ],
        head: { name: 'Er. Rajesh Deshmukh', email: 'rajesh.d@gmail.com', phone: '9876500001', designation: 'Road Department / PWD Head' },
        officers: [
          { name: 'Er. Amit Kulkarni', email: 'amitk@gmail.com', phone: '9876500002', designation: 'Executive Engineer' },
          { name: 'Er. Pravin Patil', email: 'pravinp@gmail.com', phone: '9876500003', designation: 'Executive Engineer' },
          { name: 'Er. Sneha Joshi', email: 'snehaj@gmail.com', phone: '9876500004', designation: 'Assistant Engineer' },
          { name: 'Er. Nikhil Shinde', email: 'nikhils@gmail.com', phone: '9876500005', designation: 'Assistant Engineer' },
          { name: 'Er. Rohan Wankhede', email: 'rohanw@gmail.com', phone: '9876500006', designation: 'Junior Engineer' },
          { name: 'Er. Pooja Kale', email: 'poojak@gmail.com', phone: '9876500007', designation: 'Junior Engineer' },
          { name: 'Mahesh Pawar', email: 'maheshp@gmail.com', phone: '9876500008', designation: 'Section Officer' },
          { name: 'Ganesh More', email: 'ganeshm@gmail.com', phone: '9876500009', designation: 'Section Officer' },
          { name: 'Suresh Thakre', email: 'suresht@gmail.com', phone: '9876500010', designation: 'Senior Clerk' },
          { name: 'Kavita Bhosale', email: 'kavitab@gmail.com', phone: '9876500011', designation: 'Clerk' },
          { name: 'Rahul Gawande', email: 'rahulg@gmail.com', phone: '9876500012', designation: 'Clerk' },
          { name: 'Neha Ingle', email: 'nehai@gmail.com', phone: '9876500013', designation: 'Clerk' },
        ],
      },
      {
        name: 'Sanitation Department', code: 'sanitation_department',
        description: 'Solid Waste Management & Sanitation — handles garbage, drainage, public toilets, waterlogging, pest control',
        priority: 'medium',
        subcategories: [
          { name: 'Garbage Not Collected', sla: '1-2 Days' }, { name: 'Drainage Blockage', sla: '2-4 Days' },
          { name: 'Dead Animal Removal', sla: 'Same Day' }, { name: 'Public Toilet Cleaning', sla: '1 Day' },
          { name: 'Water Logging (Minor)', sla: '2-5 Days' }, { name: 'Open Drain Cleaning', sla: '2-5 Days' },
          { name: 'Mosquito Breeding Issue', sla: '2-3 Days' }, { name: 'Broken Dustbin Replacement', sla: '3-7 Days' },
        ],
        head: { name: 'Dr. Sunil Patwardhan', email: 'sunilp@gmail.com', phone: '9876500101', designation: 'Health Officer / Sanitation Head' },
        officers: [
          { name: 'Dr. Meena Tiwari', email: 'meenat@gmail.com', phone: '9876500102', designation: 'Executive Health Officer' },
          { name: 'Dr. Ajay Ingole', email: 'ajayi@gmail.com', phone: '9876500103', designation: 'Assistant Health Officer' },
          { name: 'Rakesh Jadhav', email: 'rakeshj@gmail.com', phone: '9876500104', designation: 'Sanitary Inspector' },
          { name: 'Lata Bhure', email: 'latab@gmail.com', phone: '9876500105', designation: 'Sanitary Inspector' },
          { name: 'Shailesh Pande', email: 'shaileshp@gmail.com', phone: '9876500106', designation: 'Ward Supervisor' },
          { name: 'Pritam Dange', email: 'pritamd@gmail.com', phone: '9876500107', designation: 'Ward Supervisor' },
          { name: 'Sagar Kadu', email: 'sagark@gmail.com', phone: '9876500108', designation: 'Field Officer' },
          { name: 'Komal Mahalle', email: 'komalm@gmail.com', phone: '9876500109', designation: 'Field Officer' },
          { name: 'Vijay Waghmare', email: 'vijayw@gmail.com', phone: '9876500110', designation: 'Senior Clerk' },
          { name: 'Aarti Rathod', email: 'aartir@gmail.com', phone: '9876500111', designation: 'Clerk' },
          { name: 'Deepak Meshram', email: 'deepakm@gmail.com', phone: '9876500112', designation: 'Clerk' },
          { name: 'Swati Rode', email: 'swatir@gmail.com', phone: '9876500113', designation: 'Clerk' },
        ],
      },
      {
        name: 'Electricity Department', code: 'electricity_department',
        description: 'Street Light & Electrical Department — handles street lights, wiring, poles, transformers, cables',
        priority: 'medium',
        subcategories: [
          { name: 'Street Light Not Working', sla: '2-3 Days' }, { name: 'Open/Loose Electric Wire', sla: 'Same Day' },
          { name: 'Electric Pole Damage', sla: '3-7 Days' }, { name: 'Transformer Issue', sla: '1-3 Days' },
          { name: 'Cable Fault', sla: '1-3 Days' },
        ],
        head: { name: 'Er. Vivek Bhandari', email: 'vivekb@gmail.com', phone: '9876500201', designation: 'Electrical Engineer / Dept Head' },
        officers: [
          { name: 'Er. Manoj Kapse', email: 'manojk@gmail.com', phone: '9876500202', designation: 'Executive Engineer' },
          { name: 'Er. Priyanka Dhore', email: 'priyankad@gmail.com', phone: '9876500203', designation: 'Assistant Engineer' },
          { name: 'Er. Hemant Barve', email: 'hemantb@gmail.com', phone: '9876500204', designation: 'Assistant Engineer' },
          { name: 'Er. Akash Bhagat', email: 'akashb@gmail.com', phone: '9876500205', designation: 'Junior Engineer' },
          { name: 'Er. Shweta Raut', email: 'shwetar@gmail.com', phone: '9876500206', designation: 'Junior Engineer' },
          { name: 'Sanjay Kothari', email: 'sanjayk@gmail.com', phone: '9876500207', designation: 'Electrical Inspector' },
          { name: 'Nitin Dhok', email: 'nitind@gmail.com', phone: '9876500208', designation: 'Line Supervisor' },
          { name: 'Amol Rane', email: 'amolr@gmail.com', phone: '9876500209', designation: 'Line Supervisor' },
          { name: 'Prakash Bhalerao', email: 'prakashb@gmail.com', phone: '9876500210', designation: 'Senior Clerk' },
          { name: 'Seema Yadav', email: 'seemay@gmail.com', phone: '9876500211', designation: 'Clerk' },
          { name: 'Rohit Khandekar', email: 'rohitk@gmail.com', phone: '9876500212', designation: 'Clerk' },
          { name: 'Anita Korde', email: 'anitak@gmail.com', phone: '9876500213', designation: 'Clerk' },
          { name: 'Sandeep More', email: 'sandeepm@gmail.com', phone: '9876500214', designation: 'Technician' },
          { name: 'Yogesh Patil', email: 'yogeshp@gmail.com', phone: '9876500215', designation: 'Technician' },
        ],
      },
      {
        name: 'Garden / Tree Department', code: 'garden_tree_department',
        description: 'Handles fallen trees, parks, and greenery related issues',
        priority: 'medium',
        subcategories: [{ name: 'Fallen Trees', sla: '1-2 Days' }],
        head: { name: 'Yuvraj Bhatkar', email: 'yuvi@gmail.com', phone: '7767055408', designation: 'Senior Officer' },
        officers: [
          { name: 'Rushikesh barwat', email: 'rushi@gmail.com', phone: '1478523698', designation: 'Field Officer' },
          { name: 'Shrikan Sonikar', email: 'shri@gmail.com', phone: '1452147856', designation: 'Officer' },
        ],
      },
      {
        name: 'Drainage & Water Department', code: 'drainage_water_department',
        description: 'Handles drainage blockage, open drains, water logging, and manhole issues',
        priority: 'high',
        subcategories: [
          { name: 'Drainage Blockage', sla: '1 Day' }, { name: 'Open Drain', sla: 'Same Day' },
          { name: 'Water Logging', sla: '1-2 Days' }, { name: 'Manhole Cover Damage', sla: '2-5 Days' },
        ],
        head: null,
        officers: [],
      },
    ];

    // Sub-category → Department mapping
    const SUB_CATEGORY_MAPPINGS = [
      { categoryName: 'Pothole', departmentCode: 'road_department', slaDuration: '2-3 Days' },
      { categoryName: 'Surface Damage', departmentCode: 'road_department', slaDuration: '7-15 Days' },
      { categoryName: 'Speed Breaker Repair', departmentCode: 'road_department', slaDuration: '3-7 Days' },
      { categoryName: 'Missing Road Signboard', departmentCode: 'road_department', slaDuration: '3-5 Days' },
      { categoryName: 'Divider Damage', departmentCode: 'road_department', slaDuration: '7-15 Days' },
      { categoryName: 'Manhole Cover Damage', departmentCode: 'road_department', slaDuration: '1-3 Days' },
      { categoryName: 'Road Marking / Zebra Crossing', departmentCode: 'road_department', slaDuration: '7-15 Days' },
      { categoryName: 'Garbage Not Collected', departmentCode: 'sanitation_department', slaDuration: '1-2 Days' },
      { categoryName: 'Drainage Blockage', departmentCode: 'sanitation_department', slaDuration: '2-4 Days' },
      { categoryName: 'Dead Animal Removal', departmentCode: 'sanitation_department', slaDuration: 'Same Day' },
      { categoryName: 'Public Toilet Cleaning', departmentCode: 'sanitation_department', slaDuration: '1 Day' },
      { categoryName: 'Water Logging (Minor)', departmentCode: 'sanitation_department', slaDuration: '2-5 Days' },
      { categoryName: 'Open Drain Cleaning', departmentCode: 'sanitation_department', slaDuration: '2-5 Days' },
      { categoryName: 'Mosquito Breeding Issue', departmentCode: 'sanitation_department', slaDuration: '2-3 Days' },
      { categoryName: 'Broken Dustbin Replacement', departmentCode: 'sanitation_department', slaDuration: '3-7 Days' },
      { categoryName: 'Street Light Not Working', departmentCode: 'electricity_department', slaDuration: '2-3 Days' },
      { categoryName: 'Open/Loose Electric Wire', departmentCode: 'electricity_department', slaDuration: 'Same Day' },
      { categoryName: 'Electric Pole Damage', departmentCode: 'electricity_department', slaDuration: '3-7 Days' },
      { categoryName: 'Transformer Issue', departmentCode: 'electricity_department', slaDuration: '1-3 Days' },
      { categoryName: 'Cable Fault', departmentCode: 'electricity_department', slaDuration: '1-3 Days' },
      { categoryName: 'Fallen Trees', departmentCode: 'garden_tree_department', slaDuration: '1-2 Days' },
      { categoryName: 'Drainage Blockage', departmentCode: 'drainage_water_department', slaDuration: '1 Day' },
      { categoryName: 'Open Drain', departmentCode: 'drainage_water_department', slaDuration: 'Same Day' },
      { categoryName: 'Water Logging', departmentCode: 'drainage_water_department', slaDuration: '1-2 Days' },
    ];

    // AI-predicted category → Department mapping
    const AI_CATEGORY_MAPPINGS = [
      { categoryName: 'Damaged Road Issue', departmentCode: 'road_department', slaDuration: '3-5 Days', source: 'ai' },
      { categoryName: 'Garbage and Trash Issue', departmentCode: 'sanitation_department', slaDuration: '1-2 Days', source: 'ai' },
      { categoryName: 'Street Light Issue', departmentCode: 'electricity_department', slaDuration: '2-3 Days', source: 'ai' },
      { categoryName: 'Fallen Trees', departmentCode: 'garden_tree_department', slaDuration: '1-3 Days', source: 'ai' },
      { categoryName: 'Illegal Drawing on Walls', departmentCode: 'road_department', slaDuration: '4-6 Days', source: 'ai' },
      { categoryName: 'Other', departmentCode: 'road_department', slaDuration: '3-5 Days', source: 'ai' },
    ];

    // Step 1: Delete old departments & old heads/officers
    await Department.deleteMany({});
    await Admin.deleteMany({ role: { $in: ['department_head', 'officer'] } });

    // Step 2: Create departments + heads + officers
    let headsCreated = 0, officersCreated = 0;
    for (const dept of DEPARTMENTS) {
      const deptDoc = await Department.create({
        name: dept.name, code: dept.code, description: dept.description,
        headName: dept.head?.name || '', headEmail: dept.head?.email || '', headPhone: dept.head?.phone || '',
        supportedCategories: dept.subcategories, priority: dept.priority, isActive: true,
      });

      if (dept.head) {
        await Admin.create({
          name: dept.head.name, email: dept.head.email, password: DEFAULT_PASSWORD,
          phone: dept.head.phone, role: 'department_head', department: dept.code,
          departmentCode: dept.code, departmentRef: deptDoc._id,
          designation: dept.head.designation, isActive: true, permissions: HEAD_PERMISSIONS,
        });
        headsCreated++;
      }

      for (const off of dept.officers) {
        await Admin.create({
          name: off.name, email: off.email, password: DEFAULT_PASSWORD,
          phone: off.phone, role: 'officer', department: dept.code,
          departmentCode: dept.code, departmentRef: deptDoc._id,
          designation: off.designation, employeeId: off.employeeId || '',
          isActive: true, permissions: OFFICER_PERMISSIONS,
        });
        officersCreated++;
      }
    }

    // Step 3: Seed CategoryMappings
    await CategoryMapping.deleteMany({});
    const allMappings = [...SUB_CATEGORY_MAPPINGS, ...AI_CATEGORY_MAPPINGS];
    for (const m of allMappings) {
      const dept = await Department.findOne({ code: m.departmentCode });
      if (dept) {
        await CategoryMapping.findOneAndUpdate(
          { categoryName: m.categoryName, source: m.source || 'manual' },
          { categoryName: m.categoryName, departmentCode: m.departmentCode, departmentRef: dept._id, slaDuration: m.slaDuration, source: m.source || 'manual', isActive: true },
          { upsert: true, new: true }
        );
      }
    }

    console.log(`✅ Auto-seeded: ${DEPARTMENTS.length} departments, ${headsCreated} heads, ${officersCreated} officers, ${allMappings.length} mappings`);
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
