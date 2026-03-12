/**
 * Migration: Regenerate all college codes to 10-digit numeric format.
 * Run: node scripts/migrateCollegeCodes.js
 */
const mongoose = require('mongoose');
const config = require('../config');
const College = require('../models/College');

async function migrate() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to MongoDB');

  const colleges = await College.find({});
  console.log(`Found ${colleges.length} colleges to migrate`);

  let updated = 0;
  let errors = 0;

  for (const college of colleges) {
    try {
      const newCode = await College.generateUniqueCode();
      const oldCode = college.code;
      college.code = newCode;
      await college.save();
      console.log(`  ✔ ${college.name} (${college.city}): ${oldCode} → ${newCode}`);
      updated++;
    } catch (err) {
      console.error(`  ✘ ${college.name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${errors} errors out of ${colleges.length} total`);
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
