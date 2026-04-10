/**
 * Data Archive Page — Phase 15.8
 * Trigger archive, view batches, restore
 */
import { useState, useEffect, useCallback } from 'react';
import { showError } from '../utils/errorToast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import WorkflowGuide from '../components/WorkflowGuide';
import useReports from '../hooks/useReports';

const pageStyles = `
  .archive-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .archive-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .archive-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .archive-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; }
  .warning-box { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 10px; padding: 16px; margin-bottom: 16px; font-size: 13px; color: #92400e; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-completed { background: #dcfce7; color: #166534; }
  .badge-restored { background: #dbeafe; color: #1e40af; }
  .badge-failed { background: #fef2f2; color: #991b1b; }
  .detail-panel { background: var(--erp-bg); border-radius: 8px; padding: 12px; margin-top: 8px; }
  .detail-panel h4 { margin: 0 0 8px; font-size: 13px; }
  .detail-item { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; border-bottom: 1px solid var(--erp-border); }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  .confirm-input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; margin-right: 8px; width: 250px; }
  @media(max-width: 768px) { .archive-main { padding: 12px; } }
`;

function fmtDate(d) { return d ? new Date(d).toLocaleString() : '-'; }

export function DataArchiveContent() {
  const rpt = useReports();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [batchDetail, setBatchDetail] = useState(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await rpt.getArchiveBatches(); setBatches(res?.data || []); } catch (err) { console.error('[DataArchive] load error:', err.message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await rpt.triggerArchive();
      setConfirmArchive(false);
      load();
    } catch (err) { showError(err, 'Could not trigger archive'); }
    setArchiving(false);
  };

  const handleExpand = async (batchId) => {
    if (expandedBatch === batchId) { setExpandedBatch(null); return; }
    setExpandedBatch(batchId);
    try { const res = await rpt.getArchiveBatchDetail(batchId); setBatchDetail(res?.data || null); } catch (err) { console.error('[DataArchive] load error:', err.message); }
  };

  const handleRestore = async (batchId) => {
    if (!restoreReason.trim()) return;
    try {
      await rpt.restoreBatch(batchId, { reason: restoreReason });
      setRestoreReason('');
      setExpandedBatch(null);
      load();
    } catch (err) { showError(err, 'Could not restore archive batch'); }
  };

  return (
    <>
      <style>{pageStyles}</style>
      <div className="archive-header">
        <h1>Data Archive</h1>
        <p>Archive closed-period data to keep the system performant. Current + prior 2 months are kept live.</p>
      </div>

      <div className="warning-box">
        <strong>Archive Policy:</strong> Documents older than 2 months with POSTED/LOCKED status will be moved to the archive.
        Only finalized data is archived. DRAFT/VALID/ERROR documents are never archived.
      </div>

      {!confirmArchive ? (
        <button className="btn btn-danger" onClick={() => setConfirmArchive(true)} style={{ marginBottom: 16 }}>
          Run Archive
        </button>
      ) : (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>Confirm archive?</span>
          <button className="btn btn-danger" onClick={handleArchive} disabled={archiving}>
            {archiving ? 'Archiving...' : 'Yes, Archive Now'}
          </button>
          <button className="btn" onClick={() => setConfirmArchive(false)} style={{ background: 'var(--erp-border)' }}>Cancel</button>
        </div>
      )}

      {loading && <div className="loading">Loading...</div>}

      <div className="panel">
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Archive History</h3>
        <table className="data-table">
          <thead>
            <tr><th>Batch ID</th><th>Date</th><th>Cutoff</th><th>Periods</th><th className="num">Documents</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {batches.map(b => [
                <tr key={b.batch_id}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{b.batch_id}</td>
                  <td>{fmtDate(b.archived_at)}</td>
                  <td>{b.cutoff_period}</td>
                  <td>{(b.periods_archived || []).join(', ') || '-'}</td>
                  <td className="num">{b.total_documents}</td>
                  <td><span className={`badge badge-${b.status?.toLowerCase()}`}>{b.status}</span></td>
                  <td>
                    <button className="btn btn-sm" onClick={() => handleExpand(b.batch_id)}>
                      {expandedBatch === b.batch_id ? 'Close' : 'Details'}
                    </button>
                  </td>
                </tr>,
                expandedBatch === b.batch_id && batchDetail && (
                  <tr key={b.batch_id + '-detail'}>
                    <td colSpan={7}>
                      <div className="detail-panel">
                        <h4>Documents by Collection ({batchDetail.total} total)</h4>
                        {Object.entries(batchDetail.collections || {}).map(([coll, docs]) => (
                          <div className="detail-item" key={coll}>
                            <span>{coll}</span>
                            <span style={{ fontWeight: 600 }}>{docs.length} documents</span>
                          </div>
                        ))}
                        {b.status === 'COMPLETED' && (
                          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center' }}>
                            <input className="confirm-input" placeholder="Reason for restore..." value={restoreReason} onChange={e => setRestoreReason(e.target.value)} />
                            <button className="btn btn-primary btn-sm" onClick={() => handleRestore(b.batch_id)} disabled={!restoreReason.trim()}>Restore</button>
                          </div>
                        )}
                        {b.status === 'RESTORED' && (
                          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--erp-muted)' }}>
                            Restored on {fmtDate(b.restored_at)} — Reason: {b.restore_reason}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              ])}
            {batches.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No archive batches yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function DataArchive() {
  return (
    <div className="archive-page">
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="archive-main">
          <WorkflowGuide pageKey="data-archive" />
          <DataArchiveContent />
        </div>
      </div>
    </div>
  );
}
