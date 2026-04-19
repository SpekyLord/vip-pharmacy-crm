/**
 * useCopilot — Phase G7.3
 *
 * Manages Copilot chat state: messages, send/execute, status (widget_enabled),
 * pending confirmations, spend warning, loading flags.
 *
 *   const {
 *     status,                      // null | { widget_enabled, feature, tools, spend }
 *     messages,                    // [{role:'user'|'assistant', content:string|array, tool_calls?, pending?}]
 *     sending, executing, error,
 *     send,                         // (text, mode='normal') → Promise<void>
 *     execute,                      // (confirmation_payload) → Promise<{ok, display, ...}>
 *     clear,                        // wipe in-memory + sessionStorage
 *     reload,                       // re-fetch /status (after AI Cowork toggle)
 *   } = useCopilot();
 *
 * Persists last 20 messages in sessionStorage per entity (key:
 * `copilot_history:<entityId>`). Cleared on entity switch (handled by
 * EntityContext; the hook just re-keys when entityId changes via re-mount).
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { getCopilotStatus, postCopilotChat, postCopilotExecute } from '../services/copilotService';

const HISTORY_LIMIT = 20;
const HISTORY_KEY = (entityId) => `copilot_history:${entityId || 'default'}`;

function loadHistory(entityId) {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY(entityId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(-HISTORY_LIMIT);
  } catch { return []; }
}

function saveHistory(entityId, msgs) {
  try {
    sessionStorage.setItem(
      HISTORY_KEY(entityId),
      JSON.stringify(msgs.slice(-HISTORY_LIMIT)),
    );
  } catch { /* sessionStorage may be full */ }
}

export function useCopilot() {
  const { user } = useAuth();
  const entityId = user?.entity_id || user?.entityId || null;

  const [status, setStatus] = useState(null);
  const [messages, setMessages] = useState(() => loadHistory(entityId));
  const [sending, setSending] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const reload = useCallback(async () => {
    try {
      const s = await getCopilotStatus();
      if (mountedRef.current) setStatus(s);
    } catch {
      if (mountedRef.current) setStatus({ widget_enabled: false });
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Persist on every message change
  useEffect(() => { saveHistory(entityId, messages); }, [entityId, messages]);

  // When entity changes, drop in-memory + reload from new entity's storage
  useEffect(() => {
    setMessages(loadHistory(entityId));
  }, [entityId]);

  const clear = useCallback(() => {
    setMessages([]);
    try { sessionStorage.removeItem(HISTORY_KEY(entityId)); } catch { /* noop */ }
  }, [entityId]);

  const send = useCallback(async (text, mode = 'normal') => {
    const trimmed = String(text || '').trim();
    if (!trimmed || sending) return;
    setError(null);
    const userMsg = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    try {
      // Send only the chat-shaped messages (user/assistant text).
      const chatMessages = [...messages, userMsg]
        .filter((m) => typeof m.content === 'string')
        .slice(-HISTORY_LIMIT)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await postCopilotChat(chatMessages, mode);
      if (!mountedRef.current) return;
      const assistantMsg = {
        role: 'assistant',
        content: res?.reply || '(no reply)',
        tool_calls: res?.tool_calls || [],
        pending_confirmations: res?.pending_confirmations || [],
        usage: res?.usage,
        spend_warning: res?.spend_warning,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      return assistantMsg;
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Copilot call failed';
      if (mountedRef.current) {
        setError(msg);
        setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg}`, error: true }]);
      }
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [messages, sending]);

  const execute = useCallback(async (confirmation_payload) => {
    setExecuting(true);
    setError(null);
    try {
      const res = await postCopilotExecute(confirmation_payload);
      if (!mountedRef.current) return res;
      // Append a system-ish assistant message echoing the result
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: res?.display || `Executed ${confirmation_payload?.tool_code || 'action'}.`,
        executed_payload: confirmation_payload,
        executed_result: res?.result,
      }]);
      return res;
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Execute failed';
      if (mountedRef.current) {
        setError(msg);
        setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${msg}`, error: true }]);
      }
      throw e;
    } finally {
      if (mountedRef.current) setExecuting(false);
    }
  }, []);

  return {
    status,
    messages,
    sending,
    executing,
    error,
    send,
    execute,
    clear,
    reload,
  };
}

export default useCopilot;
