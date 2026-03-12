const mongoose = require('mongoose');
const config = require('../config');
const Complaint = require('../models/Complaint');

mongoose.connect(config.mongoUri).then(async () => {
  const now = new Date();
  console.log('Now:', now);
  
  const overdue = await Complaint.find({
    expectedResolveAt: { $lt: now },
    status: { $nin: ['closed', 'rejected'] }
  }).select('complaintId status expectedResolveAt');
  
  console.log('Overdue count:', overdue.length);
  overdue.forEach(c => console.log(c.complaintId, c.status, c.expectedResolveAt));
  
  mongoose.disconnect();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
