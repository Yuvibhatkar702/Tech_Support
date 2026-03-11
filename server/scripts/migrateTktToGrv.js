require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const coll = mongoose.connection.db.collection('complaints');
  const docs = await coll.find({ complaintId: /^TKT/ }).toArray();
  console.log(`Found ${docs.length} complaints with TKT prefix`);

  for (const doc of docs) {
    const newId = doc.complaintId.replace(/^TKT/, 'GRV');
    await coll.updateOne({ _id: doc._id }, { $set: { complaintId: newId } });
    console.log(`${doc.complaintId} -> ${newId}`);
  }

  console.log('Migration complete');
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
