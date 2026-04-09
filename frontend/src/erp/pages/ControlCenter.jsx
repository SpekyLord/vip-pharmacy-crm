/**
 * ControlCenter — Phase 24
 *
 * Single page for president/admin/finance to manage all system structure,
 * lookups, master data, and governance settings from one place.
 *
 * Left category sidebar (governance hierarchy) + right lazy-loaded content panels.
 * URL sync via ?section= query param for deep-linking.
 */
import React, { useState, useEffect, Suspense, lazy, useMemo, Component } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import {
  LayoutDashboard, Building2, Users, ShieldCheck, BookOpen, Landmark,
  CreditCard, Receipt, Package, ArrowLeftRight, Boxes, Lock,
  RefreshCw, Archive, Settings, List, DollarSign, MapPin, Truck,
  Stethoscope, ShoppingCart, Hospital, UtensilsCrossed, Bot
} from 'lucide-react';

// Lazy-load section content components
const SECTIONS = {
  'foundation-health': lazy(() => import('./FoundationHealth')),
  'entities': lazy(() => import('./EntityManager')),
  'people': lazy(() => import('./PeopleList').then(m => ({ default: m.PeopleListContent }))),
  'org-chart': lazy(() => import('./OrgChart').then(m => ({ default: m.OrgChartContent }))),
  'access-templates': lazy(() => import('./AccessTemplateManager').then(m => ({ default: m.AccessTemplateManagerContent }))),
  'coa': lazy(() => import('./ChartOfAccounts').then(m => ({ default: m.ChartOfAccountsContent }))),
  'cost-centers': lazy(() => import('./CostCenters').then(m => ({ default: m.CostCentersContent }))),
  'payment-modes': lazy(() => import('./PaymentModes').then(m => ({ default: m.PaymentModesContent }))),
  'bank-accounts': lazy(() => import('./BankAccounts').then(m => ({ default: m.BankAccountsContent }))),
  'credit-cards': lazy(() => import('./CreditCardManager').then(m => ({ default: m.CreditCardManagerContent }))),
  'government-rates': lazy(() => import('./GovernmentRates').then(m => ({ default: m.GovernmentRatesContent }))),
  'warehouses': lazy(() => import('./WarehouseManager').then(m => ({ default: m.WarehouseManagerContent }))),
  'transfer-prices': lazy(() => import('./TransferPriceManager').then(m => ({ default: m.TransferPriceManagerContent }))),
  'fixed-assets': lazy(() => import('./FixedAssets').then(m => ({ default: m.FixedAssetsContent }))),
  'period-locks': lazy(() => import('./PeriodLocks').then(m => ({ default: m.PeriodLocksContent }))),
  'recurring-journals': lazy(() => import('./RecurringJournals').then(m => ({ default: m.RecurringJournalsContent }))),
  'data-archive': lazy(() => import('./DataArchive').then(m => ({ default: m.DataArchiveContent }))),
  'territories': lazy(() => import('./TerritoryManager').then(m => ({ default: m.TerritoryManagerContent }))),
  'vendors': lazy(() => import('./VendorList').then(m => ({ default: m.VendorListContent }))),
  'customers': lazy(() => import('./CustomerList').then(m => ({ default: m.CustomerListContent }))),
  'products': lazy(() => import('./ProductMaster').then(m => ({ default: m.ProductMasterPageContent }))),
  'fnb-products': lazy(() => import('./ProductMaster').then(m => {
    // Stable wrapper component — avoids recreating on every render
    function FnbProductsContent(props) { return m.ProductMasterPageContent({ ...props, stockType: 'FNB' }); }
    FnbProductsContent.displayName = 'FnbProductsContent';
    return { default: FnbProductsContent };
  })),
  'hospitals': lazy(() => import('./HospitalList').then(m => ({ default: m.HospitalListContent }))),
  'agent-settings': lazy(() => import('./AgentSettings').then(m => ({ default: m.AgentSettingsContent }))),
  'erp-settings': lazy(() => import('./ErpSettingsPanel')),
  'lookups': lazy(() => import('./LookupManager'))
};

