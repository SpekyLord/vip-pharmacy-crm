/**
 * Migration: Split SALES_SETTINGS.REQUIRE_CSI_PHOTO into two codes.
 *
 * Old (single code): REQUIRE_CSI_PHOTO — gated Validate for every CSI row
 * regardless of source. Default 1.
 *
 * New (two codes):
 *   - REQUIRE_CSI_PHOTO_OPENING_AR (default 1): gates Validate for OPENING_AR.
 *   - REQUIRE_CSI_PHOTO_SALES_LINE (default 0): reserved future Submit gate
 *     for live Sales; off by default because the signed CSI is a post-
 *     delivery artifact attached via PUT /sales/:id/received-csi.
 *
 * Per-entity: for each entity that has the old code, we copy its value into
 * REQUIRE_CSI_PHOTO_OPENING_AR (preserving whatever the subscriber already
 * tuned) and leave SALES_LINE at the off default. Then we deactivate the old
 * code (is_active=false) so Control Center stops surfacing it.
 *
 * Safe to re-run — skips entries that already exist at the new codes.
 *
 * Usage: node backend/erp/scripts/migrateSalesPhotoLookup.js
 */
require('dotenv').config();
const db = require('../../config/db');

async function migrate() {
  await db();
  const Lookup = require('../models/Lookup');

  const oldEntries = await Lookup.find({
    category: 'SALES_SETTINGS',
    code: 'REQUIRE_CSI_PHOTO',
  });

  console.log(`Found ${oldEntries.length} legacy REQUIRE_CSI_PHOTO rows`);

  let createdOpeningAr = 0;
  let createdSalesLine = 0;
  let deactivated = 0;

  for (const old of oldEntries) {
    const preservedValue = old.metadata?.value ?? 1;

    const existingOa = await Lookup.findOne({
      entity_id: old.entity_id,
      category: 'SALES_SETTINGS',
      code: 'REQUIRE_CSI_PHOTO_OPENING_AR',
    });
    if (!existingOa) {
      await Lookup.create({
        entity_id: old.entity_id,
        category: 'SALES_SETTINGS',
        code: 'REQUIRE_CSI_PHOTO_OPENING_AR',
        label: 'Require CSI Photo on Opening AR Validate',
        metadata: {
          value: preservedValue,
          description: 'Migrated from REQUIRE_CSI_PHOTO. Any proof accepted (csi_photo_url OR csi_received_photo_url).',
        },
        is_active: true,
      });
      createdOpeningAr++;
    }

    const existingSl = await Lookup.findOne({
      entity_id: old.entity_id,
      category: 'SALES_SETTINGS',
      code: 'REQUIRE_CSI_PHOTO_SALES_LINE',
    });
    if (!existingSl) {
      await Lookup.create({
        entity_id: old.entity_id,
        category: 'SALES_SETTINGS',
        code: 'REQUIRE_CSI_PHOTO_SALES_LINE',
        label: 'Require Received CSI Photo on Live Sales Submit (reserved)',
        metadata: {
          value: 0,
          description: 'Reserved Submit gate. Default 0 — live Sales post at invoice issuance; signed CSI is attached post-delivery.',
        },
        is_active: true,
      });
      createdSalesLine++;
    }

    if (old.is_active !== false) {
      old.is_active = false;
      await old.save();
      deactivated++;
    }
  }

  console.log(`Created ${createdOpeningAr} REQUIRE_CSI_PHOTO_OPENING_AR entries`);
  console.log(`Created ${createdSalesLine} REQUIRE_CSI_PHOTO_SALES_LINE entries`);
  console.log(`Deactivated ${deactivated} legacy REQUIRE_CSI_PHOTO entries`);
  console.log('Migration complete');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
