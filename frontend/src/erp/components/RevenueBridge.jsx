/**
 * RevenueBridge — Phase G10.C (Revenue Bridge Summary widget)
 *
 * Reads the GROWTH_DRIVER lookup + aggregates tasks by driver × status to
 * show the POA's "Revenue Bridge" table inside the ERP. Each row =
 * driver label + revenue band + task counts (open / in-progress / blocked
 * / done / cancelled) + % complete + contribution-to-goal placeholder.
 *
 * Total row at the bottom sums the revenue-band midpoints and cross-
 * references the 10M increment target (hardcoded display string only —
 * the 10M figure is stable policy; admins can edit the target via the
 * Settings lookup when they need to).
 *
 * KPI actuals (revenue per accredited hospital, SKUs listed, etc.) are
 * NOT wired here — that belongs to a later phase when the KPI computation
 * cases land. This widget is deliberately task-progress focused so that
 * it ships day one and starts accumulating operator habit.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import useErpApi from '../hooks/useErpApi';
import { showError } from '../utils/errorToast';

const styles = `
  .rbg-wrap { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border,#e5e7eb); border-radius: 12px; padding: 16px; }
  .rbg-title { font-size: 15px; font-weight: 700; margin: 0 0 4px; color: var(--erp-text,#111); }
  .rbg-sub { font-size: 12px; color: var(--erp-muted,#6b7280); margin: 0 0 14px; }
  .rbg-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .rbg-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft,#eef2ff); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--erp-text,#111); }
  .rbg-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border,#e5e7eb); color: var(--erp-text,#111); }
  .rbg-table tr.total td { background: var(--erp-accent-soft,#eef2ff); font-weight: 700; font-size: 13px; }
  .rbg-pill { display: inline-block; padding: 1px 6px; border-radius: 6px; font-size: 10px; font-weight: 600; letter-spacing: 0.02em; margin-right: 3px; }
  .rbg-pill.OPEN { background: #dbeafe; color: #1e40af; }
  .rbg-pill.IN_PROGRESS { background: #fef3c7; color: #92400e; }
  .rbg-pill.BLOCKED { background: #fee2e2; color: #991b1b; }
  .rbg-pill.DONE { background: #dcfce7; color: #166534; }
  .rbg-pill.CANCELLED { background: #f3f4f6; color: #4b5563; }
  .rbg-bar { position: relative; width: 100px; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
  .rbg-bar > span { position: absolute; top: 0; left: 0; bottom: 0; background: var(--erp-status-done, #22c55e); border-radius: 4px; transition: width 200ms ease; }
  .rbg-empty { padding: 30px; text-align: center; color: var(--erp-muted,#6b7280); font-size: 12px; font-style: italic; }
  @media (max-width: 640px) {
    .rbg-table th, .rbg-table td { padding: 6px; font-size: 11px; }
    .rbg-bar { width: 60px; }
  }
`;

function formatBand(meta) {
  if (!meta) return '—';
  const min = Number(meta.revenue_band_min), max = Number(meta.revenue_band_max);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return '—';
  if (min === max) return `${min}M`;
  return `${min}\u2013${max}M`;
}
function bandMidpoint(meta) {
  if (!meta) return 0;
  const min = Number(meta.revenue_band_min), max = Number(meta.revenue_band_max);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return 0;
  if (!Number.isFinite(max)) return min;
  if (!Number.isFinite(min)) return max;
  return (min + max) / 2;
}

const TARGET_INCREMENT_M = 10; // POA: PHP 25M → PHP 35M (+PHP 10M)

export default function RevenueBridge({ goalPeriod }) {
  const api = useErpApi();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('scope', 'all');
      if (goalPeriod) qs.set('goal_period', goalPeriod);
      const res = await api.get(`/tasks/by-driver?${qs.toString()}`);
      setGroups(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // scope=all is privileged; fall back to 'mine' silently so the widget
      // stays useful for non-admin users.
      try {
        const qs = new URLSearchParams();
        qs.set('scope', 'mine');
        if (goalPeriod) qs.set('goal_period', goalPeriod);
        const res2 = await api.get(`/tasks/by-driver?${qs.toString()}`);
        setGroups(Array.isArray(res2?.data) ? res2.data : []);
      } catch (err2) {
        showError(err2, 'Failed to load Revenue Bridge');
      }
    } finally {
      setLoading(false);
    }
  }, [api, goalPeriod]);

  useEffect(() => { fetch(); }, [fetch]);

  const rows = useMemo(() => {
    return groups
      .filter(g => g.code) // hide the unassigned-driver bucket
      .map(g => {
        const counts = { OPEN: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0, CANCELLED: 0 };
        for (const t of (g.tasks || [])) {
          if (counts[t.status] !== undefined) counts[t.status]++;
        }
        const total = g.tasks?.length || 0;
        const done = counts.DONE;
        const pct = total === 0 ? 0 : Math.round((done / total) * 100);
        const midpoint = bandMidpoint(g.metadata);
        return {
          code: g.code,
          label: g.label,
          band: formatBand(g.metadata),
          midpoint,
          counts,
          total,
          done,
          pct,
          order: g.metadata?.po_a_order ?? 99,
        };
      })
      .sort((a, b) => a.order - b.order);
  }, [groups]);

  const totalPotential = rows.reduce((acc, r) => acc + r.midpoint, 0);
  const totalTasks = rows.reduce((acc, r) => acc + r.total, 0);
  const totalDone = rows.reduce((acc, r) => acc + r.done, 0);
  const overallPct = totalTasks === 0 ? 0 : Math.round((totalDone / totalTasks) * 100);

  return (
    <>
      <style>{styles}</style>
      <div className="rbg-wrap" role="region" aria-label="Revenue Bridge Summary">
        <h3 className="rbg-title">Revenue Bridge Summary</h3>
        <p className="rbg-sub">
          POA targets a <strong>PHP {TARGET_INCREMENT_M}.0M increment</strong> (PHP 25.0M → PHP 35.0M).
          Task progress per driver below. KPI actuals will wire in once the
          computation cases ship — this view tracks execution coverage.
          {goalPeriod && <> · Period <strong>{goalPeriod}</strong></>}
        </p>

        {loading && rows.length === 0 && (
          <div className="rbg-empty">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="rbg-empty">
            No drivers configured yet. The 5 POA drivers will seed on first load.
          </div>
        )}

        {rows.length > 0 && (
          <table className="rbg-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Band</th>
                <th>Task status</th>
                <th>Progress</th>
                <th style={{ textAlign: 'right' }}>% Done</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.code}>
                  <td><strong>{r.label}</strong></td>
                  <td>{r.band}</td>
                  <td>
                    {Object.entries(r.counts).filter(([, n]) => n > 0).map(([k, n]) => (
                      <span key={k} className={`rbg-pill ${k}`}>{k.replace('_', ' ')}: {n}</span>
                    ))}
                    {r.total === 0 && <span style={{ fontStyle: 'italic', color: 'var(--erp-muted)' }}>No tasks yet</span>}
                  </td>
                  <td>
                    <div className="rbg-bar" aria-label={`${r.pct}% complete`}>
                      <span style={{ width: `${r.pct}%` }} />
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.pct}%</td>
                </tr>
              ))}
              <tr className="total">
                <td>TOTAL POTENTIAL</td>
                <td>~PHP {totalPotential.toFixed(1)}M</td>
                <td>{totalTasks} task{totalTasks === 1 ? '' : 's'}</td>
                <td>
                  <div className="rbg-bar" aria-label={`${overallPct}% complete overall`}>
                    <span style={{ width: `${overallPct}%` }} />
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>{overallPct}%</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
