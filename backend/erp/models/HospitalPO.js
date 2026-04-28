/**
 * HospitalPO + HospitalPOLine — Phase CSI-X1 (April 2026)
 *
 * Captures hospital purchase orders received via Messenger / formal PDF / verbal.
 * The PO is the spine that connects sales (CSIs), inventory replenishment
 * priorities, and BDM accountability ("what we still owe each hospital").
 *
 * Lifecycle:
 *   OPEN → PARTIAL → FULFILLED (or CANCELLED / EXPIRED)
 *
 * Cross-warehouse fulfillment is supported: PO is warehouse-agnostic at header
 * level; each linked CSI (SalesLine) picks its own warehouse. PO line
 * qty_served = sum of all linked CSI line qty across all warehouses.
 *
 * Price-lock (mentor decision, Apr 28 2026): each PO line locks unit_price at
 * PO entry time. Renegotiation = new PO. The unserved portion of the old PO
 * retains its old price. Audit trail: `contract_price_ref` points at the
 * exact HospitalContractPrice row that resolved this price (or null when
 * SRP fallback was used).
 *
 * PO# uniqueness: compound unique on (entity_id, hospital_id, po_number_clean).
 * Hospitals may reuse PO numbers across their own internal departments, but
 * within a (hospital, our entity) pair the number must be unique.
 */

const mongoose = require('mongoose');

const PO_STATUS = ['OPEN', 'PARTIAL', 'FULFILLED', 'CANCELLED', 'EXPIRED'];
const LINE_STATUS = ['OPEN', 'PARTIAL', 'FULFILLED', 'CANCELLED'];
const SOURCE_KIND = ['MESSENGER_TEXT', 'FORMAL_PDF', 'VERBAL', 'EMAIL', 'OTHER'];

// Helper — PO# normalization for unique index (case + whitespace + dashes)
function cleanPoNumber(s) {
  if (!s) return '';
  return String(s).trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
}

// ──────────────────────────────────────────────────────────────────────────
// HospitalPOLine — one row per product on the PO
// ──────────────────────────────────────────────────────────────────────────
const hospitalPoLineSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true
  },
  po_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HospitalPO',
    required: true,
    index: true
  },
  // Denormalized for fast filter (Backlog page hits hospital + product without join)
  hospital_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    required: true
  },
  qty_ordered: {
    type: Number,
    required: true,
    min: [1, 'qty_ordered must be >= 1']
  },
  qty_served: {
    type: Number,
    default: 0,
    min: [0, 'qty_served must be >= 0']
  },
  // Computed in pre-save: qty_ordered - qty_served. Stored (not virtual) so
  // we can index on it for the Backlog page sort.
  qty_unserved: {
    type: Number,
    default: 0,
    min: [0, 'qty_unserved must be >= 0']
  },
  unit_price: {
    type: Number,
    required: true,
    min: [0, 'unit_price must be >= 0']
  },
  // Forward-compat: which HospitalContractPrice row resolved this price.
  // Null when SRP fallback was used. NOT a unique key — many lines can point
  // at the same contract row.
  contract_price_ref: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HospitalContractPrice',
    default: null
  },
  price_source: {
    type: String,
    enum: ['CONTRACT', 'SRP', 'MANUAL_OVERRIDE'],
    default: 'SRP'
  },
  status: {
    type: String,
    enum: LINE_STATUS,
    default: 'OPEN',
    index: true
  },
  cancellation_reason: { type: String, trim: true },
  notes: { type: String, trim: true }
}, {
  timestamps: true,
  collection: 'erp_hospital_po_lines'
});

// Auto-compute qty_unserved + line status pre-save
hospitalPoLineSchema.pre('save', function (next) {
  this.qty_unserved = Math.max(0, (this.qty_ordered || 0) - (this.qty_served || 0));
  if (this.status !== 'CANCELLED') {
    if (this.qty_served <= 0) this.status = 'OPEN';
    else if (this.qty_served < this.qty_ordered) this.status = 'PARTIAL';
    else this.status = 'FULFILLED';
  }
  next();
});

// Indexes
hospitalPoLineSchema.index({ po_id: 1, status: 1 });
hospitalPoLineSchema.index({ entity_id: 1, hospital_id: 1, status: 1, qty_unserved: -1 });
hospitalPoLineSchema.index({ entity_id: 1, product_id: 1, status: 1 });
hospitalPoLineSchema.index({ entity_id: 1, status: 1, qty_unserved: -1 });

const HospitalPOLine = mongoose.model('HospitalPOLine', hospitalPoLineSchema);

