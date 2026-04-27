/**
 * One-shot driver for the orphanLedgerAuditAgent — calls run() exactly the
 * way agentExecutor would but bypasses the cron + dispatcher. Useful to
 * verify the agent wiring end-to-end without waiting for 3:00 AM.
 *
 * Usage (from backend/):
 *   node scripts/runOrphanLedgerAuditOnce.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const agent = require('../agents/orphanLedgerAuditAgent');
  const result = await agent.run({});
  console.log('\n=== Agent run result ===');
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
})();
