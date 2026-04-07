/**
 * ERP Master Data Seed Script
 *
 * Usage:  cd backend && node erp/scripts/seedErpMasterData.js
 *
 * Reads:
 *   - Hospital List CSV (from Downloads)
 *   - Product Master CSV (from Downloads)
 *
 * Creates:
 *   1. Entity record (VIP Pharmacy Inc.)
 *   2. Assigns entity_id to all existing CRM users
 *   3. Imports unique hospitals from CSV (deduped by hospital_name)
 *   4. Imports unique products from CSV (deduped by item_key, active only)
 *   5. Tags BDMs to hospitals based on CSV BDM_Code → User.name match
 *
 * Safe to run multiple times — skips existing records.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const Hospital = require('../models/Hospital');
const ProductMaster = require('../models/ProductMaster');

const ENTITY_NAME = 'VIP Pharmacy Inc.';

// ═══ CSV paths ═══
const HOSPITAL_CSV = path.join('C:', 'Users', 'LENOVO', 'Downloads', 'Hospital List per BDM - ACCOUNT_MASTER.csv');
const PRODUCT_CSV = path.join('C:', 'Users', 'LENOVO', 'Downloads', 'PRODUCT MASTER - MASTER_ITEM_MASTER.csv');

// ═══ Simple CSV parser (handles quoted fields with commas) ═══
function parseCSV(filepath) {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (values[i] || '').trim(); });
    return obj;
  });
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected\n');

    // ═══ 1. Entity ═══
    let entity = await Entity.findOne({ entity_name: ENTITY_NAME });
    if (entity) {
      console.log(`Entity exists: ${entity._id}`);
    } else {
      entity = await Entity.create({
        entity_name: ENTITY_NAME,
        entity_type: 'PARENT',
        vat_registered: true,
        status: 'ACTIVE',
      });
      console.log(`Entity created: ${entity._id} — ${entity.entity_name}`);
    }

    // ═══ 2. Assign entity_id to users ═══
    const userResult = await User.updateMany(
      { $or: [{ entity_id: { $exists: false } }, { entity_id: null }] },
      { $set: { entity_id: entity._id } }
    );
    console.log(`Users: ${userResult.modifiedCount} assigned to entity\n`);

    // Load all users for BDM matching
    const allUsers = await User.find({}, 'name email role').lean();

    // ═══ 3. Import Hospitals ═══
    console.log('═══ HOSPITALS ═══');
    if (!fs.existsSync(HOSPITAL_CSV)) {
      console.log(`  ⚠ CSV not found: ${HOSPITAL_CSV}`);
    } else {
      const hospitalRows = parseCSV(HOSPITAL_CSV);

      // Dedupe hospitals and collect BDM tags
      const hospitalMap = new Map(); // hospital_name → { ...fields, bdm_names: Set }
      for (const row of hospitalRows) {
        const name = row.ACCOUNT_MASTER_CLEAN;
        if (!name) continue;
        if (!hospitalMap.has(name)) {
          hospitalMap.set(name, {
            hospital_name: name,
            payment_terms: parseInt(row.PaymentTerms) || 30,
            vat_status: row.VATStatus || 'VATABLE',
            cwt_rate: parseFloat(row.CWTRate) || 0.01,
            tin: row.TIN || '',
            bdm_names: new Set(),
          });
        }
        if (row.BDM_Code) {
          hospitalMap.get(name).bdm_names.add(row.BDM_Code);
        }
      }

      let created = 0, existed = 0, tagged = 0;
      for (const [, h] of hospitalMap) {
        let hospital = await Hospital.findOne({
          entity_id: entity._id,
          hospital_name: h.hospital_name,
        });

        if (!hospital) {
          hospital = await Hospital.create({
            entity_id: entity._id,
            hospital_name: h.hospital_name,
            payment_terms: h.payment_terms,
            vat_status: ['VATABLE', 'EXEMPT', 'ZERO'].includes(h.vat_status) ? h.vat_status : 'VATABLE',
            cwt_rate: h.cwt_rate,
            tin: h.tin,
          });
          created++;
          console.log(`  + ${h.hospital_name}`);
        } else {
          existed++;
        }

        // Tag BDMs to hospital
        for (const bdmName of h.bdm_names) {
          const user = allUsers.find(u =>
            u.name.toLowerCase() === bdmName.toLowerCase() ||
            u.name.toLowerCase().includes(bdmName.toLowerCase().split(' ')[0])
          );
          if (user) {
            const alreadyTagged = hospital.tagged_bdms?.some(
              t => t.bdm_id?.toString() === user._id.toString()
            );
            if (!alreadyTagged) {
              await Hospital.findByIdAndUpdate(hospital._id, {
                $push: {
                  tagged_bdms: { bdm_id: user._id, tagged_by: user._id, is_active: true }
                }
              });
              tagged++;
            }
          }
        }
      }
      console.log(`  Hospitals: ${created} created, ${existed} already existed, ${tagged} BDM tags added\n`);
    }

    // ═══ 4. Import Products ═══
    console.log('═══ PRODUCTS ═══');
    if (!fs.existsSync(PRODUCT_CSV)) {
      console.log(`  ⚠ CSV not found: ${PRODUCT_CSV}`);
    } else {
      const productRows = parseCSV(PRODUCT_CSV);

      // Dedupe by item_key (keep first occurrence — the CSV may have dups from different BDMs)
      const productMap = new Map();
      for (const row of productRows) {
        const brandName = row.BrandName?.trim();
        const dosage = row.DosageStrength?.trim() || '';
        const itemKeyRaw = row.ItemKey?.trim();

        if (!brandName) continue;

        // Build a clean item_key: "BrandName|DosageStrength"
        const itemKey = `${brandName}|${dosage}`;

        // Keep only the first (or active) occurrence
        if (!productMap.has(itemKey)) {
          productMap.set(itemKey, {
            item_key: itemKey,
            generic_name: row.GenericName?.trim() || brandName,
            brand_name: brandName,
            dosage_strength: dosage,
            sold_per: row.SoldPer?.trim() || 'PC',
            purchase_price: parseFloat(row.DefaultPurchasePrice) || 0,
            selling_price: parseFloat(row.DefaultSellingPrice) || 0,
            is_active: row.IsActive?.toUpperCase() !== 'FALSE',
            original_item_key: itemKeyRaw,
          });
        } else {
          // If existing entry is inactive but this one is active, replace
          const existing = productMap.get(itemKey);
          if (!existing.is_active && row.IsActive?.toUpperCase() !== 'FALSE') {
            productMap.set(itemKey, {
              ...existing,
              purchase_price: parseFloat(row.DefaultPurchasePrice) || existing.purchase_price,
              selling_price: parseFloat(row.DefaultSellingPrice) || existing.selling_price,
              is_active: true,
            });
          }
        }
      }

      let created = 0, existed = 0, skipped = 0;
      for (const [, p] of productMap) {
        const exists = await ProductMaster.findOne({
          entity_id: entity._id,
          item_key: p.item_key,
        });

        if (exists) {
          existed++;
          continue;
        }

        try {
          await ProductMaster.create({
            entity_id: entity._id,
            item_key: p.item_key,
            generic_name: p.generic_name,
            brand_name: p.brand_name,
            dosage_strength: p.dosage_strength,
            sold_per: p.sold_per,
            purchase_price: p.purchase_price,
            selling_price: p.selling_price,
            is_active: p.is_active,
          });
          created++;
          console.log(`  + ${p.brand_name} ${p.dosage_strength} (${p.sold_per}) — Buy: ${p.purchase_price} / Sell: ${p.selling_price}`);
        } catch (err) {
          skipped++;
          console.log(`  ✗ ${p.item_key}: ${err.message}`);
        }
      }
      console.log(`  Products: ${created} created, ${existed} existed, ${skipped} skipped\n`);
    }

    // ═══ Summary ═══
    const totalHospitals = await Hospital.countDocuments({ entity_id: entity._id });
    const totalProducts = await ProductMaster.countDocuments({ entity_id: entity._id });
    const totalActiveProducts = await ProductMaster.countDocuments({ entity_id: entity._id, is_active: true });

    console.log('═══ SUMMARY ═══');
    console.log(`Entity:          ${entity.entity_name} (${entity._id})`);
    console.log(`Hospitals:       ${totalHospitals}`);
    console.log(`Products:        ${totalProducts} (${totalActiveProducts} active)`);
    console.log('\nDone! Log out and back in so the entity_id takes effect.');

    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

seed();
