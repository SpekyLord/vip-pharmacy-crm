/**
 * CommLogForm — Communication Log Entry Form
 *
 * BDM uploads screenshot proof of Viber/Messenger/WhatsApp/Email/Google Chat
 * interactions with VIP Clients or Regular Clients.
 * Phone-friendly with 48px min tap targets.
 */

import { useState, useRef } from 'react';
import { useLookupOptions } from '../../erp/hooks/useLookups';
import doctorService from '../../services/doctorService';
import clientService from '../../services/clientService';
import communicationLogService from '../../services/communicationLogService';
import toast from 'react-hot-toast';

const formStyles = `
  .clf { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
  .clf-row { margin-bottom: 14px; }
  .clf-label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
  .clf-toggle { display: flex; gap: 0; border-radius: 8px; overflow: hidden; border: 1px solid #d1d5db; }
  .clf-toggle-btn { flex: 1; padding: 10px 12px; border: none; background: #f9fafb; color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer; min-height: 44px; transition: all 0.15s; }
  .clf-toggle-btn.active { background: #2563eb; color: #fff; }
  .clf-select { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; min-height: 44px; background: #fff; }
  .clf-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .clf-chip { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 8px 16px; border: 2px solid #d1d5db; border-radius: 24px; background: #f9fafb; color: #4b5563; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; user-select: none; -webkit-tap-highlight-color: transparent; }
  .clf-chip:hover { border-color: #93c5fd; background: #eff6ff; }
  .clf-chip.selected { border-color: #2563eb; background: #2563eb; color: white; }
  .clf-textarea { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; min-height: 80px; resize: vertical; font-family: inherit; }
  .clf-photos { display: flex; flex-wrap: wrap; gap: 8px; }
  .clf-photo-thumb { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; border: 1px solid #d1d5db; }
  .clf-photo-add { width: 72px; height: 72px; border-radius: 8px; border: 2px dashed #d1d5db; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 24px; color: #94a3b8; transition: all 0.15s; }
  .clf-photo-add:hover { border-color: #2563eb; color: #2563eb; }
  .clf-photo-remove { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: #fff; border: none; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  .clf-submit { width: 100%; padding: 14px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; min-height: 48px; transition: all 0.15s; }
  .clf-submit:hover { background: #1d4ed8; }
  .clf-submit:disabled { background: #94a3b8; cursor: not-allowed; }
  .clf-input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; min-height: 44px; }
  body.dark-mode .clf { background: #0f172a; border-color: #1e293b; }
  body.dark-mode .clf-label { color: #94a3b8; }
  body.dark-mode .clf-select, body.dark-mode .clf-textarea, body.dark-mode .clf-input { background: #0b1220; border-color: #334155; color: #e2e8f0; }
  body.dark-mode .clf-toggle-btn { background: #0b1220; color: #94a3b8; border-color: #334155; }
  body.dark-mode .clf-toggle-btn.active { background: #2563eb; color: #fff; }
  body.dark-mode .clf-chip { background: #0b1220; border-color: #334155; color: #e2e8f0; }
  body.dark-mode .clf-chip:hover { border-color: #60a5fa; background: #172554; }
  body.dark-mode .clf-chip.selected { border-color: #60a5fa; background: #2563eb; color: white; }
  body.dark-mode .clf-photo-add { border-color: #334155; color: #64748b; }
`;

