/**
 * Script to remove duplicate colleges (same name + same city)
 * Run with: node scripts/removeDuplicateColleges.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const College = require('../models/College');
const config = require('../config');

async function removeDuplicates() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected to MongoDB');

    // Find duplicates by name and city (case-insensitive)
    const duplicates = await College.aggregate([
      {
        $group: {
          _id: { 
            name: { $toLower: '$name' }, 
            city: { $toLower: '$city' } 
          },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          names: { $push: '$name' }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]);

    console.log(`\nFound ${duplicates.length} duplicate groups\n`);

    let totalRemoved = 0;
    for (const dup of duplicates) {
      // Keep the first one, remove the rest
      const idsToRemove = dup.ids.slice(1);
      await College.deleteMany({ _id: { $in: idsToRemove } });
      totalRemoved += idsToRemove.length;
      console.log(`Removed ${idsToRemove.length} duplicate(s): "${dup.names[0]}" - ${dup._id.city}`);
    }

    const finalCount = await College.countDocuments();
    console.log(`\n=== Summary ===`);
    console.log(`Duplicate entries removed: ${totalRemoved}`);
    console.log(`Total colleges now: ${finalCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

removeDuplicates();
