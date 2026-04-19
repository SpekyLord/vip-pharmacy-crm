/**
 * Compensation Statement HTML Template — Phase SG-Q2 Week 3
 *
 * Renders a printable BDM compensation statement matching the JSON shape
 * returned by incentivePayoutController.getCompensationStatement.
 *
 * Print philosophy (matches salesReceipt.js / pettyCashForm.js):
 *   - Pure HTML+CSS, no PDF library — browser "Save as PDF" produces the PDF.
 *   - `@media print` strips chrome (the Print button) and tightens margins.
 *   - Mobile-friendly via responsive CSS so a BDM can print from a phone.
 *
 * Subscriber overrides (lookup-driven, COMP_STATEMENT_TEMPLATE category):
 *   - HEADER_TITLE     — top-of-page title (default: "Compensation Statement")
 *   - HEADER_SUBTITLE  — line under the title (default: entity name + FY)
 *   - DISCLAIMER       — bottom-of-page legal/HR text (default: confidentiality note)
 *   - SIGNATORY_LINE   — signatory name/title on the signature block
 *   - SIGNATORY_TITLE  — signatory's organizational title
 *
 * Each override is `{ code, label, metadata: { value } }` in the Lookup model.
 * Subscribers configure per-entity from Control Center → Lookup Tables. Admins
 * can re-brand the statement without a code deploy. Falls back to safe defaults
 * for fresh entities so the page renders day one.
 */

