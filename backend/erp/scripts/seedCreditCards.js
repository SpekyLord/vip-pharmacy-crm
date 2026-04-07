/**
 * Seed Credit Cards — company cards assigned to BDMs
 *
 * Cards are assigned to users later via admin UI or migration.
 * This seed creates the card records without assignment (assigned_to = null).
 *
 * Usage: node backend/erp/scripts/seedCreditCards.js
 */
const path = require('path');
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const CreditCard = require('../models/CreditCard');
const Entity = require('../models/Entity');

const CARDS = [
  {
    card_code: 'SBC-MC-001',
    card_name: 'SBC Mastercard',
    bank: 'Security Bank',
    card_type: 'CREDIT_CARD',
    card_brand: 'MASTERCARD',
    coa_code: '2301',
    // assigned_to: All BDMs as supplementary — assigned via admin UI per BDM
  },
  {
    card_code: 'RCBC-CORP-001',
    card_name: 'RCBC Corporate MC',
    bank: 'RCBC',
    card_type: 'CREDIT_CARD',
    card_brand: 'MASTERCARD',
    coa_code: '2303',
    // assigned_to: eBDMs + Accounting — assigned via admin UI
  },
  {
    card_code: 'RCBC-PLAT-001',
    card_name: 'RCBC Platinum MC (Fleet)',
    bank: 'RCBC',
    card_type: 'FLEET_CARD',
    card_brand: 'MASTERCARD',
    coa_code: '2302',
    // assigned_to: Gregg — assigned via admin UI
  },
  {
    card_code: 'BDO-PLAT-001',
    card_name: 'BDO MC',
    bank: 'BDO',
    card_type: 'CREDIT_CARD',
    card_brand: 'MASTERCARD',
    coa_code: '2304',
    // assigned_to: Gregg — assigned via admin UI
  },
];

async function seedCreditCards() {
  // Seed cards under the parent (VIP) entity
  const vipEntity = await Entity.findOne({ entity_type: 'PARENT', status: 'ACTIVE' }).lean();
  if (!vipEntity) {
    console.log('  No parent entity found — skipping credit card seed');
    return;
  }

  let upserted = 0;
  for (const card of CARDS) {
    const result = await CreditCard.updateOne(
      { entity_id: vipEntity._id, card_code: card.card_code },
      { $setOnInsert: { entity_id: vipEntity._id, ...card, is_active: true } },
      { upsert: true }
    );
    if (result.upsertedCount > 0) upserted++;
  }

  console.log(`  ${vipEntity.entity_name}: ${upserted} new credit cards (${CARDS.length} total)`);
}

if (require.main === module) {
  (async () => {
    await connectDB();
    console.log('═══ Seed Credit Cards ═══\n');
    await seedCreditCards();
    await mongoose.disconnect();
  })().catch(err => {
    console.error('Seed error:', err);
    mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = seedCreditCards;
