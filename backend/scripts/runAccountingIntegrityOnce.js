/**
 * One-shot driver for the accountingIntegrityAgent — calls run() exactly the
 * way agentExecutor would but bypasses the cron + dispatcher. Useful to verify
 * the agent wiring end-to-end without waiting for 4:00 AM.
 *
 * Usage (from backend/):
 *   node scripts/runAccountingIntegrityOnce.js
 *   node scripts/runAccountingIntegrityOnce.js --entity <id>
 *   node scripts/runAccountingIntegrityOnce.js --period 2026-04
 */
require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const val = args[i + 1];
  return val && !val.startsWith('--') ? val : true;
}

const ENTITY_FILTER = flag('entity');
const PERIOD_OVERRIDE = flag('period');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const agent = require('../agents/accountingIntegrityAgent');
  const result = await agent.run({
    entityFilter: ENTITY_FILTER && ENTITY_FILTER !== true ? ENTITY_FILTER : null,
    periodOverride: PERIOD_OVERRIDE && PERIOD_OVERRIDE !== true ? PERIOD_OVERRIDE : null,
  });
  console.log('\n=== Agent run result ===');
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
})();
