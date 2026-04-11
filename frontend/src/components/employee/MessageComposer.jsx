/**
 * MessageComposer — Send Messages via API (Phase 2)
 *
 * Two modes:
 *   1. Free-text: BDM types a custom message and sends
 *   2. Template: BDM picks an admin-created template, previews, and sends in one click
 *
 * Auto-logged as CommunicationLog with source='api'.
 */

import { useState, useRef, useEffect } from 'react';
import useAuth from '../../hooks/useAuth';
import { useLookupOptions } from '../../erp/hooks/useLookups';
import doctorService from '../../services/doctorService';
import clientService from '../../services/clientService';
import communicationLogService from '../../services/communicationLogService';
import messageTemplateService from '../../services/messageTemplateService';
import toast from 'react-hot-toast';

const composerStyles = `
  .mc { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
  .mc-row { margin-bottom: 14px; }
  .mc-label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
  .mc-toggle { display: flex; gap: 0; border-radius: 8px; overflow: hidden; border: 1px solid #d1d5db; }
  .mc-toggle-btn { flex: 1; padding: 10px 12px; border: none; background: #f9fafb; color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer; min-height: 44px; transition: all 0.15s; }
  .mc-toggle-btn.active { background: #2563eb; color: #fff; }
  .mc-input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; min-height: 44px; box-sizing: border-box; }
  .mc-channels { display: flex; flex-wrap: wrap; gap: 8px; }
  .mc-ch-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 48px; padding: 8px 16px; border: 2px solid #d1d5db; border-radius: 24px; background: #f9fafb; color: #4b5563; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
  .mc-ch-btn:hover { border-color: #93c5fd; background: #eff6ff; }
  .mc-ch-btn.selected { border-color: #2563eb; background: #2563eb; color: white; }
  .mc-ch-btn.disabled { opacity: 0.4; cursor: not-allowed; }
  .mc-ch-status { width: 8px; height: 8px; border-radius: 50%; }
  .mc-ch-ok { background: #16a34a; }
  .mc-ch-no { background: #d1d5db; }
  .mc-textarea { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; min-height: 120px; resize: vertical; font-family: inherit; box-sizing: border-box; }
  .mc-send { width: 100%; padding: 14px; background: #16a34a; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; min-height: 48px; transition: all 0.15s; }
  .mc-send:hover { background: #15803d; }
  .mc-send:disabled { background: #94a3b8; cursor: not-allowed; }
  .mc-info { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 12px; font-size: 12px; color: #92400e; margin-bottom: 14px; }
  .mc-mode-toggle { display: flex; gap: 0; border-radius: 8px; overflow: hidden; border: 1px solid #d1d5db; margin-bottom: 14px; }
  .mc-mode-btn { flex: 1; padding: 10px 12px; border: none; background: #f9fafb; color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer; min-height: 44px; transition: all 0.15s; }
  .mc-mode-btn.active { background: #7c3aed; color: #fff; }
  .mc-tpl-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
  .mc-tpl-card { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; transition: all 0.15s; background: #f9fafb; }
  .mc-tpl-card:hover { border-color: #a78bfa; background: #faf5ff; }
  .mc-tpl-card.selected { border-color: #7c3aed; background: #ede9fe; }
  .mc-tpl-name { font-weight: 600; font-size: 14px; color: #1e293b; }
  .mc-tpl-desc { font-size: 12px; color: #64748b; margin-top: 2px; }
  .mc-tpl-cat { font-size: 11px; background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
  .mc-preview { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px; font-size: 13px; color: #166534; white-space: pre-wrap; margin-bottom: 14px; }
  .mc-preview-label { font-size: 11px; font-weight: 600; color: #15803d; text-transform: uppercase; margin-bottom: 6px; }
  body.dark-mode .mc { background: #0f172a; border-color: #1e293b; }
  body.dark-mode .mc-label { color: #94a3b8; }
  body.dark-mode .mc-input, body.dark-mode .mc-textarea { background: #0b1220; border-color: #334155; color: #e2e8f0; }
  body.dark-mode .mc-toggle-btn, body.dark-mode .mc-mode-btn { background: #0b1220; color: #94a3b8; }
  body.dark-mode .mc-toggle-btn.active { background: #2563eb; color: #fff; }
  body.dark-mode .mc-mode-btn.active { background: #7c3aed; color: #fff; }
  body.dark-mode .mc-ch-btn { background: #0b1220; border-color: #334155; color: #e2e8f0; }
  body.dark-mode .mc-ch-btn:hover { border-color: #60a5fa; background: #172554; }
  body.dark-mode .mc-ch-btn.selected { border-color: #60a5fa; background: #2563eb; color: white; }
  body.dark-mode .mc-info { background: #422006; border-color: #854d0e; color: #fef3c7; }
  body.dark-mode .mc-tpl-card { background: #0b1220; border-color: #334155; }
  body.dark-mode .mc-tpl-card:hover { border-color: #8b5cf6; background: #1e1b4b; }
  body.dark-mode .mc-tpl-card.selected { border-color: #8b5cf6; background: #2e1065; }
  body.dark-mode .mc-tpl-name { color: #e2e8f0; }
  body.dark-mode .mc-tpl-cat { background: #334155; color: #94a3b8; }
  body.dark-mode .mc-preview { background: #052e16; border-color: #166534; color: #86efac; }
`;

