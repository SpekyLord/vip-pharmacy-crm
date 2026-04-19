const mongoose = require('mongoose');

/**
 * KpiTemplate — Phase SG-3R reusable target-default registry.
 *
 * Admin/President curates reusable defaults per (entity, driver, fiscal profile).
 * Plan creation may pass `?template_id=` or `template_id` in the payload to
 * pre-populate `growth_drivers[].kpi_definitions[]` instead of re-typing the
 * whole catalogue. Templates are advisory defaults only — they do not lock the
 * plan (the plan owns its own copy after creation).
 *
 * Scalability:
 *   - Entity-scoped; MG AND CO. or any future subsidiary sees only its own rows.
 *   - `kpi_code`, `driver_code`, `unit_code`, `computation`, `functional_roles[]`
 *     all reference existing Lookup categories (KPI_CODE / GROWTH_DRIVER /
 *     KPI_UNIT / KPI_COMPUTATION). Zero hardcoded dropdowns.
 *   - Multiple KPIs can share the same (driver_code, kpi_code) within a template
 *     set using the `template_name` grouping label — but a `(template_name,
 *     driver_code, kpi_code)` tuple is unique per entity (idempotent upsert).
 *
 * Applied by:
 *   - `salesGoalController.createPlan` — when `template_id` is supplied in the
 *     request body, expands matching templates into `growth_drivers[]`. Not
 *     applied on subsequent updates (plan owns its copy after creation).
 */
const kpiTemplateSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Entity is required'],
    index: true,
  },
  template_name: {
    type: String,
    required: [true, 'Template name is required'],
    trim: true,
  },
  driver_code: {
    type: String,
    required: [true, 'Driver code is required'],
    trim: true,
    uppercase: true,
  },
  kpi_code: {
    type: String,
    required: [true, 'KPI code is required'],
    trim: true,
  },
  kpi_label: { type: String, trim: true, default: '' },
  default_target: { type: Number, default: 0 },
  unit_code: { type: String, trim: true, default: '' },       // Lookup KPI_UNIT code
  computation: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'manual',
  },
  direction: {
    type: String,
    enum: ['higher_better', 'lower_better'],
    default: 'higher_better',
  },
  functional_roles: [{ type: String, trim: true }],           // Free-form role codes (e.g. 'SALES','ALL')
  sort_order: { type: Number, default: 0 },
  description: { type: String, trim: true, default: '' },
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'erp_kpi_templates',
});

// One row per (entity, template_name, driver_code, kpi_code) — prevents duplicate
// KPI rows inside a single template set while still allowing the same KPI code to
// appear under different drivers or in a different template set.
kpiTemplateSchema.index(
  { entity_id: 1, template_name: 1, driver_code: 1, kpi_code: 1 },
  { unique: true }
);
kpiTemplateSchema.index({ entity_id: 1, is_active: 1 });

module.exports = mongoose.model('KpiTemplate', kpiTemplateSchema);