const CATEGORY_CONFIG = [
  {
    id: 'overview',
    label: 'Foundation Health',
    icon: LayoutDashboard,
    items: [{ key: 'foundation-health', label: 'Overview', icon: LayoutDashboard }]
  },
  {
    id: 'entity',
    label: 'Entity & Organization',
    icon: Building2,
    items: [
      { key: 'entities', label: 'Entities', icon: Building2 },
      { key: 'territories', label: 'Territories', icon: MapPin }
    ]
  },
  {
    id: 'people',
    label: 'People & Access',
    icon: Users,
    items: [
      { key: 'people', label: 'People Master', icon: Users },
      { key: 'org-chart', label: 'Org Chart', icon: Users },
      { key: 'access-templates', label: 'Access Templates', icon: ShieldCheck }
    ]
  },
  {
    id: 'financial',
    label: 'Financial Setup',
    icon: BookOpen,
    items: [
      { key: 'coa', label: 'Chart of Accounts', icon: BookOpen },
      { key: 'cost-centers', label: 'Cost Centers', icon: DollarSign },
      { key: 'bank-accounts', label: 'Bank Accounts', icon: Landmark },
      { key: 'credit-cards', label: 'Credit Cards', icon: CreditCard },
      { key: 'payment-modes', label: 'Payment Modes', icon: Receipt }
    ]
  },
  {
    id: 'tax',
    label: 'Tax & Compliance',
    icon: Receipt,
    items: [{ key: 'government-rates', label: 'Government Rates', icon: Receipt }]
  },
  {
    id: 'master-data',
    label: 'Master Data',
    icon: ShoppingCart,
    items: [
      { key: 'vendors', label: 'Vendors', icon: Truck },
      { key: 'customers', label: 'Customers', icon: Stethoscope },
      { key: 'hospitals', label: 'Hospitals', icon: Hospital },
      { key: 'products', label: 'Products (Pharma)', icon: ShoppingCart },
      { key: 'fnb-products', label: 'Products (F&B)', icon: UtensilsCrossed }
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: Package,
    items: [
      { key: 'warehouses', label: 'Warehouses', icon: Boxes },
      { key: 'transfer-prices', label: 'Transfer Prices', icon: ArrowLeftRight },
      { key: 'fixed-assets', label: 'Fixed Assets', icon: Package }
    ]
  },
  {
    id: 'governance',
    label: 'Governance Controls',
    icon: Lock,
    items: [
      { key: 'period-locks', label: 'Period Locks', icon: Lock },
      { key: 'recurring-journals', label: 'Recurring Journals', icon: RefreshCw },
      { key: 'data-archive', label: 'Data Archive', icon: Archive }
    ]
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    icon: Bot,
    items: [
      { key: 'agent-settings', label: 'Agent Config', icon: Bot }
    ]
  },
  {
    id: 'settings',
    label: 'System Settings',
    icon: Settings,
    items: [
      { key: 'erp-settings', label: 'ERP Settings', icon: Settings },
      { key: 'lookups', label: 'Lookup Tables', icon: List }
    ]
  }
];

// Error boundary for lazy-loaded section failures
class SectionErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Failed to load section</h3>
          <p style={{ fontSize: 13, color: '#64748b' }}>{this.state.error?.message || 'Unknown error'}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ marginTop: 12, padding: '6px 16px', borderRadius: 8, border: '1px solid #dbe4f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Dependency guide: what to configure when you change each section ──
const DEPENDENCY_GUIDE = {
  'entities': {
    title: 'Entity Dependencies',
    items: [
      { action: 'When you add a new entity', deps: 'Set up Territories, Warehouses, Bank Accounts, Credit Cards, COA, and Access Templates for it', section: 'territories' },
      { action: 'When you add a new entity', deps: 'Assign a manager using the "Managed By" dropdown — this person will appear as entity head in the Org Chart', section: 'people' },
      { action: 'When you change VAT status', deps: 'Review Government Rates and COA Mapping in ERP Settings', section: 'government-rates' },
    ]
  },
  'territories': {
    title: 'Territory Dependencies',
    items: [
      { action: 'When you add a territory', deps: 'Create a matching Warehouse (Territory type) and assign BDMs to it', section: 'warehouses' },
      { action: 'When you deactivate a territory', deps: 'Reassign affected BDMs and check Warehouse assignments', section: 'people' },
    ]
  },
  'people': {
    title: 'People Dependencies',
    items: [
      { action: 'When you add a person', deps: 'Create their Comp Profile (salary, allowances, tax status) from their detail page', section: null },
      { action: 'When you add a person', deps: 'Assign an Access Template so they can use ERP modules', section: 'access-templates' },
      { action: 'New to ERP?', deps: 'Use "Sync from CRM" button to import existing CRM users', section: null },
      { action: 'When you add a new person type or BDM stage', deps: 'Add it in Lookup Tables first (PERSON_TYPE, BDM_STAGE, EMPLOYMENT_TYPE, ROLE_MAPPING)', section: 'lookup-tables' },
    ]
  },
  'access-templates': {
    title: 'Access Template Dependencies',
    items: [
      { action: 'When you create/edit a template', deps: 'Apply it to users via People Master > person detail > ERP Access', section: 'people' },
      { action: 'When you change module permissions', deps: 'Affected users will see/lose sidebar items on next login', section: null },
    ]
  },
  'coa': {
    title: 'Chart of Accounts Dependencies',
    items: [
      { action: 'When you add an account', deps: 'If used for auto-journals, update COA Mapping in ERP Settings', section: 'erp-settings' },
      { action: 'When you deactivate an account', deps: 'Ensure no Bank Account, Credit Card, or Payment Mode references it', section: 'bank-accounts' },
    ]
  },
  'cost-centers': {
    title: 'Cost Center Dependencies',
    items: [
      { action: 'When you add a cost center', deps: 'Assign it to transactions via Expenses, Payroll, or Budget Allocations', section: null },
    ]
  },
  'bank-accounts': {
    title: 'Bank Account Dependencies',
    items: [
      { action: 'When you add a bank account', deps: 'Map it to a COA account code (e.g. 1001 Cash in Bank)', section: 'coa' },
      { action: 'When you add a bank account', deps: 'Assign users who can deposit/transact on it', section: null },
    ]
  },
  'credit-cards': {
    title: 'Credit Card Dependencies',
    items: [
      { action: 'When you add a card', deps: 'Map it to a COA account code (e.g. 2301 CC Payable) and assign users', section: 'coa' },
    ]
  },
  'payment-modes': {
    title: 'Payment Mode Dependencies',
    items: [
      { action: 'When you add a payment mode', deps: 'Map it to a COA account code for journal posting', section: 'coa' },
      { action: 'When you set CALF required', deps: 'BDMs must submit a CALF before expenses using this mode can be posted', section: null },
    ]
  },
  'government-rates': {
    title: 'Government Rates Dependencies',
    items: [
      { action: 'When you update SSS/PhilHealth/PagIBIG rates', deps: 'Next payroll run will use the new rates automatically', section: null },
      { action: 'When you update Withholding Tax brackets', deps: 'Affects BIR 2316 computation for all employees', section: null },
    ]
  },
  'vendors': {
    title: 'Vendor Dependencies',
    items: [
      { action: 'When you add a vendor', deps: 'You can now create Purchase Orders and Supplier Invoices for them', section: null },
    ]
  },
  'customers': {
    title: 'Customer Dependencies',
    items: [
      { action: 'When you add a customer', deps: 'You can now create Sales (CSI/Service Invoice) for them', section: null },
    ]
  },
  'products': {
    title: 'Product Dependencies',
    items: [
      { action: 'When you add a product', deps: 'Set purchase_price (drives COGS) and assign to a Warehouse for inventory', section: 'warehouses' },
      { action: 'When you Refresh Master from CSV', deps: 'Existing products are updated, duplicates deactivated, new products created. Run this BEFORE importing stock on hand.', section: 'warehouses' },
    ]
  },
  'warehouses': {
    title: 'Warehouse Dependencies',
    items: [
      { action: 'When you add a warehouse', deps: 'Set a manager, assign users, and link to a Territory if it is a field warehouse', section: 'territories' },
      { action: 'When you set "Default Receiving"', deps: 'All GRNs will route to this warehouse unless overridden', section: null },
      { action: 'When you Import Opening Stock', deps: 'Products must exist in Product Master first (Refresh Master). Unmatched items will be skipped.', section: 'products' },
    ]
  },
  'transfer-prices': {
    title: 'Transfer Price Dependencies',
    items: [
      { action: 'When you set a transfer price', deps: 'This tags the product to the target entity — VIP supplies it at the set price', section: null },
      { action: 'When you clear a transfer price', deps: 'The product is untagged from the entity — VIP no longer supplies it', section: null },
      { action: 'All products belong to VIP', deps: 'Transfer prices list VIP products; setting a price tags them to a subsidiary', section: 'products' },
    ]
  },
  'fixed-assets': {
    title: 'Fixed Asset Dependencies',
    items: [
      { action: 'When you add an asset', deps: 'Monthly depreciation will be computed and posted via Month-End Close', section: null },
      { action: 'When you change useful life', deps: 'Future depreciation amounts will recalculate', section: null },
    ]
  },
  'period-locks': {
    title: 'Period Lock Dependencies',
    items: [
      { action: 'When you lock a period', deps: 'No one can post, reopen, or modify documents in that month for that module', section: null },
      { action: 'Before locking', deps: 'Run Month-End Close to finalize all postings first', section: null },
    ]
  },
  'recurring-journals': {
    title: 'Recurring Journal Dependencies',
    items: [
      { action: 'When you create a template', deps: 'Ensure the COA codes exist and are active in Chart of Accounts', section: 'coa' },
      { action: 'When you set auto-post', deps: 'Journals will post automatically on the scheduled day — review Period Locks', section: 'period-locks' },
    ]
  },
  'erp-settings': {
    title: 'ERP Settings Dependencies',
    items: [
      { action: 'When you change COA Mapping', deps: 'All future auto-journal entries (sales, collections, expenses, payroll) will post to the new accounts', section: 'coa' },
      { action: 'When you change VAT/CWT rates', deps: 'All future transactions will use the new rates', section: null },
      { action: 'When you change Per Diem or Fuel rates', deps: 'Affects SMER and Car Logbook computations for all BDMs', section: null },
      { action: 'When you change Commission/Rebate rates', deps: 'Affects Collection commission and PRF computations', section: null },
    ]
  },
  'lookups': {
    title: 'Lookup Table Dependencies',
    items: [
      { action: 'When you add/edit a lookup value', deps: 'All dropdowns using that category will show the new value immediately (5-min cache)', section: null },
      { action: 'When you deactivate a value', deps: 'Existing records keep their value, but new entries cannot select it', section: null },
      { action: 'GOAL_CONFIG — Sales Goal thresholds', deps: 'Controls attainment colors (green/yellow/red), collection %, fiscal start month on the Goal Dashboard', section: null },
      { action: 'INCENTIVE_TIER — Incentive budgets', deps: 'Defines tier names, attainment thresholds, and budget amounts. Edit anytime to adjust rewards mid-year.', section: null },
      { action: 'GROWTH_DRIVER — Sales growth drivers', deps: 'Used when creating Sales Goal Plans. Add new drivers here before adding them to a plan.', section: null },
      { action: 'KPI_CODE — KPI metric definitions', deps: 'Defines auto/manual computation, units, and direction. Add here before linking to a growth driver.', section: null },
    ]
  },
  'org-chart': {
    title: 'Org Chart Dependencies',
    items: [
      { action: 'Before using the org chart', deps: 'Add people in People Master and set their "Reports To" field', section: 'people' },
      { action: 'To see scores', deps: 'Click "Recompute Scores" to generate Partner Scorecards from visit, sales, and collection data', section: null },
      { action: 'To see all entities', deps: 'Log in as President to view the full multi-entity org chart (VIP + subsidiaries)', section: 'entities' },
    ]
  },
  'hospitals': {
    title: 'Hospital Dependencies',
    items: [
      { action: 'When you add a hospital', deps: 'You can now create Sales (CSI) and Collections (CR) linked to it', section: null },
      { action: 'When you link to a customer', deps: 'Sales and collections will flow through the customer record for AR tracking', section: 'customers' },
    ]
  },
  'fnb-products': {
    title: 'F&B Product Dependencies',
    items: [
      { action: 'When you add an F&B product', deps: 'Set purchase_price and assign to a Warehouse for inventory tracking', section: 'warehouses' },
      { action: 'F&B products use stock_type "FNB"', deps: 'They appear separately from pharma products in inventory reports', section: null },
    ]
  },
  'data-archive': {
    title: 'Data Archive Dependencies',
    items: [
      { action: 'Before archiving', deps: 'Ensure the period is locked — archived data cannot be modified', section: 'period-locks' },
      { action: 'When you archive transactions', deps: 'They are removed from active queries but preserved in the archive collection', section: null },
    ]
  },
  'agent-settings': {
    title: 'Agent Config Dependencies',
    items: [
      { action: 'When you disable an agent', deps: 'It will stop running on its cron schedule — existing data is preserved', section: null },
      { action: 'When you change notification routing', deps: 'Only the selected roles (president/admin/finance) will receive agent alerts', section: null },
      { action: 'Use "Run Now"', deps: 'Triggers instant data gathering — results appear in the Agent Dashboard', section: null },
    ]
  },
};

function DependencyBanner({ section, onNavigate }) {
  const guide = DEPENDENCY_GUIDE[section];
  if (!guide) return null;
  return (
    <div className="ctlc-dep-banner">
      <div className="ctlc-dep-title">{guide.title}</div>
      {guide.items.map((item, i) => (
        <div key={i} className="ctlc-dep-item">
          <span className="ctlc-dep-action">{item.action}:</span>{' '}
          <span className="ctlc-dep-desc">{item.deps}</span>
          {item.section && onNavigate && (
            <button className="ctlc-dep-link" onClick={() => onNavigate(item.section)}>Go to {item.section.replace(/-/g, ' ')}</button>
          )}
        </div>
      ))}
    </div>
  );
}

const pageStyles = `
  .ctlc-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ctlc-outer { display: flex; flex: 1; }
  .ctlc-body { flex: 1; min-width: 0; display: flex; overflow: hidden; }

  .ctlc-nav { width: 230px; flex-shrink: 0; background: var(--erp-panel, #fff); border-right: 1px solid var(--erp-border, #dbe4f0); overflow-y: auto; padding: 16px 0; }
  .ctlc-nav-title { font-size: 11px; font-weight: 700; color: var(--erp-muted, #64748b); text-transform: uppercase; letter-spacing: 0.5px; padding: 0 16px; margin-bottom: 12px; }
  .ctlc-group { margin-bottom: 4px; }
  .ctlc-group-header { display: flex; align-items: center; gap: 8px; padding: 8px 16px; cursor: pointer; font-size: 12px; font-weight: 700; color: var(--erp-text, #132238); user-select: none; transition: background .1s; border-radius: 0; }
  .ctlc-group-header:hover { background: var(--erp-accent-soft, #e8efff); }
  .ctlc-group-header svg { width: 16px; height: 16px; color: var(--erp-muted); }
  .ctlc-group-items { }
  .ctlc-item { display: flex; align-items: center; gap: 8px; padding: 7px 16px 7px 36px; cursor: pointer; font-size: 13px; color: var(--erp-text); transition: all .1s; border-left: 3px solid transparent; }
  .ctlc-item:hover { background: var(--erp-accent-soft, #e8efff); }
  .ctlc-item.ctlc-active { background: var(--erp-accent-soft, #e8efff); color: var(--erp-accent, #1e5eff); font-weight: 600; border-left-color: var(--erp-accent, #1e5eff); }
  .ctlc-item svg { width: 14px; height: 14px; }

  .ctlc-content { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; }
  .ctlc-content > div { max-width: 1200px; margin: 0 auto; }
  .ctlc-loading { text-align: center; padding: 60px; color: var(--erp-muted); font-size: 14px; }

  /* Mobile: collapse nav to top selector */
  .ctlc-mobile-select { display: none; padding: 12px 16px; background: var(--erp-panel); border-bottom: 1px solid var(--erp-border); }
  .ctlc-mobile-select select { width: 100%; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--erp-border); font-size: 13px; background: var(--erp-bg); }

  /* Dependency banner */
  .ctlc-dep-banner { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; font-size: 12px; line-height: 1.7; }
  .ctlc-dep-title { font-size: 12px; font-weight: 700; color: #1e40af; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
  .ctlc-dep-item { color: #334155; margin-bottom: 2px; }
  .ctlc-dep-action { font-weight: 600; color: #1e40af; }
  .ctlc-dep-desc { color: #475569; }
  .ctlc-dep-link { background: none; border: none; color: #2563eb; cursor: pointer; font-size: 11px; font-weight: 600; text-decoration: underline; margin-left: 6px; padding: 0; }
  .ctlc-dep-link:hover { color: #1d4ed8; }
  body.dark-mode .ctlc-dep-banner { background: #1e293b; border-color: #334155; }
  body.dark-mode .ctlc-dep-title { color: #93c5fd; }
  body.dark-mode .ctlc-dep-action { color: #93c5fd; }
  body.dark-mode .ctlc-dep-desc { color: #94a3b8; }
  body.dark-mode .ctlc-dep-link { color: #60a5fa; }

  @media(max-width: 768px) {
    .ctlc-nav { display: none; }
    .ctlc-mobile-select { display: block; }
    .ctlc-content { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .ctlc-dep-banner { padding: 10px 12px; font-size: 11px; line-height: 1.6; margin-bottom: 12px; }
    .ctlc-dep-item { display: flex; flex-wrap: wrap; gap: 2px; }
    .ctlc-dep-link { display: inline-block; margin-top: 2px; margin-left: 0; font-size: 11px; }
  }
  @media(max-width: 375px) {
    .ctlc-content { padding: 8px; }
    .ctlc-dep-banner { padding: 8px 10px; font-size: 10.5px; }
  }
`;

export default function ControlCenter() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [expandedGroups, setExpandedGroups] = useState(() => {
    // Expand all groups by default
    return CATEGORY_CONFIG.reduce((acc, cat) => ({ ...acc, [cat.id]: true }), {});
  });

  const activeSection = searchParams.get('section') || 'foundation-health';

  const setActiveSection = (key) => {
    setSearchParams({ section: key }, { replace: true });
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const ActiveComponent = SECTIONS[activeSection];

  // Build flat list for mobile select
  const allItems = useMemo(() => {
    const items = [];
    CATEGORY_CONFIG.forEach(cat => {
      cat.items.forEach(item => {
        items.push({ key: item.key, label: `${cat.label} > ${item.label}` });
      });
    });
    return items;
  }, []);

  return (
    <div className="ctlc-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="ctlc-outer">
        <Sidebar />
        <div className="ctlc-body">
          {/* Desktop: left category nav */}
          <nav className="ctlc-nav">
            <div className="ctlc-nav-title">Control Center</div>
            {CATEGORY_CONFIG.map(cat => {
              const CatIcon = cat.icon;
              const isExpanded = expandedGroups[cat.id];
              return (
                <div className="ctlc-group" key={cat.id}>
                  <div className="ctlc-group-header" onClick={() => toggleGroup(cat.id)}>
                    <CatIcon />
                    <span>{cat.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--erp-muted)' }}>{isExpanded ? '▾' : '▸'}</span>
                  </div>
                  {isExpanded && (
                    <div className="ctlc-group-items">
                      {cat.items.map(item => {
                        const ItemIcon = item.icon;
                        return (
                          <div
                            key={item.key}
                            className={`ctlc-item ${activeSection === item.key ? 'ctlc-active' : ''}`}
                            onClick={() => setActiveSection(item.key)}
                          >
                            <ItemIcon />
                            <span>{item.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Mobile: dropdown selector */}
          <div className="ctlc-mobile-select">
            <select value={activeSection} onChange={e => setActiveSection(e.target.value)}>
              {allItems.map(item => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </div>

          {/* Content area */}
          <div className="ctlc-content">
            <div>
              <DependencyBanner section={activeSection} onNavigate={setActiveSection} />
              <SectionErrorBoundary key={activeSection}>
                <Suspense fallback={<div className="ctlc-loading">Loading section...</div>}>
                  {ActiveComponent ? <ActiveComponent /> : <div className="ctlc-loading">Section not found</div>}
                </Suspense>
              </SectionErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
