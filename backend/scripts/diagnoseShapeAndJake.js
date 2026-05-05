require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const c = mongoose.connection.collection('doctors');
  const u = mongoose.connection.collection('users');

  const jake = await u.findOne({ email: 's19.vippharmacy@gmail.com' });
  console.log(`Jake _id=${jake._id}`);

  // Use $type to differentiate array vs scalar
  const arrayShape = await c.countDocuments({ assignedTo: { $type: 'array' } });
  const objectIdShape = await c.countDocuments({ assignedTo: { $type: 'objectId' } });
  const missing = await c.countDocuments({ assignedTo: { $exists: false } });
  const nullField = await c.countDocuments({ assignedTo: null });
  const total = await c.countDocuments({});
  console.log(`Total doctors: ${total}`);
  console.log(`  • assignedTo is array:    ${arrayShape}`);
  console.log(`  • assignedTo is ObjectId: ${objectIdShape}`);
  console.log(`  • assignedTo missing:     ${missing}`);
  console.log(`  • assignedTo null:        ${nullField}`);
  console.log('');

  // Jake-specific by shape
  const jakeArray = await c.countDocuments({ isActive: true, assignedTo: { $type: 'array', $eq: jake._id } });
  const jakeArray2 = await c.countDocuments({ isActive: true, assignedTo: { $type: 'array' }, $expr: { $in: [jake._id, '$assignedTo'] } });
  const jakeScalar = await c.countDocuments({ isActive: true, assignedTo: jake._id, $nor: [{ assignedTo: { $type: 'array' } }] });
  // Easier: use aggregation
  const split = await c.aggregate([
    { $match: { isActive: true } },
    {
      $facet: {
        scalarMatch: [
          { $match: { assignedTo: jake._id } },
          { $match: { $expr: { $ne: [{ $type: '$assignedTo' }, 'array'] } } },
          { $count: 'n' },
        ],
        arrayMatch: [
          { $match: { assignedTo: { $type: 'array' } } },
          { $match: { assignedTo: jake._id } },
          { $count: 'n' },
        ],
      },
    },
  ]).toArray();
  console.log(`Jake-active scalar match: ${(split[0].scalarMatch[0] && split[0].scalarMatch[0].n) || 0}`);
  console.log(`Jake-active  array match: ${(split[0].arrayMatch[0]  && split[0].arrayMatch[0].n)  || 0}`);
  console.log('');

  // Jake-active count via simple find
  const allActiveJake = await c.countDocuments({ isActive: true, assignedTo: jake._id });
  console.log(`All Jake-active (any shape): ${allActiveJake}`);

  // Sample 3 array-shape Jake assignments
  const sample = await c.find(
    { isActive: true, assignedTo: { $type: 'array', $eq: jake._id } },
    { projection: { _id: 1, lastName: 1, firstName: 1, assignedTo: 1, primaryAssignee: 1 } },
  ).limit(5).toArray();
  console.log('Sample array-shape Jake docs:');
  for (const d of sample) {
    console.log(`  ${d.lastName}, ${d.firstName}: assignedTo length=${d.assignedTo.length}, primary=${d.primaryAssignee}`);
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
