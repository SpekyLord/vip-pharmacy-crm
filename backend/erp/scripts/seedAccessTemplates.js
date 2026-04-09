/**
 * Seed default ERP access templates per entity
 *
 * Usage: node backend/erp/scripts/seedAccessTemplates.js
 */
const path = require('path');
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const AccessTemplate = require('../models/AccessTemplate');
const Entity = require('../models/Entity');

const TEMPLATES = [
  {
    template_name: 'Field BDM',
    description: 'Standard field BDM — full sales/collections/expenses, view inventory/reports/goals',
    modules: {
      sales: 'FULL', inventory: 'VIEW', collections: 'FULL', expenses: 'FULL',
      reports: 'VIEW', people: 'NONE', payroll: 'NONE', accounting: 'NONE',
      purchasing: 'NONE', banking: 'NONE', sales_goals: 'VIEW',
    },
    can_approve: false,
  },
  {
    template_name: 'e-Commerce BDM',
    description: 'e-Commerce BDM — full sales/collections, view inventory/expenses/reports/goals',
    modules: {
      sales: 'FULL', inventory: 'VIEW', collections: 'FULL', expenses: 'VIEW',
      reports: 'VIEW', people: 'NONE', payroll: 'NONE', accounting: 'NONE',
      purchasing: 'NONE', banking: 'NONE', sales_goals: 'VIEW',
    },
    can_approve: false,
  },
  {
    template_name: 'Office Encoder',
    description: 'Office encoder — full sales/collections, view inventory/expenses/reports',
    modules: {
      sales: 'FULL', inventory: 'VIEW', collections: 'FULL', expenses: 'VIEW',
      reports: 'VIEW', people: 'NONE', payroll: 'NONE', accounting: 'NONE',
      purchasing: 'NONE', banking: 'NONE', sales_goals: 'NONE',
    },
    can_approve: false,
  },
  {
    template_name: 'Finance',
    description: 'Finance staff — full access to all modules with approval rights',
    modules: {
      sales: 'FULL', inventory: 'FULL', collections: 'FULL', expenses: 'FULL',
      reports: 'FULL', people: 'FULL', payroll: 'FULL', accounting: 'FULL',
      purchasing: 'FULL', banking: 'FULL', sales_goals: 'FULL',
    },
    can_approve: true,
  },
  {
    template_name: 'View Only (Probation)',
    description: 'Probationary access — view-only across all modules',
    modules: {
      sales: 'VIEW', inventory: 'VIEW', collections: 'VIEW', expenses: 'VIEW',
      reports: 'VIEW', people: 'VIEW', payroll: 'VIEW', accounting: 'VIEW',
      purchasing: 'VIEW', banking: 'VIEW', sales_goals: 'VIEW',
    },
    can_approve: false,
  },
  {
    template_name: 'Executive',
    description: 'Executive — view most modules, full reports/accounting/goals',
    modules: {
      sales: 'VIEW', inventory: 'VIEW', collections: 'VIEW', expenses: 'VIEW',
      reports: 'FULL', people: 'VIEW', payroll: 'VIEW', accounting: 'FULL',
      purchasing: 'VIEW', banking: 'VIEW', sales_goals: 'FULL',
    },
    can_approve: false,
  },
  {
    template_name: 'No ERP Access',
    description: 'No ERP access — all modules disabled',
    modules: {
      sales: 'NONE', inventory: 'NONE', collections: 'NONE', expenses: 'NONE',
      reports: 'NONE', people: 'NONE', payroll: 'NONE', accounting: 'NONE',
      purchasing: 'NONE', banking: 'NONE', sales_goals: 'NONE',
    },
    can_approve: false,
  },
];

const seedAccessTemplates = async () => {
  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  if (!entities.length) {
    console.log('  No active entities found — skipping access template seed');
    return;
  }

  let created = 0;
  let updated = 0;
  for (const entity of entities) {
    for (const tpl of TEMPLATES) {
      const result = await AccessTemplate.findOneAndUpdate(
        { entity_id: entity._id, template_name: tpl.template_name },
        {
          ...tpl,
          entity_id: entity._id,
          is_system: true,
          is_active: true,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (result.createdAt && result.updatedAt &&
          Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000) {
        created++;
      } else {
        updated++;
      }
    }
  }

  console.log(`  ✓ Access templates: ${created} created, ${updated} updated across ${entities.length} entities`);
};

if (require.main === module) {
  (async () => {
    await connectDB();
    console.log('═══ Seed Access Templates ═══\n');
    await seedAccessTemplates();
    console.log('\n═══ Done ═══');
    await mongoose.disconnect();
  })().catch(err => {
    console.error('Seed error:', err);
    mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = seedAccessTemplates;
