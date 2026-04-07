const mongoose = require('mongoose');

/**
 * PartnerScorecard — Monthly performance snapshot per partner/BDM.
 * Aggregates data from CRM (visits, doctors) and ERP (sales, collections, expenses).
 * Tracks graduation readiness for partners aiming to own a subsidiary.
 */
const partnerScorecardSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  person_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PeopleMaster', required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  period: { type: String, required: true },  // "2026-04"
  track: { type: String, enum: ['PARTNER', 'MANAGER', 'EMPLOYEE'], default: 'PARTNER' },

  // ═══ Visit Performance (CRM) ═══
  visits_completed: { type: Number, default: 0 },
  visits_expected: { type: Number, default: 0 },
  visit_compliance_pct: { type: Number, default: 0 },
  unique_clients_visited: { type: Number, default: 0 },

  // ═══ Sales Performance (ERP) ═══
  sales_total: { type: Number, default: 0 },
  sales_count: { type: Number, default: 0 },
  avg_invoice_value: { type: Number, default: 0 },

  // ═══ Collection Performance (ERP) ═══
  collections_total: { type: Number, default: 0 },
  collections_count: { type: Number, default: 0 },
  collection_rate_pct: { type: Number, default: 0 },

  // ═══ Expense Efficiency (ERP) ═══
  expenses_total: { type: Number, default: 0 },
  expense_sales_ratio_pct: { type: Number, default: 0 },

  // ═══ Client Health (CRM) ═══
  total_clients_assigned: { type: Number, default: 0 },
  clients_at_risk: { type: Number, default: 0 },
  avg_engagement_level: { type: Number, default: 0 },

  // ═══ Composite Scores (0-100) ═══
  score_visits: { type: Number, default: 0 },
  score_sales: { type: Number, default: 0 },
  score_collections: { type: Number, default: 0 },
  score_efficiency: { type: Number, default: 0 },
  score_engagement: { type: Number, default: 0 },
  score_overall: { type: Number, default: 0 },

  // ═══ Graduation Readiness ═══
  graduation: {
    criteria: [{
      key: String,
      label: String,
      target: Number,
      actual: Number,
      comparator: String,  // 'gte' or 'lte'
      met: Boolean,
    }],
    checklist_met: { type: Number, default: 0 },
    checklist_total: { type: Number, default: 7 },
    readiness_pct: { type: Number, default: 0 },
    ready: { type: Boolean, default: false },
  },

  // ═══ AI Insights (from agent runs) ═══
  ai_insights: [{
    agent: String,
    message: String,
    severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    run_date: Date,
  }],

  computed_at: { type: Date, default: Date.now },
}, {
  timestamps: true,
  collection: 'erp_partner_scorecards',
});

partnerScorecardSchema.index({ entity_id: 1, person_id: 1, period: 1 }, { unique: true });
partnerScorecardSchema.index({ entity_id: 1, period: 1, score_overall: -1 });
partnerScorecardSchema.index({ person_id: 1, period: -1 });

module.exports = mongoose.model('PartnerScorecard', partnerScorecardSchema);