// Channels that support API sending
const API_CHANNELS = ['VIBER', 'MESSENGER', 'WHATSAPP', 'EMAIL'];

// Map channel to client field
const CHANNEL_FIELD_MAP = {
  WHATSAPP: 'whatsappNumber',
  VIBER: 'viberId',
  MESSENGER: 'messengerId',
  EMAIL: 'email',
};

const MessageComposer = ({ onSuccess }) => {
  const { user } = useAuth();
  const { options: channelOpts } = useLookupOptions('COMM_CHANNEL');

  const [mode, setMode] = useState('freetext'); // freetext | template
  const [clientType, setClientType] = useState('vip');
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [channel, setChannel] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Template state
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [previewText, setPreviewText] = useState('');

  const searchTimeoutRef = useRef(null);

  // Load templates when switching to template mode
  useEffect(() => {
    if (mode === 'template') {
      messageTemplateService.getAll().then((res) => {
        setTemplates(res.data || []);
      }).catch(() => setTemplates([]));
    }
  }, [mode]);

  // Update preview when template or client changes
  useEffect(() => {
    if (selectedTemplate) {
      const context = {
        // Recipient variables (from selected client)
        firstName: selectedClient?.firstName || '',
        lastName: selectedClient?.lastName || '',
        fullName: selectedClient ? `${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim() : '',
        specialization: selectedClient?.specialization || '',
        // Sender variables (from logged-in user — senderRole resolved server-side from PeopleMaster)
        senderName: user?.name || '',
        senderRole: user?.role || '',
        senderEmail: user?.email || '',
      };
      const rendered = selectedTemplate.bodyTemplate.replace(
        /\{\{(\w+)\}\}/g,
        (match, varName) => context[varName] !== undefined && context[varName] !== '' ? context[varName] : match
      );
      setPreviewText(rendered);
    } else {
      setPreviewText('');
    }
  }, [selectedTemplate, selectedClient, user]);

  const handleSearch = (value) => {
    setClientSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!value.trim()) { setClientResults([]); return; }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const service = clientType === 'vip' ? doctorService : clientService;
        const result = await service.getAll({ search: value, limit: 10 });
        setClientResults(result.data || []);
      } catch {
        setClientResults([]);
      }
      setSearchLoading(false);
    }, 300);
  };

  const selectClient = (client) => {
    setSelectedClient(client);
    setClientSearch('');
    setClientResults([]);
    if (client.preferredChannel && API_CHANNELS.includes(client.preferredChannel)) {
      setChannel(client.preferredChannel);
    }
  };

  const hasChannelContact = (ch) => {
    if (!selectedClient) return false;
    const field = CHANNEL_FIELD_MAP[ch];
    if (!field) return false;
    return !!selectedClient[field];
  };

  // Free-text send
  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedClient || !channel || !message.trim()) {
      toast.error('Please select a client, channel, and type a message.');
      return;
    }

    setSending(true);
    try {
      const payload = { channel, message: message.trim() };
      if (clientType === 'vip') payload.doctorId = selectedClient._id;
      else payload.clientId = selectedClient._id;

      await communicationLogService.sendMessage(payload);
      toast.success(`Message sent via ${channel}!`);
      setMessage('');
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to send via ${channel}.`);
    }
    setSending(false);
  };

  // Template send (one-click)
  const handleTemplateSend = async (e) => {
    e.preventDefault();
    if (!selectedClient || !channel || !selectedTemplate) {
      toast.error('Please select a client, channel, and template.');
      return;
    }

    setSending(true);
    try {
      const payload = { channel };
      if (clientType === 'vip') payload.doctorId = selectedClient._id;
      else payload.clientId = selectedClient._id;

      await messageTemplateService.sendFromTemplate(selectedTemplate._id, payload);
      toast.success(`Template "${selectedTemplate.name}" sent via ${channel}!`);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to send template via ${channel}.`);
    }
    setSending(false);
  };

  const clientName = selectedClient
    ? `${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim()
    : '';

  const apiChannelOpts = channelOpts.filter((opt) => API_CHANNELS.includes(opt.value));

  // Filter templates by selected channel
  const filteredTemplates = templates.filter((t) => {
    if (!t.channels || t.channels.length === 0) return true;
    return t.channels.includes(channel);
  });

  return (
    <div className="mc">
      <style>{composerStyles}</style>

      <div className="mc-info">
        Send messages directly to VIP Clients or Regular Clients. Choose <strong>Free Text</strong> to write a custom message, or <strong>Template</strong> to send a pre-approved message in one click.
      </div>

      {/* Mode toggle: Free Text vs Template */}
      <div className="mc-mode-toggle">
        <button type="button" className={`mc-mode-btn${mode === 'freetext' ? ' active' : ''}`} onClick={() => setMode('freetext')}>
          Free Text
        </button>
        <button type="button" className={`mc-mode-btn${mode === 'template' ? ' active' : ''}`} onClick={() => setMode('template')}>
          Template
        </button>
      </div>

      <form onSubmit={mode === 'freetext' ? handleSend : handleTemplateSend}>
        {/* Client type toggle */}
        <div className="mc-row">
          <label className="mc-label">Client Type</label>
          <div className="mc-toggle">
            <button type="button" className={`mc-toggle-btn${clientType === 'vip' ? ' active' : ''}`} onClick={() => { setClientType('vip'); setSelectedClient(null); }}>VIP Client</button>
            <button type="button" className={`mc-toggle-btn${clientType === 'regular' ? ' active' : ''}`} onClick={() => { setClientType('regular'); setSelectedClient(null); }}>Regular Client</button>
          </div>
        </div>

        {/* Client search */}
        <div className="mc-row">
          <label className="mc-label">{clientType === 'vip' ? 'VIP Client' : 'Regular Client'} *</label>
          {selectedClient ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#1e40af' }}>{clientName}</span>
              <button type="button" onClick={() => { setSelectedClient(null); setChannel(''); setSelectedTemplate(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 18 }}>&times;</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input className="mc-input" placeholder={`Search ${clientType === 'vip' ? 'VIP Client' : 'Regular Client'}...`} value={clientSearch} onChange={(e) => handleSearch(e.target.value)} />
              {(clientResults.length > 0 || searchLoading) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '0 0 8px 8px', maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
                  {searchLoading && <div style={{ padding: 12, color: '#64748b', fontSize: 13 }}>Searching...</div>}
                  {clientResults.map((c) => (
                    <div key={c._id} onClick={() => selectClient(c)} style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={(e) => { e.target.style.background = '#eff6ff'; }}
                      onMouseLeave={(e) => { e.target.style.background = '#fff'; }}>
                      <strong>{c.firstName} {c.lastName}</strong>
                      {c.specialization && <span style={{ color: '#64748b', marginLeft: 8 }}>{c.specialization}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Channel selection */}
        <div className="mc-row">
          <label className="mc-label">Send Via *</label>
          <div className="mc-channels">
            {apiChannelOpts.map((opt) => {
              const hasContact = hasChannelContact(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`mc-ch-btn${channel === opt.value ? ' selected' : ''}${!hasContact && selectedClient ? ' disabled' : ''}`}
                  onClick={() => hasContact || !selectedClient ? setChannel(channel === opt.value ? '' : opt.value) : null}
                  title={!hasContact && selectedClient ? `No ${opt.label} contact info on file` : ''}
                >
                  <span className={`mc-ch-status ${hasContact ? 'mc-ch-ok' : 'mc-ch-no'}`} />
                  {opt.label}
                </button>
              );
            })}
          </div>
          {selectedClient && !hasChannelContact(channel) && channel && (
            <div style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>
              This client has no {channel} contact info. Update their profile first.
            </div>
          )}
        </div>

        {/* Free-text mode */}
        {mode === 'freetext' && (
          <>
            <div className="mc-row">
              <label className="mc-label">Message *</label>
              <textarea
                className="mc-textarea"
                placeholder="Type your message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={5000}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'right' }}>{message.length}/5000</div>
            </div>
            <button type="submit" className="mc-send" disabled={sending || !selectedClient || !channel || !message.trim()}>
              {sending ? 'Sending...' : `Send via ${channel || '...'}`}
            </button>
          </>
        )}

        {/* Template mode */}
        {mode === 'template' && (
          <>
            <div className="mc-row">
              <label className="mc-label">Choose Template *</label>
              {filteredTemplates.length === 0 && (
                <div style={{ fontSize: 13, color: '#94a3b8', padding: 12 }}>
                  {channel ? `No templates available for ${channel}.` : 'Select a channel first to see available templates.'}
                </div>
              )}
              <div className="mc-tpl-list">
                {filteredTemplates.map((t) => (
                  <div
                    key={t._id}
                    className={`mc-tpl-card${selectedTemplate?._id === t._id ? ' selected' : ''}`}
                    onClick={() => setSelectedTemplate(selectedTemplate?._id === t._id ? null : t)}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="mc-tpl-name">{t.name}</div>
                      {t.description && <div className="mc-tpl-desc">{t.description}</div>}
                    </div>
                    {t.category && <span className="mc-tpl-cat">{t.category}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            {selectedTemplate && (
              <div className="mc-row">
                <div className="mc-preview">
                  <div className="mc-preview-label">Preview</div>
                  {previewText}
                </div>
                {selectedTemplate.variables?.length > 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Variables: {selectedTemplate.variables.map((v) => `{{${v}}}`).join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons: Send via API + Copy to Clipboard */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="mc-send"
                disabled={!selectedTemplate || !previewText}
                style={{ flex: '0 0 auto', background: '#475569', width: 'auto', padding: '14px 20px' }}
                onClick={() => {
                  if (!previewText) return;
                  navigator.clipboard.writeText(previewText).then(() => {
                    toast.success('Copied to clipboard! Paste into your group chat.');
                  }).catch(() => {
                    toast.error('Failed to copy. Please select the text manually.');
                  });
                }}
              >
                Copy
              </button>
              <button type="submit" className="mc-send" disabled={sending || !selectedClient || !channel || !selectedTemplate} style={{ flex: 1, background: selectedTemplate ? '#7c3aed' : '#94a3b8' }}>
                {sending ? 'Sending...' : selectedTemplate ? `Send via ${channel || '...'}` : 'Select a template'}
              </button>
            </div>
            {selectedTemplate && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                Copy = paste into Viber/Messenger group chat &nbsp;|&nbsp; Send = send via official business channel
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );
};

export default MessageComposer;
