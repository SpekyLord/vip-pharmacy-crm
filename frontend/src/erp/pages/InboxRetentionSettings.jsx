/**
 * InboxRetentionSettings — Phase G9.R8 (Apr 2026)
 *
 * Admin UI for tuning the two lookup categories that drive the nightly inbox
 * retention agent:
 *   - INBOX_RETENTION      → days-based purge settings (per entity)
 *   - INBOX_ACK_DEFAULTS   → which messages auto-require acknowledgement
 *
 * Gated server-side by messaging.retention_manage (erpSubAccessCheck). The
 * page still renders for anyone who can reach the route, but Save / Run /
 * Preview actions surface the 403 as a toast if they don't have the sub-perm
 * (matches the behaviour of every other Control Center panel — discoverable
 * but non-destructive for read-only admins).
 *
 * Rule alignment:
 *   #3  — No hardcoded values. Every threshold in this UI is a Lookup row;
 *         the retention agent + pre-save hook read the same rows at runtime.
 *   #6  — Keep CLAUDE-ERP / PHASETASK-ERP in sync when new rows are added.
 *   #7  — Agent run history + Run-Now trigger + kill-switch (ENABLED row).
 *   #19 — Entity-scoped: the backend lookup-values endpoint filters by
 *         req.entityId so changes only affect the working entity.
 *
 * Embedded in ControlCenter via the `inbox-retention` section key. Also
 * reachable at /admin/control-center/inbox-retention via a redirect route so
 * the sidebar shortcut still works when section-deep-linking.
 */
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import useErpSubAccess from '../hooks/useErpSubAccess';
import { EntityContext } from '../../context/EntityContextObject';
import messageService from '../../services/messageInboxService';

const RETENTION_CATEGORY = 'INBOX_RETENTION';
const ACK_CATEGORY = 'INBOX_ACK_DEFAULTS';

// Codes whose metadata.value is a boolean (rendered as a toggle instead of a number).
const BOOL_CODES = new Set(['ENABLED']);

// Codes whose metadata.value is an array (rendered read-only w/ editor hint).
// Array-valued rows stay in this page as display-only; deeper editing lives in
// the generic Lookup Tables UI where metadata JSON is first-class.
const ARRAY_CODES = new Set(['BROADCAST_ROLES']);

const pageStyles = `
  .irs-wrap { padding: 0; }
  .irs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .irs-header h1 { font-size: 22px; font-weight: 700; color: var(--erp-text, #132238); margin: 0; }
  .irs-sub { font-size: 12px; color: var(--erp-muted, #64748b); margin: 0; }
  .irs-section { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
  .irs-section h3 { font-size: 14px; font-weight: 700; color: var(--erp-accent, #1e5eff); margin: 0 0 4px; }
  .irs-section p.irs-lead { font-size: 12px; color: var(--erp-muted); margin: 0 0 14px; }
  .irs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .irs-row { display: flex; flex-direction: column; gap: 4px; background: var(--erp-bg, #f4f7fb); padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; }
  .irs-row.irs-dirty { border-color: var(--erp-accent, #1e5eff); background: #eef4ff; }
  .irs-label { font-size: 12px; font-weight: 700; color: var(--erp-text); }
  .irs-code { font-family: monospace; font-size: 10.5px; color: var(--erp-muted); }
  .irs-controls { display: flex; align-items: center; gap: 8px; }
  .irs-controls input[type="number"] { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; background: #fff; }
  .irs-controls .irs-unit { font-size: 11px; color: var(--erp-muted); min-width: 36px; }
  .irs-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--erp-text); cursor: pointer; user-select: none; }
  .irs-toggle input { width: 16px; height: 16px; cursor: pointer; }
  .irs-array { font-size: 11px; color: var(--erp-muted); font-family: monospace; word-break: break-word; }
  .irs-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .irs-actions.trailing { margin-top: 14px; }
  .btn { padding: 7px 14px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warn    { background: #f59e0b; color: #fff; }
  .irs-meta { display: inline-block; background: #fef3c7; color: #92400e; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; margin-left: 8px; }
  .irs-empty { text-align: center; padding: 24px; color: var(--erp-muted); font-size: 13px; background: var(--erp-bg); border-radius: 10px; }
  .irs-preview-card { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px 14px; margin-top: 14px; font-size: 12px; color: #1e40af; line-height: 1.7; }
  .irs-preview-card strong { color: #1d4ed8; font-size: 13px; }
  body.dark-mode .irs-row { background: #0f172a; }
  body.dark-mode .irs-row.irs-dirty { background: #1e293b; border-color: #3b82f6; }
  body.dark-mode .irs-controls input[type="number"] { background: #0b1220; color: #e2e8f0; border-color: #334155; }
  body.dark-mode .irs-meta { background: #78350f; color: #fef3c7; }
  body.dark-mode .irs-preview-card { background: #1e293b; border-color: #334155; color: #93c5fd; }
  body.dark-mode .irs-preview-card strong { color: #60a5fa; }
  @media (max-width: 640px) {
    .irs-grid { grid-template-columns: 1fr; }
    .irs-actions { flex-direction: column; align-items: stretch; }
    .btn { width: 100%; text-align: center; }
  }
`;

