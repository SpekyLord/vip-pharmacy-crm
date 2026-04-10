const AGENT_DEFINITIONS = {
  smart_collection: { key: 'smart_collection', label: 'Smart Collection', modulePath: './smartCollectionAgent', type: 'AI' },
  performance_coach: { key: 'performance_coach', label: 'BDM Performance Coach', modulePath: './performanceCoachAgent', type: 'AI' },
  bir_filing: { key: 'bir_filing', label: 'BIR Filing Review', modulePath: './birFilingAgent', type: 'AI' },
  visit_planner: { key: 'visit_planner', label: 'Smart Visit Planner', modulePath: './visitPlannerAgent', type: 'AI' },
  engagement_decay: { key: 'engagement_decay', label: 'Engagement Decay Monitor', modulePath: './engagementDecayAgent', type: 'AI' },
  org_intelligence: { key: 'org_intelligence', label: 'Org Intelligence', modulePath: './orgIntelligenceAgent', type: 'AI' },
  expense_anomaly: { key: 'expense_anomaly', label: 'Expense Anomaly', modulePath: './expenseAnomalyAgent', type: 'FREE' },
  inventory_reorder: { key: 'inventory_reorder', label: 'Inventory Reorder', modulePath: './inventoryReorderAgent', type: 'FREE' },
  credit_risk: { key: 'credit_risk', label: 'Credit Risk Scoring', modulePath: './creditRiskAgent', type: 'FREE' },
  document_expiry: { key: 'document_expiry', label: 'Document Expiry', modulePath: './documentExpiryAgent', type: 'FREE' },
  visit_compliance: { key: 'visit_compliance', label: 'Visit Compliance', modulePath: './visitComplianceAgent', type: 'FREE' },
  photo_audit: { key: 'photo_audit', label: 'Photo Audit', modulePath: './photoAuditAgent', type: 'FREE' },
  system_integrity: { key: 'system_integrity', label: 'System Integrity', modulePath: './systemIntegrityAgent', type: 'FREE' },
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
