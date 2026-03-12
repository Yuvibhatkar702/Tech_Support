/**
 * Seed script for Tech Support team members
 * Run with: node scripts/seedTechTeam.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const config = require('../config');

// Default password for all team members
const DEFAULT_PASSWORD = 'TechSupport@123';

// Team data
const supportEngineers = [
  { name: 'Amit Kohale', email: 'amitkohale@gmail.com' },
  { name: 'Arpit Kambe', email: 'arpitkambe@gmail.com' },
  { name: 'Ashish Muke', email: 'ashishmuke@gmail.com' },
];

const developers = [
  { name: 'Manali Sukalikar', email: 'manalisukalikar@gmail.com' },
  { name: 'Abhinav Chaudhari', email: 'abhinavchaudhari@gmail.com' },
  { name: 'Akshay Kale', email: 'akshaykale@gmail.com' },
  { name: 'Nikita Kamnani', email: 'nikitakamnani@gmail.com' },
  { name: 'Shravani Bonde', email: 'shravanibonde@gmail.com' },
];

const admin = [
  { name: 'Harshal Watane', email: 'harshalwatane@gmail.com' },
];

async function seedTechTeam() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB\n');

    // Plain password - model will hash it automatically
    const plainPassword = DEFAULT_PASSWORD;

    // Remove existing developers and support staff (by email)
    console.log('Removing existing team members...');
    const emailsToRemove = [
      ...supportEngineers.map(s => s.email.toLowerCase()),
      ...developers.map(d => d.email.toLowerCase()),
      ...admin.map(a => a.email.toLowerCase()),
      // Also remove old test data
      'support@techsupport.com', 'priya.dev@techsupport.com', 'developer@techsupport.com'
    ];
    const deleteResult = await Admin.deleteMany({ 
      email: { $in: emailsToRemove } 
    });
    console.log(`Removed ${deleteResult.deletedCount} existing entries\n`);

    const results = { created: 0, errors: [] };

    // Create Support Engineers
    console.log('=== Creating Support Engineers ===');
    for (const member of supportEngineers) {
      try {
        await Admin.create({
          name: member.name,
          email: member.email.toLowerCase(),
          password: plainPassword,
          role: 'support',
          designation: 'Support Engineer',
          department: 'support',
          departmentCode: 'support',
          isActive: true,
          permissions: {
            canViewComplaints: true,
            canUpdateStatus: true,
            canAssignComplaints: true,
            canDeleteComplaints: false,
            canManageAdmins: false,
            canViewAnalytics: true,
            canExportData: true,
          },
        });
        console.log(`Created: ${member.name} (${member.email})`);
        results.created++;
      } catch (err) {
        results.errors.push({ name: member.name, error: err.message });
        console.error(`Error: ${member.name} - ${err.message}`);
      }
    }

    // Create Developers
    console.log('\n=== Creating Developers ===');
    for (const member of developers) {
      try {
        await Admin.create({
          name: member.name,
          email: member.email.toLowerCase(),
          password: plainPassword,
          role: 'developer',
          designation: 'Developer',
          department: 'developer',
          departmentCode: 'developer',
          isActive: true,
          permissions: {
            canViewComplaints: true,
            canUpdateStatus: true,
            canAssignComplaints: true,
            canDeleteComplaints: true,
            canManageAdmins: false,
            canViewAnalytics: true,
            canExportData: true,
          },
        });
        console.log(`Created: ${member.name} (${member.email})`);
        results.created++;
      } catch (err) {
        results.errors.push({ name: member.name, error: err.message });
        console.error(`Error: ${member.name} - ${err.message}`);
      }
    }

    // Create/Update Admin
    console.log('\n=== Creating Admin ===');
    for (const member of admin) {
      try {
        await Admin.create({
          name: member.name,
          email: member.email.toLowerCase(),
          password: plainPassword,
          role: 'super_admin',
          designation: 'Admin',
          department: 'admin',
          departmentCode: 'admin',
          isActive: true,
          permissions: {
            canViewComplaints: true,
            canUpdateStatus: true,
            canAssignComplaints: true,
            canDeleteComplaints: true,
            canManageAdmins: true,
            canViewAnalytics: true,
            canExportData: true,
          },
        });
        console.log(`Created: ${member.name} (${member.email})`);
        results.created++;
      } catch (err) {
        results.errors.push({ name: member.name, error: err.message });
        console.error(`Error: ${member.name} - ${err.message}`);
      }
    }

    // Summary
    console.log('\n=== Summary ===');
    console.log(`Total created/updated: ${results.created}`);
    console.log(`Errors: ${results.errors.length}`);
    console.log(`\nDefault Password: ${DEFAULT_PASSWORD}`);
    console.log('\nTeam members can login with their email and the default password.');

    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
    }

  } catch (error) {
    console.error('Seed failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

seedTechTeam();
