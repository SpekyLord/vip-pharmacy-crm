/**
 * WorkflowGuide — Phase 24
 *
 * Contextual workflow guidance banner for BDM-facing ERP pages.
 * Shows what the page is for, what to do, and what comes next.
 * Dismissible per session via sessionStorage.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const styles = `
  .wfg { background: linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; position: relative; font-size: 12px; line-height: 1.7; }
  .wfg-dismiss { position: absolute; top: 8px; right: 10px; background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 4px; }
  .wfg-dismiss:hover { background: #dbeafe; color: #1e40af; }
  .wfg-title { font-size: 13px; font-weight: 700; color: #1e40af; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
  .wfg-title svg { width: 16px; height: 16px; }
  .wfg-steps { display: flex; flex-direction: column; gap: 3px; }
  .wfg-step { display: flex; align-items: flex-start; gap: 6px; color: #334155; }
  .wfg-num { background: #2563eb; color: #fff; width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .wfg-next { margin-top: 8px; padding-top: 8px; border-top: 1px solid #bfdbfe; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .wfg-next-label { font-weight: 700; color: #1e40af; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  .wfg-link { background: #2563eb; color: #fff; border: none; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .wfg-link:hover { background: #1d4ed8; }
  .wfg-link-outline { background: transparent; border: 1px solid #bfdbfe; color: #2563eb; }
  .wfg-link-outline:hover { background: #eff6ff; }
  .wfg-tip { margin-top: 6px; color: #64748b; font-style: italic; font-size: 11px; }
  body.dark-mode .wfg { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-color: #334155; }
  body.dark-mode .wfg-title { color: #93c5fd; }
  body.dark-mode .wfg-step { color: #cbd5e1; }
  body.dark-mode .wfg-next { border-color: #334155; }
  body.dark-mode .wfg-next-label { color: #93c5fd; }
  body.dark-mode .wfg-tip { color: #64748b; }
  body.dark-mode .wfg-dismiss:hover { background: #334155; color: #93c5fd; }
  @media(max-width: 480px) { .wfg { padding: 12px; font-size: 11px; } .wfg-next { flex-direction: column; align-items: flex-start; } }
`;

// ── Complete BDM workflow guide config ──
const WORKFLOW_GUIDES = {
  'erp-dashboard': {
    title: 'Your Daily Workflow',
    steps: [
      'Check your targets and MTD performance here',
      'Create Sales (CSI) for hospital visits',
      'Record field expenses (SMER, Car Logbook, ORE/ACCESS)',
      'Collect payments from customers',
      'Review your P&L and profit sharing at month-end',
    ],
    next: [
      { label: 'Create Sale', path: '/erp/sales/entry' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'Collect Payment', path: '/erp/collections' },
    ],
    tip: 'Complete all DRAFT documents before end of day. Unfinished drafts will not appear in reports.',
  },
  'sales-entry': {
    title: 'Creating a Sale (CSI)',
    steps: [
      'Select the hospital/customer and set the invoice date',
      'Add line items — select product, quantity, and price',
      'System auto-selects FIFO batch for inventory deduction',
      'Save as DRAFT, then Validate to check for errors',
      'Post to finalize — this creates AR and COGS journal entries',
    ],
    next: [
      { label: 'View All Sales', path: '/erp/sales' },
      { label: 'Check Inventory', path: '/erp/my-stock' },
      { label: 'Collect Payment', path: '/erp/collections' },
    ],
    tip: 'Posted sales generate Accounts Receivable. Collect payment via Collections to clear the AR.',
  },
  'sales-list': {
    title: 'Sales Management',
    steps: [
      'Review all your CSI documents and their statuses',
      'DRAFT — still editable, not yet validated',
      'VALID — passed checks, ready to post',
      'POSTED — finalized, AR created, appears in reports',
    ],
    next: [
      { label: 'Create New Sale', path: '/erp/sales/entry' },
      { label: 'Collect Payment', path: '/erp/collections' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
    ],
    tip: 'Post valid sales promptly. Unposted sales do not count in MTD targets or P&L.',
  },
  'my-stock': {
    title: 'Inventory Overview',
    steps: [
      'Stock on Hand — your current available quantity per product',
      'Transaction Ledger — all stock movements (in/out)',
      'Check stock before creating sales to avoid over-selling',
      'Request transfers from main warehouse if stock is low',
    ],
    next: [
      { label: 'Create Sale', path: '/erp/sales/entry' },
      { label: 'Request Transfer', path: '/erp/transfers' },
      { label: 'View Consignment', path: '/erp/consignment' },
    ],
    tip: 'FIFO (First In, First Out) is enforced. Oldest batches are sold first automatically.',
  },
  'dr-entry': {
    title: 'Delivery Receipt / Consignment',
    steps: [
      'Select DR type: Consignment, Sampling, or Donation',
      'Choose the hospital/customer receiving the goods',
      'Add products and quantities being delivered',
      'Save as DRAFT, Validate, then Post to deduct from inventory',
    ],
    next: [
      { label: 'View Inventory', path: '/erp/my-stock' },
      { label: 'Track Consignment', path: '/erp/consignment' },
      { label: 'Create Sale', path: '/erp/sales/entry' },
    ],
    tip: 'Consignment goods remain your inventory until the customer sells or returns them. Track aging in Consignment Dashboard.',
  },
  'collections': {
    title: 'Collections Process',
    steps: [
      'View all receivables and their aging status',
      'Click "New Collection" to record a payment received',
      'Select the CSI invoices being paid (partial or full)',
      'Enter payment details (mode, amount, check number if applicable)',
      'Validate and Post — this clears the customer\'s AR balance',
    ],
    next: [
      { label: 'New Collection', path: '/erp/collections/session' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
      { label: 'Generate SOA', path: '/erp/collections/soa' },
    ],
    tip: 'Overdue accounts (>30 days) are flagged. Generate an SOA to send to the customer as a reminder.',
  },
  'collection-session': {
    title: 'Recording a Collection',
    steps: [
      'Select the customer/hospital',
      'Choose which invoices (CSIs) are being paid',
      'Enter the payment mode (Cash, Check, Bank Transfer, GCash)',
      'Enter amount received — can be partial or full payment',
      'Validate and Post to clear the AR and create bank deposit journal',
    ],
    next: [
      { label: 'View All Collections', path: '/erp/collections' },
      { label: 'View AR Aging', path: '/erp/collections/ar' },
    ],
    tip: 'CWT (Creditable Withholding Tax) is auto-computed if applicable. Check the CWT amount before posting.',
  },
  'ar-aging': {
    title: 'Accounts Receivable Aging',
    steps: [
      'Review outstanding balances by customer and age bracket',
      'Current (0-30 days), Overdue (31-60), Critical (60+)',
      'Prioritize collection on oldest receivables first',
      'Generate SOA for customers with high balances',
    ],
    next: [
      { label: 'Collect Payment', path: '/erp/collections/session' },
      { label: 'Generate SOA', path: '/erp/collections/soa' },
    ],
    tip: 'High AR aging affects your collection rate and profit sharing eligibility.',
  },
  'expenses': {
    title: 'Recording Expenses (ORE / ACCESS)',
    steps: [
      'Choose expense type: ORE (reimbursable) or ACCESS (operational)',
      'Use the OCR scanner to auto-extract receipt data, or enter manually',
      'Select category, COA code, and cost center',
      'Attach receipt photo as proof',
      'Save as DRAFT → Validate → Post to generate expense journal',
    ],
    next: [
      { label: 'Record SMER', path: '/erp/smer' },
      { label: 'Record Car Logbook', path: '/erp/car-logbook' },
      { label: 'PRF / CALF', path: '/erp/prf-calf' },
    ],
    tip: 'Expenses with CALF required cannot be posted until the linked CALF is posted. President can override this gate.',
  },
  'smer': {
    title: 'SMER (Sales/Marketing Expense Report)',
    steps: [
      'Select the period/cycle and your name',
      'Fill in each day\'s activity type (Office/Field/Other)',
      'Enter expense amounts per category (Mobile, Internet, Meals, etc.)',
      'System auto-computes Per Diem based on MD count',
      'Validate and Post to generate expense journal entries',
    ],
    next: [
      { label: 'Record Car Logbook', path: '/erp/car-logbook' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'View Reports', path: '/erp/reports' },
    ],
    tip: 'Full per diem requires minimum MDs per day (check ERP Settings). Half-day threshold is lower.',
  },
  'car-logbook': {
    title: 'Car Logbook',
    steps: [
      'Enter the date and your vehicle details',
      'Scan odometer photo using OCR for accurate reading',
      'Add fuel entries: station, fuel type, liters, cost',
      'System computes mileage and fuel efficiency automatically',
      'Validate and Post to generate fuel expense journal',
    ],
    next: [
      { label: 'Record SMER', path: '/erp/smer' },
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'Fuel Efficiency', path: '/erp/fuel-efficiency' },
    ],
    tip: 'Fuel overconsumption above the threshold (set in ERP Settings) will be flagged in anomaly reports.',
  },
  'prf-calf': {
    title: 'PRF / CALF',
    steps: [
      'PRF (Partner Rebate Form) — record partner rebate payments',
      'CALF (Cash Advance Liquidation) — liquidate cash advances against expenses',
      'For PRF: enter partner details, rebate amount, payment mode',
      'For CALF: link to related expenses, verify advance vs. liquidation balance',
      'Validate and Post — CALF cannot post until linked expenses are posted',
    ],
    next: [
      { label: 'Record Expenses', path: '/erp/expenses' },
      { label: 'View Sales', path: '/erp/sales' },
    ],
    tip: 'CALF is required for certain expense types before they can be posted. Check the funding source.',
  },
  'collaterals': {
    title: 'Marketing Collaterals',
    steps: [
      'Track promotional materials (brochures, samples, merchandise)',
      'Record quantities received, distributed, and returned',
      'Assign collaterals to specific hospitals/customers',
    ],
    next: [
      { label: 'View Inventory', path: '/erp/my-stock' },
      { label: 'View Reports', path: '/erp/reports' },
    ],
    tip: 'Keep collateral records up to date. Unaccounted materials may be flagged in audits.',
  },
  'transfers': {
    title: 'Stock Transfers',
    steps: [
      'Create a transfer order to move stock between warehouses',
      'Select source warehouse, target warehouse, and products',
      'Enter quantities to transfer',
      'Validate and Post — updates inventory in both warehouses',
    ],
    next: [
      { label: 'Receive Transfer', path: '/erp/transfers/receive' },
      { label: 'View Inventory', path: '/erp/my-stock' },
    ],
    tip: 'Inter-company transfers (between entities) use transfer prices set by the president.',
  },
  'transfers-receive': {
    title: 'Receiving Stock Transfers',
    steps: [
      'View incoming transfer orders from other warehouses',
      'Verify quantities match the transfer document',
      'Confirm receipt to update your warehouse inventory',
    ],
    next: [
      { label: 'View Inventory', path: '/erp/my-stock' },
      { label: 'Create Sale', path: '/erp/sales/entry' },
    ],
  },
  'reports': {
    title: 'Reports & Analytics',
    steps: [
      'Review your performance metrics and trends',
      'Check cycle status for the current period',
      'Monitor expense anomalies and fuel efficiency',
      'View consignment aging for outstanding deliveries',
    ],
    next: [
      { label: 'Cycle Status', path: '/erp/cycle-status' },
      { label: 'P&L Statement', path: '/erp/pnl' },
      { label: 'Profit Sharing', path: '/erp/profit-sharing' },
    ],
  },
  'income': {
    title: 'Revenue Summary',
    steps: [
      'View revenue breakdown by product, customer, and period',
      'Compare MTD vs. target',
      'Identify top-performing products and customers',
    ],
    next: [
      { label: 'View P&L', path: '/erp/pnl' },
      { label: 'Profit Sharing', path: '/erp/profit-sharing' },
    ],
  },
  'pnl': {
    title: 'Profit & Loss Statement',
    steps: [
      'Revenue minus COGS = Gross Profit',
      'Gross Profit minus Operating Expenses = Net Income',
      'This is the GL-based (authoritative) P&L from posted journal entries',
    ],
    next: [
      { label: 'Profit Sharing', path: '/erp/profit-sharing' },
      { label: 'View Income', path: '/erp/income' },
    ],
    tip: 'Only POSTED transactions appear here. Draft/valid documents are excluded.',
  },
  'profit-sharing': {
    title: 'Profit Sharing',
    steps: [
      'View your allocated profit share based on sales performance',
      'Eligibility requires minimum products and hospitals (see ERP Settings)',
      'Consecutive months of eligibility required before payout',
    ],
    next: [
      { label: 'View P&L', path: '/erp/pnl' },
      { label: 'View Sales', path: '/erp/sales' },
    ],
    tip: 'BDM share and VIP share percentages are configured in ERP Settings by admin/finance.',
  },
};

/**
 * WorkflowGuide component
 * @param {string} pageKey — key from WORKFLOW_GUIDES config
 */
export default function WorkflowGuide({ pageKey }) {
  const navigate = useNavigate();
  const storageKey = `wfg_dismiss_${pageKey}`;
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(storageKey) === '1');

  const guide = WORKFLOW_GUIDES[pageKey];
  if (!guide || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(storageKey, '1');
    setDismissed(true);
  };

  return (
    <>
      <style>{styles}</style>
      <div className="wfg">
        <button className="wfg-dismiss" onClick={handleDismiss} title="Dismiss for this session">×</button>
        <div className="wfg-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          {guide.title}
        </div>
        <div className="wfg-steps">
          {guide.steps.map((step, i) => (
            <div key={i} className="wfg-step">
              <span className="wfg-num">{i + 1}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        {guide.next && guide.next.length > 0 && (
          <div className="wfg-next">
            <span className="wfg-next-label">Next steps:</span>
            {guide.next.map((n, i) => (
              <button key={i} className={`wfg-link ${i > 0 ? 'wfg-link-outline' : ''}`} onClick={() => navigate(n.path)}>
                {n.label} →
              </button>
            ))}
          </div>
        )}
        {guide.tip && <div className="wfg-tip">💡 {guide.tip}</div>}
      </div>
    </>
  );
}
