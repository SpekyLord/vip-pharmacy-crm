/**
 * Clean Database & S3 for Production
 *
 * Removes all test/seed data while keeping the admin user.
 * Also empties S3 bucket (visits/, avatars/, products/ folders).
 *
 * Usage: node backend/scripts/cleanForProduction.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

// Models
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const ProductAssignment = require('../models/ProductAssignment');
const MessageInbox = require('../models/MessageInbox');
const AuditLog = require('../models/AuditLog');

// Newer models (may or may not have data)
let Schedule, Client, ClientVisit, CrmProduct, ImportBatch, EmailLog, Report, ScheduledReport;
try { Schedule = require('../models/Schedule'); } catch {}
try { Client = require('../models/Client'); } catch {}
try { ClientVisit = require('../models/ClientVisit'); } catch {}
try { CrmProduct = require('../models/CrmProduct'); } catch {}
try { ImportBatch = require('../models/ImportBatch'); } catch {}
try { EmailLog = require('../models/EmailLog'); } catch {}
try { Report = require('../models/Report'); } catch {}
try { ScheduledReport = require('../models/ScheduledReport'); } catch {}

const ADMIN_EMAIL = 'admin@vipcrm.com';

async function cleanDatabase() {
  console.log('\n=== DATABASE CLEANUP ===\n');

  // Keep admin user
  const admin = await User.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    console.log('⚠ Admin user not found! Proceeding without admin preservation.');
  } else {
    console.log(`✓ Found admin: ${admin.name} (${admin.email})`);
  }

  // Delete all users except admin
  const userResult = await User.deleteMany(admin ? { _id: { $ne: admin._id } } : {});
  console.log(`✓ Users deleted: ${userResult.deletedCount} (kept admin)`);

  // Delete all doctors (VIP Clients)
  const doctorResult = await Doctor.deleteMany({});
  console.log(`✓ Doctors (VIP Clients) deleted: ${doctorResult.deletedCount}`);

  // Delete all visits
  const visitResult = await Visit.deleteMany({});
  console.log(`✓ Visits deleted: ${visitResult.deletedCount}`);

  // Delete all product assignments
  const assignResult = await ProductAssignment.deleteMany({});
  console.log(`✓ Product assignments deleted: ${assignResult.deletedCount}`);

  // Delete all messages
  const msgResult = await MessageInbox.deleteMany({});
  console.log(`✓ Messages deleted: ${msgResult.deletedCount}`);

  // Delete all audit logs
  const auditResult = await AuditLog.deleteMany({});
  console.log(`✓ Audit logs deleted: ${auditResult.deletedCount}`);

  // Clean newer collections if they exist
  const optionalModels = [
    ['Schedules', Schedule],
    ['Clients', Client],
    ['ClientVisits', ClientVisit],
    ['CrmProducts', CrmProduct],
    ['ImportBatches', ImportBatch],
    ['EmailLogs', EmailLog],
    ['Reports', Report],
    ['ScheduledReports', ScheduledReport],
  ];

  for (const [name, Model] of optionalModels) {
    if (Model) {
      try {
        const result = await Model.deleteMany({});
        if (result.deletedCount > 0) {
          console.log(`✓ ${name} deleted: ${result.deletedCount}`);
        }
      } catch {
        // Collection may not exist yet
      }
    }
  }

  // Don't delete regions - they're structural data you'll want to keep or re-create
  console.log(`\n  Note: Regions were NOT deleted (structural data).`);
  console.log(`  To also clear regions, run: db.regions.deleteMany({}) in mongo shell.\n`);
}

async function cleanS3() {
  console.log('=== S3 CLEANUP ===\n');

  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    console.log('⚠ S3_BUCKET_NAME not set, skipping S3 cleanup.');
    return;
  }

  const s3 = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const folders = ['visits/', 'avatars/', 'products/'];
  let totalDeleted = 0;

  for (const prefix of folders) {
    let continuationToken;
    let folderCount = 0;

    do {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      });

      const response = await s3.send(listCmd);
      const objects = response.Contents || [];

      if (objects.length > 0) {
        const deleteCmd = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.map(obj => ({ Key: obj.Key })),
            Quiet: true,
          },
        });
        await s3.send(deleteCmd);
        folderCount += objects.length;
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
    } while (continuationToken);

    console.log(`✓ S3 ${prefix} — deleted ${folderCount} files`);
    totalDeleted += folderCount;
  }

  console.log(`\n  Total S3 files deleted: ${totalDeleted}`);
  console.log(`  Bucket: ${bucket}\n`);
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_DATA_SCRIPTS !== 'true') {
    console.error('Refusing to run cleanup in production. Set ALLOW_PROD_DATA_SCRIPTS=true to override.');
    process.exit(1);
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║  CLEAN DATABASE & S3 FOR PRODUCTION      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\nEnvironment: ${process.env.NODE_ENV}`);
  console.log(`Database: ${process.env.MONGO_URI?.replace(/\/\/.*@/, '//***@')}`);
  console.log(`S3 Bucket: ${process.env.S3_BUCKET_NAME}`);

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    await cleanDatabase();
    await cleanS3();

    console.log('=== CLEANUP COMPLETE ===\n');
    console.log('Admin user preserved. Database and S3 are clean.');
    console.log('You can now import real production data.\n');
  } catch (err) {
    console.error('✗ Error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