// Each row in the two categories mixes number / boolean / array values. This
// helper normalises the current-edit state into whatever metadata.value shape
// was originally stored so partial edits never blow away adjacent metadata.
const writeValue = (meta, nextValue) => {
  const copy = { ...(meta || {}) };
  copy.value = nextValue;
  return copy;
};

const clampNumber = (value, meta) => {
  const min = meta?.min;
  const max = meta?.max;
  let n = Number(value);
  if (!Number.isFinite(n)) n = 0;
  if (typeof min === 'number' && n < min) n = min;
  if (typeof max === 'number' && n > max) n = max;
  // Days are integers — reject fractional values regardless of input.
  return Math.round(n);
};

export function InboxRetentionSettingsContent() {
  const entityCtx = useContext(EntityContext);
  const workingEntityId = entityCtx?.workingEntityId || null;
  const { hasSubPermission } = useErpSubAccess();
  const canManage = hasSubPermission('messaging', 'retention_manage');

  const [retentionRows, setRetentionRows] = useState([]);
  const [ackRows, setAckRows] = useState([]);
  const [drafts, setDrafts] = useState({}); // row._id -> { metadata, is_active }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  // ─── Load both categories ────────────────────────────────────────────
  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/erp/lookup-values/batch', {
        params: { categories: `${RETENTION_CATEGORY},${ACK_CATEGORY}` },
      });
      const grouped = res.data?.data || {};
      setRetentionRows((grouped[RETENTION_CATEGORY] || []).slice().sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      ));
      setAckRows((grouped[ACK_CATEGORY] || []).slice().sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
      ));
      setDrafts({});
      // Entity change or reload invalidates the previous preview — it was
      // computed against a different rule set / entity scope.
      setPreview(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load retention settings');
    } finally {
      setLoading(false);
    }
  }, [workingEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadRows(); }, [loadRows]);

  // ─── Draft helpers ───────────────────────────────────────────────────
  const originalFor = useCallback((id) => {
    const r = retentionRows.find((x) => x._id === id) || ackRows.find((x) => x._id === id);
    return r || null;
  }, [retentionRows, ackRows]);

  const stageChange = useCallback((id, patch) => {
    setDrafts((prev) => {
      const existing = prev[id] || {};
      return { ...prev, [id]: { ...existing, ...patch } };
    });
  }, []);

  const resolveValue = useCallback((row) => {
    const draft = drafts[row._id];
    if (draft && draft.metadata !== undefined) return draft.metadata.value;
    return row.metadata?.value;
  }, [drafts]);

  const resolveActive = useCallback((row) => {
    const draft = drafts[row._id];
    if (draft && typeof draft.is_active === 'boolean') return draft.is_active;
    return row.is_active !== false;
  }, [drafts]);

  const dirtyCount = Object.keys(drafts).length;
  const hasDraft = (id) => !!drafts[id];

  // ─── Seed defaults ──────────────────────────────────────────────────
  const seedCategory = async (category) => {
    if (!canManage) { toast.error('You do not have permission to seed retention settings'); return; }
    try {
      setBusy(true);
      await api.post(`/erp/lookup-values/${category}/seed`);
      toast.success(`${category.replace('_', ' ').toLowerCase()} seeded`);
      await loadRows();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Seed failed');
    } finally {
      setBusy(false);
    }
  };

  // ─── Save all drafts ────────────────────────────────────────────────
  const saveAll = async () => {
    if (!canManage) { toast.error('You do not have permission to change retention settings'); return; }
    const entries = Object.entries(drafts);
    if (entries.length === 0) return;
    setSaving(true);
    let saved = 0;
    try {
      for (const [id, patch] of entries) {
        const orig = originalFor(id);
        if (!orig) continue;
        const body = {};
        if (patch.metadata !== undefined) body.metadata = patch.metadata;
        if (typeof patch.is_active === 'boolean') body.is_active = patch.is_active;
        if (Object.keys(body).length === 0) continue;
        // orig.category is on the document; endpoint uses category as a path segment.
        await api.put(`/erp/lookup-values/${orig.category}/${id}`, body);
        saved++;
      }
      toast.success(`Saved ${saved} change${saved === 1 ? '' : 's'}`);
      await loadRows();
      // Stale preview after a save — clear so user re-runs.
      setPreview(null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const discardAll = () => { setDrafts({}); };

  // ─── Preview / Run Now ──────────────────────────────────────────────
  const doPreview = async () => {
    setBusy(true);
    try {
      const res = await messageService.previewRetention();
      setPreview(res?.data || res);
      toast.success('Preview computed');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    if (!canManage) { toast.error('You do not have permission to run retention'); return; }
    if (dirtyCount > 0) {
      toast.error('Save or discard pending changes first');
      return;
    }
    // Confirm destructive action — hard-deletes run against real data.
    const ok = window.confirm(
      'Run the retention agent now? This will mark stage-1 candidates and hard-delete stage-2 candidates older than the grace period.'
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await messageService.runRetention({ dry_run: false });
      const env = res?.data || res;
      const marked = env?.total_marked || 0;
      const deleted = env?.total_deleted || 0;
      toast.success(`Retention run complete — marked ${marked}, deleted ${deleted}`);
      setPreview(env);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Retention run failed');
    } finally {
      setBusy(false);
    }
  };

  // ─── Renderers ──────────────────────────────────────────────────────
  const renderRetentionRow = (row) => {
    const value = resolveValue(row);
    const active = resolveActive(row);
    const isBool = BOOL_CODES.has(row.code);
    const isArray = ARRAY_CODES.has(row.code);
    const meta = row.metadata || {};
    const dirty = hasDraft(row._id);

    return (
      <div key={row._id} className={`irs-row${dirty ? ' irs-dirty' : ''}`}>
        <div className="irs-label">
          {row.label}
          {dirty && <span className="irs-meta">unsaved</span>}
        </div>
        <div className="irs-code">{row.code}</div>
        <div className="irs-controls">
          {isBool && (
            <label className="irs-toggle">
              <input
                type="checkbox"
                checked={!!value}
                disabled={!canManage}
                onChange={(e) => stageChange(row._id, {
                  metadata: writeValue(row.metadata, e.target.checked),
                })}
              />
              {value ? 'Enabled' : 'Disabled'}
            </label>
          )}
          {!isBool && !isArray && (
            <>
              <input
                type="number"
                min={meta.min ?? 0}
                max={meta.max ?? undefined}
                value={value ?? 0}
                disabled={!canManage || !active}
                onChange={(e) => stageChange(row._id, {
                  metadata: writeValue(row.metadata, clampNumber(e.target.value, meta)),
                })}
              />
              <span className="irs-unit">{meta.unit || 'days'}</span>
            </>
          )}
          {isArray && (
            <span className="irs-array">
              {Array.isArray(value) ? value.join(', ') : String(value ?? '')}
            </span>
          )}
        </div>
        {!isBool && (
          <label className="irs-toggle" style={{ marginTop: 2 }}>
            <input
              type="checkbox"
              checked={active}
              disabled={!canManage}
              onChange={(e) => stageChange(row._id, { is_active: e.target.checked })}
            />
            <span style={{ color: active ? 'inherit' : 'var(--erp-muted)' }}>
              {active ? 'Active' : 'Inactive'}
            </span>
          </label>
        )}
      </div>
    );
  };

  const renderAckRow = (row) => {
    const value = resolveValue(row);
    const active = resolveActive(row);
    const dirty = hasDraft(row._id);
    const meta = row.metadata || {};
    const isArrayRule = Array.isArray(value);
    // Supplementary context — shows what the rule applies to (folders, roles, etc.)
    const contextBits = [];
    if (Array.isArray(meta.folders)) contextBits.push(`folders: ${meta.folders.join(', ')}`);
    if (Array.isArray(meta.categories)) contextBits.push(`categories: ${meta.categories.join(', ')}`);

    return (
      <div key={row._id} className={`irs-row${dirty ? ' irs-dirty' : ''}`}>
        <div className="irs-label">
          {row.label}
          {dirty && <span className="irs-meta">unsaved</span>}
        </div>
        <div className="irs-code">{row.code}</div>
        <div className="irs-controls">
          {!isArrayRule && (
            <label className="irs-toggle">
              <input
                type="checkbox"
                checked={!!value}
                disabled={!canManage}
                onChange={(e) => stageChange(row._id, {
                  metadata: writeValue(row.metadata, e.target.checked),
                })}
              />
              {value ? 'Rule enabled' : 'Rule disabled'}
            </label>
          )}
          {isArrayRule && (
            <span className="irs-array">{value.join(', ') || '—'}</span>
          )}
        </div>
        {contextBits.length > 0 && (
          <div className="irs-array">{contextBits.join(' · ')}</div>
        )}
        <label className="irs-toggle" style={{ marginTop: 2 }}>
          <input
            type="checkbox"
            checked={active}
            disabled={!canManage}
            onChange={(e) => stageChange(row._id, { is_active: e.target.checked })}
          />
          <span style={{ color: active ? 'inherit' : 'var(--erp-muted)' }}>
            {active ? 'Active' : 'Inactive'}
          </span>
        </label>
      </div>
    );
  };

  const previewSummary = useMemo(() => {
    if (!preview) return null;
    const marked = preview.total_marked ?? 0;
    const deleted = preview.total_deleted ?? 0;
    const entities = Array.isArray(preview.entities) ? preview.entities.length : 0;
    const skipped = Array.isArray(preview.entities)
      ? preview.entities.filter((e) => e.skipped).length
      : 0;
    return { marked, deleted, entities, skipped, at: preview.at };
  }, [preview]);

  return (
    <>
      <style>{pageStyles}</style>
      <div className="irs-wrap">
        <div className="irs-header">
          <div>
            <h1>Inbox Retention</h1>
            <p className="irs-sub">
              Controls the nightly <code>#MR Inbox Retention</code> agent (2 AM Manila). Per-entity
              retention windows + acknowledgement defaults. Edits take effect on the next run.
            </p>
          </div>
          <div className="irs-actions">
            <button
              className="btn btn-outline"
              onClick={doPreview}
              disabled={busy}
              title="Dry-run — counts candidates without deleting"
            >
              Preview
            </button>
            <button
              className="btn btn-warn"
              onClick={runNow}
              disabled={busy || !canManage || dirtyCount > 0}
              title={dirtyCount > 0 ? 'Save pending changes first' : 'Hard-runs the retention agent now'}
            >
              Run Now
            </button>
          </div>
        </div>

        {loading ? (
          <div className="irs-empty">Loading retention settings…</div>
        ) : (
          <>
            {/* ── Retention thresholds ────────────────────────────────── */}
            <div className="irs-section">
              <h3>Retention Thresholds</h3>
              <p className="irs-lead">
                Each rule below defines how many days before a matching message is flagged for
                soft-delete. After the grace period, flagged messages are hard-purged. Guards:
                the agent never purges unacknowledged must-ack messages or open approvals.
              </p>
              {retentionRows.length === 0 ? (
                <div className="irs-empty">
                  No retention rows for this entity yet.
                  {canManage && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        className="btn btn-success"
                        onClick={() => seedCategory(RETENTION_CATEGORY)}
                        disabled={busy}
                      >
                        Seed Defaults
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="irs-grid">
                  {retentionRows.map(renderRetentionRow)}
                </div>
              )}
            </div>

            {/* ── Acknowledgement defaults ──────────────────────────── */}
            <div className="irs-section">
              <h3>Acknowledgement Defaults</h3>
              <p className="irs-lead">
                Flags new messages as <em>must acknowledge</em> automatically based on folder,
                category, or sender role. Deactivate a rule to remove it from the pre-save hook —
                compose-time &ldquo;Require acknowledgement&rdquo; still wins either way.
              </p>
              {ackRows.length === 0 ? (
                <div className="irs-empty">
                  No acknowledgement rules for this entity yet.
                  {canManage && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        className="btn btn-success"
                        onClick={() => seedCategory(ACK_CATEGORY)}
                        disabled={busy}
                      >
                        Seed Defaults
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="irs-grid">
                  {ackRows.map(renderAckRow)}
                </div>
              )}
            </div>

            {/* ── Save bar ──────────────────────────────────────────── */}
            <div className="irs-actions trailing">
              <button
                className="btn btn-primary"
                onClick={saveAll}
                disabled={!canManage || saving || dirtyCount === 0}
              >
                {saving ? 'Saving…' : `Save${dirtyCount ? ` (${dirtyCount})` : ''}`}
              </button>
              <button
                className="btn btn-outline"
                onClick={discardAll}
                disabled={saving || dirtyCount === 0}
              >
                Discard changes
              </button>
            </div>

            {/* ── Preview / run result card ─────────────────────────── */}
            {previewSummary && (
              <div className="irs-preview-card" role="status">
                <strong>
                  {(preview?.dry_run ? 'Dry-run' : 'Last run')} — {previewSummary.marked} marked,{' '}
                  {previewSummary.deleted} deleted
                </strong>
                <div>
                  Scope: {previewSummary.entities} entit{previewSummary.entities === 1 ? 'y' : 'ies'}
                  {previewSummary.skipped > 0 ? ` (${previewSummary.skipped} skipped — retention disabled)` : ''}
                  {previewSummary.at ? ` · ${new Date(previewSummary.at).toLocaleString()}` : ''}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function InboxRetentionSettings() {
  // Kept for parity with other ERP pages that are reachable as standalone
  // routes (ControlCenter embeds the named export directly). Rendering only
  // the content keeps layout concerns in ControlCenter itself.
  return <InboxRetentionSettingsContent />;
}
