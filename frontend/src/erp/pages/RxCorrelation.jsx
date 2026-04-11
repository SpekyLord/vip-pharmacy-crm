/**
 * Rx Correlation Page — Gap 9
 * Correlates BDM visit activity with product sell-through, partner rebates, and program effectiveness
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useReports from '../hooks/useReports';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .rx-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .rx-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .rx-header { margin-bottom: 20px; }
  .rx-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .rx-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .controls input, .controls select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-success { background: #16a34a; color: white; }
  .btn:disabled { opacity: 0.5; }
  .tab-bar { display: flex; gap: 2px; margin-bottom: 16px; background: var(--erp-border); border-radius: 10px; padding: 3px; }
  .tab-btn { flex: 1; padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: transparent; color: var(--erp-muted); transition: all 0.15s; white-space: nowrap; }
  .tab-btn.active { background: var(--erp-panel); color: var(--erp-accent); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; white-space: nowrap; cursor: default; }
  .data-table th.sortable { cursor: pointer; user-select: none; }
  .data-table th.sortable:hover { color: var(--erp-accent); }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); white-space: nowrap; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .row-high { background: rgba(34,197,94,0.08); }
  .row-low { background: rgba(239,68,68,0.08); }
  .row-clickable { cursor: pointer; }
  .row-clickable:hover { background: var(--erp-accent-soft); }
  .coverage-bar { display: inline-block; height: 18px; border-radius: 4px; min-width: 2px; background: var(--erp-accent, #2563eb); }
  .coverage-cell { display: flex; align-items: center; gap: 6px; }
  .drill-detail { background: var(--erp-bg); padding: 12px; border-radius: 8px; margin: 4px 0 8px; }
  .mapping-form { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--erp-border); }
  .mapping-form select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); min-width: 200px; }
  .section-title { font-size: 14px; font-weight: 600; color: var(--erp-text); margin: 16px 0 8px; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .rx-main { padding: 12px; } .tab-btn { padding: 6px 8px; font-size: 11px; } }
`;

function fmt(n) { return '\u20B1' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function getCurrentPeriod() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

export default function RxCorrelation() {
  const rpt = useReports();
  const [tab, setTab] = useState('summary');
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [pathway, setPathway] = useState('All');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Territory drill-down
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [territoryDetail, setTerritoryDetail] = useState(null);

  // Partner sorting
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  // Trend controls
  const [trendTerritory, setTrendTerritory] = useState('');
  const [trendProduct, setTrendProduct] = useState('');
  const [trendStart, setTrendStart] = useState(getCurrentPeriod());
  const [trendEnd, setTrendEnd] = useState(getCurrentPeriod());

  // Mapping
  const [mappings, setMappings] = useState([]);
  const [unmapped, setUnmapped] = useState([]);
  const [mapCrm, setMapCrm] = useState('');
  const [mapErp, setMapErp] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSummary(); }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = pathway !== 'All' ? { pathway } : {};
      const res = await rpt.getRxCorrelationSummary(period, params);
      setData(res?.data || null);
      setSelectedTerritory(null);
      setTerritoryDetail(null);
    } catch (err) { console.error('[RxCorrelation] load error:', err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, pathway]);

  const loadTerritoryDetail = useCallback(async (territoryId) => {
    if (selectedTerritory === territoryId) { setSelectedTerritory(null); setTerritoryDetail(null); return; }
    setSelectedTerritory(territoryId);
    try {
      const res = await rpt.getRxTerritoryDetail(territoryId, period);
      setTerritoryDetail(res?.data || null);
    } catch (err) { console.error('[RxCorrelation] territory detail error:', err.message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerritory, period]);

  const loadPartnerDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rpt.getRxPartnerDetail(period);
      setData(res?.data || null);
      setSortField(null);
    } catch (err) { console.error('[RxCorrelation] partner error:', err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadStakeholders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rpt.getRxHospitalStakeholders(period);
      setData(res?.data || null);
    } catch (err) { console.error('[RxCorrelation] stakeholders error:', err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rpt.getRxProgramEffectiveness(period);
      setData(res?.data || null);
    } catch (err) { console.error('[RxCorrelation] programs error:', err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadSupport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rpt.getRxSupportEffectiveness(period);
      setData(res?.data || null);
    } catch (err) { console.error('[RxCorrelation] support error:', err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const loadTrend = useCallback(async () => {
    setLoading(true);
    try {
      const params = { start: trendStart, end: trendEnd };
      if (trendTerritory) params.territory = trendTerritory;
      if (trendProduct) params.product = trendProduct;
      const res = await rpt.getRxTimeSeries(params);
      setData(res?.data || null);
    } catch (err) { console.error('[RxCorrelation] trend error:', err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendStart, trendEnd, trendTerritory, trendProduct]);

  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const [mapRes, unmapRes] = await Promise.all([
        rpt.getRxProductMappings(),
        rpt.getUnmappedRxProducts()
      ]);
      setMappings(mapRes?.data?.mappings || []);
      setUnmapped(unmapRes?.data?.products || []);
    } catch (err) { console.error('[RxCorrelation] mappings error:', err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAutoMap = async () => {
    setLoading(true);
    try {
      await rpt.autoMapRxProducts();
      await loadMappings();
    } catch (err) { console.error('[RxCorrelation] auto-map error:', err.message); }
    setLoading(false);
  };

  const handleCreateMapping = async () => {
    if (!mapCrm || !mapErp) return;
    try {
      await rpt.createRxProductMapping({ crm_product: mapCrm, erp_product: mapErp });
      setMapCrm(''); setMapErp('');
      await loadMappings();
    } catch (err) { console.error('[RxCorrelation] create mapping error:', err.message); }
  };

  const handleDeleteMapping = async (id) => {
    try {
      await rpt.deleteRxProductMapping(id);
      await loadMappings();
    } catch (err) { console.error('[RxCorrelation] delete mapping error:', err.message); }
  };

  const handleTabChange = (t) => {
    setTab(t);
    setData(null);
    setSelectedTerritory(null);
    setTerritoryDetail(null);
    setSortField(null);
    if (t === 'summary') loadSummary();
    else if (t === 'partner') loadPartnerDetail();
    else if (t === 'stakeholders') loadStakeholders();
    else if (t === 'programs') loadPrograms();
    else if (t === 'support') loadSupport();
    else if (t === 'trend') loadTrend();
    else if (t === 'mapping') loadMappings();
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const getSortedPartners = () => {
    const list = data?.partners || [];
    if (!sortField) return list;
    return [...list].sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === 'number' ? av - bv : String(av || '').localeCompare(String(bv || ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  };

  const sortIndicator = (field) => sortField === field ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';

  // Build territory/product options from mapping data for trend tab
  const territoryOptions = (data?.territories || []);
  const productOptions = mappings.length > 0 ? mappings : [];

  return (
    <div className="rx-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="rx-main">
          <div className="rx-header">
            <h1>Rx Correlation</h1>
            <p>BDM visit activity correlated with sell-through, partner rebates, and program effectiveness</p>
            <div style={{ marginTop: 10 }}>
              <Link to="/erp/reports" className="erp-back-btn">
                Back to Reports
              </Link>
            </div>
          </div>
          <WorkflowGuide guideId="rx-correlation" />

          <div className="tab-bar">
            <button className={`tab-btn ${tab === 'summary' ? 'active' : ''}`} onClick={() => handleTabChange('summary')}>Territory Summary</button>
            <button className={`tab-btn ${tab === 'partner' ? 'active' : ''}`} onClick={() => handleTabChange('partner')}>MD Partner Detail</button>
            <button className={`tab-btn ${tab === 'stakeholders' ? 'active' : ''}`} onClick={() => handleTabChange('stakeholders')}>Hospital Stakeholders</button>
            <button className={`tab-btn ${tab === 'programs' ? 'active' : ''}`} onClick={() => handleTabChange('programs')}>Program Effectiveness</button>
            <button className={`tab-btn ${tab === 'support' ? 'active' : ''}`} onClick={() => handleTabChange('support')}>Support Effectiveness</button>
            <button className={`tab-btn ${tab === 'trend' ? 'active' : ''}`} onClick={() => handleTabChange('trend')}>Trend</button>
            <button className={`tab-btn ${tab === 'mapping' ? 'active' : ''}`} onClick={() => handleTabChange('mapping')}>Product Mapping</button>
          </div>

          {/* Tab 1: Territory Summary */}
          {tab === 'summary' && (
            <>
              <div className="controls">
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                <select value={pathway} onChange={e => setPathway(e.target.value)}>
                  <option value="All">All Pathways</option>
                  <option value="PS">PS</option>
                  <option value="Non-PS">Non-PS</option>
                </select>
                <button className="btn btn-primary" onClick={loadSummary} disabled={loading}>Load</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {data && !loading && (
                <div className="panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Territory</th>
                        <th style={{ textAlign: 'right' }}>Visits</th>
                        <th style={{ textAlign: 'right' }}>Unique Doctors</th>
                        <th style={{ textAlign: 'right' }}>Sales Qty</th>
                        <th style={{ textAlign: 'right' }}>Sales Revenue</th>
                        <th style={{ textAlign: 'right' }}>Rebates</th>
                        <th style={{ textAlign: 'right' }}>Programs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.territories || []).map((t, i) => {
                        const total = (data.territories || []).length;
                        const cls = i < 3 ? 'row-high' : (i >= total - 3 && total > 6 ? 'row-low' : '');
                        return (
                          <tr key={t.territory_id || i} className={`${cls} row-clickable`} onClick={() => loadTerritoryDetail(t.territory_id)}>
                            <td style={{ fontWeight: 600 }}>{t.territory_name}</td>
                            <td className="num">{t.visits || 0}</td>
                            <td className="num">{t.unique_doctors || 0}</td>
                            <td className="num">{t.sales_qty || 0}</td>
                            <td className="num">{fmt(t.sales_revenue)}</td>
                            <td className="num">{fmt(t.rebates)}</td>
                            <td className="num">{t.programs || 0}</td>
                          </tr>
                        );
                      })}
                      {(!data.territories || data.territories.length === 0) && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No data for this period</td></tr>
                      )}
                    </tbody>
                  </table>
                  {selectedTerritory && territoryDetail && (
                    <div className="drill-detail">
                      <strong>Territory Detail: {territoryDetail.territory_name || selectedTerritory}</strong>
                      <table className="data-table" style={{ marginTop: 8 }}>
                        <thead>
                          <tr><th>Doctor</th><th style={{ textAlign: 'right' }}>Visits</th><th style={{ textAlign: 'right' }}>Products</th><th style={{ textAlign: 'right' }}>Sales Revenue</th><th style={{ textAlign: 'right' }}>Rebates</th></tr>
                        </thead>
                        <tbody>
                          {(territoryDetail.doctors || []).map((d, i) => (
                            <tr key={d.doctor_id || i}>
                              <td>{d.doctor_name}</td>
                              <td className="num">{d.visits || 0}</td>
                              <td className="num">{d.products || 0}</td>
                              <td className="num">{fmt(d.sales_revenue)}</td>
                              <td className="num">{fmt(d.rebates)}</td>
                            </tr>
                          ))}
                          {(!territoryDetail.doctors || territoryDetail.doctors.length === 0) && (
                            <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No detail data</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Tab 2: MD Partner Detail */}
          {tab === 'partner' && (
            <>
              <div className="controls">
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                <button className="btn btn-primary" onClick={loadPartnerDetail} disabled={loading}>Load</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {data && !loading && (
                <div className="panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => handleSort('partner_name')}>Partner Name{sortIndicator('partner_name')}</th>
                        <th className="sortable" onClick={() => handleSort('territory')}>Territory{sortIndicator('territory')}</th>
                        <th className="sortable" onClick={() => handleSort('visit_count')} style={{ textAlign: 'right' }}>Visit Count{sortIndicator('visit_count')}</th>
                        <th className="sortable" onClick={() => handleSort('products_discussed')} style={{ textAlign: 'right' }}>Products Discussed{sortIndicator('products_discussed')}</th>
                        <th className="sortable" onClick={() => handleSort('sales_revenue')} style={{ textAlign: 'right' }}>Sales Revenue{sortIndicator('sales_revenue')}</th>
                        <th className="sortable" onClick={() => handleSort('rebate_amount')} style={{ textAlign: 'right' }}>Rebate Amount{sortIndicator('rebate_amount')}</th>
                        <th className="sortable" onClick={() => handleSort('engagement_level')}>Engagement{sortIndicator('engagement_level')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getSortedPartners().map((p, i) => (
                        <tr key={p.partner_id || i}>
                          <td style={{ fontWeight: 600 }}>{p.partner_name}</td>
                          <td>{p.territory}</td>
                          <td className="num">{p.visit_count || 0}</td>
                          <td className="num">{p.products_discussed || 0}</td>
                          <td className="num">{fmt(p.sales_revenue)}</td>
                          <td className="num">{fmt(p.rebate_amount)}</td>
                          <td>{p.engagement_level}</td>
                        </tr>
                      ))}
                      {getSortedPartners().length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No data for this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Tab 3: Hospital Stakeholders */}
          {tab === 'stakeholders' && (
            <>
              <div className="controls">
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                <button className="btn btn-primary" onClick={loadStakeholders} disabled={loading}>Load</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {data && !loading && (
                <div className="panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Hospital</th>
                        <th>Engagement Level</th>
                        <th style={{ textAlign: 'right' }}>MD Visits</th>
                        <th style={{ textAlign: 'right' }}>Pharmacist Visits</th>
                        <th style={{ textAlign: 'right' }}>Purchaser Visits</th>
                        <th style={{ textAlign: 'right' }}>Admin Visits</th>
                        <th style={{ textAlign: 'right' }}>Non-PS Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.hospitals || []).map((h, i) => (
                        <tr key={h.hospital_id || i}>
                          <td style={{ fontWeight: 600 }}>{h.hospital_name}</td>
                          <td>{h.engagement_level}</td>
                          <td className="num">{h.md_visits || 0}</td>
                          <td className="num">{h.pharmacist_visits || 0}</td>
                          <td className="num">{h.purchaser_visits || 0}</td>
                          <td className="num">{h.admin_visits || 0}</td>
                          <td className="num">{fmt(h.non_ps_sales)}</td>
                        </tr>
                      ))}
                      {(!data.hospitals || data.hospitals.length === 0) && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No data for this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Tab 4: Program Effectiveness */}
          {tab === 'programs' && (
            <>
              <div className="controls">
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                <button className="btn btn-primary" onClick={loadPrograms} disabled={loading}>Load</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {data && !loading && (
                <div className="panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th style={{ textAlign: 'right' }}>Enrolled Doctors</th>
                        <th style={{ textAlign: 'right' }}>Visited</th>
                        <th style={{ textAlign: 'right' }}>Coverage %</th>
                        <th style={{ textAlign: 'right' }}>Territory Sales</th>
                        <th style={{ textAlign: 'right' }}>Avg Sales/Visit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.programs || []).map((p, i) => (
                        <tr key={p.program_id || i}>
                          <td style={{ fontWeight: 600 }}>{p.program_name}</td>
                          <td className="num">{p.enrolled_doctors || 0}</td>
                          <td className="num">{p.visited || 0}</td>
                          <td className="num">
                            <div className="coverage-cell" style={{ justifyContent: 'flex-end' }}>
                              <span className="coverage-bar" style={{ width: Math.min((p.coverage_pct || 0), 100) + 'px' }} />
                              <span>{p.coverage_pct || 0}%</span>
                            </div>
                          </td>
                          <td className="num">{fmt(p.territory_sales)}</td>
                          <td className="num">{fmt(p.avg_sales_per_visit)}</td>
                        </tr>
                      ))}
                      {(!data.programs || data.programs.length === 0) && (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No data for this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Tab 5: Support Type Effectiveness */}
          {tab === 'support' && (
            <>
              <div className="controls">
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                <button className="btn btn-primary" onClick={loadSupport} disabled={loading}>Load</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {data && !loading && (
                <div className="panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Support Type</th>
                        <th style={{ textAlign: 'right' }}>Enrolled Doctors</th>
                        <th style={{ textAlign: 'right' }}>Visited</th>
                        <th style={{ textAlign: 'right' }}>Coverage %</th>
                        <th style={{ textAlign: 'right' }}>Territory Sales</th>
                        <th style={{ textAlign: 'right' }}>Avg Sales/Visit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.support_types || []).map((s, i) => (
                        <tr key={s.support_type_id || i}>
                          <td style={{ fontWeight: 600 }}>{s.support_type_name}</td>
                          <td className="num">{s.enrolled_doctors || 0}</td>
                          <td className="num">{s.visited || 0}</td>
                          <td className="num">
                            <div className="coverage-cell" style={{ justifyContent: 'flex-end' }}>
                              <span className="coverage-bar" style={{ width: Math.min((s.coverage_pct || 0), 100) + 'px' }} />
                              <span>{s.coverage_pct || 0}%</span>
                            </div>
                          </td>
                          <td className="num">{fmt(s.territory_sales)}</td>
                          <td className="num">{fmt(s.avg_sales_per_visit)}</td>
                        </tr>
                      ))}
                      {(!data.support_types || data.support_types.length === 0) && (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No data for this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Tab 6: Trend */}
          {tab === 'trend' && (
            <>
              <div className="controls">
                <select value={trendTerritory} onChange={e => setTrendTerritory(e.target.value)}>
                  <option value="">All Territories</option>
                  {territoryOptions.map((t, i) => (
                    <option key={t.territory_id || i} value={t.territory_id}>{t.territory_name}</option>
                  ))}
                </select>
                <select value={trendProduct} onChange={e => setTrendProduct(e.target.value)}>
                  <option value="">All Products</option>
                  {productOptions.map((m, i) => (
                    <option key={m._id || i} value={m.crm_product}>{m.crm_product}</option>
                  ))}
                </select>
                <input type="month" value={trendStart} onChange={e => setTrendStart(e.target.value)} title="Start month" />
                <input type="month" value={trendEnd} onChange={e => setTrendEnd(e.target.value)} title="End month" />
                <button className="btn btn-primary" onClick={loadTrend} disabled={loading}>Load</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {data && !loading && (
                <div className="panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th style={{ textAlign: 'right' }}>Visits</th>
                        <th style={{ textAlign: 'right' }}>Sales Revenue</th>
                        <th style={{ textAlign: 'right' }}>Rebates</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.series || []).map((s, i) => (
                        <tr key={s.period || i}>
                          <td>{s.period}</td>
                          <td className="num">{s.visits || 0}</td>
                          <td className="num">{fmt(s.sales_revenue)}</td>
                          <td className="num">{fmt(s.rebates)}</td>
                        </tr>
                      ))}
                      {(!data.series || data.series.length === 0) && (
                        <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No trend data</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Tab 7: Product Mapping */}
          {tab === 'mapping' && (
            <>
              <div className="controls">
                <button className="btn btn-success" onClick={handleAutoMap} disabled={loading}>Auto-Map</button>
              </div>
              {loading && <div className="loading">Loading...</div>}
              {!loading && (
                <>
                  <div className="panel">
                    <div className="section-title">Existing Mappings</div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>CRM Product</th>
                          <th>ERP Product</th>
                          <th>Method</th>
                          <th style={{ textAlign: 'right' }}>Confidence</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappings.map((m, i) => (
                          <tr key={m._id || i}>
                            <td>{m.crm_product}</td>
                            <td>{m.erp_product}</td>
                            <td>{m.method}</td>
                            <td className="num">{m.confidence != null ? m.confidence + '%' : '-'}</td>
                            <td>
                              <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleDeleteMapping(m._id)}>Delete</button>
                            </td>
                          </tr>
                        ))}
                        {mappings.length === 0 && (
                          <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No mappings found</td></tr>
                        )}
                      </tbody>
                    </table>

                    {unmapped.length > 0 && (
                      <>
                        <div className="section-title" style={{ marginTop: 20 }}>Unmapped CRM Products</div>
                        <table className="data-table">
                          <thead>
                            <tr><th>CRM Product Name</th></tr>
                          </thead>
                          <tbody>
                            {unmapped.map((u, i) => (
                              <tr key={u._id || u.product_name || i}>
                                <td>{u.product_name || u.name || u}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}

                    <div className="mapping-form">
                      <select value={mapCrm} onChange={e => setMapCrm(e.target.value)}>
                        <option value="">Select CRM Product</option>
                        {unmapped.map((u, i) => {
                          const name = u.product_name || u.name || u;
                          return <option key={i} value={name}>{name}</option>;
                        })}
                      </select>
                      <select value={mapErp} onChange={e => setMapErp(e.target.value)}>
                        <option value="">Select ERP Product</option>
                        {mappings.filter(m => m.erp_product).map((m, i) => (
                          <option key={i} value={m.erp_product}>{m.erp_product}</option>
                        ))}
                      </select>
                      <button className="btn btn-primary" onClick={handleCreateMapping} disabled={!mapCrm || !mapErp}>Map</button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
