const mongoose = require('mongoose');
const config = require('../config');
const Admin = require('../models/Admin');

const emailsToDelete = [
  'priya.dev@techsupport.com',
  'developer@techsupport.com', 
  'support@techsupport.com'
];

mongoose.connect(config.mongoUri).then(async () => {
  const result = await Admin.deleteMany({ email: { $in: emailsToDelete } });
  console.log('Deleted', result.deletedCount, 'records');
  mongoose.disconnect();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
