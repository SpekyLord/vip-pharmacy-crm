/**
 * OrgChart — Multi-entity org chart with partner score badges.
 * Shows entities as header bars, people as tree nodes with performance scores.
 * Click a partner → PartnerScorecard slide-out panel.
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpApi from '../hooks/useErpApi';
import PartnerScorecard from './PartnerScorecard';
import WorkflowGuide from '../components/WorkflowGuide';

const TYPE_COLORS = {
  BDM: { bg: '#dbeafe', text: '#1e40af' },
  ECOMMERCE_BDM: { bg: '#e0e7ff', text: '#3730a3' },
  EMPLOYEE: { bg: '#dcfce7', text: '#166534' },
  SALES_REP: { bg: '#fef3c7', text: '#92400e' },
  CONSULTANT: { bg: '#f3e8ff', text: '#6b21a8' },
  DIRECTOR: { bg: '#fce7f3', text: '#9d174d' },
};

function scoreColor(score) {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  if (score > 0) return '#ef4444';
  return '#d1d5db';
}

const pageStyles = `
  .org-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .org-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1100px; margin: 0 auto; }
  .org-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .org-header h2 { font-size: 20px; font-weight: 700; margin: 0; color: var(--erp-text, #1a1a2e); }
  .org-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .org-search { padding: 7px 12px; border: 1px solid var(--erp-border, #d1d5db); border-radius: 8px; font-size: 13px; min-width: 180px; }
  .org-btn { padding: 7px 14px; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
  .org-btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .org-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .org-summary { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; font-size: 13px; }
  .org-stat { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 10px; padding: 10px 16px; text-align: center; }
  .org-stat-value { font-size: 22px; font-weight: 700; color: var(--erp-text); }
  .org-stat-label { font-size: 11px; color: var(--erp-muted, #64748b); margin-top: 2px; }

  .org-entity-bar {
    display: flex; align-items: center; gap: 10px; padding: 10px 16px; margin: 16px 0 8px;
    background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb);
    border-radius: 10px; border-left: 4px solid var(--accent, #1e5eff);
  }
  .org-entity-name { font-size: 15px; font-weight: 700; color: var(--erp-text); }
  .org-entity-meta { font-size: 11px; color: var(--erp-muted); }
  .org-entity-type { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; background: #e8efff; color: #1e40af; }

  .org-tree { padding: 0; }
  .org-node { margin-left: 24px; border-left: 2px solid var(--erp-border, #e5e7eb); padding-left: 16px; position: relative; }
  .org-node:before { content: ''; position: absolute; left: -2px; top: 18px; width: 14px; height: 0; border-top: 2px solid var(--erp-border, #e5e7eb); }
  .org-node:last-child { border-left-color: transparent; }
  .org-node:last-child:before { border-left: 2px solid var(--erp-border, #e5e7eb); height: 18px; top: 0; }
  .org-root { margin-left: 0; border-left: none; padding-left: 0; }
  .org-root:before { display: none; }

  .org-card {
    display: inline-flex; align-items: center; gap: 10px;
    padding: 8px 14px; margin: 4px 0;
    background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb);
    border-radius: 10px; cursor: pointer; transition: all 0.15s;
    max-width: 100%;
  }
  .org-card:hover { border-color: var(--erp-accent, #2563eb); box-shadow: 0 2px 8px rgba(30,94,255,.1); }
  .org-card.highlight { border-color: #f59e0b; background: #fffbeb; }

  .org-score-circle {
    width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0;
  }
  .org-name { font-size: 14px; font-weight: 600; color: var(--erp-text, #1a1a2e); }
  .org-role { font-size: 11px; color: var(--erp-muted, #64748b); }
  .org-badge { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .org-toggle { font-size: 12px; color: var(--erp-muted); cursor: pointer; user-select: none; margin-left: 4px; }
  .org-grad { font-size: 10px; margin-left: 4px; }

  .org-empty { text-align: center; color: #64748b; padding: 60px 20px; }
  .org-empty p { margin: 8px 0; }

  @media(max-width: 768px) {
    .org-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .org-node { margin-left: 16px; padding-left: 12px; }
    .org-card { padding: 6px 10px; }
    .org-name { font-size: 13px; }
    .org-summary { gap: 8px; }
    .org-stat { padding: 8px 12px; }
  }
`;

function OrgNode({ node, search, scoreMap, collapsed, toggleCollapse, onSelectPerson }) {
  const tc = TYPE_COLORS[node.person_type] || { bg: '#f3f4f6', text: '#374151' };
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsed.has(node._id);
  const isMatch = search && node.full_name?.toLowerCase().includes(search.toLowerCase());
  const score = scoreMap[node._id] || null;
  const isPartner = ['BDM', 'ECOMMERCE_BDM', 'CONSULTANT'].includes(node.person_type);

  return (
    <div className={node._isRoot ? 'org-root' : 'org-node'}>
      <div
        className={`org-card${isMatch ? ' highlight' : ''}`}
        onClick={() => isPartner && score ? onSelectPerson(node._id) : null}
      >
        {isPartner && (
          <div className="org-score-circle" style={{ background: scoreColor(score?.score_overall || 0) }}>
            {score?.score_overall || '—'}
          </div>
        )}
        <div>
          <div className="org-name">
            {node.full_name}
            {score?.graduation?.readiness_pct >= 85 && <span className="org-grad" title="Near graduation">🎓</span>}
            {hasChildren && (
              <span
                className="org-toggle"
                onClick={e => { e.stopPropagation(); toggleCollapse(node._id); }}
              >
                {isCollapsed ? ` [+${node.children.length}]` : ' ▾'}
              </span>
            )}
          </div>
          <div className="org-role">
            {[node.position, node.department].filter(Boolean).join(' · ') || '—'}
            {score && isPartner && ` · ${score.graduation?.checklist_met || 0}/${score.graduation?.checklist_total || 7} grad`}
          </div>
        </div>
        <span className="org-badge" style={{ background: tc.bg, color: tc.text }}>
          {(node.person_type || '').replace(/_/g, ' ')}
        </span>
      </div>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <OrgNode
          key={child._id}
          node={child}
          search={search}
          scoreMap={scoreMap}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
          onSelectPerson={onSelectPerson}
        />
      ))}
    </div>
  );
}

export function OrgChartContent() {
  const { get: erpGet, post: erpPost } = useErpApi();
  const [tree, setTree] = useState([]);
  const [totalPeople, setTotalPeople] = useState(0);
  const [totalEntities, setTotalEntities] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(new Set());
  const [scoreMap, setScoreMap] = useState({});
  const [summary, setSummary] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [computing, setComputing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgRes, scoreRes, sumRes] = await Promise.all([
        erpGet('/people/org-chart'),
        erpGet('/scorecards').catch(() => ({ data: [] })),
        erpGet('/scorecards/group-summary').catch(() => ({ data: null })),
      ]);

      const orgData = orgRes.data?.data || orgRes.data || {};
      setTree(orgData.tree || []);
      setTotalPeople(orgData.total_people || 0);
      setTotalEntities(orgData.total_entities || 0);

      // Build score lookup by person_id
      const scores = scoreRes.data?.data || scoreRes.data || [];
      const map = {};
      scores.forEach(s => { if (s.person_id?._id) map[s.person_id._id] = s; });
      setScoreMap(map);

      setSummary(sumRes.data?.data || sumRes.data || null);
    } catch (err) {
      console.error('[OrgChart] load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [erpGet]);

  useEffect(() => { load(); }, [load]);

  const handleCompute = async () => {
    setComputing(true);
    try {
      await erpPost('/scorecards/compute');
      await load(); // refresh
    } catch (err) {
      console.error('[OrgChart] compute error:', err.message);
    } finally {
      setComputing(false);
    }
  };

  const toggleCollapse = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totals = summary?.totals || {};

  return (
    <>
      <style>{pageStyles}</style>
      <WorkflowGuide pageKey="org-chart" />
      <div className="org-header">
        <h2>Org Chart</h2>
        <div className="org-toolbar">
          <input className="org-search" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="org-btn org-btn-primary" onClick={handleCompute} disabled={computing}>
            {computing ? 'Computing...' : 'Recompute Scores'}
          </button>
        </div>
      </div>

      {summary && (
        <div className="org-summary">
          <div className="org-stat">
            <div className="org-stat-value">{totalEntities}</div>
            <div className="org-stat-label">Entities</div>
          </div>
          <div className="org-stat">
            <div className="org-stat-value">{totals.total_partners || totalPeople}</div>
            <div className="org-stat-label">Partners</div>
          </div>
          <div className="org-stat">
            <div className="org-stat-value" style={{ color: scoreColor(totals.avg_score || 0) }}>{totals.avg_score || '—'}</div>
            <div className="org-stat-label">Avg Score</div>
          </div>
          <div className="org-stat">
            <div className="org-stat-value" style={{ color: '#22c55e' }}>{totals.near_graduation || 0}</div>
            <div className="org-stat-label">Near Graduation</div>
          </div>
          <div className="org-stat">
            <div className="org-stat-value" style={{ color: '#ef4444' }}>{totals.at_risk || 0}</div>
            <div className="org-stat-label">At Risk</div>
          </div>
        </div>
      )}

      {loading && <div className="org-empty"><p>Loading...</p></div>}
      {!loading && tree.length === 0 && (
        <div className="org-empty">
          <p style={{ fontSize: 18 }}>No people found</p>
          <p>Add people and set their &quot;Reports To&quot; to build the org chart.</p>
        </div>
      )}
      {!loading && tree.length > 0 && (
        <div className="org-tree">
          {tree.map(entity => (
            <div key={entity._id}>
              <div
                className="org-entity-bar"
                style={{ '--accent': entity.brand_color || '#1e5eff' }}
              >
                <div>
                  <div className="org-entity-name">{entity.entity_name || entity.short_name}</div>
                  <div className="org-entity-meta">
                    <span className="org-entity-type">{entity.entity_type}</span>
                    {' · '}{entity.people_count || 0} people
                  </div>
                </div>
              </div>
              {(entity.children || []).map(person => (
                <OrgNode
                  key={person._id}
                  node={{ ...person, _isRoot: true }}
                  search={search}
                  scoreMap={scoreMap}
                  collapsed={collapsed}
                  toggleCollapse={toggleCollapse}
                  onSelectPerson={setSelectedPerson}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {selectedPerson && (
        <PartnerScorecard personId={selectedPerson} onClose={() => setSelectedPerson(null)} />
      )}
    </>
  );
}

export default function OrgChart() {
  return (
    <div className="admin-page erp-page org-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="org-main">
          <OrgChartContent />
        </main>
      </div>
    </div>
  );
}
