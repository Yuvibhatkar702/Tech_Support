const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config');
const Admin = require('../models/Admin');

const emails = [
  'yuvi@gmail.com',
  'ashishmuke@gmail.com', 
  'arpitkambe@gmail.com',
  'amitkohale@gmail.com',
  'shravanibonde@gmail.com',
  'nikitakamnani@gmail.com',
  'akshaykale@gmail.com',
  'abhinavchaudhari@gmail.com',
  'manalisukalikar@gmail.com'
];

mongoose.connect(config.mongoUri).then(async () => {
  const hash = await bcrypt.hash('TechSupport@123', 12);
  const result = await Admin.updateMany(
    { email: { $in: emails } },
    { password: hash }
  );
  console.log('Updated', result.modifiedCount, 'users with password TechSupport@123');
  mongoose.disconnect();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
