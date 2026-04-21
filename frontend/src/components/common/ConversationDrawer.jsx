/**
 * ConversationDrawer
 *
 * Slide-over panel (right side) showing the full chat thread with a VIP Client
 * on a selected channel. Supports send, optimistic updates, and 10s polling.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import communicationLogService from '../../services/communicationLogService';
import inviteService from '../../services/inviteService';

const CHANNELS = [
  { value: 'MESSENGER', label: 'Messenger', idField: 'messengerId' },
  { value: 'VIBER', label: 'Viber', idField: 'viberId' },
  { value: 'WHATSAPP', label: 'WhatsApp', idField: 'whatsappNumber' },
  { value: 'EMAIL', label: 'Email', idField: 'email' },
];

const STATUS_ICON = {
  sent: '○',
  delivered: '◉',
  read: '✓',
  failed: '✗',
};

function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ConversationDrawer({ doctor, onClose }) {
  const availableChannels = CHANNELS.filter((ch) => doctor?.[ch.idField]);
  const [channel, setChannel] = useState(availableChannels[0]?.value || 'MESSENGER');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Phase M1 — invite-link state when this channel has no external ID on file
  const [inviteLink, setInviteLink] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);
  const pollRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    if (!doctor?._id) return;
    try {
      const res = await communicationLogService.getByDoctor(doctor._id, {
        sort: 'asc',
        source: 'api',
        limit: 100,
      });
      setMessages(res.data || []);
    } catch {
      // silently ignore poll failures
    } finally {
      setLoading(false);
    }
  }, [doctor?._id]);

  // Initial fetch + poll every 10s
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 10000);
    return () => clearInterval(pollRef.current);
  }, [fetchMessages, channel]);

  // Reset invite state when channel changes
  useEffect(() => {
    setInviteLink(null);
    setCopied(false);
  }, [channel]);

  // Phase M1 — Generate a deep-link invite for Messenger/Viber/WhatsApp
  const handleGenerateInvite = async () => {
    if (inviteBusy || !doctor?._id) return;
    setInviteBusy(true);
    setError('');
    try {
      const res = await inviteService.generate({ doctorId: doctor._id, channel });
      if (res?.data?.linkUrl) {
        setInviteLink(res.data.linkUrl);
      } else {
        setError('Invite generated but no link returned. Check channel config.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to generate invite.');
    } finally {
      setInviteBusy(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Copy failed. Select the link text manually.');
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    setError('');

    // Optimistic bubble
    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      _id: tempId,
      direction: 'outbound',
      source: 'api',
      messageContent: content,
      channel,
      deliveryStatus: 'sent',
      contactedAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      await communicationLogService.sendMessage({
        doctorId: doctor._id,
        channel,
        message: content,
      });
      // Real data will arrive on next poll
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send message.');
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by date
  const grouped = [];
  let lastDate = '';
  for (const msg of messages) {
    const dateLabel = formatDateLabel(msg.contactedAt);
    if (dateLabel !== lastDate) {
      grouped.push({ type: 'separator', label: dateLabel });
      lastDate = dateLabel;
    }
    grouped.push({ type: 'message', msg });
  }

  const doctorName = doctor ? `${doctor.firstName} ${doctor.lastName}` : '';
  const hasChannelId = availableChannels.some((ch) => ch.value === channel);

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Drawer */}
      <div style={styles.drawer}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <button style={styles.closeBtn} onClick={onClose} title="Close">✕</button>
            <div>
              <div style={styles.doctorName}>{doctorName}</div>
              <div style={styles.channelRow}>
                {CHANNELS.map((ch) => {
                  const active = ch.value === channel;
                  const noId = !doctor?.[ch.idField];
                  return (
                    <button
                      key={ch.value}
                      style={{
                        ...styles.channelBtn,
                        ...(active ? styles.channelBtnActive : {}),
                        ...(noId ? styles.channelBtnDisabled : {}),
                      }}
                      onClick={() => setChannel(ch.value)}
                      title={noId ? `No ${ch.label} ID set — click to send an invite` : ch.label}
                    >
                      {ch.label}
                      {noId && <span style={styles.channelBtnDot} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={styles.body} ref={bodyRef}>
          {loading && (
            <div style={styles.centeredMsg}>Loading messages…</div>
          )}
          {!loading && messages.length === 0 && (
            <div style={styles.centeredMsg}>No messages yet. Send the first one!</div>
          )}
          {grouped.map((item, i) => {
            if (item.type === 'separator') {
              return (
                <div key={`sep-${i}`} style={styles.dateSep}>
                  <span style={styles.dateSepLabel}>{item.label}</span>
                </div>
              );
            }
            const { msg } = item;
            const isOut = msg.direction === 'outbound';
            return (
              <div key={msg._id} style={{ ...styles.msgRow, justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...styles.bubble, ...(isOut ? styles.bubbleOut : styles.bubbleIn) }}>
                  <div style={styles.bubbleText}>{msg.messageContent}</div>
                  <div style={styles.bubbleMeta}>
                    <span>{formatTime(msg.contactedAt)}</span>
                    {isOut && (
                      <span style={{ marginLeft: 4, color: msg.deliveryStatus === 'failed' ? '#ef4444' : '#94a3b8' }}>
                        {STATUS_ICON[msg.deliveryStatus] || '○'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          {!hasChannelId && channel === 'EMAIL' && (
            <div style={styles.noChannelNote}>
              No email address on file for this VIP Client. Update their profile to enable email.
            </div>
          )}
          {!hasChannelId && channel !== 'EMAIL' && !inviteLink && (
            <div style={styles.inviteBox}>
              <div style={styles.inviteBoxTitle}>
                No {CHANNELS.find((c) => c.value === channel)?.label} link for {doctor?.firstName || 'this VIP Client'} yet.
              </div>
              <div style={styles.inviteBoxBody}>
                Generate a one-time invite link — send it to them via text or personal chat.
                When they tap it and reply, their {CHANNELS.find((c) => c.value === channel)?.label} ID
                will auto-link to this profile.
              </div>
              <button
                style={styles.inviteBtn}
                onClick={handleGenerateInvite}
                disabled={inviteBusy}
              >
                {inviteBusy ? 'Generating…' : `Generate ${CHANNELS.find((c) => c.value === channel)?.label} Invite`}
              </button>
            </div>
          )}
          {!hasChannelId && channel !== 'EMAIL' && inviteLink && (
            <div style={styles.inviteBox}>
              <div style={styles.inviteBoxTitle}>Invite link ready</div>
              <div style={styles.inviteLinkRow}>
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  onFocus={(e) => e.target.select()}
                  style={styles.inviteLinkInput}
                />
                <button style={styles.inviteCopyBtn} onClick={handleCopyInvite}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div style={styles.inviteBoxBody}>
                Send this link to {doctor?.firstName || 'them'} through any channel you already have
                (SMS, personal FB, in-person QR). First reply auto-links and opens this chat for real-time conversation.
              </div>
            </div>
          )}
          {error && <div style={styles.errorNote}>{error}</div>}
          <div style={styles.inputRow}>
            <textarea
              style={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={hasChannelId ? 'Type a message… (Enter to send)' : 'Channel ID required'}
              disabled={!hasChannelId || sending}
              rows={2}
            />
            <button
              style={{ ...styles.sendBtn, opacity: (!text.trim() || !hasChannelId || sending) ? 0.5 : 1 }}
              onClick={handleSend}
              disabled={!text.trim() || !hasChannelId || sending}
            >
              {sending ? '…' : '▶'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000,
  },
  drawer: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
    maxWidth: '100vw',
    background: '#fff', zIndex: 1001,
    display: 'flex', flexDirection: 'column',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
  },
  header: {
    padding: '14px 16px',
    borderBottom: '1px solid #e5e7eb',
    background: '#1e40af',
    color: '#fff',
  },
  headerLeft: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  closeBtn: {
    background: 'transparent', border: 'none', color: '#fff',
    fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1, marginTop: 2,
  },
  doctorName: { fontWeight: 700, fontSize: 15, marginBottom: 6 },
  channelRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  channelBtn: {
    padding: '3px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.4)',
    background: 'transparent', color: '#e0e7ff', fontSize: 12, cursor: 'pointer',
  },
  channelBtnActive: {
    background: '#fff', color: '#1e40af', border: '1px solid #fff', fontWeight: 600,
  },
  channelBtnDisabled: {
    opacity: 0.6,
    fontStyle: 'italic',
  },
  channelBtnDot: {
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: '#fbbf24', marginLeft: 5, verticalAlign: 'middle',
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '16px 12px',
    display: 'flex', flexDirection: 'column', gap: 4,
    background: '#f8fafc',
  },
  centeredMsg: { textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 32 },
  dateSep: { display: 'flex', alignItems: 'center', margin: '12px 0 4px' },
  dateSepLabel: {
    margin: '0 auto', padding: '2px 12px',
    background: '#e2e8f0', borderRadius: 10, fontSize: 11, color: '#64748b',
  },
  msgRow: { display: 'flex', marginBottom: 4 },
  bubble: {
    maxWidth: '75%', padding: '8px 12px', borderRadius: 14,
    fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word',
  },
  bubbleOut: { background: '#2563eb', color: '#fff', borderBottomRightRadius: 4 },
  bubbleIn: { background: '#fff', color: '#1f2937', borderBottomLeftRadius: 4, border: '1px solid #e5e7eb' },
  bubbleText: { whiteSpace: 'pre-wrap' },
  bubbleMeta: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 10, marginTop: 4, opacity: 0.7 },
  footer: {
    borderTop: '1px solid #e5e7eb',
    padding: '10px 12px',
    background: '#fff',
  },
  // Phase M1 invite UI
  inviteBox: {
    background: '#eff6ff', border: '1px solid #bfdbfe',
    borderRadius: 8, padding: '10px 12px', marginBottom: 8,
  },
  inviteBoxTitle: { fontSize: 13, fontWeight: 600, color: '#1e40af', marginBottom: 6 },
  inviteBoxBody: { fontSize: 12, color: '#475569', lineHeight: 1.45, marginTop: 6 },
  inviteBtn: {
    marginTop: 8, width: '100%', padding: '10px 12px',
    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  inviteLinkRow: { display: 'flex', gap: 6, alignItems: 'center' },
  inviteLinkInput: {
    flex: 1, border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 8px',
    fontSize: 11, background: '#fff', color: '#1e293b',
  },
  inviteCopyBtn: {
    padding: '6px 12px', background: '#1e40af', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  noChannelNote: {
    background: '#fef3c7', border: '1px solid #fde68a',
    borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 8,
  },
  errorNote: {
    background: '#fee2e2', borderRadius: 8, padding: '6px 10px',
    fontSize: 12, color: '#b91c1c', marginBottom: 6,
  },
  inputRow: { display: 'flex', gap: 8, alignItems: 'flex-end' },
  textarea: {
    flex: 1, resize: 'none', border: '1px solid #d1d5db', borderRadius: 10,
    padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
    lineHeight: 1.4,
  },
  sendBtn: {
    background: '#2563eb', color: '#fff', border: 'none',
    borderRadius: 10, padding: '8px 14px', fontSize: 16,
    cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-end',
  },
};
