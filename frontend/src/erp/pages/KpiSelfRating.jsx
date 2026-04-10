/**
 * KpiSelfRating — Phase 32
 *
 * Universal KPI Self-Rating & Performance Review page.
 * Three modes:
 *   1. Self-Rating: user fills scores/comments for their KPIs + competencies
 *   2. Manager Review: reviewer adds manager scores side-by-side
 *   3. History: past submissions with status badges
 *
 * Exports KpiSelfRatingContent for ControlCenter embedding.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { ROLE_SETS } from '../../constants/roles';
import useKpiSelfRating from '../hooks/useKpiSelfRating';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  DRAFT:     { bg: '#f3f4f6', text: '#374151' },
  SUBMITTED: { bg: '#dbeafe', text: '#1e40af' },
  REVIEWED:  { bg: '#fef3c7', text: '#92400e' },
  APPROVED:  { bg: '#dcfce7', text: '#166534' },
  RETURNED:  { bg: '#fee2e2', text: '#991b1b' },
};

const PERIOD_TYPES = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'SEMI_ANNUAL', label: 'Semi-Annual' },
  { value: 'ANNUAL', label: 'Annual' },
];

const SCORE_OPTIONS = [
  { value: '', label: '—' },
  { value: 1, label: '1 — Needs Improvement' },
  { value: 2, label: '2 — Below Expectations' },
  { value: 3, label: '3 — Meets Expectations' },
  { value: 4, label: '4 — Exceeds Expectations' },
  { value: 5, label: '5 — Outstanding' },
];

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

/* eslint-disable react/prop-types */
function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
  return <span style={{ padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text }}>{status}</span>;
}

