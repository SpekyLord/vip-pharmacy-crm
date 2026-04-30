/**
 * Executive Cockpit — Phase EC-1 (Apr 2026).
 *
 * CFO/CEO/COO at-a-glance landing page at /erp/cockpit.
 * Reads from GET /api/erp/cockpit which aggregates 10 tiles via Promise.allSettled.
 * Each tile has its own loading / error / empty surface — a single backend
 * tile failure does not dark the page.
 *
 * Tiers:
 *   T1 (always shown if scope allows): Cash, AR Aging, AP Aging, Period Close,
 *                                       Approval SLA, Agent Health
 *   T2 (deeper detail):                 Margin, Inventory Turns,
 *                                       Partnership Funnel, BIR Calendar
 *
 * Click-through: every tile drills into the canonical detail page.
 * Lookup-driven scope flags arrive in `data.scopes` — tiles render conditionally.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import WorkflowGuide from '../components/WorkflowGuide';
import useCockpit from '../hooks/useCockpit';
import { showError } from '../utils/errorToast';

const styles = `
  :root {
    --cp-bg: #f4f7fb;
    --cp-panel: #ffffff;
    --cp-border: #dbe4f0;
    --cp-text: #132238;
    --cp-muted: #5f7188;
    --cp-accent: #1e5eff;
    --cp-accent-soft: #e8efff;
    --cp-good: #16a34a;
    --cp-warn: #f59e0b;
    --cp-bad: #dc2626;
  }
  body.dark-mode {
    --cp-bg: #0f172a;
    --cp-panel: #111c31;
    --cp-border: #20304f;
    --cp-text: #f8fafc;
    --cp-muted: #9fb0ca;
    --cp-accent: #7aa2ff;
    --cp-accent-soft: rgba(122,162,255,0.16);
    --cp-good: #4ade80;
    --cp-warn: #fbbf24;
    --cp-bad: #f87171;
  }
  .cp-main { flex: 1; min-width: 0; overflow-y: auto; background: var(--cp-bg); display: flex; flex-direction: column; }
  .cp-scroll { flex: 1; overflow-y: auto; padding: 16px 16px 96px; max-width: 1280px; margin: 0 auto; width: 100%; }
  .cp-header { margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .cp-header h1 { font-size: 20px; color: var(--cp-text); margin: 0 0 2px; }
  .cp-header p { color: var(--cp-muted); font-size: 13px; margin: 0; }
  .cp-meta { color: var(--cp-muted); font-size: 11px; }
  .cp-refresh { background: var(--cp-panel); border: 1px solid var(--cp-border); border-radius: 8px; padding: 6px 12px; font-size: 12px; color: var(--cp-text); cursor: pointer; }
  .cp-refresh:hover { background: var(--cp-accent-soft); border-color: var(--cp-accent); }
  .cp-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

  .cp-tier-label { font-size: 11px; font-weight: 700; color: var(--cp-muted); text-transform: uppercase; letter-spacing: 0.08em; margin: 18px 0 10px; display: flex; align-items: center; gap: 8px; }
  .cp-tier-label::after { content: ''; flex: 1; height: 1px; background: var(--cp-border); }

  .cp-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 600px) { .cp-grid { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 1024px) { .cp-grid { grid-template-columns: 1fr 1fr 1fr; } }

  .cp-tile { background: var(--cp-panel); border: 1px solid var(--cp-border); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; min-height: 130px; text-decoration: none; color: var(--cp-text); transition: transform 0.12s, box-shadow 0.12s; }
  .cp-tile:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(15,23,42,0.08); border-color: var(--cp-accent); }
  .cp-tile-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .cp-tile-title { font-size: 12px; font-weight: 700; color: var(--cp-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .cp-tile-icon { font-size: 18px; line-height: 1; }
  .cp-tile-value { font-size: 22px; font-weight: 700; color: var(--cp-text); font-variant-numeric: tabular-nums; line-height: 1.1; }
  .cp-tile-sub { font-size: 11px; color: var(--cp-muted); margin-top: 4px; }
  .cp-tile-footer { font-size: 11px; color: var(--cp-muted); margin-top: auto; padding-top: 8px; border-top: 1px dashed var(--cp-border); }
  .cp-tile-footer strong { color: var(--cp-text); }

  .cp-good { color: var(--cp-good); }
  .cp-warn { color: var(--cp-warn); }
  .cp-bad { color: var(--cp-bad); }

  .cp-error-tile { border-color: var(--cp-bad); background: color-mix(in srgb, var(--cp-bad) 6%, var(--cp-panel)); }
  .cp-error-msg { font-size: 11px; color: var(--cp-bad); margin-top: 6px; word-break: break-word; }

  .cp-banner { background: var(--cp-accent-soft); border: 1px solid var(--cp-accent); border-radius: 12px; padding: 10px 14px; font-size: 12px; color: var(--cp-text); margin-bottom: 12px; }
  .cp-banner-warn { background: color-mix(in srgb, var(--cp-warn) 12%, var(--cp-panel)); border-color: var(--cp-warn); }

  .cp-mini-list { font-size: 11px; color: var(--cp-muted); margin-top: 6px; line-height: 1.5; }
  .cp-mini-list-item { display: flex; justify-content: space-between; gap: 8px; }
  .cp-mini-list-item strong { color: var(--cp-text); font-weight: 600; }

  .cp-progress { background: var(--cp-border); height: 6px; border-radius: 3px; overflow: hidden; margin-top: 6px; }
  .cp-progress-fill { height: 100%; background: var(--cp-accent); transition: width 0.3s; }

  @media (max-width: 768px) {
    .cp-main { padding-top: 56px; }
    .cp-tile-value { font-size: 18px; }
  }
`;

function fmtPHP(n, opts = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const { compact = false, decimals = 0 } = opts;
  if (compact && Math.abs(n) >= 1_000_000) {
    return '₱' + (n / 1_000_000).toFixed(1) + 'M';
  }
  if (compact && Math.abs(n) >= 1_000) {
    return '₱' + (n / 1_000).toFixed(0) + 'K';
  }
  return '₱' + Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toFixed(1) + '%';
}

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString();
}

function fmtRelative(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / 3600000;
  if (h < 1) return Math.round(ms / 60000) + ' min ago';
  if (h < 24) return Math.round(h) + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

// ─── Tile components ─────────────────────────────────────────────────────────

function TileShell({ title, icon, status, message, footer, children, to }) {
  const Wrap = to ? Link : 'div';
  const wrapProps = to ? { to } : {};
  return (
    <Wrap {...wrapProps} className={`cp-tile ${status === 'error' ? 'cp-error-tile' : ''}`}>
      <div className="cp-tile-head">
        <div className="cp-tile-title">{title}</div>
        <div className="cp-tile-icon">{icon}</div>
      </div>
      {status === 'error' ? (
        <>
          <div className="cp-tile-value cp-bad">—</div>
          <div className="cp-error-msg">⚠ {message || 'Tile failed to load'}</div>
        </>
      ) : (
        children
      )}
      {footer && <div className="cp-tile-footer">{footer}</div>}
    </Wrap>
  );
}

function CashTile({ tile }) {
  const v = tile?.value || {};
  return (
    <TileShell title="Cash Position" icon="💵" status={tile?.status} message={tile?.message} to="/erp/banking" footer={<>Across <strong>{v.bank_account_count || 0}</strong> bank accts + <strong>{v.petty_fund_count || 0}</strong> petty funds</>}>
      <div className="cp-tile-value">{fmtPHP(v.grand_total, { compact: true })}</div>
      <div className="cp-tile-sub">Bank {fmtPHP(v.bank_total, { compact: true })} · Petty {fmtPHP(v.petty_cash_total, { compact: true })}</div>
      {v.top_accounts?.length > 0 && (
        <div className="cp-mini-list">
          {v.top_accounts.map((a, i) => (
            <div key={i} className="cp-mini-list-item">
              <span>{a.bank_name}</span><strong>{fmtPHP(a.balance, { compact: true })}</strong>
            </div>
          ))}
        </div>
      )}
    </TileShell>
  );
}

function ArAgingTile({ tile }) {
  const v = tile?.value || {};
  const over90Class = v.over_90_pct >= 20 ? 'cp-bad' : v.over_90_pct >= 10 ? 'cp-warn' : 'cp-good';
  return (
    <TileShell title="AR Aging" icon="📥" status={tile?.status} message={tile?.message} to="/erp/collections/ar" footer={<>Over 90 d: <strong className={over90Class}>{fmtPct(v.over_90_pct)}</strong></>}>
      <div className="cp-tile-value">{fmtPHP(v.total, { compact: true })}</div>
      <div className="cp-tile-sub">Current {fmtPHP(v.buckets?.current, { compact: true })} · 30 {fmtPHP(v.buckets?.d_30, { compact: true })} · 60+ {fmtPHP((v.buckets?.d_60 || 0) + (v.buckets?.d_90 || 0) + (v.buckets?.d_120 || 0), { compact: true })}</div>
      {v.top_overdue?.length > 0 && (
        <div className="cp-mini-list">
          {v.top_overdue.map((h, i) => (
            <div key={i} className="cp-mini-list-item">
              <span>{h.hospital_name}</span><strong>{fmtPHP(h.outstanding, { compact: true })}</strong>
            </div>
          ))}
        </div>
      )}
    </TileShell>
  );
}

function ApAgingTile({ tile }) {
  const v = tile?.value || {};
  const over90Class = v.over_90_pct >= 20 ? 'cp-bad' : v.over_90_pct >= 10 ? 'cp-warn' : 'cp-good';
  return (
    <TileShell title="AP Aging" icon="📤" status={tile?.status} message={tile?.message} to="/erp/purchasing/ap" footer={<>{fmtNum(v.invoice_count)} invoices · over 90 d: <strong className={over90Class}>{fmtPct(v.over_90_pct)}</strong></>}>
      <div className="cp-tile-value">{fmtPHP(v.total, { compact: true })}</div>
      <div className="cp-tile-sub">Current {fmtPHP(v.buckets?.current, { compact: true })} · 30 {fmtPHP(v.buckets?.d_30, { compact: true })} · 60+ {fmtPHP((v.buckets?.d_60 || 0) + (v.buckets?.d_90 || 0) + (v.buckets?.d_120 || 0), { compact: true })}</div>
      {v.top_overdue?.length > 0 && (
        <div className="cp-mini-list">
          {v.top_overdue.map((h, i) => (
            <div key={i} className="cp-mini-list-item">
              <span>{h.vendor_name}</span><strong>{fmtPHP(h.outstanding, { compact: true })}</strong>
            </div>
          ))}
        </div>
      )}
    </TileShell>
  );
}

function PeriodCloseTile({ tile }) {
  const v = tile?.value || {};
  const pctClass = v.steps_errored > 0 ? 'cp-bad' : v.pct_complete >= 100 ? 'cp-good' : 'cp-warn';
  return (
    <TileShell title="Period Close" icon="📅" status={tile?.status} message={tile?.message} to={`/erp/month-end-close/${v.period || ''}`} footer={<>Period <strong>{v.period || '—'}</strong> · {v.period_status || 'OPEN'}</>}>
      <div className={`cp-tile-value ${pctClass}`}>{v.pct_complete}%</div>
      <div className="cp-tile-sub">{v.steps_completed}/{v.steps_total} steps complete{v.steps_errored ? ` · ${v.steps_errored} error${v.steps_errored > 1 ? 's' : ''}` : ''}</div>
      <div className="cp-progress"><div className="cp-progress-fill" style={{ width: `${v.pct_complete || 0}%`, background: v.steps_errored > 0 ? 'var(--cp-bad)' : 'var(--cp-accent)' }} /></div>
    </TileShell>
  );
}

function ApprovalSlaTile({ tile }) {
  const v = tile?.value || {};
  const breachedClass = v.breached_sla > 0 ? 'cp-bad' : 'cp-good';
  return (
    <TileShell title="Approval Queue" icon="✅" status={tile?.status} message={tile?.message} to="/erp/approvals" footer={<>Oldest: <strong>{v.oldest_age_hours}h</strong> · SLA <strong>{v.sla_hours}h</strong></>}>
      <div className="cp-tile-value">{fmtNum(v.pending_count)}</div>
      <div className="cp-tile-sub"><span className={breachedClass}>{fmtNum(v.breached_sla)} breached SLA</span></div>
      {v.by_module?.length > 0 && (
        <div className="cp-mini-list">
          {v.by_module.slice(0, 3).map((m, i) => (
            <div key={i} className="cp-mini-list-item">
              <span>{m.module}</span><strong>{m.count}</strong>
            </div>
          ))}
        </div>
      )}
    </TileShell>
  );
}

function AgentHealthTile({ tile }) {
  const v = tile?.value || {};
  const failingClass = v.agents_failing > 0 ? 'cp-bad' : v.agents_stale > 0 ? 'cp-warn' : 'cp-good';
  return (
    <TileShell title="Agent Health" icon="🤖" status={tile?.status} message={tile?.message} to="/erp/agent-dashboard" footer={<>{fmtNum(v.total_alerts_30d)} alerts (30d)</>}>
      <div className={`cp-tile-value ${failingClass}`}>{fmtNum(v.agents_total)}</div>
      <div className="cp-tile-sub"><span className="cp-bad">{v.agents_failing || 0} failing</span> · <span className="cp-warn">{v.agents_stale || 0} stale</span></div>
      {v.agents?.length > 0 && (
        <div className="cp-mini-list">
          {v.agents.slice(0, 3).map((a, i) => {
            const cls = a.last_status === 'FAILURE' ? 'cp-bad' : a.last_status === 'SUCCESS' ? 'cp-good' : 'cp-muted';
            return (
              <div key={i} className="cp-mini-list-item">
                <span>{a.agent_key}</span><strong className={cls}>{a.last_status || '—'} · {fmtRelative(a.last_run)}</strong>
              </div>
            );
          })}
        </div>
      )}
    </TileShell>
  );
}

function MarginTile({ tile }) {
  const v = tile?.value || {};
  const marginClass = v.gross_margin_pct >= 30 ? 'cp-good' : v.gross_margin_pct >= 15 ? 'cp-warn' : 'cp-bad';
  return (
    <TileShell title="Gross Margin (MTD)" icon="📊" status={tile?.status} message={tile?.message} to="/erp/pnl" footer={<>Sales <strong>{fmtPHP(v.sales_mtd, { compact: true })}</strong> · DSO <strong>{v.dso} d</strong></>}>
      <div className={`cp-tile-value ${marginClass}`}>{fmtPct(v.gross_margin_pct)}</div>
      <div className="cp-tile-sub">Collection rate {fmtPct(v.collection_rate)}</div>
    </TileShell>
  );
}

function InventoryTurnsTile({ tile }) {
  const v = tile?.value || {};
  const dohClass = v.days_on_hand !== null && v.days_on_hand <= 60 ? 'cp-good' : v.days_on_hand !== null && v.days_on_hand <= 120 ? 'cp-warn' : 'cp-bad';
  return (
    <TileShell title="Inventory Turns" icon="📦" status={tile?.status} message={tile?.message} to="/erp/my-stock" footer={<>{fmtNum(v.on_hand_units)} units on hand · MTD out {fmtNum(v.mtd_outflow_units)}</>}>
      <div className="cp-tile-value">{v.annualized_turns || '—'}x</div>
      <div className="cp-tile-sub">Days on hand: <span className={dohClass}>{v.days_on_hand !== null ? fmtNum(v.days_on_hand) : '—'} d</span></div>
    </TileShell>
  );
}

function PartnershipFunnelTile({ tile }) {
  const v = tile?.value || {};
  const s = v.by_status || {};
  return (
    <TileShell title="MD Partnership Funnel" icon="🤝" status={tile?.status} message={tile?.message} to="/admin/md-leads" footer={<>Conversion <strong>{fmtPct(v.conversion_pct)}</strong> · {fmtNum(v.total_partners)} partners</>}>
      <div className="cp-tile-value">{fmtNum(v.total_active_pipeline)}</div>
      <div className="cp-tile-sub">Active pipeline (LEAD→VISITED)</div>
      <div className="cp-mini-list">
        <div className="cp-mini-list-item"><span>Lead</span><strong>{s.LEAD || 0}</strong></div>
        <div className="cp-mini-list-item"><span>Contacted</span><strong>{s.CONTACTED || 0}</strong></div>
        <div className="cp-mini-list-item"><span>Visited</span><strong>{s.VISITED || 0}</strong></div>
        <div className="cp-mini-list-item"><span>Partner</span><strong className="cp-good">{s.PARTNER || 0}</strong></div>
      </div>
    </TileShell>
  );
}

function BirCalendarTile({ tile }) {
  const v = tile?.value || {};
  const overdueClass = v.overdue > 0 ? 'cp-bad' : v.due_30d > 0 ? 'cp-warn' : 'cp-good';
  return (
    <TileShell title="BIR Calendar" icon="📑" status={tile?.status} message={tile?.message} to="/erp/bir" footer={<>{fmtNum(v.filed_this_quarter)} filed this quarter</>}>
      <div className={`cp-tile-value ${overdueClass}`}>{fmtNum(v.overdue)}</div>
      <div className="cp-tile-sub">overdue · {fmtNum(v.due_30d)} due in 30 d</div>
      {v.upcoming?.length > 0 && (
        <div className="cp-mini-list">
          {v.upcoming.slice(0, 3).map((f, i) => (
            <div key={i} className="cp-mini-list-item">
              <span>{f.form_code} · {f.period}</span><strong>{f.due_date ? new Date(f.due_date).toLocaleDateString() : '—'}</strong>
            </div>
          ))}
        </div>
      )}
    </TileShell>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const TILE_RENDERERS = {
  cash: CashTile,
  ar_aging: ArAgingTile,
  ap_aging: ApAgingTile,
  period_close: PeriodCloseTile,
  approval_sla: ApprovalSlaTile,
  agent_health: AgentHealthTile,
  margin: MarginTile,
  inventory_turns: InventoryTurnsTile,
  partnership_funnel: PartnershipFunnelTile,
  bir_calendar: BirCalendarTile,
};

const TIER_1_ORDER = ['cash', 'ar_aging', 'ap_aging', 'period_close', 'approval_sla', 'agent_health'];
const TIER_2_ORDER = ['margin', 'inventory_turns', 'partnership_funnel', 'bir_calendar'];

export default function ExecutiveCockpit() {
  const cockpit = useCockpit();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await cockpit.getCockpit();
      setData(res?.data || null);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load cockpit';
      setError(msg);
      if (!isRefresh) showError(err, msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // 60-second auto-refresh — keeps the cockpit fresh without hammering the
    // backend. Tiles change slowly relative to ERP transactions; 60 s is a
    // good compromise between freshness and load.
    const interval = setInterval(() => load(true), 60_000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tiles = data?.tiles || {};
  const scopes = data?.scopes || {};
  const renderTile = (code) => {
    const tile = tiles[code];
    if (!tile) return null;
    const Renderer = TILE_RENDERERS[code];
    if (!Renderer) return null;
    return <Renderer key={code} tile={tile} />;
  };

  const t1Tiles = TIER_1_ORDER.filter((c) => tiles[c]);
  const t2Tiles = TIER_2_ORDER.filter((c) => tiles[c]);

  return (
    <div className="admin-page erp-page">
      <style>{styles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="cp-main">
          <div className="cp-scroll">
            <WorkflowGuide pageKey="cockpit" />

            <div className="cp-header">
              <div>
                <h1>Executive Cockpit</h1>
                <p>CFO · CEO · COO daily roll-up</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {data?.generated_at && (
                  <span className="cp-meta">Updated {fmtRelative(data.generated_at)}</span>
                )}
                <button className="cp-refresh" onClick={() => load(true)} disabled={loading || refreshing}>
                  {refreshing ? '⟳' : '↻'} Refresh
                </button>
              </div>
            </div>

            {!loading && !scopes.financial && !scopes.operational && (
              <div className="cp-banner cp-banner-warn">
                You can see this page but no tile scopes are granted. Ask admin to add your role to <strong>VIEW_FINANCIAL</strong> or <strong>VIEW_OPERATIONAL</strong> in EXECUTIVE_COCKPIT_ROLES (Control Center → Lookup Tables).
              </div>
            )}

            {error && !data && (
              <div className="cp-banner cp-banner-warn">
                ⚠ Could not load cockpit: {error}
              </div>
            )}

            {loading && !data && (
              <div className="cp-banner">Loading executive metrics…</div>
            )}

            {t1Tiles.length > 0 && (
              <>
                <div className="cp-tier-label">Tier 1 — At-a-glance</div>
                <div className="cp-grid">{t1Tiles.map(renderTile)}</div>
              </>
            )}

            {t2Tiles.length > 0 && (
              <>
                <div className="cp-tier-label">Tier 2 — Depth</div>
                <div className="cp-grid">{t2Tiles.map(renderTile)}</div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
