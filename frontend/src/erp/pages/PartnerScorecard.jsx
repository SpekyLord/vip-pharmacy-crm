/**
 * PartnerScorecard — Slide-out panel showing partner performance, graduation, and AI insights.
 * Opens from OrgChart when clicking a partner node.
 */
import { useState, useEffect } from 'react';
import useErpApi from '../hooks/useErpApi';
import WorkflowGuide from '../components/WorkflowGuide';

function scoreColor(score) {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  if (score > 0) return '#ef4444';
  return '#d1d5db';
}

const panelStyles = `
  .sc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 1000; }
  .sc-panel {
    position: fixed; top: 0; right: 0; bottom: 0; width: 480px; max-width: 95vw;
    background: var(--erp-panel, #fff); z-index: 1001; overflow-y: auto;
    box-shadow: -4px 0 20px rgba(0,0,0,.15); animation: sc-slide 0.2s ease;
  }
  @keyframes sc-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
  .sc-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--erp-border, #e5e7eb); }
  .sc-header h3 { margin: 0; font-size: 16px; font-weight: 700; }
  .sc-close { background: none; border: none; font-size: 20px; cursor: pointer; color: var(--erp-muted); padding: 4px 8px; }
  .sc-tabs { display: flex; border-bottom: 1px solid var(--erp-border); }
  .sc-tab { flex: 1; padding: 10px; text-align: center; font-size: 12px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; color: var(--erp-muted); }
  .sc-tab.active { color: var(--erp-accent, #1e5eff); border-bottom-color: var(--erp-accent, #1e5eff); }
  .sc-body { padding: 16px 20px; }

  .sc-overall { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .sc-score-ring { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; color: #fff; }
  .sc-score-label { font-size: 13px; color: var(--erp-muted); }
  .sc-score-name { font-size: 16px; font-weight: 600; }
  .sc-delta { font-size: 12px; font-weight: 600; }

  .sc-bars { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
  .sc-bar-row { display: flex; align-items: center; gap: 8px; }
  .sc-bar-label { font-size: 12px; color: var(--erp-muted); width: 80px; flex-shrink: 0; }
  .sc-bar-track { flex: 1; height: 8px; background: #f3f4f6; border-radius: 4px; overflow: hidden; }
  .sc-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .sc-bar-value { font-size: 12px; font-weight: 600; width: 32px; text-align: right; }

  .sc-numbers { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; }
  .sc-num { background: #f9fafb; border-radius: 8px; padding: 10px; }
  .sc-num-value { font-size: 16px; font-weight: 700; color: var(--erp-text); }
  .sc-num-label { font-size: 11px; color: var(--erp-muted); }

  .sc-grad-ring { text-align: center; margin-bottom: 16px; }
  .sc-grad-pct { font-size: 36px; font-weight: 700; }
  .sc-grad-sub { font-size: 13px; color: var(--erp-muted); }
  .sc-grad-banner { background: #dcfce7; color: #166534; padding: 10px 16px; border-radius: 8px; text-align: center; font-weight: 600; font-size: 14px; margin-bottom: 12px; }
  .sc-criteria { display: flex; flex-direction: column; gap: 8px; }
  .sc-crit-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .sc-crit-icon { font-size: 16px; width: 20px; flex-shrink: 0; }
  .sc-crit-label { flex: 1; }
  .sc-crit-vals { font-size: 12px; color: var(--erp-muted); text-align: right; }

  .sc-insights { display: flex; flex-direction: column; gap: 10px; }
  .sc-insight-card { background: #f9fafb; border-radius: 8px; padding: 12px; border-left: 3px solid #d1d5db; }
  .sc-insight-card.warning { border-left-color: #f59e0b; }
  .sc-insight-card.critical { border-left-color: #ef4444; }
  .sc-insight-agent { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .sc-insight-msg { font-size: 13px; margin-top: 4px; color: var(--erp-text); }
  .sc-insight-date { font-size: 10px; color: var(--erp-muted); margin-top: 4px; }

  .sc-empty { text-align: center; color: #64748b; padding: 30px; font-size: 13px; }
  .sc-trend { display: flex; gap: 4px; align-items: end; height: 40px; margin-top: 8px; }
  .sc-trend-bar { width: 14px; border-radius: 2px 2px 0 0; }

  @media(max-width: 768px) {
    .sc-panel { width: 100vw; max-width: 100vw; }
  }
`;

function ScoreBar({ label, value, color }) {
  return (
    <div className="sc-bar-row">
      <div className="sc-bar-label">{label}</div>
      <div className="sc-bar-track">
        <div className="sc-bar-fill" style={{ width: `${Math.min(100, value)}%`, background: color || scoreColor(value) }} />
      </div>
      <div className="sc-bar-value" style={{ color: scoreColor(value) }}>{value}</div>
    </div>
  );
}

