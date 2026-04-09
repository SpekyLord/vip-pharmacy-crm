/**
 * IncentiveTracker — Phase 28 Tiered incentive leaderboard.
 * Tier summary, BDM leaderboard with attainment bars, distance to next tier, budget advisor.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useSalesGoals from '../hooks/useSalesGoals';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

const php = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0);
const pct = (n) => `${(n || 0).toFixed(1)}%`;

const pageStyles = `
  .ict-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .ict-header { margin-bottom: 20px; }
  .ict-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .ict-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .ict-tier-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .ict-tier-card { flex: 1; min-width: 140px; border-radius: 14px; padding: 16px; text-align: center; border: 1px solid var(--erp-border, #e5e7eb); }
  .ict-tier-label { font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
  .ict-tier-budget { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
  .ict-tier-count { font-size: 11px; }
  .ict-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }
  .ict-panel h3 { font-size: 15px; font-weight: 700; color: var(--erp-text); margin: 0 0 12px; }
  .ict-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ict-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft, #eef2ff); font-weight: 600; white-space: nowrap; color: var(--erp-text); }
  .ict-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); color: var(--erp-text); white-space: nowrap; }
  .ict-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .ict-progress-track { width: 100%; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; min-width: 80px; }
  .ict-progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .ict-tier-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
  .ict-distance { font-size: 12px; color: var(--erp-accent, #2563eb); font-weight: 500; }
  .ict-advisor { background: linear-gradient(135deg, #fef3c7, #fef9c3); border: 1px solid #fde68a; border-radius: 14px; padding: 20px; margin-bottom: 16px; }
  .ict-advisor h3 { font-size: 15px; font-weight: 700; color: #92400e; margin: 0 0 12px; }
  .ict-advisor-row { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 8px; }
  .ict-advisor-stat { flex: 1; min-width: 150px; }
  .ict-advisor-label { font-size: 11px; color: #92400e; font-weight: 600; text-transform: uppercase; }
  .ict-advisor-value { font-size: 20px; font-weight: 700; color: #78350f; }
  .ict-advisor-note { font-size: 12px; color: #92400e; margin-top: 8px; font-style: italic; }
  .ict-countdown { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .ict-countdown-num { font-size: 20px; font-weight: 700; color: var(--erp-accent, #2563eb); }
  .ict-countdown-text { font-size: 13px; color: var(--erp-muted); }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .ict-main { padding: 12px; } .ict-tier-row { flex-direction: column; } }
`;

// Tier colors from Lookup metadata (database-driven, not hardcoded)
function buildTierColorMap(tiers) {
  const map = {};
  if (tiers) {
    for (const t of tiers) {
      if (t.label) map[t.label.toLowerCase()] = { bg: t.bg_color || '#dbeafe', color: t.text_color || '#1e40af' };
    }
  }
  return map;
}

function tierStyle(tier, colorMap) {
  const t = (tier || '').toLowerCase();
  const c = colorMap[t] || { bg: '#dbeafe', color: '#1e40af' };
  return { ...c, border: c.bg };
}

function attainColor(pctVal, config) {
  if (config?.attainment_green && pctVal >= config.attainment_green) return '#22c55e';
  if (config?.attainment_yellow && pctVal >= config.attainment_yellow) return '#f59e0b';
  return '#ef4444';
}

export default function IncentiveTracker() {
  const { user } = useAuth();
  const sg = useSalesGoals();

  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState(null);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sg.getIncentiveBoard();
      setBoard(res?.data || null);
    } catch (err) { showError(err, 'Failed to load incentive board'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadBoard(); }, []);

  const tiers = board?.tiers || [];
  const leaderboard = board?.board || [];
  const advisor = board?.advisor || {};
  const fiscalYear = board?.plan?.fiscal_year || new Date().getFullYear();
  const config = board?.config || {};
  const colorMap = buildTierColorMap(tiers);

  // Fiscal year countdown: months remaining in FY
  const now = new Date();
  const fyEnd = new Date(fiscalYear, 11, 31); // Assuming calendar year
  const monthsRemaining = Math.max(0, (fyEnd.getFullYear() - now.getFullYear()) * 12 + (fyEnd.getMonth() - now.getMonth()));

  const isPresident = user?.role === 'president';

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{pageStyles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="ict-main">
          <div className="ict-header">
            <h1>Incentive Tracker</h1>
            <p>Tiered incentive leaderboard for FY {fiscalYear}</p>
            <div style={{ marginTop: 10 }}>
              <Link to="/erp/sales-goals" style={{ fontSize: 13, color: 'var(--erp-accent)' }}>
                Back to Dashboard
              </Link>
            </div>
          </div>

          <WorkflowGuide pageKey="incentiveTracker" />

          {loading && <div className="loading">Loading incentive data...</div>}

          {!loading && !board && (
            <div className="ict-panel" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--erp-muted)', fontSize: 14 }}>
                No incentive data available. Set up a sales goal plan with incentive programs first.
              </p>
            </div>
          )}

          {!loading && board && (
            <>
              {/* Fiscal Year Countdown */}
              <div className="ict-countdown">
                <span className="ict-countdown-num">{monthsRemaining}</span>
                <span className="ict-countdown-text">month{monthsRemaining !== 1 ? 's' : ''} remaining in FY {fiscalYear}</span>
              </div>

              {/* Tier Summary Cards */}
              {tiers.length > 0 && (
                <div className="ict-tier-row">
                  {tiers.map((t, i) => {
                    const ts = tierStyle(t.label, colorMap);
                    return (
                      <div key={t.tier_label || i} className="ict-tier-card" style={{ background: ts.bg, borderColor: ts.border }}>
                        <div className="ict-tier-label" style={{ color: ts.color }}>{t.tier_label}</div>
                        <div className="ict-tier-budget" style={{ color: ts.color }}>{php(t.budget)}</div>
                        <div className="ict-tier-count" style={{ color: ts.color }}>
                          {t.bdm_count || 0} BDM{(t.bdm_count || 0) !== 1 ? 's' : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Budget Advisor Panel — president only */}
              {isPresident && (
                <div className="ict-advisor">
                  <h3>Budget Advisor</h3>
                  <div className="ict-advisor-row">
                    <div className="ict-advisor-stat">
                      <div className="ict-advisor-label">Revenue YTD</div>
                      <div className="ict-advisor-value">{php(advisor.revenue_ytd)}</div>
                    </div>
                    <div className="ict-advisor-stat">
                      <div className="ict-advisor-label">Total Incentive Spend</div>
                      <div className="ict-advisor-value">{php(advisor.total_incentive_spend)}</div>
                    </div>
                    <div className="ict-advisor-stat">
                      <div className="ict-advisor-label">Incentive-to-Revenue %</div>
                      <div className="ict-advisor-value">{pct(advisor.incentive_to_revenue_pct)}</div>
                    </div>
                  </div>
                  <div className="ict-advisor-note">
                    Adjust tier budgets in Control Center &rarr; Lookup Manager &rarr; INCENTIVE_TIER
                  </div>
                </div>
              )}

              {/* BDM Leaderboard */}
              <div className="ict-panel">
                <h3>BDM Leaderboard</h3>
                {leaderboard.length === 0 ? (
                  <p style={{ color: 'var(--erp-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                    No BDM incentive data available yet.
                  </p>
                ) : (
                  <table className="ict-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>BDM Name</th>
                        <th>Territory</th>
                        <th>Sales Target</th>
                        <th>Sales Actual</th>
                        <th>Attainment</th>
                        <th>Progress</th>
                        <th>Current Tier</th>
                        <th>Budget</th>
                        <th>Projected Tier</th>
                        <th>Distance to Next</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((row, i) => {
                        const att = row.attainment_pct || 0;
                        const color = attainColor(att, config);
                        const ts = tierStyle(row.current_tier, colorMap);
                        const pts = tierStyle(row.projected_tier, colorMap);
                        return (
                          <tr key={row.bdm_id || i}>
                            <td className="num" style={{ fontWeight: 700 }}>{row.rank || i + 1}</td>
                            <td>
                              <Link to={`/erp/sales-goals/bdm/${row.bdm_id}`} style={{ color: 'var(--erp-accent)', textDecoration: 'none', fontWeight: 600 }}>
                                {row.bdm_name || 'Unknown'}
                              </Link>
                            </td>
                            <td>{row.territory || '-'}</td>
                            <td className="num">{php(row.sales_target)}</td>
                            <td className="num">{php(row.sales_actual)}</td>
                            <td className="num" style={{ color, fontWeight: 600 }}>{pct(att)}</td>
                            <td>
                              <div className="ict-progress-track">
                                <div className="ict-progress-fill" style={{
                                  width: `${Math.min(att, 100)}%`,
                                  background: color,
                                }} />
                              </div>
                            </td>
                            <td>
                              <span className="ict-tier-badge" style={{ background: ts.bg, color: ts.color }}>
                                {row.current_tier || 'N/A'}
                              </span>
                            </td>
                            <td className="num">{php(row.budget)}</td>
                            <td>
                              <span className="ict-tier-badge" style={{ background: pts.bg, color: pts.color }}>
                                {row.projected_tier || '-'}
                              </span>
                            </td>
                            <td>
                              {row.amount_to_next_tier > 0 ? (
                                <span className="ict-distance">{php(row.amount_to_next_tier)} more</span>
                              ) : (
                                <span style={{ color: '#22c55e', fontWeight: 600, fontSize: 12 }}>Top Tier</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
