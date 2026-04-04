/**
 * Credit Risk Agent (#8)
 * Runs weekly (Sunday midnight)
 *
 * For each Hospital and Customer with POSTED sales:
 * 1. Calculates average days-to-pay from Collection data
 * 2. Calculates consistency (% invoices paid within payment_terms)
 * 3. Calculates utilization (current AR / credit_limit)
 * 4. Computes weighted score: speed(35%) + consistency(25%) + utilization(20%) + relationship(10%) + incidents(10%)
 * 5. Maps score to risk level and triggers notifications on significant changes
 * 6. Auto-updates credit_limit_action for HIGH/VERY_HIGH risk accounts
 */

const { notify } = require('./notificationService');

async function run() {
  console.log('[CreditRisk] Running...');
  try {
    const SalesLine = require('../erp/models/SalesLine');
    const Collection = require('../erp/models/Collection');
    const Hospital = require('../erp/models/Hospital');
    const Customer = require('../erp/models/Customer');

    const results = [];
    const significantChanges = [];

    // Helper: map score to risk level
    function getRiskLevel(score) {
      if (score >= 80) return 'LOW';
      if (score >= 60) return 'MODERATE';
      if (score >= 40) return 'HIGH';
      if (score >= 20) return 'VERY_HIGH';
      return 'CRITICAL';
    }

    // Helper: score a single entity (hospital or customer)
    async function scoreEntity({ entityType, entityId, entityName, paymentTerms, creditLimit }) {
      try {
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

        // Query field name depends on entity type
        const idField = entityType === 'hospital' ? 'hospital_id' : 'customer_id';

        // Get POSTED sales in last 12 months
        const sales = await SalesLine.find({
          [idField]: entityId,
          status: 'POSTED',
          csi_date: { $gte: twelveMonthsAgo }
        }).select('_id csi_date invoice_total doc_ref').lean();

        if (sales.length === 0) return null;

        // Get POSTED collections in last 12 months
        const collections = await Collection.find({
          [idField]: entityId,
          status: 'POSTED',
          cr_date: { $gte: twelveMonthsAgo }
        }).select('cr_date cr_amount settled_csis').lean();

        // ── 1. Payment speed score (35%) ──────────────────────────
        // Calculate average days between CSI date and collection CR date
        let totalDaysToPay = 0;
        let paidInvoiceCount = 0;
        let paidOnTimeCount = 0;

        const terms = paymentTerms || 30;

        for (const col of collections) {
          for (const settled of (col.settled_csis || [])) {
            const matchingSale = sales.find(s => String(s._id) === String(settled.sales_line_id));
            if (matchingSale) {
              const daysToPay = Math.floor((new Date(col.cr_date) - new Date(matchingSale.csi_date)) / (1000 * 60 * 60 * 24));
              totalDaysToPay += Math.max(0, daysToPay);
              paidInvoiceCount++;
              if (daysToPay <= terms) paidOnTimeCount++;
            }
          }
        }

        let speedScore = 50; // default if no data
        if (paidInvoiceCount > 0) {
          const avgDays = totalDaysToPay / paidInvoiceCount;
          // 0 days = 100, payment_terms days = 70, 2x terms = 30, 3x+ terms = 0
          if (avgDays <= 0) speedScore = 100;
          else if (avgDays <= terms) speedScore = 100 - (avgDays / terms) * 30;
          else if (avgDays <= terms * 2) speedScore = 70 - ((avgDays - terms) / terms) * 40;
          else if (avgDays <= terms * 3) speedScore = 30 - ((avgDays - terms * 2) / terms) * 30;
          else speedScore = 0;
          speedScore = Math.max(0, Math.min(100, speedScore));
        }

        // ── 2. Consistency score (25%) ────────────────────────────
        let consistencyScore = 50;
        if (paidInvoiceCount > 0) {
          consistencyScore = (paidOnTimeCount / paidInvoiceCount) * 100;
        }

        // ── 3. Utilization score (20%) ────────────────────────────
        // Lower utilization = better score
        let utilizationScore = 80; // default if no credit limit
        if (creditLimit && creditLimit > 0) {
          // Calculate current AR: total POSTED sales - total POSTED collections
          const totalSales = sales.reduce((sum, s) => sum + (s.invoice_total || 0), 0);
          const totalCollected = collections.reduce((sum, c) => sum + (c.cr_amount || 0), 0);
          const currentAR = Math.max(0, totalSales - totalCollected);
          const utilization = currentAR / creditLimit;

          if (utilization <= 0.5) utilizationScore = 100;
          else if (utilization <= 0.75) utilizationScore = 80;
          else if (utilization <= 0.9) utilizationScore = 60;
          else if (utilization <= 1.0) utilizationScore = 40;
          else if (utilization <= 1.2) utilizationScore = 20;
          else utilizationScore = 0;
        }

        // ── 4. Relationship score (10%) ───────────────────────────
        // Based on how long they've been a customer (more months = better)
        const oldestSale = sales.reduce((oldest, s) =>
          !oldest || new Date(s.csi_date) < new Date(oldest.csi_date) ? s : oldest, null);
        let relationshipScore = 50;
        if (oldestSale) {
          const monthsActive = Math.floor((now - new Date(oldestSale.csi_date)) / (1000 * 60 * 60 * 24 * 30));
          if (monthsActive >= 24) relationshipScore = 100;
          else if (monthsActive >= 12) relationshipScore = 80;
          else if (monthsActive >= 6) relationshipScore = 60;
          else if (monthsActive >= 3) relationshipScore = 40;
          else relationshipScore = 20;
        }

        // ── 5. Incidents score (10%) ──────────────────────────────
        // No incident model yet, default to 80 (no known issues)
        const incidentScore = 80;

        // ── Weighted composite ────────────────────────────────────
        const score = Math.round(
          speedScore * 0.35 +
          consistencyScore * 0.25 +
          utilizationScore * 0.20 +
          relationshipScore * 0.10 +
          incidentScore * 0.10
        );

        const riskLevel = getRiskLevel(score);

        return {
          entityType,
          entityId,
          entityName,
          score,
          riskLevel,
          breakdown: { speedScore: Math.round(speedScore), consistencyScore: Math.round(consistencyScore), utilizationScore: Math.round(utilizationScore), relationshipScore, incidentScore },
          invoiceCount: sales.length,
          paidCount: paidInvoiceCount
        };
      } catch (err) {
        console.error(`[CreditRisk] Error scoring ${entityType} ${entityName}:`, err.message);
        return null;
      }
    }

    // ─── Score all active Hospitals ────────────────────────────────
    try {
      const hospitals = await Hospital.find({ status: 'ACTIVE' })
        .select('_id hospital_name payment_terms credit_limit credit_limit_action')
        .lean();

      for (const h of hospitals) {
        const result = await scoreEntity({
          entityType: 'hospital',
          entityId: h._id,
          entityName: h.hospital_name,
          paymentTerms: h.payment_terms,
          creditLimit: h.credit_limit
        });

        if (!result) continue;
        results.push(result);

        // Store score on the document (MongoDB will create the field dynamically)
        try {
          const updateFields = {
            credit_risk_score: result.score,
            credit_risk_level: result.riskLevel,
            credit_risk_updated: new Date()
          };

          // Auto-block if score < 40
          if (result.score < 40) {
            updateFields.credit_limit_action = 'BLOCK';
          } else if (result.score >= 60 && h.credit_limit_action === 'BLOCK') {
            // Un-block if score recovered
            updateFields.credit_limit_action = 'WARN';
          }

          await Hospital.findByIdAndUpdate(h._id, { $set: updateFields });
        } catch (err) {
          // Non-critical: just log, fields may not exist on schema
          console.warn(`[CreditRisk] Could not update Hospital ${h.hospital_name}:`, err.message);
        }

        // Check for significant change (> 10 points) — compare with stored score
        if (h.credit_risk_score !== undefined) {
          const delta = Math.abs(result.score - h.credit_risk_score);
          if (delta > 10) {
            significantChanges.push({
              name: h.hospital_name,
              type: 'Hospital',
              oldScore: h.credit_risk_score,
              newScore: result.score,
              riskLevel: result.riskLevel,
              delta
            });
          }
        }
      }
    } catch (err) {
      console.error('[CreditRisk] Hospital scoring failed:', err.message);
    }

    // ─── Score all active Customers ────────────────────────────────
    try {
      const customers = await Customer.find({ status: 'ACTIVE' })
        .select('_id customer_name payment_terms credit_limit credit_limit_action')
        .lean();

      for (const c of customers) {
        const result = await scoreEntity({
          entityType: 'customer',
          entityId: c._id,
          entityName: c.customer_name,
          paymentTerms: c.payment_terms,
          creditLimit: c.credit_limit
        });

        if (!result) continue;
        results.push(result);

        // Store score dynamically
        try {
          const updateFields = {
            credit_risk_score: result.score,
            credit_risk_level: result.riskLevel,
            credit_risk_updated: new Date()
          };

          if (result.score < 40) {
            updateFields.credit_limit_action = 'BLOCK';
          } else if (result.score >= 60 && c.credit_limit_action === 'BLOCK') {
            updateFields.credit_limit_action = 'WARN';
          }

          await Customer.findByIdAndUpdate(c._id, { $set: updateFields });
        } catch (err) {
          console.warn(`[CreditRisk] Could not update Customer ${c.customer_name}:`, err.message);
        }

        if (c.credit_risk_score !== undefined) {
          const delta = Math.abs(result.score - c.credit_risk_score);
          if (delta > 10) {
            significantChanges.push({
              name: c.customer_name,
              type: 'Customer',
              oldScore: c.credit_risk_score,
              newScore: result.score,
              riskLevel: result.riskLevel,
              delta
            });
          }
        }
      }
    } catch (err) {
      console.error('[CreditRisk] Customer scoring failed:', err.message);
    }

    // ─── Notifications ─────────────────────────────────────────────
    if (results.length > 0) {
      const critical = results.filter(r => r.score < 40);
      const high = results.filter(r => r.score >= 40 && r.score < 60);

      let body = `Credit Risk Assessment — ${new Date().toLocaleDateString()}\n\n`;
      body += `Scored: ${results.length} accounts\n`;
      body += `Critical/Very High risk: ${critical.length}\n`;
      body += `High risk: ${high.length}\n\n`;

      if (critical.length > 0) {
        body += '=== CRITICAL / VERY HIGH RISK (auto-blocked) ===\n';
        for (const r of critical) {
          body += `  - ${r.entityName} (${r.entityType}): score ${r.score} — ${r.riskLevel}\n`;
          body += `    Speed: ${r.breakdown.speedScore}, Consistency: ${r.breakdown.consistencyScore}, Utilization: ${r.breakdown.utilizationScore}\n`;
        }
        body += '\n';
      }

      if (high.length > 0) {
        body += '=== HIGH RISK ===\n';
        for (const r of high) {
          body += `  - ${r.entityName} (${r.entityType}): score ${r.score} — ${r.riskLevel}\n`;
        }
        body += '\n';
      }

      if (significantChanges.length > 0) {
        body += '=== SIGNIFICANT SCORE CHANGES (>10 pts) ===\n';
        for (const c of significantChanges) {
          const direction = c.newScore > c.oldScore ? 'IMPROVED' : 'DECLINED';
          body += `  - ${c.name} (${c.type}): ${c.oldScore} -> ${c.newScore} (${direction}, delta: ${c.delta})\n`;
        }
        body += '\n';
      }

      await notify({
        recipient_id: 'PRESIDENT',
        title: `Credit Risk Report: ${critical.length} critical, ${high.length} high risk`,
        body,
        category: 'system',
        priority: critical.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'credit_risk'
      });
    }

    console.log(`[CreditRisk] Complete. Scored ${results.length} accounts, ${significantChanges.length} significant changes.`);
  } catch (err) {
    console.error('[CreditRisk] Error:', err.message);
  }
}

module.exports = { run };
