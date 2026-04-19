/**
 * CommandPalette — Phase G7.10
 *
 * Global Cmd/Ctrl+K opens a single-input overlay. On Enter, it forwards the
 * prompt to the Copilot in 'quick' mode. The PRESIDENT_COPILOT.metadata.quick_mode_prompt
 * pushes Claude to prefer NAVIGATE_TO / SEARCH_DOCUMENTS for terse phrases.
 *
 * Reuses the same /api/erp/copilot/chat endpoint — zero new backend code.
 *
 * Unlike PresidentCopilot, this overlay does not maintain its own chat history.
 * It runs a single-turn call, navigates if the response includes a NAVIGATE_TO
 * tool result, and otherwise dispatches a `copilot:open` event so the main
 * widget shows the conversation.
 *
 * Render guard: only renders on /erp/* paths AND only if the Copilot status
 * widget_enabled is true (uses the same /status endpoint via the parent hook
 * via copilotService.getCopilotStatus directly, lightweight).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { getCopilotStatus, postCopilotChat } from '../services/copilotService';

const styles = {
  scrim: {
    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)',
    zIndex: 9100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh',
  },
  panel: {
    width: 'min(640px, 95vw)', background: '#fff', borderRadius: 14,
    boxShadow: '0 25px 60px rgba(15,23,42,0.35)', overflow: 'hidden',
  },
  inputRow: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
    borderBottom: '1px solid #e5e7eb',
  },
  input: {
    flex: 1, border: 'none', outline: 'none', fontSize: 16, padding: '4px 0',
  },
  hint: { padding: '10px 16px', fontSize: 12, color: '#64748b', background: '#f8fafc' },
  resultBox: { padding: 14, fontSize: 13, color: '#1f2937', maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' },
  warn: { padding: '8px 16px', fontSize: 11, background: '#fef3c7', color: '#92400e' },
};

export default function CommandPalette() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const onErp = location.pathname.startsWith('/erp');

  // Fetch widget enabled-ness once per route entry (cheap, cached server side)
  useEffect(() => {
    if (!onErp) { setEnabled(false); return; }
    let mounted = true;
    getCopilotStatus()
      .then((s) => { if (mounted) setEnabled(!!s?.widget_enabled); })
      .catch(() => { if (mounted) setEnabled(false); });
    return () => { mounted = false; };
  }, [onErp, location.pathname]);

  // Global keydown listener
  useEffect(() => {
    if (!enabled) return;
    const handler = (e) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const isMod = isMac ? e.metaKey : e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResult(null);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const submit = useCallback(async (e) => {
    e?.preventDefault?.();
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await postCopilotChat([{ role: 'user', content: text }], 'quick');
      // If the Copilot called NAVIGATE_TO, jump there directly + close
      const nav = (res?.tool_calls || []).find((tc) => tc.tool_code === 'NAVIGATE_TO' && tc.args);
      // Look for the NAVIGATE_TO result URL by inspecting the result_summary text
      // (handler.display = "Open <url>"); fall back to scanning args + reply.
      let url = null;
      if (nav) {
        // The handler returned `display: "Open <url>"`. Re-derive the URL by
        // re-running the same logic: respect args.page → known map, append filters.
        // Simpler: extract from display.
        const m = (nav.result_summary || '').match(/Open\s+(\/\S+)/);
        if (m) url = m[1];
      }
      if (!url && res?.reply) {
        const m2 = res.reply.match(/(\/erp\/[^\s)]+)/);
        if (m2) url = m2[1];
      }
      if (url) {
        setOpen(false);
        navigate(url);
        return;
      }
      // Otherwise show the assistant reply briefly + offer to continue in widget
      setResult(res?.reply || '(no reply)');
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Quick command failed');
    } finally {
      setBusy(false);
    }
  }, [query, busy, navigate]);

  const continueInWidget = useCallback(() => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('copilot:open', { detail: { seedPrompt: query } }));
  }, [query]);

  if (!onErp || !enabled || !open) return null;

  return (
    <div style={styles.scrim} onClick={() => setOpen(false)}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} style={styles.inputRow}>
          <Search size={18} color="#64748b" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={busy ? 'Running…' : 'Quick command — e.g. "open petty cash" or "rejected smers march"'}
            style={styles.input}
            disabled={busy}
          />
          <button type="button" onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={18} />
          </button>
        </form>
        {!result && !error && (
          <div style={styles.hint}>
            ⌘K / Ctrl+K to open · Enter to run · Esc to close · Powered by Copilot
          </div>
        )}
        {result && (
          <>
            <div style={styles.resultBox}>{result}</div>
            <div style={{ padding: '8px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={continueInWidget} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                Continue in Copilot →
              </button>
            </div>
          </>
        )}
        {error && <div style={styles.warn}>⚠️ {error}</div>}
      </div>
    </div>
  );
}
