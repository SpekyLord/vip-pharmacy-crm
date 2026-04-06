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
  Stethoscope, ShoppingCart
} from 'lucide-react';

// Lazy-load section content components
const SECTIONS = {
  'foundation-health': lazy(() => import('./FoundationHealth')),
  'entities': lazy(() => import('./EntityManager')),
  'people': lazy(() => import('./PeopleList').then(m => ({ default: m.PeopleListContent }))),
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
      { key: 'products', label: 'Products', icon: ShoppingCart }
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

  @media(max-width: 768px) {
    .ctlc-nav { display: none; }
    .ctlc-mobile-select { display: block; }
    .ctlc-content { padding: 16px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
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
