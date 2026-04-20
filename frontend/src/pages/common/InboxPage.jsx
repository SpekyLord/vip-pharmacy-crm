/**
 * InboxPage — Phase G9.R5 Unified Operational Inbox
 *
 * Single inbox surface for ALL roles. Replaces the BDM-only
 * EMP_InboxPage (which now re-exports this for /bdm/inbox URL stability).
 *
 * Layout
 *   Desktop / tablet (>=768px): three columns — folders, message list, thread
 *   Mobile (<768px):              one column at a time, bottom drawer for thread
 *
 * Folder semantics
 *   - INBOX:           everything not archived
 *   - ACTION_REQUIRED: rows with requires_action && !action_completed_at
 *   - APPROVALS / TASKS / AI_AGENT_REPORTS / ANNOUNCEMENTS / CHAT: folder match
 *   - SENT:            messages I sent
 *   - ARCHIVE:         messages the current user self-archived (archivedBy contains me)
 *
 * Task folder swap
 *   When folder=TASKS, the right pane mounts <TaskMiniEditor> instead of the
 *   generic <InboxThreadView>. The editor reads task by source_doc_id /
 *   action_payload.task_id and saves via PATCH /erp/tasks/:id (Rule #20: never
 *   reimplement task logic in the inbox).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import WorkflowGuide from '../../erp/components/WorkflowGuide';
import InboxFolderNav from '../../components/common/inbox/InboxFolderNav';
import InboxMessageList from '../../components/common/inbox/InboxMessageList';
import InboxThreadView from '../../components/common/inbox/InboxThreadView';
import InboxComposeModal from '../../components/common/inbox/InboxComposeModal';
import TaskMiniEditor from '../../erp/components/TaskMiniEditor';
import messageService from '../../services/messageInboxService';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { Plus, RefreshCw } from 'lucide-react';

const styles = `
  .ip-shell { display: grid; grid-template-columns: 240px 360px 1fr; height: calc(100vh - 88px); min-height: 0; gap: 0; background: #f8fafc; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
  body.dark-mode .ip-shell { background: #0b1220; }
  .ip-pane { background: #fff; min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
  body.dark-mode .ip-pane { background: #0f172a; }
  .ip-pane.folders { border-right: 1px solid #e5e7eb; overflow-y: auto; }
  .ip-pane.list { border-right: 1px solid #e5e7eb; overflow-y: auto; }
  body.dark-mode .ip-pane.folders, body.dark-mode .ip-pane.list { border-color: #1e293b; }
  .ip-toolbar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; background: #fff; }
  body.dark-mode .ip-toolbar { background: #0f172a; border-color: #1e293b; }
  .ip-toolbar h2 { margin: 0; font-size: 15px; font-weight: 800; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.dark-mode .ip-toolbar h2 { color: #f1f5f9; }
  .ip-tbtn { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; color: #334155; display: inline-flex; align-items: center; gap: 4px; min-height: 36px; }
  .ip-tbtn:hover { background: #f1f5f9; }
  .ip-tbtn.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .ip-tbtn.primary:hover { background: #1d4ed8; }
  body.dark-mode .ip-tbtn { background: #1e293b; color: #cbd5e1; border-color: #334155; }
  .ip-search { padding: 10px 14px; border-bottom: 1px solid #e5e7eb; background: #fafbfc; }
  body.dark-mode .ip-search { background: #142036; border-color: #1e293b; }
  .ip-search input { width: 100%; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; }
  body.dark-mode .ip-search input { background: #0b1220; border-color: #1e293b; color: #e2e8f0; }
  .ip-mobile-tab { display: none; }

  @media (max-width: 1023px) {
    .ip-shell { grid-template-columns: 200px 1fr; }
    .ip-pane.thread.show-mobile { position: fixed; inset: 0; z-index: 50; }
  }
  @media (max-width: 767px) {
    .ip-shell { grid-template-columns: 1fr; height: calc(100vh - 56px); position: relative; }
    .ip-pane.folders { display: none; }
    .ip-pane.list { display: flex; }
    .ip-pane.thread { display: none; }
    .ip-pane.thread.open { display: flex; position: fixed; inset: 0; z-index: 50; }
    .ip-mobile-tab { display: flex; gap: 4px; padding: 8px; background: #fff; border-bottom: 1px solid #e5e7eb; overflow-x: auto; }
    .ip-mobile-tab button { white-space: nowrap; padding: 8px 12px; font-size: 12px; font-weight: 700; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; min-height: 44px; }
    .ip-mobile-tab button.active { background: #2563eb; color: #fff; border-color: #2563eb; }
  }
`;

const DEFAULT_FOLDERS = [
  { code: 'INBOX', label: 'Inbox', sort_order: 1 },
  { code: 'ACTION_REQUIRED', label: 'Action Required', sort_order: 2 },
  { code: 'APPROVALS', label: 'Approvals', sort_order: 3 },
  { code: 'TASKS', label: 'Tasks / To-Do', sort_order: 4 },
  { code: 'AI_AGENT_REPORTS', label: 'AI Agents', sort_order: 5 },
  { code: 'ANNOUNCEMENTS', label: 'Announcements', sort_order: 6 },
  { code: 'CHAT', label: 'Chat', sort_order: 7 },
  { code: 'SENT', label: 'Sent', sort_order: 8 },
  { code: 'ARCHIVE', label: 'Archive', sort_order: 9 },
];

export default function InboxPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const params = useParams();
  const initialThreadId = params.thread_id || null;

  const [folders, setFolders] = useState(DEFAULT_FOLDERS);
  const [actionsConfig, setActionsConfig] = useState([]);
  const [activeFolder, setActiveFolder] = useState('INBOX');
  const [counts, setCounts] = useState({});
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMessage, setActiveMessage] = useState(null);
  const [thread, setThread] = useState([]);
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [taskFromMsg, setTaskFromMsg] = useState(null);
  const abortRef = useRef(null);

  // ── Bootstrap: folders + actions config (lookup-driven) ──────────
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const json = await messageService.getFolders();
        if (!live) return;
        if (json?.data?.folders?.length) setFolders(json.data.folders);
        if (json?.data?.actions?.length) setActionsConfig(json.data.actions);
      } catch {
        // keep defaults
      }
    })();
    return () => { live = false; };
  }, []);

  // ── Refresh list when folder/search changes ─────────────────────
  const refreshList = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const json = await messageService.list({
        folder: activeFolder,
        search: search.trim() || undefined,
        counts: 1,
        limit: 50,
      }, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setMessages(json?.data || []);
      if (json?.counts) setCounts(json.counts);
    } catch (err) {
      if (err?.code !== 'ERR_CANCELED' && err?.name !== 'CanceledError') {
        console.error('Inbox list failed:', err);
        toast.error('Could not load messages');
        setMessages([]);
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [activeFolder, search]);

  useEffect(() => {
    refreshList();
    const onUpdate = () => refreshList();
    window.addEventListener('inbox:updated', onUpdate);
    return () => window.removeEventListener('inbox:updated', onUpdate);
  }, [refreshList]);

  // ── Open message → load thread + (if TASKS) load Task ─────────────
  const openMessage = useCallback(async (msg) => {
    setActiveMessage(msg);
    setTaskFromMsg(null);
    if (!msg) { setThread([]); return; }
    // Mark read (server side); UI will reflect on next list refresh.
    if (!msg.read) {
      try { await messageService.markRead(msg._id); } catch { /* best-effort */ }
      window.dispatchEvent(new Event('inbox:updated'));
    }
    // Pull thread if there's a thread_id (otherwise just show this row)
    if (msg.thread_id) {
      try {
        const t = await messageService.getThread(msg.thread_id);
        setThread(t?.data || [msg]);
      } catch {
        setThread([msg]);
      }
    } else {
      setThread([msg]);
    }
    // For TASKS folder: load the underlying Task by action_payload.task_id
    if (msg.folder === 'TASKS' && msg.action_payload?.task_id) {
      try {
        const res = await api.get(`/erp/tasks/${msg.action_payload.task_id}`, { withCredentials: true });
        setTaskFromMsg(res?.data?.data || res?.data || null);
      } catch {
        // Task may have been deleted; silent fall-through.
        setTaskFromMsg(null);
      }
    }
    // URL deep-link cleanup: if the user opened /inbox/thread/:id and then
    // clicked a different message in the list, drop the deep-link from the URL
    // so a future refresh doesn't re-open the original thread.
    if (initialThreadId && msg.thread_id && String(msg.thread_id) !== String(initialThreadId)) {
      navigate('/inbox', { replace: true });
    }
  }, [navigate, initialThreadId]);

  // Auto-open when URL has thread_id. Try the in-memory list first
  // (cheap); if the deep-linked thread isn't in the active folder's slice,
  // fall back to fetching the thread directly so the deep-link still works.
  useEffect(() => {
    if (!initialThreadId) return;
    let cancelled = false;
    (async () => {
      const inListHit = messages.find(
        (m) => String(m.thread_id) === String(initialThreadId) || String(m._id) === String(initialThreadId)
      );
      if (inListHit) { openMessage(inListHit); return; }
      // Not in current folder — fetch the thread directly. Use the oldest
      // message of the thread (idx 0) as the row to open; openMessage will
      // re-fetch the full thread for the right pane.
      try {
        const t = await messageService.getThread(initialThreadId);
        const rows = t?.data || [];
        if (!cancelled && rows.length > 0) openMessage(rows[0]);
      } catch {
        // Silently ignore — deep-link may have pointed at a deleted thread.
      }
    })();
    return () => { cancelled = true; };
    // openMessage intentionally omitted from deps to avoid re-running on its identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialThreadId, messages]);

  // ── Action handler (approve/reject/resolve/acknowledge) ─────────
  const handleAction = useCallback(async (id, args) => {
    setActionBusy(true);
    try {
      const json = await messageService.executeAction(id, args);
      toast.success('Done');
      window.dispatchEvent(new Event('inbox:updated'));
      window.dispatchEvent(new Event('approval:updated'));
      // Refresh the active message + list
      if (json?.data) setActiveMessage(json.data);
      refreshList();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Action failed';
      toast.error(msg);
    } finally {
      setActionBusy(false);
    }
  }, [refreshList]);

  // ── Phase G9.R8 — Archive / Unarchive / Acknowledge / Read-receipts ──
  // All four delegate to messageService; each refreshes the list (so
  // badge counts update) and refreshes the active message DTO (so the
  // ACK chip / Archive/Unarchive label flip without a full re-open).
  const refreshActive = useCallback(async (id) => {
    try {
      const t = await messageService.getThread(id); // cheap re-fetch for the thread
      if (t?.data?.length) {
        const updated = t.data.find((m) => String(m._id) === String(id)) || t.data[0];
        setActiveMessage(updated);
        setThread(t.data);
      }
    } catch {
      /* best-effort */
    }
  }, []);

  const handleArchiveToggle = useCallback(async (id, nextArchived) => {
    setActionBusy(true);
    try {
      if (nextArchived) await messageService.archive(id);
      else await messageService.unarchive(id);
      toast.success(nextArchived ? 'Archived' : 'Restored to inbox');
      await refreshActive(id);
      refreshList();
      window.dispatchEvent(new Event('inbox:updated'));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Archive failed');
    } finally {
      setActionBusy(false);
    }
  }, [refreshActive, refreshList]);

  const handleAcknowledgeMessage = useCallback(async (id) => {
    setActionBusy(true);
    try {
      const res = await messageService.acknowledge(id);
      if (res?.data) setActiveMessage(res.data);
      toast.success('Acknowledged');
      refreshList();
      window.dispatchEvent(new Event('inbox:updated'));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not acknowledge');
    } finally {
      setActionBusy(false);
    }
  }, [refreshList]);

  const handleViewReceipts = useCallback(async (id) => {
    const res = await messageService.getAckStatus(id);
    return res?.data || null;
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    setActionBusy(true);
    try {
      const res = await messageService.markAllRead(activeFolder);
      const modified = res?.data?.modified || 0;
      toast.success(modified > 0 ? `Marked ${modified} read` : 'Nothing to mark read');
      refreshList();
      window.dispatchEvent(new Event('inbox:updated'));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Could not mark all read');
    } finally {
      setActionBusy(false);
    }
  }, [activeFolder, refreshList]);

  const handleBulkArchive = useCallback(async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    setActionBusy(true);
    try {
      const res = await messageService.bulkArchive(ids);
      const modified = res?.data?.modified || 0;
      toast.success(`Archived ${modified} message${modified === 1 ? '' : 's'}`);
      refreshList();
      setActiveMessage((curr) => (curr && ids.includes(String(curr._id)) ? null : curr));
      window.dispatchEvent(new Event('inbox:updated'));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Bulk archive failed');
    } finally {
      setActionBusy(false);
    }
  }, [refreshList]);

  // ── Reply handler ────────────────────────────────────────────────
  const handleReply = useCallback(async (id, body) => {
    setActionBusy(true);
    try {
      await messageService.reply(id, body);
      toast.success('Reply sent');
      window.dispatchEvent(new Event('inbox:updated'));
      // Reload thread for the active message
      if (activeMessage?.thread_id || activeMessage?._id) {
        const tid = activeMessage.thread_id || activeMessage._id;
        const t = await messageService.getThread(tid);
        setThread(t?.data || [activeMessage]);
      }
      refreshList();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Reply failed';
      toast.error(msg);
    } finally {
      setActionBusy(false);
    }
  }, [activeMessage, refreshList]);

  const folderTitle = useMemo(() => {
    return folders.find((f) => f.code === activeFolder)?.label || 'Inbox';
  }, [folders, activeFolder]);

  const showThreadOnMobile = !!activeMessage;

  return (
    <div className="dashboard-layout">
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content" style={{ padding: '14px' }}>
          {/* PHASETASK-ERP Phase G9 R8: PageGuide.inbox (CRM) + WorkflowGuide.inbox (ERP). */}
          {['president', 'ceo', 'admin', 'finance'].includes(user?.role)
            ? <WorkflowGuide pageKey="inbox" />
            : <PageGuide pageKey="inbox" />}
          <style>{styles}</style>

          <div className="ip-shell" role="region" aria-label="Inbox">
            {/* Folders */}
            <aside className="ip-pane folders">
              <div className="ip-toolbar">
                <h2>Folders</h2>
                <button type="button" className="ip-tbtn primary" onClick={() => setComposeOpen(true)} aria-label="New message">
                  <Plus size={14} /> New
                </button>
              </div>
              <InboxFolderNav
                folders={folders}
                activeFolder={activeFolder}
                counts={counts}
                onSelect={(code) => { setActiveFolder(code); setActiveMessage(null); }}
              />
            </aside>

            {/* Message list */}
            <section className="ip-pane list">
              <div className="ip-toolbar">
                <h2>{folderTitle}</h2>
                <button type="button" className="ip-tbtn" onClick={refreshList} aria-label="Refresh">
                  <RefreshCw size={14} />
                </button>
              </div>
              <div className="ip-search">
                <input
                  type="search"
                  placeholder="Search title, body, sender…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search messages"
                />
              </div>
              <InboxMessageList
                messages={messages}
                activeId={activeMessage?._id}
                onSelect={openMessage}
                loading={loading}
                onMarkAllRead={handleMarkAllRead}
                onBulkArchive={handleBulkArchive}
                busy={actionBusy}
              />
            </section>

            {/* Thread / Task editor */}
            <section className={`ip-pane thread${showThreadOnMobile ? ' open' : ''}`}>
              {activeFolder === 'TASKS' && taskFromMsg ? (
                <TaskMiniEditor
                  task={taskFromMsg}
                  onChange={(updated) => {
                    setTaskFromMsg(updated);
                    // Refresh inbox in case status change closed the requires_action bit
                    refreshList();
                  }}
                  onClose={() => setActiveMessage(null)}
                />
              ) : (
                <InboxThreadView
                  message={activeMessage}
                  thread={thread}
                  currentUserId={user?._id}
                  actionsConfig={actionsConfig}
                  onAction={handleAction}
                  onReply={handleReply}
                  onArchiveToggle={handleArchiveToggle}
                  onAcknowledge={handleAcknowledgeMessage}
                  // Only expose read-receipts to sender + privileged roles.
                  // Parent-side gate mirrors the backend check so the button
                  // only appears when the API will actually return data.
                  onViewReceipts={
                    activeMessage && (
                      String(activeMessage.senderUserId) === String(user?._id)
                      || ['president', 'ceo', 'admin', 'finance'].includes(user?.role)
                    ) ? handleViewReceipts : undefined
                  }
                  onClose={() => setActiveMessage(null)}
                  busy={actionBusy}
                />
              )}
            </section>
          </div>
        </main>
      </div>

      <InboxComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSent={() => refreshList()}
      />
    </div>
  );
}
