/**
 * PresidentCopilot — Phase G7.3
 *
 * Floating chat widget mounted in App.jsx, visible only on /erp/* routes for
 * users whose role is in the PRESIDENT_COPILOT lookup row's allowed_roles AND
 * the row is_active. The widget self-hides via /api/erp/copilot/status.
 *
 * Responsibilities:
 *   - Collapsed: circular floating button bottom-right.
 *   - Expanded:  400×600 panel (fullscreen on <768px), chat history, input.
 *   - Tool calls render as collapsible cards.
 *   - Write-confirm pending actions render as bordered card with Execute / Cancel.
 *   - Persists last 20 messages in sessionStorage per entity (handled by hook).
 *
 * Mounted at the App level so navigating between ERP pages keeps the chat open.
 *
 * Companion: CommandPalette (Cmd+K, also calls the same /chat with mode='quick').
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X, Send, Trash2, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { useCopilot } from '../hooks/useCopilot';

const PANEL_W = 400;
const PANEL_H = 600;

const styles = {
  fab: {
    position: 'fixed', right: 20, bottom: 20, zIndex: 9000,
    width: 56, height: 56, borderRadius: 28,
    border: 'none', cursor: 'pointer',
    background: 'linear-gradient(135deg,#6366f1 0%,#a78bfa 100%)',
    color: '#fff',
    boxShadow: '0 6px 18px rgba(99,102,241,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 24,
  },
  badge: {
    position: 'absolute', top: -4, right: -4,
    background: '#ef4444', color: '#fff', borderRadius: 10,
    padding: '2px 6px', fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: 'center',
  },
  panel: (full) => ({
    position: 'fixed',
    right: full ? 0 : 20, bottom: full ? 0 : 88,
    left: full ? 0 : undefined, top: full ? 0 : undefined,
    width: full ? '100vw' : PANEL_W, height: full ? '100vh' : PANEL_H,
    maxWidth: full ? 'none' : '95vw', maxHeight: full ? 'none' : '85vh',
    background: '#fff', borderRadius: full ? 0 : 14,
    boxShadow: '0 10px 40px rgba(15,23,42,0.25)',
    border: '1px solid #e5e7eb',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 9001,
  }),
  header: {
    padding: '10px 14px', borderBottom: '1px solid #e5e7eb',
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'linear-gradient(135deg,#6366f1 0%,#a78bfa 100%)',
    color: '#fff',
  },
  headerTitle: { fontSize: 14, fontWeight: 700, flex: 1 },
  iconBtn: {
    background: 'transparent', border: 'none', color: '#fff',
    cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, overflowY: 'auto', padding: 14, background: '#f8fafc' },
  msgRow: (role) => ({
    display: 'flex', flexDirection: 'column',
    alignItems: role === 'user' ? 'flex-end' : 'flex-start',
    marginBottom: 10,
  }),
  bubble: (role, error) => ({
    maxWidth: '85%', padding: '8px 12px', borderRadius: 12,
    background: error ? '#fef2f2'
      : role === 'user' ? '#6366f1' : '#fff',
    color: error ? '#991b1b' : role === 'user' ? '#fff' : '#1f2937',
    border: error ? '1px solid #fca5a5' : role === 'user' ? 'none' : '1px solid #e5e7eb',
    fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  }),
  toolCard: {
    marginTop: 6, fontSize: 11, background: '#eef2ff', border: '1px solid #c7d2fe',
    borderRadius: 8, padding: '6px 10px', color: '#3730a3', maxWidth: '85%',
  },
  toolCardSummary: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' },
  confirmCard: {
    marginTop: 8, padding: 10, border: '2px solid #f59e0b', borderRadius: 10,
    background: '#fffbeb', maxWidth: '95%', fontSize: 12,
  },
  confirmActions: { marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' },
  inputBar: {
    padding: 10, borderTop: '1px solid #e5e7eb', background: '#fff',
    display: 'flex', gap: 6, alignItems: 'flex-end',
  },
  textarea: {
    flex: 1, minHeight: 36, maxHeight: 120, resize: 'none',
    border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px',
    fontSize: 13, fontFamily: 'inherit',
  },
  sendBtn: (disabled) => ({
    background: disabled ? '#cbd5e1' : '#6366f1', color: '#fff',
    border: 'none', borderRadius: 8, padding: '8px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
  }),
  spendWarn: {
    margin: '0 14px 8px', padding: '6px 10px', borderRadius: 6,
    background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', fontSize: 11,
  },
  empty: {
    padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13,
  },
};

function ToolCard({ tc }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={styles.toolCard}>
      <div style={styles.toolCardSummary} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        🔧 <strong>{tc.tool_code}</strong>
        <span style={{ marginLeft: 'auto', opacity: 0.85 }}>{tc.result_summary || ''}</span>
      </div>
      {open && (
        <pre style={{ margin: '6px 0 0', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
          {JSON.stringify(tc.args, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ConfirmCard({ pending, onExecute, onCancel, executing }) {
  return (
    <div style={styles.confirmCard}>
      <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
        ⚠️ Confirm action — {pending.tool_code}
      </div>
      <div style={{ color: '#78350f' }}>{pending.confirmation_text}</div>
      <div style={styles.confirmActions}>
        <button
          onClick={() => onExecute(pending.confirmation_payload)}
          disabled={executing}
          style={{
            background: '#16a34a', color: '#fff', border: 'none',
            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {executing ? 'Executing…' : '✓ Execute'}
        </button>
        <button
          onClick={onCancel}
          style={{
            background: '#fff', color: '#92400e', border: '1px solid #fcd34d',
            padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PresidentCopilot() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [input, setInput] = useState('');
  // resolved = confirm cards that should hide (user clicked Cancel OR Execute).
  // Tracked by JSON.stringify(payload) since payloads come from the backend in a
  // stable shape (we constructed them, key order is preserved).
  const [resolvedIds, setResolvedIds] = useState(() => new Set());
  const bodyRef = useRef(null);
  const taRef = useRef(null);

  const { status, messages, sending, executing, send, execute, clear, error } =
    useCopilot();

  // Only render on /erp/* paths
  const onErp = location.pathname.startsWith('/erp');

  // Mobile fullscreen toggle on small viewports
  useEffect(() => {
    const handler = () => setFull(window.innerWidth < 768);
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open]);

  // Allow other components (CommandPalette) to open the widget
  useEffect(() => {
    const onOpenEvt = (e) => {
      setOpen(true);
      const seed = e?.detail?.seedPrompt;
      if (seed && taRef.current) {
        setInput(seed);
        setTimeout(() => taRef.current?.focus(), 80);
      }
    };
    window.addEventListener('copilot:open', onOpenEvt);
    return () => window.removeEventListener('copilot:open', onOpenEvt);
  }, []);

  const handleSend = useCallback(async (e) => {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    await send(text, 'normal');
  }, [input, sending, send]);

  const handleExecute = useCallback(async (payload) => {
    const key = JSON.stringify(payload);
    try {
      const res = await execute(payload);
      // Hide the confirm card on success (executed)
      setResolvedIds((prev) => {
        const n = new Set(prev); n.add(key); return n;
      });
      // For DRAFT_NEW_ENTRY, navigate to the prefilled URL after execution
      if (payload?.tool_code === 'DRAFT_NEW_ENTRY' && res?.result?.url) {
        navigate(res.result.url);
      }
    } catch { /* hook surfaced the error; leave the card visible so user can retry */ }
  }, [execute, navigate]);

  const handleCancel = useCallback((payload) => {
    setResolvedIds((prev) => {
      const n = new Set(prev); n.add(JSON.stringify(payload)); return n;
    });
  }, []);

  if (!onErp) return null;
  if (!status) return null; // loading
  if (!status.widget_enabled) return null;

  const buttonLabel = status.feature?.metadata?.button_label || '✨ Copilot';

  return (
    <>
      {/* Floating button (always rendered when widget enabled) */}
      {!open && (
        <button
          style={styles.fab}
          onClick={() => setOpen(true)}
          title={buttonLabel}
          aria-label={buttonLabel}
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div style={styles.panel(full)} role="dialog" aria-label="President Copilot">
          <div style={styles.header}>
            <Sparkles size={18} />
            <div style={styles.headerTitle}>{buttonLabel}</div>
            {!full && (
              <button style={styles.iconBtn} onClick={() => setFull(true)} title="Maximize">
                <Maximize2 size={16} />
              </button>
            )}
            <button style={styles.iconBtn} onClick={clear} title="Clear conversation">
              <Trash2 size={16} />
            </button>
            <button style={styles.iconBtn} onClick={() => setOpen(false)} title="Close">
              <X size={18} />
            </button>
          </div>

          {status.spend?.warning === 'NEAR_CAP' && (
            <div style={styles.spendWarn}>
              ⚠️ AI spend at {status.spend.pct}% of monthly cap (${status.spend.spend?.toFixed(2)} / ${status.spend.cap?.toFixed(2)})
            </div>
          )}

          <div style={styles.body} ref={bodyRef}>
            {messages.length === 0 && (
              <div style={styles.empty}>
                <Sparkles size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div>Ask me about your ERP.</div>
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  Examples: <em>“What needs my approval?”</em><br />
                  <em>“Open the petty cash page.”</em><br />
                  <em>“Today’s collections vs target.”</em>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={styles.msgRow(m.role)}>
                <div style={styles.bubble(m.role, m.error)}>
                  {typeof m.content === 'string' ? m.content : '(structured)'}
                </div>
                {(m.tool_calls || []).map((tc, j) => <ToolCard key={`tc-${i}-${j}`} tc={tc} />)}
                {(m.pending_confirmations || []).map((pc, j) => {
                  const k = JSON.stringify(pc.confirmation_payload);
                  if (resolvedIds.has(k)) return null;
                  return (
                    <ConfirmCard
                      key={`pc-${i}-${j}`}
                      pending={pc}
                      onExecute={handleExecute}
                      onCancel={() => handleCancel(pc.confirmation_payload)}
                      executing={executing}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} style={styles.inputBar}>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              placeholder={sending ? 'Thinking…' : 'Ask anything (Enter to send, Shift+Enter for newline)'}
              style={styles.textarea}
              disabled={sending}
              rows={1}
            />
            <button type="submit" disabled={sending || !input.trim()} style={styles.sendBtn(sending || !input.trim())}>
              <Send size={14} /> Send
            </button>
          </form>
          {error && <div style={{ padding: '4px 14px', color: '#991b1b', fontSize: 11 }}>⚠️ {error}</div>}
        </div>
      )}
    </>
  );
}
