/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   TECH SUPPORT SEED SCRIPT                                  ║
 * ║   Seeds departments, support leads, and developers           ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * This script:
 *  1. Removes OLD departments and officials.
 *  2. Creates the tech-support departments with subcategories + SLA.
 *  3. Creates an Admin account.
 *  4. Creates Support Leads (department_head role) and Developers (officer role).
 *
 * Default password for ALL accounts: Pass@123
 *
 * Usage:
 *   node scripts/seedTechSupport.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Department = require('../models/Department');
const Admin      = require('../models/Admin');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const DEFAULT_PASSWORD = 'Pass@123';

function log(msg) { console.log(msg); }
function section(title) { console.log(`\n${'═'.repeat(60)}\n  ${title}\n${'═'.repeat(60)}`); }

// ─── Permissions ────────────────────────────────────────────────────
const ADMIN_PERMISSIONS = {
  canViewComplaints: true,
  canUpdateStatus: true,
  canAssignComplaints: true,
  canDeleteComplaints: true,
  canManageAdmins: true,
  canViewAnalytics: true,
  canExportData: true,
};

const SUPPORT_PERMISSIONS = {
  canViewComplaints: true,
  canUpdateStatus: true,
  canAssignComplaints: true,
  canDeleteComplaints: false,
  canManageAdmins: false,
  canViewAnalytics: true,
  canExportData: true,
};

const DEVELOPER_PERMISSIONS = {
  canViewComplaints: true,
  canUpdateStatus: true,
  canAssignComplaints: false,
  canDeleteComplaints: false,
  canManageAdmins: false,
  canViewAnalytics: false,
  canExportData: false,
};

// ════════════════════════════════════════════════════════════════════
//  DATA — Departments for tech support
// ════════════════════════════════════════════════════════════════════

const DEPARTMENTS = [
  {
    name: 'Support',
    code: 'support',
    description: 'Support team — triages tickets, assigns to developers, manages SLA and escalations',
    priority: 'high',
    subcategories: [
      { name: 'Homepage Issue', sla: '1-2 Days' },
      { name: 'Admission Portal Issue', sla: '1-3 Days' },
      { name: 'Examination Portal Issue', sla: 'Same Day' },
      { name: 'Student Portal Issue', sla: '1-3 Days' },
      { name: 'Faculty Portal Issue', sla: '1-3 Days' },
      { name: 'LMS Issue', sla: '1-3 Days' },
      { name: 'Payment Gateway Issue', sla: 'Same Day' },
      { name: 'Email System Issue', sla: '1-2 Days' },
      { name: 'Mobile App Issue', sla: '1-3 Days' },
      { name: 'Other', sla: '2-5 Days' },
    ],
    head: {
      name: 'Rahul Sharma',
      email: 'support@techsupport.com',
      phone: '9876500001',
      designation: 'Support Lead',
    },
    officers: [
      { name: 'Amit Kumar',  email: 'developer@techsupport.com',  phone: '9876500002', designation: 'Developer' },
      { name: 'Priya Singh', email: 'priya.dev@techsupport.com',  phone: '9876500003', designation: 'Developer' },
    ],
  },
];

// ─── Admin Account ──────────────────────────────────────────────────
const ADMIN_ACCOUNT = {
  name: 'Admin',
  email: 'admin@techsupport.com',
  phone: '9876500000',
  role: 'super_admin',
  designation: 'System Administrator',
};

// ════════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════════

