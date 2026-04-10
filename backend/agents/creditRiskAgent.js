/**
 * Credit Risk Agent (#8)
 */

const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

async function run() {
  console.log('[CreditRisk] Running...');

  const SalesLine = require('../erp/models/SalesLine');
  const Collection = require('../erp/models/Collection');
  const Hospital = require('../erp/models/Hospital');
  const Customer = require('../erp/models/Customer');

  const results = [];
  const significantChanges = [];

  function getRiskLevel(score) {
    if (score >= 80) return 'LOW';
    if (score >= 60) return 'MODERATE';
    if (score >= 40) return 'HIGH';
    if (score >= 20) return 'VERY_HIGH';
    return 'CRITICAL';
  }

  async function scoreEntity({ entityType, entityId, entityName, paymentTerms, creditLimit }) {
    try {
      const now = new Date();
      const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const idField = entityType === 'hospital' ? 'hospital_id' : 'customer_id';

      const sales = await SalesLine.find({
        [idField]: entityId,
        status: 'POSTED',
        csi_date: { $gte: twelveMonthsAgo },
      }).select('_id csi_date invoice_total').lean();
      if (!sales.length) return null;

      const collections = await Collection.find({
        [idField]: entityId,
        status: 'POSTED',
        cr_date: { $gte: twelveMonthsAgo },
      }).select('cr_date cr_amount settled_csis').lean();

      let totalDaysToPay = 0;
      let paidInvoiceCount = 0;
      let paidOnTimeCount = 0;
      const terms = paymentTerms || 30;

      for (const collection of collections) {
        for (const settled of collection.settled_csis || []) {
          const sale = sales.find((item) => String(item._id) === String(settled.sales_line_id));
          if (!sale) continue;
          const daysToPay = Math.floor((new Date(collection.cr_date) - new Date(sale.csi_date)) / (1000 * 60 * 60 * 24));
          totalDaysToPay += Math.max(0, daysToPay);
          paidInvoiceCount += 1;
          if (daysToPay <= terms) paidOnTimeCount += 1;
        }
      }

      let speedScore = 50;
      if (paidInvoiceCount > 0) {
        const avgDays = totalDaysToPay / paidInvoiceCount;
        if (avgDays <= 0) speedScore = 100;
        else if (avgDays <= terms) speedScore = 100 - (avgDays / terms) * 30;
        else if (avgDays <= terms * 2) speedScore = 70 - ((avgDays - terms) / terms) * 40;
        else if (avgDays <= terms * 3) speedScore = 30 - ((avgDays - terms * 2) / terms) * 30;
        else speedScore = 0;
        speedScore = Math.max(0, Math.min(100, speedScore));
      }

      let consistencyScore = 50;
      if (paidInvoiceCount > 0) consistencyScore = (paidOnTimeCount / paidInvoiceCount) * 100;

      let utilizationScore = 80;
      if (creditLimit && creditLimit > 0) {
        const totalSales = sales.reduce((sum, sale) => sum + (sale.invoice_total || 0), 0);
        const totalCollected = collections.reduce((sum, collection) => sum + (collection.cr_amount || 0), 0);
        const currentAR = Math.max(0, totalSales - totalCollected);
        const utilization = currentAR / creditLimit;

        if (utilization <= 0.5) utilizationScore = 100;
        else if (utilization <= 0.75) utilizationScore = 80;
        else if (utilization <= 0.9) utilizationScore = 60;
        else if (utilization <= 1.0) utilizationScore = 40;
        else if (utilization <= 1.2) utilizationScore = 20;
        else utilizationScore = 0;
      }

      const oldestSale = sales.reduce((oldest, sale) => (!oldest || new Date(sale.csi_date) < new Date(oldest.csi_date) ? sale : oldest), null);
      let relationshipScore = 50;
      if (oldestSale) {
        const monthsActive = Math.floor((now - new Date(oldestSale.csi_date)) / (1000 * 60 * 60 * 24 * 30));
        if (monthsActive >= 24) relationshipScore = 100;
        else if (monthsActive >= 12) relationshipScore = 80;
        else if (monthsActive >= 6) relationshipScore = 60;
        else if (monthsActive >= 3) relationshipScore = 40;
        else relationshipScore = 20;
      }

      const incidentScore = 80;
      const score = Math.round(
        speedScore * 0.35 +
        consistencyScore * 0.25 +
        utilizationScore * 0.2 +
        relationshipScore * 0.1 +
        incidentScore * 0.1
      );

      return {
        entityType,
        entityId,
        entityName,
        score,
        riskLevel: getRiskLevel(score),
        breakdown: {
          speedScore: Math.round(speedScore),
          consistencyScore: Math.round(consistencyScore),
          utilizationScore: Math.round(utilizationScore),
          relationshipScore,
          incidentScore,
        },
      };
    } catch (err) {
      console.error(`[CreditRisk] Error scoring ${entityType} ${entityName}:`, err.message);
      return null;
    }
  }

  try {
    const hospitals = await Hospital.find({ status: 'ACTIVE' })
      .select('_id hospital_name payment_terms credit_limit credit_limit_action credit_risk_score')
      .lean();

    for (const hospital of hospitals) {
      const result = await scoreEntity({
        entityType: 'hospital',
        entityId: hospital._id,
        entityName: hospital.hospital_name,
        paymentTerms: hospital.payment_terms,
        creditLimit: hospital.credit_limit,
      });
      if (!result) continue;

      results.push(result);

      try {
        const updateFields = {
          credit_risk_score: result.score,
          credit_risk_level: result.riskLevel,
          credit_risk_updated: new Date(),
        };
        if (result.score < 40) updateFields.credit_limit_action = 'BLOCK';
        else if (result.score >= 60 && hospital.credit_limit_action === 'BLOCK') updateFields.credit_limit_action = 'WARN';
        await Hospital.findByIdAndUpdate(hospital._id, { $set: updateFields });
      } catch (err) {
        console.warn(`[CreditRisk] Could not update Hospital ${hospital.hospital_name}:`, err.message);
      }

      if (hospital.credit_risk_score !== undefined) {
        const delta = Math.abs(result.score - hospital.credit_risk_score);
        if (delta > 10) {
          significantChanges.push({
            name: hospital.hospital_name,
            type: 'Hospital',
            oldScore: hospital.credit_risk_score,
            newScore: result.score,
            riskLevel: result.riskLevel,
            delta,
          });
        }
      }
    }
  } catch (err) {
    console.error('[CreditRisk] Hospital scoring failed:', err.message);
  }

  try {
    const customers = await Customer.find({ status: 'ACTIVE' })
      .select('_id customer_name payment_terms credit_limit credit_limit_action credit_risk_score')
      .lean();

    for (const customer of customers) {
      const result = await scoreEntity({
        entityType: 'customer',
        entityId: customer._id,
        entityName: customer.customer_name,
        paymentTerms: customer.payment_terms,
        creditLimit: customer.credit_limit,
      });
      if (!result) continue;

      results.push(result);

      try {
        const updateFields = {
          credit_risk_score: result.score,
          credit_risk_level: result.riskLevel,
          credit_risk_updated: new Date(),
        };
        if (result.score < 40) updateFields.credit_limit_action = 'BLOCK';
        else if (result.score >= 60 && customer.credit_limit_action === 'BLOCK') updateFields.credit_limit_action = 'WARN';
        await Customer.findByIdAndUpdate(customer._id, { $set: updateFields });
      } catch (err) {
        console.warn(`[CreditRisk] Could not update Customer ${customer.customer_name}:`, err.message);
      }

      if (customer.credit_risk_score !== undefined) {
        const delta = Math.abs(result.score - customer.credit_risk_score);
        if (delta > 10) {
          significantChanges.push({
            name: customer.customer_name,
            type: 'Customer',
            oldScore: customer.credit_risk_score,
            newScore: result.score,
            riskLevel: result.riskLevel,
            delta,
          });
        }
      }
    }
  } catch (err) {
    console.error('[CreditRisk] Customer scoring failed:', err.message);
  }

  const notificationResults = [];
  if (results.length > 0) {
    const critical = results.filter((result) => result.score < 40);
    const high = results.filter((result) => result.score >= 40 && result.score < 60);

    let body = `Credit Risk Assessment - ${new Date().toLocaleDateString()}\n\n`;
    body += `Scored: ${results.length} accounts\n`;
    body += `Critical/Very High risk: ${critical.length}\n`;
    body += `High risk: ${high.length}\n\n`;

    if (critical.length > 0) {
      body += '=== CRITICAL / VERY HIGH RISK (auto-blocked) ===\n';
      for (const result of critical) {
        body += `  - ${result.entityName} (${result.entityType}): score ${result.score} - ${result.riskLevel}\n`;
        body += `    Speed: ${result.breakdown.speedScore}, Consistency: ${result.breakdown.consistencyScore}, Utilization: ${result.breakdown.utilizationScore}\n`;
      }
      body += '\n';
    }

    if (high.length > 0) {
      body += '=== HIGH RISK ===\n';
      for (const result of high) {
        body += `  - ${result.entityName} (${result.entityType}): score ${result.score} - ${result.riskLevel}\n`;
      }
      body += '\n';
    }

    if (significantChanges.length > 0) {
      body += '=== SIGNIFICANT SCORE CHANGES (>10 pts) ===\n';
      for (const change of significantChanges) {
        const direction = change.newScore > change.oldScore ? 'IMPROVED' : 'DECLINED';
        body += `  - ${change.name} (${change.type}): ${change.oldScore} -> ${change.newScore} (${direction}, delta: ${change.delta})\n`;
      }
      body += '\n';
    }

    notificationResults.push(
      ...(await notify({
        recipient_id: 'PRESIDENT',
        title: `Credit Risk Report: ${critical.length} critical, ${high.length} high risk`,
        body,
        category: 'system',
        priority: critical.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'credit_risk',
      }))
    );
  }

  console.log(`[CreditRisk] Complete. Scored ${results.length} accounts, ${significantChanges.length} significant changes.`);

  const riskyCount = results.filter((result) => result.score < 60).length;
  return {
    status: 'success',
    summary: {
      bdms_processed: results.length,
      alerts_generated: riskyCount,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: results.length
        ? results.slice(0, 5).map((result) => `${result.entityName}: ${result.score} (${result.riskLevel})`)
        : ['No accounts had enough activity for credit-risk scoring.'],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
