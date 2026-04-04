/**
 * Warehouse Model — Phase 17
 *
 * Physical or logical stock-holding locations.
 * Each BDM territory maps to a warehouse. ILO-MAIN is the central receiving warehouse.
 *
 * Access rule: Users can only transact in warehouses where they are manager or assigned_user.
 * President/admin can access all warehouses.
 *
 * Types:
 *   MAIN      — Central warehouse (e.g., ILO-MAIN). Default GRN receiving.
 *   TERRITORY — BDM field stock or eBDM stock.
 *   VIRTUAL   — In-transit, staging, or other logical locations.
 */
const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Entity is required'],
  },
  warehouse_code: {
    type: String,
    required: [true, 'Warehouse code is required'],
    trim: true,
    uppercase: true,
  },
  warehouse_name: {
    type: String,
    required: [true, 'Warehouse name is required'],
    trim: true,
  },
  warehouse_type: {
    type: String,
    enum: ['MAIN', 'TERRITORY', 'VIRTUAL'],
    required: true,
    default: 'TERRITORY',
  },
  location: {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    region: { type: String, trim: true },
  },

  // Access control
  manager_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  assigned_users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  // Links
  territory_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Territory',
  },
  draws_from: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
  },

  // Capabilities
  is_default_receiving: { type: Boolean, default: false },
  can_receive_grn: { type: Boolean, default: false },
  can_transfer_out: { type: Boolean, default: true },

  // Stock type — determines which inventory model to use
  stock_type: {
    type: String,
    enum: ['PHARMA', 'FNB', 'OFFICE'],
    default: 'PHARMA',
  },

  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true },
}, {
  timestamps: true,
  collection: 'erp_warehouses',
});

// Unique warehouse code per entity
warehouseSchema.index({ entity_id: 1, warehouse_code: 1 }, { unique: true });
warehouseSchema.index({ entity_id: 1, is_active: 1 });
warehouseSchema.index({ manager_id: 1 });
warehouseSchema.index({ assigned_users: 1 });
warehouseSchema.index({ entity_id: 1, is_default_receiving: 1 });

module.exports = mongoose.model('Warehouse', warehouseSchema);
