/**
 * OrgChart — Visual org chart built from PeopleMaster reports_to hierarchy.
 * Pure CSS tree (no extra dependencies). Collapsible nodes, search filter.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpApi from '../hooks/useErpApi';

const TYPE_COLORS = {
  BDM: { bg: '#dbeafe', text: '#1e40af' },
  ECOMMERCE_BDM: { bg: '#e0e7ff', text: '#3730a3' },
  EMPLOYEE: { bg: '#dcfce7', text: '#166534' },
  SALES_REP: { bg: '#fef3c7', text: '#92400e' },
  CONSULTANT: { bg: '#f3e8ff', text: '#6b21a8' },
  DIRECTOR: { bg: '#fce7f3', text: '#9d174d' },
};

const pageStyles = `
  .org-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .org-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1000px; margin: 0 auto; }
  .org-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .org-header h2 { font-size: 20px; font-weight: 700; margin: 0; color: var(--erp-text, #1a1a2e); }
  .org-search { padding: 7px 12px; border: 1px solid var(--erp-border, #d1d5db); border-radius: 8px; font-size: 13px; min-width: 200px; }
  .org-stats { font-size: 13px; color: var(--erp-muted, #64748b); margin-bottom: 12px; }

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

  .org-name { font-size: 14px; font-weight: 600; color: var(--erp-text, #1a1a2e); }
  .org-role { font-size: 11px; color: var(--erp-muted, #64748b); }
  .org-badge { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .org-toggle { font-size: 12px; color: var(--erp-muted); cursor: pointer; user-select: none; margin-left: 4px; }

  .org-empty { text-align: center; color: #64748b; padding: 60px 20px; }
  .org-empty p { margin: 8px 0; }

  @media(max-width: 768px) {
    .org-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .org-node { margin-left: 16px; padding-left: 12px; }
    .org-card { padding: 6px 10px; }
    .org-name { font-size: 13px; }
  }
`;

function OrgNode({ node, search, navigate, collapsed, toggleCollapse }) {
  const tc = TYPE_COLORS[node.person_type] || { bg: '#f3f4f6', text: '#374151' };
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsed.has(node._id);
  const isMatch = search && node.full_name.toLowerCase().includes(search.toLowerCase());

  return (
    <div className={node._isRoot ? 'org-root' : 'org-node'}>
      <div
        className={`org-card${isMatch ? ' highlight' : ''}`}
        onClick={() => navigate(`/erp/people/${node._id}`)}
      >
        <div>
          <div className="org-name">
            {node.full_name}
            {hasChildren && (
              <span
                className="org-toggle"
                onClick={e => { e.stopPropagation(); toggleCollapse(node._id); }}
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? ` [+${node.children.length}]` : ' ▾'}
              </span>
            )}
          </div>
          <div className="org-role">
            {[node.position, node.department].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <span className="org-badge" style={{ background: tc.bg, color: tc.text }}>
          {node.person_type.replace(/_/g, ' ')}
        </span>
      </div>
      {hasChildren && !isCollapsed && node.children.map(child => (
        <OrgNode
          key={child._id}
          node={child}
          search={search}
          navigate={navigate}
          collapsed={collapsed}
          toggleCollapse={toggleCollapse}
        />
      ))}
    </div>
  );
}

function OrgChartContent() {
  const navigate = useNavigate();
  const api = useErpApi();
  const [tree, setTree] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/people/org-chart');
      const data = res.data?.data || res.data;
      setTree((data.tree || []).map(n => ({ ...n, _isRoot: true })));
      setCount(data.count || 0);
    } catch (err) {
      console.error('[OrgChart] load error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const toggleCollapse = (id) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <style>{pageStyles}</style>
      <div className="org-header">
        <h2>Org Chart</h2>
        <input
          className="org-search"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="org-stats">{count} people · {tree.length} top-level</div>

      {loading && <div className="org-empty"><p>Loading...</p></div>}
      {!loading && tree.length === 0 && (
        <div className="org-empty">
          <p style={{ fontSize: 18 }}>No people found</p>
          <p>Add people and set their "Reports To" to build the org chart.</p>
        </div>
      )}
      {!loading && tree.length > 0 && (
        <div className="org-tree">
          {tree.map(node => (
            <OrgNode
              key={node._id}
              node={node}
              search={search}
              navigate={navigate}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
            />
          ))}
        </div>
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