const CommLogForm = ({ onSuccess, preselectedDoctor }) => {
  const { options: channelOpts } = useLookupOptions('COMM_CHANNEL');

  // Form state
  const [clientType, setClientType] = useState('vip'); // vip | regular
  const [selectedClient, setSelectedClient] = useState(preselectedDoctor || null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [channel, setChannel] = useState('');
  const [direction, setDirection] = useState('outbound');
  const [notes, setNotes] = useState('');
  const [contactedAt, setContactedAt] = useState(new Date().toISOString().slice(0, 16));
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const fileInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Search clients
  const handleSearch = (value) => {
    setClientSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!value.trim()) {
      setClientResults([]);
      return;
    }

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

  // Select a client from search results
  const selectClient = (client) => {
    setSelectedClient(client);
    setClientSearch('');
    setClientResults([]);
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const remaining = 10 - photos.length;
    const toAdd = files.slice(0, remaining).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...toAdd]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Remove a photo
  const removePhoto = (index) => {
    setPhotos((prev) => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Handle paste (clipboard screenshots)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/') && photos.length < 10) {
        const blob = item.getAsFile();
        if (blob) {
          setPhotos((prev) => [
            ...prev,
            { file: blob, preview: URL.createObjectURL(blob) },
          ]);
        }
      }
    }
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedClient || !channel || photos.length === 0) {
      toast.error('Please select a client, channel, and attach at least one screenshot.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      if (clientType === 'vip') {
        formData.append('doctor', selectedClient._id);
      } else {
        formData.append('client', selectedClient._id);
      }
      formData.append('channel', channel);
      formData.append('direction', direction);
      if (notes.trim()) formData.append('notes', notes);
      formData.append('contactedAt', new Date(contactedAt).toISOString());

      for (const photo of photos) {
        const file = photo.file instanceof File
          ? photo.file
          : new File([photo.file], `screenshot-${Date.now()}.jpg`, { type: photo.file.type || 'image/jpeg' });
        formData.append('photos', file);
      }

      await communicationLogService.create(formData);
      toast.success('Communication log saved!');

      // Reset form
      setSelectedClient(preselectedDoctor || null);
      setChannel('');
      setDirection('outbound');
      setNotes('');
      setContactedAt(new Date().toISOString().slice(0, 16));
      photos.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setPhotos([]);

      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save communication log.');
    }
    setSubmitting(false);
  };

  const clientName = selectedClient
    ? `${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim()
    : '';

  return (
    <form className="clf" onSubmit={handleSubmit} onPaste={handlePaste}>
      <style>{formStyles}</style>

      {/* Client type toggle */}
      <div className="clf-row">
        <label className="clf-label">Client Type</label>
        <div className="clf-toggle">
          <button type="button" className={`clf-toggle-btn${clientType === 'vip' ? ' active' : ''}`} onClick={() => { setClientType('vip'); setSelectedClient(null); setClientResults([]); }}>
            VIP Client
          </button>
          <button type="button" className={`clf-toggle-btn${clientType === 'regular' ? ' active' : ''}`} onClick={() => { setClientType('regular'); setSelectedClient(null); setClientResults([]); }}>
            Regular Client
          </button>
        </div>
      </div>

      {/* Client search */}
      <div className="clf-row">
        <label className="clf-label">{clientType === 'vip' ? 'VIP Client' : 'Regular Client'} *</label>
        {selectedClient ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#1e40af' }}>{clientName}</span>
            <button type="button" onClick={() => setSelectedClient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 18 }}>&times;</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <input
              className="clf-input"
              placeholder={`Search ${clientType === 'vip' ? 'VIP Client' : 'Regular Client'}...`}
              value={clientSearch}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {(clientResults.length > 0 || searchLoading) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '0 0 8px 8px', maxHeight: 200, overflowY: 'auto', zIndex: 10 }}>
                {searchLoading && <div style={{ padding: 12, color: '#64748b', fontSize: 13 }}>Searching...</div>}
                {clientResults.map((c) => (
                  <div
                    key={c._id}
                    onClick={() => selectClient(c)}
                    style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={(e) => { e.target.style.background = '#eff6ff'; }}
                    onMouseLeave={(e) => { e.target.style.background = '#fff'; }}
                  >
                    <strong>{c.firstName} {c.lastName}</strong>
                    {c.specialization && <span style={{ color: '#64748b', marginLeft: 8 }}>{c.specialization}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Channel chips */}
      <div className="clf-row">
        <label className="clf-label">Channel *</label>
        <div className="clf-chips">
          {channelOpts.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`clf-chip${channel === opt.value ? ' selected' : ''}`}
              onClick={() => setChannel(channel === opt.value ? '' : opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Direction toggle */}
      <div className="clf-row">
        <label className="clf-label">Direction</label>
        <div className="clf-toggle">
          <button type="button" className={`clf-toggle-btn${direction === 'outbound' ? ' active' : ''}`} onClick={() => setDirection('outbound')}>
            Outbound (You → Client)
          </button>
          <button type="button" className={`clf-toggle-btn${direction === 'inbound' ? ' active' : ''}`} onClick={() => setDirection('inbound')}>
            Inbound (Client → You)
          </button>
        </div>
      </div>

      {/* Date */}
      <div className="clf-row">
        <label className="clf-label">Date &amp; Time</label>
        <input
          className="clf-input"
          type="datetime-local"
          value={contactedAt}
          onChange={(e) => setContactedAt(e.target.value)}
        />
      </div>

      {/* Notes */}
      <div className="clf-row">
        <label className="clf-label">Notes (optional)</label>
        <textarea
          className="clf-textarea"
          placeholder="Brief context about the interaction..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
      </div>

      {/* Screenshots */}
      <div className="clf-row">
        <label className="clf-label">Screenshots * ({photos.length}/10)</label>
        <div className="clf-photos">
          {photos.map((photo, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={photo.preview} alt={`Screenshot ${i + 1}`} className="clf-photo-thumb" />
              <button type="button" className="clf-photo-remove" onClick={() => removePhoto(i)}>&times;</button>
            </div>
          ))}
          {photos.length < 10 && (
            <div className="clf-photo-add" onClick={() => fileInputRef.current?.click()}>+</div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
          Tap + to upload, or paste a screenshot (Ctrl+V)
        </div>
      </div>

      {/* Submit */}
      <button type="submit" className="clf-submit" disabled={submitting || !selectedClient || !channel || photos.length === 0}>
        {submitting ? 'Saving...' : 'Save Communication Log'}
      </button>
    </form>
  );
};

export default CommLogForm;