// ──────────────────────────────────────────────────────────────────────────
// HospitalPO — header
// ──────────────────────────────────────────────────────────────────────────
const sourceAttachmentSchema = new mongoose.Schema({
  url: { type: String, trim: true },
  s3_key: { type: String, trim: true },
  kind: { type: String, enum: ['SCREENSHOT', 'PDF', 'OTHER'], default: 'OTHER' },
  uploaded_at: { type: Date, default: Date.now },
  uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const hospitalPoSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true
  },
  hospital_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  po_number: {
    type: String,
    required: [true, 'PO number is required'],
    trim: true
  },
  po_number_clean: { type: String },  // unique key — auto-generated
  po_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner BDM is required']
  },
  entered_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Phase G4.5a — proxy entry audit marker. Set when entered_by != bdm_id.
  recorded_on_behalf_of: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  expiry_date: { type: Date, default: null },  // computed at create from PO_EXPIRY_DAYS lookup
  source_kind: {
    type: String,
    enum: SOURCE_KIND,
    default: 'OTHER'
  },
  source_text: { type: String, trim: true },  // raw Messenger paste (X2 attaches)
  source_attachments: { type: [sourceAttachmentSchema], default: [] },
  notes: { type: String, trim: true },
  status: {
    type: String,
    enum: PO_STATUS,
    default: 'OPEN',
    index: true
  },
  cancellation_reason: { type: String, trim: true },
  // Aggregates — recomputed on every line write via static helper
  total_qty_ordered: { type: Number, default: 0 },
  total_qty_served: { type: Number, default: 0 },
  total_amount_ordered: { type: Number, default: 0 },
  total_amount_served: { type: Number, default: 0 }
}, {
  timestamps: true,
  collection: 'erp_hospital_pos'
});

// Auto-clean PO# pre-validate
hospitalPoSchema.pre('validate', function (next) {
  if (this.po_number) this.po_number_clean = cleanPoNumber(this.po_number);
  next();
});

hospitalPoSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  const incoming = update.$set?.po_number || update.po_number;
  if (incoming) {
    const cleaned = cleanPoNumber(incoming);
    if (update.$set) update.$set.po_number_clean = cleaned;
    else update.po_number_clean = cleaned;
  }
  next();
});

// Compound unique on (entity_id, hospital_id, po_number_clean) — same hospital
// re-using a PO# triggers HTTP 400.
hospitalPoSchema.index(
  { entity_id: 1, hospital_id: 1, po_number_clean: 1 },
  { unique: true, partialFilterExpression: { po_number_clean: { $exists: true, $type: 'string' } } }
);
hospitalPoSchema.index({ entity_id: 1, status: 1, po_date: -1 });
hospitalPoSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
hospitalPoSchema.index({ entity_id: 1, hospital_id: 1, po_date: -1 });

// Static — recompute parent PO aggregates + status from its lines.
// Called inside a Mongo transaction by submitSales after qty_served changes.
hospitalPoSchema.statics.recomputeFromLines = async function (poId, session = null) {
  const PO = this;
  const linesQuery = HospitalPOLine.find({ po_id: poId });
  const lines = session ? await linesQuery.session(session) : await linesQuery;
  if (!lines.length) return null;

  let totalOrdered = 0;
  let totalServed = 0;
  let amountOrdered = 0;
  let amountServed = 0;
  let allFulfilled = true;
  let anyServed = false;
  let anyActive = false;

  for (const ln of lines) {
    totalOrdered += ln.qty_ordered || 0;
    totalServed += ln.qty_served || 0;
    amountOrdered += (ln.qty_ordered || 0) * (ln.unit_price || 0);
    amountServed += (ln.qty_served || 0) * (ln.unit_price || 0);
    if (ln.status === 'CANCELLED') continue;
    anyActive = true;
    if (ln.status !== 'FULFILLED') allFulfilled = false;
    if (ln.qty_served > 0) anyServed = true;
  }

  let status;
  if (!anyActive) {
    status = 'CANCELLED';
  } else if (allFulfilled) {
    status = 'FULFILLED';
  } else if (anyServed) {
    status = 'PARTIAL';
  } else {
    status = 'OPEN';
  }

  const update = {
    total_qty_ordered: totalOrdered,
    total_qty_served: totalServed,
    total_amount_ordered: amountOrdered,
    total_amount_served: amountServed
  };
  // Don't overwrite EXPIRED unless lines say otherwise
  const current = await (session ? PO.findById(poId).session(session) : PO.findById(poId));
  if (current && current.status === 'EXPIRED' && status !== 'CANCELLED' && status !== 'FULFILLED') {
    // EXPIRED is sticky once set; only FULFILLED or CANCELLED can move it forward
  } else {
    update.status = status;
  }

  const opts = session ? { new: true, session } : { new: true };
  return PO.findByIdAndUpdate(poId, update, opts);
};

hospitalPoSchema.statics.STATUS = PO_STATUS;
hospitalPoSchema.statics.SOURCE_KIND = SOURCE_KIND;
hospitalPoSchema.statics.cleanPoNumber = cleanPoNumber;

const HospitalPO = mongoose.model('HospitalPO', hospitalPoSchema);

module.exports = { HospitalPO, HospitalPOLine };
