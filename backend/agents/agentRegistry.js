// Phase G9.R9 — `schedule` is a display-only, human-readable summary of the
// cron expression registered in backend/agents/agentScheduler.js. Kept here
// (the single source of truth) so the frontend registry endpoint can expose
// it uniformly and new agents don't require a parallel frontend map update.
// Subscription-ready: no business value, just UI copy — safe to translate or
// override per locale without affecting the actual cron timing.
const AGENT_DEFINITIONS = {
  smart_collection: { key: 'smart_collection', label: 'Smart Collection', modulePath: './smartCollectionAgent', type: 'AI', schedule: 'Weekdays 7:00 AM' },
  performance_coach: { key: 'performance_coach', label: 'BDM Performance Coach', modulePath: './performanceCoachAgent', type: 'AI', schedule: 'Mon 6:00 AM' },
  bir_filing: { key: 'bir_filing', label: 'BIR Filing Review', modulePath: './birFilingAgent', type: 'AI', schedule: '15th monthly 9:00 AM' },
  visit_planner: { key: 'visit_planner', label: 'Smart Visit Planner', modulePath: './visitPlannerAgent', type: 'AI', schedule: 'Sun 6:00 PM' },
  engagement_decay: { key: 'engagement_decay', label: 'Engagement Decay Monitor', modulePath: './engagementDecayAgent', type: 'AI', schedule: 'Mon 7:00 AM' },
  org_intelligence: { key: 'org_intelligence', label: 'Org Intelligence', modulePath: './orgIntelligenceAgent', type: 'AI', schedule: 'Mon 5:30 AM' },
  expense_anomaly: { key: 'expense_anomaly', label: 'Expense Anomaly', modulePath: './expenseAnomalyAgent', type: 'FREE', schedule: 'Daily 6:00 AM' },
  inventory_reorder: { key: 'inventory_reorder', label: 'Inventory Reorder', modulePath: './inventoryReorderAgent', type: 'FREE', schedule: 'Daily 6:30 AM' },
  credit_risk: { key: 'credit_risk', label: 'Credit Risk Scoring', modulePath: './creditRiskAgent', type: 'FREE', schedule: 'Sun 11:00 PM' },
  document_expiry: { key: 'document_expiry', label: 'Document Expiry', modulePath: './documentExpiryAgent', type: 'FREE', schedule: 'Daily 7:30 AM' },
  visit_compliance: { key: 'visit_compliance', label: 'Visit Compliance', modulePath: './visitComplianceAgent', type: 'FREE', schedule: 'Wed 8 AM + Fri 10 AM' },
  photo_audit: { key: 'photo_audit', label: 'Photo Audit', modulePath: './photoAuditAgent', type: 'FREE', schedule: 'Daily 8:30 AM' },
  system_integrity: { key: 'system_integrity', label: 'System Integrity', modulePath: './systemIntegrityAgent', type: 'FREE', schedule: 'Mon 5:00 AM' },
  // Phase SG-Q2 W2 — KPI snapshot + incentive accrual (FREE; no AI)
  kpi_snapshot: { key: 'kpi_snapshot', label: 'KPI Snapshot & Incentive Accrual', modulePath: './kpiSnapshotAgent', type: 'FREE', schedule: 'Monthly day 1 5:00 AM' },
  // Phase SG-Q2 W3 — KPI variance detection + alerts (FREE; no AI)
  kpi_variance: { key: 'kpi_variance', label: 'KPI Variance Alerts', modulePath: './kpiVarianceAgent', type: 'FREE', schedule: 'Monthly day 2 6:00 AM' },
  // Phase SG-5 #27 — Weekly digest aggregator for KPI variance alerts (FREE; no AI)
  kpi_variance_digest: { key: 'kpi_variance_digest', label: 'KPI Variance Weekly Digest', modulePath: './kpiVarianceDigestAgent', type: 'FREE', schedule: 'Mon 7:00 AM' },
  // Phase SG-4 #24 — Dispute SLA escalator (FREE; no AI)
  dispute_sla: { key: 'dispute_sla', label: 'Dispute SLA Escalator', modulePath: './disputeSlaAgent', type: 'FREE', schedule: 'Daily 6:30 AM' },
  // Phase G7.9 — Daily morning briefing for the President (uses Copilot infra; AI tier)
  daily_briefing: { key: 'daily_briefing', label: 'Daily Briefing (Copilot)', modulePath: './dailyBriefingAgent', type: 'AI', schedule: 'Weekdays 7:00 AM' },
  // ── Phase G8 (P2-1 to P2-8) — 8 new rule-based agents (FREE by default; AI toggles per-agent via lookup) ──
  treasury:              { key: 'treasury',              label: 'Treasury & Cash Flow',          modulePath: './treasuryAgent',              type: 'FREE', schedule: 'Weekdays 5:30 AM' },
  fpa_forecast:          { key: 'fpa_forecast',          label: 'FP&A Rolling Forecast',          modulePath: './fpaForecastAgent',           type: 'FREE', schedule: 'Mon 6:00 AM' },
  procurement_scorecard: { key: 'procurement_scorecard', label: 'Procurement & Vendor Scorecard', modulePath: './procurementScorecardAgent',  type: 'FREE', schedule: 'Tue 7:00 AM' },
  compliance_calendar:   { key: 'compliance_calendar',   label: 'Compliance Deadline Calendar',   modulePath: './complianceDeadlineAgent',    type: 'FREE', schedule: 'Mon 5:00 AM' },
  internal_audit_sod:    { key: 'internal_audit_sod',    label: 'Internal Audit / SoD',           modulePath: './internalAuditSodAgent',      type: 'FREE', schedule: 'Wed 8:00 AM' },
  data_quality:          { key: 'data_quality',          label: 'Data Quality',                   modulePath: './dataQualityAgent',           type: 'FREE', schedule: 'Daily 9:00 AM' },
  fefo_audit:            { key: 'fefo_audit',            label: 'FEFO / Expiry Audit',            modulePath: './fefoAuditAgent',             type: 'FREE', schedule: 'Daily 7:30 AM' },
  expansion_readiness:   { key: 'expansion_readiness',   label: 'Expansion Readiness',            modulePath: './expansionReadinessAgent',    type: 'FREE', schedule: '1st of month 10:00 AM' },
  // Phase G9.R1 — Task Overdue Notifier (FREE; no AI)
  // Walks every active entity for overdue tasks (status OPEN/IN_PROGRESS/BLOCKED, due_date < now)
  // and pushes `notifyTaskEvent({ event: 'overdue' })` per task. Cooldown via TASK_OVERDUE_COOLDOWN_DAYS lookup.
  task_overdue:          { key: 'task_overdue',          label: 'Task Overdue Notifier',          modulePath: './taskOverdueAgent',           type: 'FREE', schedule: 'Weekdays 6:15 AM' },
  // Phase P1 — Proxy SLA Escalator (FREE; no AI)
  // Walks every active entity for stale CaptureSubmissions (PENDING_PROXY > 24h,
  // AWAITING_BDM_REVIEW > 72h). Thresholds lookup-driven (PROXY_SLA_THRESHOLDS).
  proxy_sla:             { key: 'proxy_sla',             label: 'Proxy SLA Escalator',            modulePath: './proxySlaAgent',              type: 'FREE', schedule: 'Every 4 hours' },
  // Phase G9.R8 — Inbox Retention (FREE; no AI)
  // Two-stage soft-delete → hard-delete for old archived / read / AI-agent /
  // broadcast messages, per-entity lookup-driven (INBOX_RETENTION). Safety
  // guards never purge unacknowledged must-ack messages or open approvals.
  // See backend/erp/services/messageRetentionAgent.js. Scheduled nightly in
  // backend/agents/agentScheduler.js (2:00 AM Asia/Manila).
  message_retention:     { key: 'message_retention',     label: 'Inbox Retention',                modulePath: '../erp/services/messageRetentionAgent', type: 'FREE', schedule: 'Daily 2:00 AM' },
  // Week-1 Stabilization Day-4.5 #3 — Orphan Audit (FREE; no AI)
  // Wraps the read-only `findOrphanedOwnerRecords.js` script into a weekly
  // sweep that fires a MessageInbox alert when any of the 8 covered
  // transactional collections has a `bdm_id` pointing to a non-BDM user.
  // Reuses Day-4 notify() plumbing (PRESIDENT + ALL_ADMINS).
  orphan_audit:          { key: 'orphan_audit',          label: 'Orphan Owner Audit',             modulePath: './orphanAuditAgent',           type: 'FREE', schedule: 'Mon 5:15 AM' },
  // VIP-1.B follow-up — Orphan Ledger Audit (FREE; no AI)
  // Catches POSTED Sales/Collections/PRF whose settlement JournalEntry never
  // wrote (the JE engine throws OUTSIDE the POST transaction, leaving books
  // silently inconsistent). Daily 03:00 — fast detection of BIR-facing leaks.
  orphan_ledger_audit:   { key: 'orphan_ledger_audit',   label: 'Orphan Ledger Audit',            modulePath: './orphanLedgerAuditAgent',     type: 'FREE', schedule: 'Daily 3:00 AM' },
};

const AGENT_KEYS = Object.keys(AGENT_DEFINITIONS);
const AI_AGENT_KEYS = new Set(
  Object.values(AGENT_DEFINITIONS)
    .filter((definition) => definition.type === 'AI')
    .map((definition) => definition.key)
);

function getAgentDefinition(agentKey) {
  return AGENT_DEFINITIONS[agentKey] || null;
}

module.exports = {
  AGENT_DEFINITIONS,
  AGENT_KEYS,
  AI_AGENT_KEYS,
  getAgentDefinition,
};