function ScoreSelect({ value, onChange, disabled }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} disabled={disabled}
      style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, minWidth: 160, background: disabled ? '#f9fafb' : '#fff' }}>
      {SCORE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
/* eslint-enable react/prop-types */

function KpiSelfRatingContent() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const {
    loading, fetchMyRatings, fetchCurrentDraft,
    fetchRating, fetchForReview, saveDraft, submitRating, reviewRating,
    approveRating, returnRating,
  } = useKpiSelfRating();

  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  // ─── Tabs: self | review | history ────
  const [tab, setTab] = useState(searchParams.get('tab') || 'self');
  const [periodType, setPeriodType] = useState('QUARTERLY');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());

  // Self-rating state
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  // Review state
  const [reviewList, setReviewList] = useState([]);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [returnModal, setReturnModal] = useState(null);
  const [returnReason, setReturnReason] = useState('');

  // History state
  const [historyList, setHistoryList] = useState([]);
  const [viewRating, setViewRating] = useState(null);

  // ─── Load self-rating draft ──────────
  const loadDraft = useCallback(async () => {
    try {
      const d = await fetchCurrentDraft({ period_type: periodType, fiscal_year: fiscalYear });
      setDraft(d);
    } catch (e) { showError(e); }
  }, [fetchCurrentDraft, periodType, fiscalYear]);

  // ─── Load review queue ───────────────
  const loadReview = useCallback(async () => {
    try {
      const list = await fetchForReview({ fiscal_year: fiscalYear, period_type: periodType });
      setReviewList(list);
    } catch (e) { showError(e); }
  }, [fetchForReview, fiscalYear, periodType]);

  // ─── Load history ────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const list = await fetchMyRatings({ fiscal_year: fiscalYear });
      setHistoryList(list);
    } catch (e) { showError(e); }
  }, [fetchMyRatings, fiscalYear]);

  useEffect(() => {
    if (tab === 'self') loadDraft();
    else if (tab === 'review') loadReview();
    else if (tab === 'history') loadHistory();
  }, [tab, loadDraft, loadReview, loadHistory]);

  // ─── Save draft handler ──────────────
  const handleSaveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveDraft({
        period: draft.period,
        period_type: draft.period_type,
        fiscal_year: draft.fiscal_year,
        kpi_ratings: draft.kpi_ratings,
        competency_ratings: draft.competency_ratings,
        overall_self_score: draft.overall_self_score,
        overall_self_comment: draft.overall_self_comment,
      });
      toast.success('Draft saved');
    } catch (e) { showError(e); }
    setSaving(false);
  };

  // ─── Submit handler ──────────────────
  const handleSubmit = async () => {
    if (!draft?._id) return;
    // Validate at least overall score filled
    if (!draft.overall_self_score) {
      toast.error('Please fill in your overall self-assessment score before submitting');
      return;
    }
    setSaving(true);
    try {
      // Save first, then submit
      await saveDraft({
        period: draft.period, period_type: draft.period_type, fiscal_year: draft.fiscal_year,
        kpi_ratings: draft.kpi_ratings, competency_ratings: draft.competency_ratings,
        overall_self_score: draft.overall_self_score, overall_self_comment: draft.overall_self_comment,
      });
      await submitRating(draft._id);
      toast.success('Rating submitted for review!');
      loadDraft();
    } catch (e) { showError(e); }
    setSaving(false);
  };

  // ─── KPI rating update helpers ───────
  const updateKpiField = (idx, field, value) => {
    setDraft(prev => {
      const kpi = [...prev.kpi_ratings];
      kpi[idx] = { ...kpi[idx], [field]: value };
      return { ...prev, kpi_ratings: kpi };
    });
  };

  const updateCompField = (idx, field, value) => {
    setDraft(prev => {
      const comp = [...prev.competency_ratings];
      comp[idx] = { ...comp[idx], [field]: value };
      return { ...prev, competency_ratings: comp };
    });
  };

  // ─── Review handlers ─────────────────
  const openReview = async (rating) => {
    try {
      const full = await fetchRating(rating._id);
      setReviewTarget(full);
    } catch (e) { showError(e); }
  };

  const updateReviewKpi = (idx, field, value) => {
    setReviewTarget(prev => {
      const kpi = [...prev.kpi_ratings];
      kpi[idx] = { ...kpi[idx], [field]: value };
      return { ...prev, kpi_ratings: kpi };
    });
  };

  const updateReviewComp = (idx, field, value) => {
    setReviewTarget(prev => {
      const comp = [...prev.competency_ratings];
      comp[idx] = { ...comp[idx], [field]: value };
      return { ...prev, competency_ratings: comp };
    });
  };

  const handleCompleteReview = async () => {
    if (!reviewTarget) return;
    setSaving(true);
    try {
      await reviewRating(reviewTarget._id, {
        kpi_ratings: reviewTarget.kpi_ratings,
        competency_ratings: reviewTarget.competency_ratings,
        overall_manager_score: reviewTarget.overall_manager_score,
        overall_manager_comment: reviewTarget.overall_manager_comment,
      });
      toast.success('Review completed');
      setReviewTarget(null);
      loadReview();
    } catch (e) { showError(e); }
    setSaving(false);
  };

  const handleApprove = async (id) => {
    try {
      await approveRating(id);
      toast.success('Rating approved');
      loadReview();
      setReviewTarget(null);
    } catch (e) { showError(e); }
  };

  const handleReturn = async () => {
    if (!returnModal) return;
    try {
      await returnRating(returnModal, returnReason);
      toast.success('Rating returned for revision');
      setReturnModal(null);
      setReturnReason('');
      loadReview();
      setReviewTarget(null);
    } catch (e) { showError(e); }
  };

  const openViewRating = async (rating) => {
    try {
      const full = await fetchRating(rating._id);
      setViewRating(full);
    } catch (e) { showError(e); }
  };

  // ─── Computed average scores ─────────
  const avgSelfKpi = useMemo(() => {
    if (!draft?.kpi_ratings?.length) return null;
    const scored = draft.kpi_ratings.filter(k => k.self_score);
    return scored.length ? (scored.reduce((s, k) => s + k.self_score, 0) / scored.length).toFixed(1) : null;
  }, [draft]);

  const avgSelfComp = useMemo(() => {
    if (!draft?.competency_ratings?.length) return null;
    const scored = draft.competency_ratings.filter(c => c.self_score);
    return scored.length ? (scored.reduce((s, c) => s + c.self_score, 0) / scored.length).toFixed(1) : null;
  }, [draft]);

  const canEditDraft = draft && ['DRAFT', 'RETURNED'].includes(draft.status);

  // ═══ RENDER ═══
  return (
    <div style={{ padding: 0 }}>
      <WorkflowGuide pageKey="kpiSelfRating" />

      {/* Header + Tab Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>KPI Self-Rating</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          {['self', 'review', 'history'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: '1px solid', background: tab === t ? 'var(--erp-accent, #1e5eff)' : '#fff',
              color: tab === t ? '#fff' : '#374151', borderColor: tab === t ? 'transparent' : '#d1d5db',
            }}>
              {t === 'self' ? 'My Rating' : t === 'review' ? `Review${reviewList.length ? ` (${reviewList.length})` : ''}` : 'History'}
            </button>
          ))}
        </div>
      </div>

      {/* Period Selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={periodType} onChange={e => setPeriodType(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          {PERIOD_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input type="number" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
          min={2020} max={2035} style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: 80 }} />
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>Loading...</div>}

      {/* ═══ TAB: Self-Rating ═══ */}
      {tab === 'self' && !loading && draft && (
        <div>
          {/* Status + Period Info */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <StatusBadge status={draft.status} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>Period: <strong>{draft.period}</strong> ({draft.period_type})</span>
            {draft.reviewer_id && (
              <span style={{ fontSize: 13, color: '#6b7280' }}>Reviewer: <strong>{draft.reviewer_id.full_name || '—'}</strong></span>
            )}
            {draft.return_reason && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#991b1b', width: '100%' }}>
                <strong>Returned:</strong> {draft.return_reason}
              </div>
            )}
          </div>

          {/* KPI Ratings Section */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>KPI Ratings ({draft.kpi_ratings?.length || 0})</h3>
              {avgSelfKpi && <span style={{ fontSize: 12, color: '#6b7280' }}>Avg: {avgSelfKpi}/5</span>}
            </div>
            {draft.kpi_ratings?.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, minWidth: 180 }}>KPI</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 60 }}>Unit</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 70 }}>Target</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 70 }}>Actual</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 180 }}>Self Score</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, minWidth: 150 }}>Comment</th>
                      {draft.status !== 'DRAFT' && draft.status !== 'RETURNED' && (
                        <>
                          <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 100 }}>Mgr Score</th>
                          <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, minWidth: 120 }}>Mgr Comment</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.kpi_ratings.map((kpi, i) => (
                      <tr key={kpi.kpi_code} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 500 }}>{kpi.kpi_label}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {kpi.direction === 'higher_better' ? '▲' : '▼'} {kpi.direction === 'higher_better' ? 'Higher' : 'Lower'} is better
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', padding: '8px 12px', color: '#6b7280' }}>{kpi.unit}</td>
                        <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                          {canEditDraft ? (
                            <input type="number" value={kpi.target_value ?? ''} onChange={e => updateKpiField(i, 'target_value', e.target.value ? Number(e.target.value) : null)}
                              style={{ width: 60, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, textAlign: 'center' }} />
                          ) : (kpi.target_value ?? '—')}
                        </td>
                        <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                          {canEditDraft ? (
                            <input type="number" value={kpi.actual_value ?? ''} onChange={e => updateKpiField(i, 'actual_value', e.target.value ? Number(e.target.value) : null)}
                              style={{ width: 60, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, textAlign: 'center' }} />
                          ) : (kpi.actual_value ?? '—')}
                        </td>
                        <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                          <ScoreSelect value={kpi.self_score} onChange={v => updateKpiField(i, 'self_score', v)} disabled={!canEditDraft} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {canEditDraft ? (
                            <input type="text" value={kpi.self_comment || ''} onChange={e => updateKpiField(i, 'self_comment', e.target.value)}
                              placeholder="Comment..." style={{ width: '100%', padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }} />
                          ) : (kpi.self_comment || '—')}
                        </td>
                        {draft.status !== 'DRAFT' && draft.status !== 'RETURNED' && (
                          <>
                            <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 500, color: kpi.manager_score ? '#1e40af' : '#9ca3af' }}>
                              {kpi.manager_score ? `${kpi.manager_score}/5` : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280' }}>{kpi.manager_comment || '—'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div style={{ padding: 16, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>No KPIs assigned. Check your functional role assignments.</div>}
          </div>

          {/* Competency Ratings Section */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Competency Ratings ({draft.competency_ratings?.length || 0})</h3>
              {avgSelfComp && <span style={{ fontSize: 12, color: '#6b7280' }}>Avg: {avgSelfComp}/5</span>}
            </div>
            {draft.competency_ratings?.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, minWidth: 200 }}>Competency</th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 180 }}>Self Score</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, minWidth: 200 }}>Comment</th>
                      {draft.status !== 'DRAFT' && draft.status !== 'RETURNED' && (
                        <>
                          <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 100 }}>Mgr Score</th>
                          <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, minWidth: 120 }}>Mgr Comment</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.competency_ratings.map((comp, i) => (
                      <tr key={comp.competency_code} style={{ borderTop: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{comp.competency_label}</td>
                        <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                          <ScoreSelect value={comp.self_score} onChange={v => updateCompField(i, 'self_score', v)} disabled={!canEditDraft} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {canEditDraft ? (
                            <input type="text" value={comp.self_comment || ''} onChange={e => updateCompField(i, 'self_comment', e.target.value)}
                              placeholder="Comment..." style={{ width: '100%', padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }} />
                          ) : (comp.self_comment || '—')}
                        </td>
                        {draft.status !== 'DRAFT' && draft.status !== 'RETURNED' && (
                          <>
                            <td style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 500, color: comp.manager_score ? '#1e40af' : '#9ca3af' }}>
                              {comp.manager_score ? `${comp.manager_score}/5` : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 12, color: '#6b7280' }}>{comp.manager_comment || '—'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div style={{ padding: 16, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>No competencies loaded.</div>}
          </div>

          {/* Overall Assessment */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Overall Assessment</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, alignItems: 'start' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Overall Score</label>
                <ScoreSelect value={draft.overall_self_score} onChange={v => setDraft(p => ({ ...p, overall_self_score: v }))} disabled={!canEditDraft} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Summary Comment</label>
                {canEditDraft ? (
                  <textarea value={draft.overall_self_comment || ''} onChange={e => setDraft(p => ({ ...p, overall_self_comment: e.target.value }))}
                    rows={3} placeholder="Summarize your performance this period..."
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                ) : <div style={{ fontSize: 13, color: '#374151' }}>{draft.overall_self_comment || '—'}</div>}
              </div>
            </div>
            {draft.overall_manager_score && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#eff6ff', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>Manager Assessment</div>
                <div style={{ fontSize: 13 }}>Score: <strong>{draft.overall_manager_score}/5</strong></div>
                {draft.overall_manager_comment && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{draft.overall_manager_comment}</div>}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {canEditDraft && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={handleSaveDraft} disabled={saving} style={{
                padding: '8px 20px', background: '#f3f4f6', border: '1px solid #d1d5db',
                borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>{saving ? 'Saving...' : 'Save Draft'}</button>
              <button onClick={handleSubmit} disabled={saving} style={{
                padding: '8px 20px', background: 'var(--erp-accent, #1e5eff)', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>{saving ? 'Submitting...' : 'Submit for Review'}</button>
            </div>
          )}
        </div>
      )}

      {tab === 'self' && !loading && !draft && (
        <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>No rating found for this period.</p>
          <p style={{ fontSize: 12 }}>Make sure your account is linked to a PeopleMaster record and you have active functional role assignments.</p>
        </div>
      )}

      {/* ═══ TAB: Review (Manager/Admin) ═══ */}
      {tab === 'review' && !loading && !reviewTarget && (
        <div>
          {reviewList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 14 }}>No ratings pending your review.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {reviewList.map(r => (
                <div key={r._id} style={{
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.person_id?.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {r.period} ({r.period_type}) · Overall self: {r.overall_self_score || '—'}/5
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <StatusBadge status={r.status} />
                    <button onClick={() => openReview(r)} style={{
                      padding: '6px 14px', background: 'var(--erp-accent, #1e5eff)', color: '#fff',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}>Review</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review Detail */}
      {tab === 'review' && reviewTarget && (
        <div>
          <button onClick={() => setReviewTarget(null)} style={{
            padding: '4px 12px', background: '#f3f4f6', border: '1px solid #d1d5db',
            borderRadius: 4, cursor: 'pointer', fontSize: 12, marginBottom: 16,
          }}>← Back to Queue</button>

          <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{reviewTarget.person_id?.full_name || 'Unknown'}</h3>
            <StatusBadge status={reviewTarget.status} />
            <span style={{ fontSize: 13, color: '#6b7280' }}>{reviewTarget.period} ({reviewTarget.period_type})</span>
          </div>

          {/* KPI review table — side-by-side */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>KPI Ratings</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>KPI</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 60 }}>Target</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, width: 60 }}>Actual</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, background: '#fefce8', width: 80 }}>Self</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, background: '#fefce8' }}>Self Comment</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, background: '#eff6ff', width: 170 }}>Mgr Score</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, background: '#eff6ff', minWidth: 150 }}>Mgr Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewTarget.kpi_ratings?.map((kpi, i) => (
                    <tr key={kpi.kpi_code} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{kpi.kpi_label}</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px' }}>{kpi.target_value ?? '—'}</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px' }}>{kpi.actual_value ?? '—'}</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px', background: '#fffbeb', fontWeight: 500 }}>{kpi.self_score ?? '—'}</td>
                      <td style={{ padding: '8px 12px', background: '#fffbeb', fontSize: 12, color: '#6b7280' }}>{kpi.self_comment || '—'}</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px', background: '#f0f7ff' }}>
                        {reviewTarget.status === 'SUBMITTED' ? (
                          <ScoreSelect value={kpi.manager_score} onChange={v => updateReviewKpi(i, 'manager_score', v)} />
                        ) : (kpi.manager_score ? `${kpi.manager_score}/5` : '—')}
                      </td>
                      <td style={{ padding: '8px 12px', background: '#f0f7ff' }}>
                        {reviewTarget.status === 'SUBMITTED' ? (
                          <input type="text" value={kpi.manager_comment || ''} onChange={e => updateReviewKpi(i, 'manager_comment', e.target.value)}
                            placeholder="Comment..." style={{ width: '100%', padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }} />
                        ) : (kpi.manager_comment || '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Competency review table */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Competency Ratings</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Competency</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, background: '#fefce8', width: 80 }}>Self</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, background: '#fefce8' }}>Self Comment</th>
                    <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600, background: '#eff6ff', width: 170 }}>Mgr Score</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, background: '#eff6ff', minWidth: 150 }}>Mgr Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewTarget.competency_ratings?.map((comp, i) => (
                    <tr key={comp.competency_code} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}>{comp.competency_label}</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px', background: '#fffbeb', fontWeight: 500 }}>{comp.self_score ?? '—'}</td>
                      <td style={{ padding: '8px 12px', background: '#fffbeb', fontSize: 12, color: '#6b7280' }}>{comp.self_comment || '—'}</td>
                      <td style={{ textAlign: 'center', padding: '8px 12px', background: '#f0f7ff' }}>
                        {reviewTarget.status === 'SUBMITTED' ? (
                          <ScoreSelect value={comp.manager_score} onChange={v => updateReviewComp(i, 'manager_score', v)} />
                        ) : (comp.manager_score ? `${comp.manager_score}/5` : '—')}
                      </td>
                      <td style={{ padding: '8px 12px', background: '#f0f7ff' }}>
                        {reviewTarget.status === 'SUBMITTED' ? (
                          <input type="text" value={comp.manager_comment || ''} onChange={e => updateReviewComp(i, 'manager_comment', e.target.value)}
                            placeholder="Comment..." style={{ width: '100%', padding: '3px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }} />
                        ) : (comp.manager_comment || '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overall Manager Assessment */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>Overall Assessment</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ padding: '10px 14px', background: '#fffbeb', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Self Assessment</div>
                <div>Score: <strong>{reviewTarget.overall_self_score || '—'}/5</strong></div>
                {reviewTarget.overall_self_comment && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{reviewTarget.overall_self_comment}</div>}
              </div>
              <div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>Manager Assessment</div>
                {reviewTarget.status === 'SUBMITTED' ? (
                  <>
                    <ScoreSelect value={reviewTarget.overall_manager_score}
                      onChange={v => setReviewTarget(p => ({ ...p, overall_manager_score: v }))} />
                    <textarea value={reviewTarget.overall_manager_comment || ''}
                      onChange={e => setReviewTarget(p => ({ ...p, overall_manager_comment: e.target.value }))}
                      rows={2} placeholder="Overall comment..." style={{ width: '100%', marginTop: 8, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
                  </>
                ) : (
                  <>
                    <div>Score: <strong>{reviewTarget.overall_manager_score || '—'}/5</strong></div>
                    {reviewTarget.overall_manager_comment && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{reviewTarget.overall_manager_comment}</div>}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Review Action Buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            {reviewTarget.status === 'SUBMITTED' && (
              <>
                <button onClick={() => { setReturnModal(reviewTarget._id); setReturnReason(''); }} style={{
                  padding: '8px 16px', background: '#fee2e2', color: '#991b1b',
                  border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}>Return for Revision</button>
                <button onClick={handleCompleteReview} disabled={saving} style={{
                  padding: '8px 20px', background: 'var(--erp-accent, #1e5eff)', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}>{saving ? 'Saving...' : 'Complete Review'}</button>
              </>
            )}
            {reviewTarget.status === 'REVIEWED' && isAdmin && (
              <button onClick={() => handleApprove(reviewTarget._id)} style={{
                padding: '8px 20px', background: '#16a34a', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>Approve</button>
            )}
          </div>
        </div>
      )}

      {/* ═══ TAB: History ═══ */}
      {tab === 'history' && !loading && (
        <div>
          {historyList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#6b7280', fontSize: 14 }}>No rating history found.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {historyList.map(r => (
                <div key={r._id} style={{
                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, cursor: 'pointer',
                }} onClick={() => openViewRating(r)}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.period} ({r.period_type})</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      Self: {r.overall_self_score || '—'}/5
                      {r.overall_manager_score && ` · Manager: ${r.overall_manager_score}/5`}
                      {r.submitted_at && ` · Submitted: ${fmtDate(r.submitted_at)}`}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* View Rating Modal (history detail) */}
      {viewRating && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setViewRating(null)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 700,
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{viewRating.period} ({viewRating.period_type})</h3>
              <StatusBadge status={viewRating.status} />
            </div>

            {/* Quick summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Self Overall</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{viewRating.overall_self_score || '—'}<span style={{ fontSize: 12, fontWeight: 400 }}>/5</span></div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Manager Overall</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>{viewRating.overall_manager_score || '—'}<span style={{ fontSize: 12, fontWeight: 400 }}>/5</span></div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>KPIs Rated</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{viewRating.kpi_ratings?.filter(k => k.self_score).length || 0}/{viewRating.kpi_ratings?.length || 0}</div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Competencies</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{viewRating.competency_ratings?.filter(c => c.self_score).length || 0}/{viewRating.competency_ratings?.length || 0}</div>
              </div>
            </div>

            {viewRating.overall_self_comment && (
              <div style={{ background: '#fffbeb', padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                <strong>Self:</strong> {viewRating.overall_self_comment}
              </div>
            )}
            {viewRating.overall_manager_comment && (
              <div style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
                <strong>Manager:</strong> {viewRating.overall_manager_comment}
              </div>
            )}

            <button onClick={() => setViewRating(null)} style={{
              padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db',
              borderRadius: 6, cursor: 'pointer', fontSize: 13, width: '100%', marginTop: 8,
            }}>Close</button>
          </div>
        </div>
      )}

      {/* Return Reason Modal */}
      {returnModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setReturnModal(null)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Return for Revision</h3>
            <textarea value={returnReason} onChange={e => setReturnReason(e.target.value)}
              rows={3} placeholder="Reason for returning (visible to the person)..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setReturnModal(null)} style={{
                padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db',
                borderRadius: 6, cursor: 'pointer', fontSize: 13,
              }}>Cancel</button>
              <button onClick={handleReturn} style={{
                padding: '8px 16px', background: '#dc2626', color: '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              }}>Return</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Standalone Page Wrapper ═══
export default function KpiSelfRating() {
  return (
    <div className="erp-page">
      <Navbar />
      <div className="erp-layout">
        <Sidebar />
        <main className="erp-main" style={{ padding: 24 }}>
          <KpiSelfRatingContent />
        </main>
      </div>
    </div>
  );
}

export { KpiSelfRatingContent };
