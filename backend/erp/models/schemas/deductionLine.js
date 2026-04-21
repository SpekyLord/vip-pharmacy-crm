/**
 * Shared deduction-line sub-schema — Phase G1.3
 *
 * Originally mirrored IncomeReport.deduction_lines (Phase G1.2). Extracted so
 * employee Payslip.js can reuse the exact same shape, giving contractor
 * IncomeReport and employee Payslip a single transparency contract:
 *
 *   label + amount + kind badge + expandable source detail + status lifecycle.
 *
 * IncomeReport.js keeps its own inline definition (the Phase G1.2 shipped code
 * is load-bearing on profit-sharing and CALF flows, not touched in G1.3). This
 * shared schema is the forward source of truth — IncomeReport can migrate in a
 * follow-up once the contract has soaked in production.
 *
 * auto_source is intentionally a free-form String (no enum). Contractor docs
 * use CALF / SCHEDULE / PERSONAL_GAS; employee docs use SSS / PHILHEALTH /
 * PAGIBIG / WITHHOLDING_TAX / LOAN / CASH_ADVANCE / PERSONAL_GAS / SCHEDULE.
 * Keeping it free-form avoids a migration each time a subscriber introduces a
 * new auto-source (Rule #3 subscription-readiness).
 */
const mongoose = require('mongoose');

const deductionLineSchema = new mongoose.Schema({
  deduction_type: { type: String, required: true },   // Lookup code (INCOME_DEDUCTION_TYPE or EMPLOYEE_DEDUCTION_TYPE)
  deduction_label: { type: String, required: true },   // Snapshot of label at entry time
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  entered_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  entered_at: { type: Date, default: Date.now },
  // Finance verification lifecycle
  status: {
    type: String,
    default: 'PENDING',
    enum: ['PENDING', 'VERIFIED', 'CORRECTED', 'REJECTED']
  },
  verified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verified_at: { type: Date },
  original_amount: { type: Number },                   // Preserved when Finance corrects
  finance_note: { type: String, default: '' },
  auto_source: { type: String, default: null },         // Free-form — see header comment
  // Link to DeductionSchedule (for auto_source='SCHEDULE')
  schedule_ref: {
    schedule_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DeductionSchedule' },
    installment_id: { type: mongoose.Schema.Types.ObjectId }
  }
}, { _id: true });

module.exports = deductionLineSchema;
