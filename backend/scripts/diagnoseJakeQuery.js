/**
 * Run the EXACT dashboard query through Mongoose to figure out why Jake sees
 * 51-60 instead of 115.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('No MONGO_URI'); process.exit(1); }

const JAKE_EMAIL = 's19.vippharmacy@gmail.com';

async function main() {
  await mongoose.connect(MONGO_URI);

  const User = require('../models/User');
  const Doctor = require('../models/Doctor');

  const jake = await User.findOne({ email: JAKE_EMAIL }).lean();
  console.log(`Jake: _id=${jake._id} role=${jake.role}`);
  console.log('');

  // Mirror getRegionFilter for staff
  const filter = { isActive: true, assignedTo: jake._id };

  const c1 = await Doctor.countDocuments(filter);
  console.log(`Doctor.countDocuments({ isActive:true, assignedTo: jakeOid }) = ${c1}`);

  // Same with primaryAssignee
  const c2 = await Doctor.countDocuments({ isActive: true, primaryAssignee: jake._id });
  console.log(`Doctor.countDocuments({ isActive:true, primaryAssignee: jakeOid }) = ${c2}`);

  // What if assignedTo is queried with $in?
  const c3 = await Doctor.countDocuments({ isActive: true, assignedTo: { $in: [jake._id] } });
  console.log(`Doctor.countDocuments({ isActive:true, assignedTo: $in [jakeOid] }) = ${c3}`);

  // Check for a 'visitFrequency' or other implicit filter
  const list = await Doctor.find(filter).select('_id firstName lastName visitFrequency assignedTo').lean();
  console.log(`List length: ${list.length}`);
  const freqDist = {};
  for (const d of list) freqDist[d.visitFrequency || 'undef'] = (freqDist[d.visitFrequency || 'undef'] || 0) + 1;
  console.log(`visitFrequency distribution: ${JSON.stringify(freqDist)}`);

  // What does the EmployeeDashboard hit? Let's also check the BDM-specific stats endpoint
  console.log('');
  console.log('Sampling 5 docs that Jake should see:');
  for (const d of list.slice(0, 5)) {
    const ids = Array.isArray(d.assignedTo) ? d.assignedTo.map(x => x.toString()) : [d.assignedTo?.toString()];
    console.log(`  ${d.lastName}, ${d.firstName} freq=${d.visitFrequency} assignedTo=[${ids.length}]`);
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
