/**
 * Tag VIP Bacolod hospitals to Mae Navarro
 * Usage: node backend/erp/scripts/tagBacolodHospitals.js
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

const HOSPITAL_NAMES = [
  'Metro Bacolod Hospital',
  'The Doctors Hospital',
  'Bacolod Adventist Medical center',
  'Bacolod Queen of Mercy',
  'Riverside Medical Center',
  'South Bacolod General Hospital',
  'Manapla Hospital',
  'Lopez district Farmers hospital',
  'Maranon Hospital',
  'Hinigaran Doctors Hospital',
  'Holy Mother Of Mercy -Hinigaran',
  'Holy Mother Of Mercy -Kabankalan',
  'Binalnagan Infirmary'
];

async function run() {
  await connectDB();
  const Hospital = require('../models/Hospital');
  const User = require('../../models/User');

  const mae = await User.findOne({ email: 's3.vippharmacy@gmail.com' }).select('_id name').lean();
  if (!mae) { console.error('Mae Navarro not found!'); process.exit(1); }
  console.log('BDM:', mae.name, String(mae._id));

  let tagged = 0, already = 0, notFound = 0;

  for (const name of HOSPITAL_NAMES) {
    // Case-insensitive search
    const h = await Hospital.findOne({
      hospital_name: { $regex: name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), $options: 'i' }
    }).select('_id hospital_name tagged_bdms');

    if (!h) {
      console.log('  NOT FOUND:', name);
      notFound++;
      continue;
    }

    const isTagged = (h.tagged_bdms || []).some(
      t => t.bdm_id.toString() === mae._id.toString() && t.is_active !== false
    );

    if (isTagged) {
      console.log('  Already:', h.hospital_name);
      already++;
    } else {
      await Hospital.updateOne(
        { _id: h._id },
        { $push: { tagged_bdms: { bdm_id: mae._id, tagged_at: new Date(), is_active: true } } }
      );
      console.log('  TAGGED:', h.hospital_name);
      tagged++;
    }
  }

  console.log(`\nDone: ${tagged} tagged, ${already} already, ${notFound} not found`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