export default function PartnerScorecard({ personId, onClose }) {
  const { get: erpGet } = useErpApi();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('performance');

  useEffect(() => {
    if (!personId) return;
    setLoading(true);
    erpGet(`/scorecards/${personId}`)
      .then(res => setData(res.data?.data || res.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [personId, erpGet]);

  const sc = data?.current;
  const history = data?.history || [];
  const person = sc?.person_id;
  const grad = sc?.graduation;
  const insights = sc?.ai_insights || [];

  // Trend from history
  const prevScore = history.length > 1 ? history[1]?.score_overall : null;
  const delta = prevScore !== null && sc ? sc.score_overall - prevScore : null;

  return (
    <>
      <style>{panelStyles}</style>
      <div className="sc-overlay" onClick={onClose} />
      <div className="sc-panel">
        <div className="sc-header">
          <h3>{person?.full_name || 'Partner Scorecard'}</h3>
          <button className="sc-close" onClick={onClose}>✕</button>
        </div>

        <div className="sc-tabs">
          {['performance', 'graduation', 'insights'].map(t => (
            <div key={t} className={`sc-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'performance' ? 'Performance' : t === 'graduation' ? 'Graduation' : 'AI Insights'}
            </div>
          ))}
        </div>

        <div className="sc-body">
          <WorkflowGuide pageKey="partner-scorecard" />
          {loading && <div className="sc-empty">Loading scorecard...</div>}
          {!loading && !sc && (
            <div className="sc-empty">No scorecard data. Click &quot;Recompute Scores&quot; to generate.</div>
          )}

          {!loading && sc && tab === 'performance' && (
            <>
              <div className="sc-overall">
                <div className="sc-score-ring" style={{ background: scoreColor(sc.score_overall) }}>
                  {sc.score_overall}
                </div>
                <div>
                  <div className="sc-score-name">{person?.full_name}</div>
                  <div className="sc-score-label">
                    {person?.position || person?.person_type} · {sc.period}
                  </div>
                  {delta !== null && (
                    <div className="sc-delta" style={{ color: delta >= 0 ? '#22c55e' : '#ef4444' }}>
                      {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs last month
                    </div>
                  )}
                </div>
              </div>

              <div className="sc-bars">
                <ScoreBar label="Visits" value={sc.score_visits} />
                <ScoreBar label="Sales" value={sc.score_sales} />
                <ScoreBar label="Collections" value={sc.score_collections} />
                <ScoreBar label="Efficiency" value={sc.score_efficiency} />
                <ScoreBar label="Engagement" value={sc.score_engagement} />
              </div>

              <div className="sc-numbers">
                <div className="sc-num">
                  <div className="sc-num-value">{sc.visits_completed}/{sc.visits_expected}</div>
                  <div className="sc-num-label">Visits ({sc.visit_compliance_pct}% compliance)</div>
                </div>
                <div className="sc-num">
                  <div className="sc-num-value">₱{(sc.sales_total || 0).toLocaleString()}</div>
                  <div className="sc-num-label">{sc.sales_count} invoices</div>
                </div>
                <div className="sc-num">
                  <div className="sc-num-value">₱{(sc.collections_total || 0).toLocaleString()}</div>
                  <div className="sc-num-label">{sc.collection_rate_pct}% collection rate</div>
                </div>
                <div className="sc-num">
                  <div className="sc-num-value">{sc.expense_sales_ratio_pct}%</div>
                  <div className="sc-num-label">Expense/Sales ratio</div>
                </div>
                <div className="sc-num">
                  <div className="sc-num-value">{sc.total_clients_assigned}</div>
                  <div className="sc-num-label">Clients ({sc.clients_at_risk} at risk)</div>
                </div>
                <div className="sc-num">
                  <div className="sc-num-value">{sc.avg_engagement_level}</div>
                  <div className="sc-num-label">Avg engagement (1-5)</div>
                </div>
              </div>

              {history.length > 1 && (
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Score Trend</div>
                  <div className="sc-trend">
                    {history.slice().reverse().map((h, i) => (
                      <div
                        key={i}
                        className="sc-trend-bar"
                        style={{ height: `${Math.max(4, h.score_overall * 0.4)}px`, background: scoreColor(h.score_overall) }}
                        title={`${h.period}: ${h.score_overall}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && sc && tab === 'graduation' && (
            <>
              <div className="sc-grad-ring">
                <div className="sc-grad-pct" style={{ color: scoreColor(grad?.readiness_pct || 0) }}>
                  {grad?.checklist_met || 0}/{grad?.checklist_total || 7}
                </div>
                <div className="sc-grad-sub">Graduation Criteria Met ({grad?.readiness_pct || 0}%)</div>
              </div>

              {grad?.ready && (
                <div className="sc-grad-banner">🎓 Ready to Graduate!</div>
              )}

              <div className="sc-criteria">
                {(grad?.criteria || []).map((c, i) => (
                  <div key={i} className="sc-crit-row">
                    <div className="sc-crit-icon">{c.met ? '✅' : '❌'}</div>
                    <div className="sc-crit-label">{c.label}</div>
                    <div className="sc-crit-vals">
                      {typeof c.actual === 'number' && c.actual >= 1000
                        ? `₱${c.actual.toLocaleString()}`
                        : c.actual}
                      {' / '}
                      {c.comparator === 'lte' ? '≤' : '≥'}
                      {typeof c.target === 'number' && c.target >= 1000
                        ? `₱${c.target.toLocaleString()}`
                        : c.target}
                    </div>
                  </div>
                ))}
              </div>

              {!grad?.ready && (
                <div style={{ marginTop: 16, fontSize: 13, color: '#64748b' }}>
                  <strong>Focus areas:</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                    {(grad?.criteria || []).filter(c => !c.met).map((c, i) => (
                      <li key={i}>{c.label}: currently {c.actual}, need {c.comparator === 'lte' ? '≤' : '≥'}{c.target}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {!loading && sc && tab === 'insights' && (
            <>
              {insights.length === 0 && (
                <div className="sc-empty">No recent AI insights. Agents run on schedule and will populate findings here.</div>
              )}
              <div className="sc-insights">
                {insights.map((ins, i) => (
                  <div key={i} className={`sc-insight-card ${ins.severity}`}>
                    <div className="sc-insight-agent">{(ins.agent || '').replace(/_/g, ' ')}</div>
                    <div className="sc-insight-msg">{ins.message}</div>
                    {ins.run_date && (
                      <div className="sc-insight-date">{new Date(ins.run_date).toLocaleDateString()}</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