function php(n) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function pct(n) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const STATUS_BADGE = {
  ACCRUED:  { bg: '#dbeafe', color: '#1e40af', label: 'Accrued' },
  APPROVED: { bg: '#fef3c7', color: '#92400e', label: 'Approved' },
  PAID:     { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  REVERSED: { bg: '#fee2e2', color: '#991b1b', label: 'Reversed' },
};

function statusBadgeHtml(status) {
  const b = STATUS_BADGE[status] || STATUS_BADGE.ACCRUED;
  return `<span style="background:${b.bg};color:${b.color};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${b.label}</span>`;
}

function renderCompensationStatement({
  bdm = {},
  plan = null,
  entity = null,
  fiscalYear,
  period,
  summary = { earned: 0, accrued: 0, adjusted: 0, paid: 0, count: 0 },
  periods = [],
  tier = null,
  rows = [],
  template = {},
  generatedAt = new Date(),
} = {}) {
  const entityName = entity?.short_name || entity?.name || '';
  const headerTitle = template.HEADER_TITLE || 'Compensation Statement';
  const headerSubtitle = template.HEADER_SUBTITLE
    || `${entityName ? entityName + ' • ' : ''}Fiscal Year ${fiscalYear}`;
  const disclaimer = template.DISCLAIMER
    || 'This statement is confidential and intended only for the named BDM. '
       + 'Amounts are computed from the Sales Goal incentive ledger and reflect '
       + 'the current status as of the generation timestamp. Accrued amounts are '
       + 'subject to authority approval; reversed amounts have been backed out '
       + 'with a SAP-Storno journal entry.';
  const signatoryLine = template.SIGNATORY_LINE || '';
  const signatoryTitle = template.SIGNATORY_TITLE || 'Authorized Officer';

  // ── Period rows table ─────────────────────────────────────────────────────
  const periodRows = (periods || []).map(p => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(p.period)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;color:#6b7280;font-size:11px;">${escapeHtml(p.period_type || '')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${php(p.earned)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;color:#1e40af;">${php(p.accrued)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;color:#166534;">${php(p.paid)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;color:#991b1b;">${php(p.adjusted)}</td>
    </tr>`).join('');

  // ── Detail ledger rows ────────────────────────────────────────────────────
  const ledgerRows = (rows || []).map(r => {
    const planLabel = r.plan_id?.reference || r.plan_id?.plan_name || '';
    const accrualJe = r.journal_id?.je_number || r.journal_number || '—';
    const settleJe = r.settlement_journal_id?.je_number || (r.reversal_journal_id?.je_number ? `${r.reversal_journal_id.je_number} (rev)` : '—');
    const capDelta = (Number(r.uncapped_budget) || 0) - (Number(r.tier_budget) || 0);
    const capNote = capDelta > 0 ? `<div style="font-size:10px;color:#92400e;">capped −${php(capDelta)}</div>` : '';
    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(r.period)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(r.tier_label || r.tier_code)}${capNote}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${php(r.tier_budget)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-variant-numeric:tabular-nums;">${pct(r.attainment_pct)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${statusBadgeHtml(r.status)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;">${escapeHtml(accrualJe)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;">${escapeHtml(settleJe)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;color:#6b7280;">${escapeHtml(planLabel)}</td>
      </tr>`;
  }).join('');

  // ── Tier context (current/projected) ──────────────────────────────────────
  const tierBlock = tier ? `
    <div class="cs-card">
      <div class="cs-card-label">YTD Attainment</div>
      <div class="cs-card-value">${pct(tier.sales_attainment_pct)}</div>
      <div class="cs-card-sub">${php(tier.sales_actual)} of ${php(tier.sales_target)}</div>
    </div>
    <div class="cs-card">
      <div class="cs-card-label">Current Tier</div>
      <div class="cs-card-value">${escapeHtml(tier.current_tier_label || tier.current_tier_code || 'Participant')}</div>
      <div class="cs-card-sub">Budget: ${php(tier.current_tier_budget)}</div>
    </div>
    <div class="cs-card">
      <div class="cs-card-label">Projected Tier (FY-end)</div>
      <div class="cs-card-value">${escapeHtml(tier.projected_tier_label || tier.projected_tier_code || '—')}</div>
      <div class="cs-card-sub">Projected: ${php(tier.projected_tier_budget)}</div>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compensation Statement — ${escapeHtml(bdm.name || 'BDM')} — FY${fiscalYear}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1f2937; padding: 24px; max-width: 900px; margin: 0 auto; background: #fff; }
    .cs-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #1e40af; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
    .cs-header-title { font-size: 20px; font-weight: 700; color: #1e40af; }
    .cs-header-subtitle { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .cs-header-meta { font-size: 11px; color: #6b7280; text-align: right; }
    .cs-bdm-block { background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; gap: 24px; flex-wrap: wrap; }
    .cs-bdm-field { font-size: 12px; }
    .cs-bdm-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2px; }
    .cs-bdm-value { font-weight: 600; color: #1f2937; }
    .cs-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
    .cs-summary-card { background: #fff; border: 1px solid #e5e7eb; padding: 12px 14px; border-radius: 8px; }
    .cs-summary-label { font-size: 10px; font-weight: 600; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
    .cs-summary-value { font-size: 18px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .cs-summary-card.earned   .cs-summary-value { color: #1f2937; }
    .cs-summary-card.accrued  .cs-summary-value { color: #1e40af; }
    .cs-summary-card.paid     .cs-summary-value { color: #166534; }
    .cs-summary-card.adjusted .cs-summary-value { color: #991b1b; }
    .cs-tier-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .cs-card { background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 14px; border-radius: 8px; }
    .cs-card-label { font-size: 10px; font-weight: 600; text-transform: uppercase; color: #1e40af; letter-spacing: 0.05em; }
    .cs-card-value { font-size: 16px; font-weight: 700; margin-top: 4px; color: #1e3a8a; }
    .cs-card-sub { font-size: 11px; color: #4b5563; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .cs-section-title { font-size: 13px; font-weight: 700; color: #1f2937; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
    .cs-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .cs-table th { background: #f3f4f6; padding: 8px; text-align: left; border-bottom: 2px solid #d1d5db; font-size: 11px; color: #374151; font-weight: 600; }
    .cs-table th.num { text-align: right; }
    .cs-empty { padding: 24px; text-align: center; color: #9ca3af; font-style: italic; }
    .cs-disclaimer { margin-top: 24px; padding: 12px 16px; background: #f9fafb; border-left: 3px solid #6b7280; font-size: 11px; color: #4b5563; line-height: 1.5; }
    .cs-signature { margin-top: 32px; display: flex; justify-content: space-between; gap: 48px; flex-wrap: wrap; }
    .cs-sig-block { flex: 1; min-width: 220px; text-align: center; }
    .cs-sig-line { border-top: 1px solid #1f2937; margin-top: 40px; padding-top: 4px; font-size: 11px; color: #4b5563; }
    .cs-sig-name { font-weight: 600; color: #1f2937; font-size: 12px; }
    .cs-print-btn { display: block; margin: 20px auto; padding: 10px 24px; background: #1e40af; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .cs-print-btn:hover { background: #1e3a8a; }
    @media print {
      body { padding: 16px; max-width: 100%; }
      .cs-print-btn { display: none; }
      .cs-section-title { break-after: avoid; }
      table { break-inside: avoid; }
    }
    @media (max-width: 600px) {
      body { padding: 12px; font-size: 11px; }
      .cs-summary-grid { grid-template-columns: repeat(2, 1fr); }
      .cs-tier-grid { grid-template-columns: 1fr; }
      .cs-bdm-block { gap: 12px; }
      .cs-table th, .cs-table td { padding: 4px 6px; font-size: 10px; }
    }
    @media (max-width: 360px) {
      .cs-summary-grid { grid-template-columns: 1fr; }
      .cs-header-title { font-size: 17px; }
      .cs-summary-value { font-size: 16px; }
    }
  </style>
</head>
<body>
  <div class="cs-header">
    <div>
      <div class="cs-header-title">${escapeHtml(headerTitle)}</div>
      <div class="cs-header-subtitle">${escapeHtml(headerSubtitle)}</div>
    </div>
    <div class="cs-header-meta">
      Generated: ${fmtDate(generatedAt)}<br>
      ${plan?.reference ? `Plan: ${escapeHtml(plan.reference)}<br>` : ''}
      ${period ? `Period: ${escapeHtml(period)}` : `FY ${fiscalYear}`}
    </div>
  </div>

  <div class="cs-bdm-block">
    <div class="cs-bdm-field"><div class="cs-bdm-label">BDM</div><div class="cs-bdm-value">${escapeHtml(bdm.name || '—')}</div></div>
    ${bdm.bdm_code ? `<div class="cs-bdm-field"><div class="cs-bdm-label">BDM Code</div><div class="cs-bdm-value">${escapeHtml(bdm.bdm_code)}</div></div>` : ''}
    ${bdm.position ? `<div class="cs-bdm-field"><div class="cs-bdm-label">Position</div><div class="cs-bdm-value">${escapeHtml(bdm.position)}</div></div>` : ''}
    ${bdm.email ? `<div class="cs-bdm-field"><div class="cs-bdm-label">Email</div><div class="cs-bdm-value">${escapeHtml(bdm.email)}</div></div>` : ''}
    ${entityName ? `<div class="cs-bdm-field"><div class="cs-bdm-label">Entity</div><div class="cs-bdm-value">${escapeHtml(entityName)}</div></div>` : ''}
  </div>

  <div class="cs-summary-grid">
    <div class="cs-summary-card earned">
      <div class="cs-summary-label">Earned</div>
      <div class="cs-summary-value">${php(summary.earned)}</div>
    </div>
    <div class="cs-summary-card accrued">
      <div class="cs-summary-label">Accrued (pending)</div>
      <div class="cs-summary-value">${php(summary.accrued)}</div>
    </div>
    <div class="cs-summary-card paid">
      <div class="cs-summary-label">Paid</div>
      <div class="cs-summary-value">${php(summary.paid)}</div>
    </div>
    <div class="cs-summary-card adjusted">
      <div class="cs-summary-label">Adjustments</div>
      <div class="cs-summary-value">${php(summary.adjusted)}</div>
    </div>
  </div>

  ${tier ? `
    <div class="cs-section-title">Tier Context</div>
    <div class="cs-tier-grid">
      ${tierBlock}
    </div>
  ` : ''}

  <div class="cs-section-title">By Period</div>
  ${periods.length === 0 ? '<div class="cs-empty">No qualifying periods in this fiscal year.</div>' : `
    <table class="cs-table">
      <thead>
        <tr>
          <th>Period</th>
          <th style="text-align:center;">Type</th>
          <th class="num">Earned</th>
          <th class="num">Accrued</th>
          <th class="num">Paid</th>
          <th class="num">Adjusted</th>
        </tr>
      </thead>
      <tbody>
        ${periodRows}
      </tbody>
    </table>
  `}

  <div class="cs-section-title">Detail Ledger</div>
  ${rows.length === 0 ? '<div class="cs-empty">No incentive ledger entries for this fiscal year. Hit a tier threshold on YTD attainment and a payout will be accrued automatically.</div>' : `
    <table class="cs-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Tier</th>
          <th class="num">Amount</th>
          <th class="num">Attain%</th>
          <th>Status</th>
          <th>Accrual JE</th>
          <th>Settlement JE</th>
          <th>Plan</th>
        </tr>
      </thead>
      <tbody>
        ${ledgerRows}
      </tbody>
    </table>
  `}

  <div class="cs-disclaimer">${escapeHtml(disclaimer)}</div>

  <div class="cs-signature">
    <div class="cs-sig-block">
      <div class="cs-sig-line">BDM Acknowledgement</div>
      <div class="cs-sig-name">${escapeHtml(bdm.name || '')}</div>
    </div>
    <div class="cs-sig-block">
      <div class="cs-sig-line">${escapeHtml(signatoryTitle)}</div>
      <div class="cs-sig-name">${escapeHtml(signatoryLine)}</div>
    </div>
  </div>

  <button class="cs-print-btn" onclick="window.print()">Print / Save as PDF</button>
</body>
</html>`;
}

module.exports = { renderCompensationStatement };
