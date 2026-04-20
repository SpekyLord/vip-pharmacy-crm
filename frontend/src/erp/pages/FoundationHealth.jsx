/**
 * FoundationHealth — Phase 24 (Control Center)
 *
 * Landing view for the ERP Control Center. Shows at-a-glance completeness
 * of each governance layer so president/admin/finance know what needs attention.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import useWorkingEntity from '../../hooks/useWorkingEntity';
import api from '../../services/api';

const pageStyles = `
  .fh-container { padding: 0; }
  .fh-title { font-size: 22px; font-weight: 700; color: var(--erp-text, #132238); margin: 0 0 4px; }
  .fh-subtitle { font-size: 13px; color: var(--erp-muted, #64748b); margin: 0 0 24px; }
  .fh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .fh-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 14px; padding: 20px; position: relative; overflow: hidden; transition: box-shadow .15s; }
  .fh-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.08); }
  .fh-card-link { cursor: pointer; text-align: left; font: inherit; color: inherit; width: 100%; display: block; appearance: none; }
  .fh-card-link:hover { border-color: var(--erp-accent, #1e5eff); }
  .fh-card-link:focus-visible { outline: 2px solid var(--erp-accent, #1e5eff); outline-offset: 2px; }
  .fh-card-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; }
  .fh-card h3 { font-size: 14px; font-weight: 700; margin: 0 0 8px; color: var(--erp-text); }
  .fh-card-value { font-size: 28px; font-weight: 800; color: var(--erp-accent, #1e5eff); margin: 0 0 4px; }
  .fh-card-detail { font-size: 12px; color: var(--erp-muted); line-height: 1.6; }
  .fh-card-detail strong { color: var(--erp-text); }
  .fh-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; margin-right: 4px; }
  .fh-badge-ok { background: #dcfce7; color: #166534; }
  .fh-badge-warn { background: #fef3c7; color: #92400e; }
  .fh-badge-info { background: #dbeafe; color: #1e40af; }
  .fh-loading { text-align: center; padding: 60px; color: var(--erp-muted); font-size: 14px; }
  .fh-error { text-align: center; padding: 40px; color: #dc2626; font-size: 13px; }
  @media(max-width: 768px) { .fh-grid { grid-template-columns: 1fr; } }
`;

export function FoundationHealthContent() {
  const { workingEntityId, loaded: entityLoaded } = useWorkingEntity();
  const [, setSearchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Deep-link a card to a Control Center section. Works because FoundationHealth
  // always renders inside Control Center (/erp/control-center?section=foundation-health)
  // and ControlCenter.jsx reads the section from searchParams. The Settings group
  // (which contains 'lookups') is expanded by default, so the destination is visible
  // in the nav without any extra click.
  const goToSection = (sectionKey) => {
    setSearchParams({ section: sectionKey }, { replace: true });
  };

  useEffect(() => {
    if (!entityLoaded) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const res = await api.get('/erp/control-center/health');
        if (mounted) setData(res.data?.data || null);
      } catch (err) {
        if (mounted) setError(err.response?.data?.message || 'Failed to load health data');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [entityLoaded, workingEntityId]);

  if (loading) return <><style>{pageStyles}</style><div className="fh-loading">Loading foundation health...</div></>;
  if (error) return <><style>{pageStyles}</style><div className="fh-error">{error}</div></>;
  if (!data) return null;

  // Null-safe destructuring with defaults
  const entities = data.entities || { count: 0, items: [] };
  const people = data.people || { total: 0, active: 0 };
  const access_templates = data.access_templates || 0;
  const coa = data.coa || { total: 0, breakdown: {} };
  const bank_accounts = data.bank_accounts || 0;
  const credit_cards = data.credit_cards || 0;
  const government_rates = data.government_rates || {};
  const warehouses = data.warehouses || 0;
  const period_locks = data.period_locks || { current_month_locked: 0, current_month_open: 0, total_modules: 10 };
  const lookups = data.lookups || { categories_configured: 0, total_available: 16 };
  const settings = data.settings || { last_updated: null };

  const cards = [
    {
      title: 'Entities',
      section: 'entities',
      value: entities.count,
      color: '#6366f1',
      detail: entities.items.map(e => `${e.short_name || e.entity_name} (${e.entity_type})`).join(', ') || 'No entities configured',
      badge: entities.count > 0 ? 'ok' : 'warn',
      badgeText: entities.count > 0 ? 'Active' : 'Setup needed'
    },
    {
      title: 'People Master',
      section: 'people',
      value: people.active,
      color: '#0ea5e9',
      detail: `${people.total} total, ${people.active} active`,
      badge: people.active > 0 ? 'ok' : 'warn',
      badgeText: people.active > 0 ? `${people.active} active` : 'No people'
    },
    {
      title: 'Access Templates',
      section: 'access-templates',
      value: access_templates,
      color: '#8b5cf6',
      detail: `${access_templates} template${access_templates !== 1 ? 's' : ''} configured for role-based module access`,
      badge: access_templates > 0 ? 'ok' : 'warn',
      badgeText: access_templates > 0 ? 'Configured' : 'Setup needed'
    },
    {
      title: 'Chart of Accounts',
      section: 'coa',
      value: coa.total,
      color: '#10b981',
      detail: Object.entries(coa.breakdown || {}).map(([type, count]) => `${count} ${type}`).join(', ') || 'No accounts',
      badge: coa.total > 0 ? 'ok' : 'warn',
      badgeText: coa.total > 0 ? `${coa.total} accounts` : 'Setup needed'
    },
    {
      title: 'Bank Accounts',
      section: 'bank-accounts',
      value: bank_accounts,
      color: '#f59e0b',
      detail: `${bank_accounts} active bank account${bank_accounts !== 1 ? 's' : ''}`,
      badge: bank_accounts > 0 ? 'ok' : 'warn',
      badgeText: bank_accounts > 0 ? 'Active' : 'Setup needed'
    },
    {
      title: 'Credit Cards',
      section: 'credit-cards',
      value: credit_cards,
      color: '#ef4444',
      detail: `${credit_cards} active card${credit_cards !== 1 ? 's' : ''}`,
      badge: credit_cards > 0 ? 'info' : 'info',
      badgeText: credit_cards > 0 ? 'Active' : 'None'
    },
    {
      title: 'Government Rates',
      section: 'government-rates',
      value: Object.values(government_rates).reduce((s, c) => s + c, 0),
      color: '#14b8a6',
      detail: Object.entries(government_rates).map(([type, count]) => `${type}: ${count}`).join(', ') || 'No rates configured',
      badge: Object.keys(government_rates).length > 0 ? 'ok' : 'warn',
      badgeText: Object.keys(government_rates).length > 0 ? 'Configured' : 'Setup needed'
    },
    {
      title: 'Warehouses',
      section: 'warehouses',
      value: warehouses,
      color: '#f97316',
      detail: `${warehouses} active warehouse${warehouses !== 1 ? 's' : ''}`,
      badge: warehouses > 0 ? 'ok' : 'warn',
      badgeText: warehouses > 0 ? 'Active' : 'Setup needed'
    },
    {
      title: 'Period Locks',
      section: 'period-locks',
      value: `${period_locks.current_month_open}/${period_locks.total_modules}`,
      color: '#ec4899',
      detail: `Current month: ${period_locks.current_month_open} open, ${period_locks.current_month_locked} locked`,
      badge: period_locks.current_month_locked > 0 ? 'warn' : 'ok',
      badgeText: period_locks.current_month_locked > 0 ? `${period_locks.current_month_locked} locked` : 'All open'
    },
    {
      title: 'Lookup Tables',
      section: 'lookups',
      value: `${lookups.categories_configured}/${lookups.total_available}`,
      color: '#a855f7',
      detail: `${lookups.categories_configured} of ${lookups.total_available} categories populated`,
      badge: lookups.categories_configured >= lookups.total_available ? 'ok' : 'warn',
      badgeText: lookups.categories_configured >= lookups.total_available ? 'Complete' : 'Incomplete'
    },
    {
      title: 'System Settings',
      section: 'erp-settings',
      value: settings.last_updated ? 'Active' : 'Default',
      color: '#64748b',
      detail: settings.last_updated ? `Last updated: ${new Date(settings.last_updated).toLocaleDateString()}` : 'Using system defaults — review recommended',
      badge: settings.last_updated ? 'ok' : 'warn',
      badgeText: settings.last_updated ? 'Customized' : 'Defaults'
    }
  ];

  return (
    <>
      <style>{pageStyles}</style>
      <div className="fh-container">
        <h1 className="fh-title">Foundation Health</h1>
        <p className="fh-subtitle">System structure and governance readiness at a glance. Green = configured, amber = needs attention.</p>
        <div className="fh-grid">
          {cards.map(card => {
            const body = (
              <>
                <div className="fh-card-accent" style={{ background: card.color }} />
                <h3>{card.title}</h3>
                <div className="fh-card-value" style={{ color: card.color }}>{card.value}</div>
                <div className="fh-card-detail">
                  <span className={`fh-badge fh-badge-${card.badge}`}>{card.badgeText}</span>
                  <br />
                  {card.detail}
                </div>
              </>
            );
            if (card.section) {
              return (
                <button
                  type="button"
                  className="fh-card fh-card-link"
                  key={card.title}
                  onClick={() => goToSection(card.section)}
                  title={`Go to ${card.title}`}
                >
                  {body}
                </button>
              );
            }
            return <div className="fh-card" key={card.title}>{body}</div>;
          })}
        </div>
      </div>
    </>
  );
}

export default FoundationHealthContent;