async function run() {
  if (!MONGO_URI) {
    console.error('❌ MONGODB_URI not set. Set it in server/.env or run with:\n   MONGODB_URI="mongodb+srv://..." node scripts/seedTechSupport.js');
    process.exit(1);
  }

  const dbName = MONGO_URI.match(/\/([^/?]+)(\?|$)/)?.[1] || 'unknown';
  log(`\n🔗 Connecting to: ${MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);
  log(`📦 Database: ${dbName}`);

  await mongoose.connect(MONGO_URI);
  log('✅ Connected\n');

  const summary = { deptsDeleted: 0, officialsDeleted: 0, deptsCreated: 0, headsCreated: 0, developersCreated: 0, adminCreated: false, errors: [] };

  // ── Step 1: Remove ALL old departments ─────────────────────────
  section('STEP 1 — Remove all old departments');
  const delDepts = await Department.deleteMany({});
  summary.deptsDeleted = delDepts.deletedCount;
  log(`  Deleted ${delDepts.deletedCount} old department(s)`);

  // ── Step 2: Remove old department_head & officer accounts ──────
  section('STEP 2 — Remove old department_head & officer accounts');
  const delOfficials = await Admin.deleteMany({ role: { $in: ['department_head', 'officer'] } });
  summary.officialsDeleted = delOfficials.deletedCount;
  log(`  Deleted ${delOfficials.deletedCount} old official(s)`);
  log(`  ⚠️  super_admin / admin accounts are NOT touched`);

  // ── Step 3: Create / update Admin account ──────────────────────
  section('STEP 3 — Ensure Admin account exists');
  const existingAdmin = await Admin.findOne({ email: ADMIN_ACCOUNT.email });
  if (existingAdmin) {
    log(`  ⏭️  Admin already exists: ${ADMIN_ACCOUNT.email}`);
  } else {
    await Admin.create({
      name: ADMIN_ACCOUNT.name,
      email: ADMIN_ACCOUNT.email,
      password: DEFAULT_PASSWORD,
      phone: ADMIN_ACCOUNT.phone,
      role: ADMIN_ACCOUNT.role,
      designation: ADMIN_ACCOUNT.designation,
      department: 'general',
      isActive: true,
      permissions: ADMIN_PERMISSIONS,
    });
    summary.adminCreated = true;
    log(`  ✅ Admin created: ${ADMIN_ACCOUNT.email}  (password: ${DEFAULT_PASSWORD})`);
  }

  // ── Step 4: Create departments ─────────────────────────────────
  section('STEP 4 — Create departments');
  const deptMap = {};

  for (const dept of DEPARTMENTS) {
    try {
      const newDept = await Department.create({
        name: dept.name,
        code: dept.code,
        description: dept.description,
        headName: dept.head?.name || '',
        headEmail: dept.head?.email || '',
        headPhone: dept.head?.phone || '',
        supportedCategories: dept.subcategories,
        priority: dept.priority,
        isActive: true,
      });
      deptMap[dept.code] = newDept;
      summary.deptsCreated++;
      log(`  ✅ ${dept.name}  (${dept.code}) — ${dept.subcategories.length} subcategories`);
    } catch (err) {
      const msg = `Failed: ${dept.code} — ${err.message}`;
      summary.errors.push(msg);
      log(`  ❌ ${msg}`);
    }
  }

  // ── Step 5: Create Support Leads (department_head role) ────────
  section('STEP 5 — Create Support Leads');

  for (const dept of DEPARTMENTS) {
    if (!dept.head) { log(`  ⏭️  ${dept.code} — no support lead`); continue; }
    const deptDoc = deptMap[dept.code];
    try {
      await Admin.create({
        name:           dept.head.name,
        email:          dept.head.email,
        password:       DEFAULT_PASSWORD,
        phone:          dept.head.phone,
        role:           'department_head',
        department:     dept.code,
        departmentCode: dept.code,
        departmentRef:  deptDoc?._id,
        designation:    dept.head.designation,
        isActive:       true,
        permissions:    SUPPORT_PERMISSIONS,
      });
      summary.headsCreated++;
      log(`  ✅ SUPPORT  ${dept.head.name}  <${dept.head.email}>  dept=${dept.code}`);
    } catch (err) {
      const msg = `Support Lead ${dept.head.email}: ${err.message}`;
      summary.errors.push(msg);
      log(`  ❌ ${msg}`);
    }
  }

  // ── Step 6: Create Developers (officer role) ───────────────────
  section('STEP 6 — Create Developers');

  for (const dept of DEPARTMENTS) {
    if (!dept.officers.length) { log(`  ⏭️  ${dept.code} — no developers`); continue; }
    const deptDoc = deptMap[dept.code];
    log(`\n  📂 ${dept.name} (${dept.officers.length} developers)`);

    for (const dev of dept.officers) {
      try {
        await Admin.create({
          name:           dev.name,
          email:          dev.email,
          password:       DEFAULT_PASSWORD,
          phone:          dev.phone,
          role:           'officer',
          department:     dept.code,
          departmentCode: dept.code,
          departmentRef:  deptDoc?._id,
          designation:    dev.designation,
          employeeId:     dev.employeeId || '',
          isActive:       true,
          permissions:    DEVELOPER_PERMISSIONS,
        });
        summary.developersCreated++;
        log(`     ✅ ${dev.designation.padEnd(26)} ${dev.name.padEnd(24)} <${dev.email}>`);
      } catch (err) {
        const msg = `Developer ${dev.email}: ${err.message}`;
        summary.errors.push(msg);
        log(`     ❌ ${msg}`);
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────
  section('SUMMARY');
  log(`  Departments deleted:    ${summary.deptsDeleted}`);
  log(`  Officials deleted:      ${summary.officialsDeleted}`);
  log(`  Departments created:    ${summary.deptsCreated}`);
  log(`  Admin created:          ${summary.adminCreated ? 'Yes' : 'Already existed'}`);
  log(`  Support Leads created:  ${summary.headsCreated}`);
  log(`  Developers created:     ${summary.developersCreated}`);
  log(`  Errors:                 ${summary.errors.length}`);
  if (summary.errors.length) {
    summary.errors.forEach(e => log(`    ⚠️  ${e}`));
  }

  section('LOGIN CREDENTIALS');
  log(`  ┌──────────────────────────────────────────────────────────┐`);
  log(`  │  Role          Email                        Password    │`);
  log(`  ├──────────────────────────────────────────────────────────┤`);
  log(`  │  Admin         admin@techsupport.com        Pass@123    │`);
  log(`  │  Support       support@techsupport.com      Pass@123    │`);
  log(`  │  Developer     developer@techsupport.com    Pass@123    │`);
  log(`  └──────────────────────────────────────────────────────────┘`);
  log('');

  await mongoose.disconnect();
  log('🔌 Disconnected. Done!\n');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
