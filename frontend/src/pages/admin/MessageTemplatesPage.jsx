/**
 * MessageTemplatesPage — Admin Message Template Management
 *
 * Admin creates, edits, activates/deactivates reusable message templates.
 * Templates can be:
 *   - Access: 'all' (every BDM) or 'restricted' (only selected users)
 *   - Entity-scoped or global (null entity = cross-entity)
 *   - Channel-restricted or universal
 *
 * Template categories are lookup-driven (MSG_TEMPLATE_CATEGORY).
 * Channels are lookup-driven (COMM_CHANNEL).
 */

import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import { useLookupOptions } from '../../erp/hooks/useLookups';
import messageTemplateService from '../../services/messageTemplateService';
import userService from '../../services/userService';
import toast from 'react-hot-toast';

const pageStyles = `
  .mtp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; margin-bottom: 20px; }
  .mtp-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; position: relative; transition: box-shadow 0.15s; }
  .mtp-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
  .mtp-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px; }
  .mtp-card-name { font-size: 15px; font-weight: 700; color: #1e293b; }
  .mtp-card-desc { font-size: 13px; color: #64748b; margin-bottom: 8px; }
  .mtp-card-body { font-size: 12px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; white-space: pre-wrap; max-height: 120px; overflow-y: auto; margin-bottom: 10px; }
  .mtp-card-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .mtp-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .mtp-badge-active { background: #dcfce7; color: #166534; }
  .mtp-badge-inactive { background: #fee2e2; color: #991b1b; }
  .mtp-badge-cat { background: #e0e7ff; color: #3730a3; }
  .mtp-badge-ch { background: #e2e8f0; color: #475569; }
  .mtp-badge-restricted { background: #fef3c7; color: #92400e; }
  .mtp-badge-all { background: #dcfce7; color: #166534; }
  .mtp-card-access { font-size: 11px; color: #64748b; margin-top: 6px; }
  .mtp-card-actions { display: flex; gap: 6px; margin-top: 10px; }
  .mtp-btn { padding: 6px 14px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; min-height: 32px; transition: all 0.15s; }
  .mtp-btn-edit { background: #eff6ff; color: #2563eb; }
  .mtp-btn-edit:hover { background: #dbeafe; }
  .mtp-btn-toggle { background: #fef3c7; color: #92400e; }
  .mtp-btn-toggle:hover { background: #fde68a; }
  .mtp-btn-del { background: #fee2e2; color: #991b1b; }
  .mtp-btn-del:hover { background: #fecaca; }
  .mtp-btn-create { padding: 12px 24px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; min-height: 44px; margin-bottom: 16px; }
  .mtp-btn-create:hover { background: #1d4ed8; }
  .mtp-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .mtp-modal { background: #fff; border-radius: 16px; padding: 24px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
  .mtp-modal h2 { font-size: 18px; font-weight: 700; margin-bottom: 16px; color: #1e293b; }
  .mtp-form-row { margin-bottom: 14px; }
  .mtp-form-label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
  .mtp-form-input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; min-height: 44px; box-sizing: border-box; }
  .mtp-form-textarea { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; min-height: 120px; resize: vertical; font-family: inherit; box-sizing: border-box; }
  .mtp-form-select { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; min-height: 44px; background: #fff; }
  .mtp-form-ch-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .mtp-form-ch-btn { padding: 6px 14px; border: 2px solid #d1d5db; border-radius: 20px; background: #f9fafb; color: #4b5563; font-size: 12px; font-weight: 500; cursor: pointer; min-height: 36px; transition: all 0.15s; }
  .mtp-form-ch-btn.active { border-color: #2563eb; background: #2563eb; color: white; }
  .mtp-form-actions { display: flex; gap: 10px; margin-top: 16px; }
  .mtp-form-submit { flex: 1; padding: 12px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; min-height: 44px; }
  .mtp-form-submit:disabled { background: #94a3b8; cursor: not-allowed; }
  .mtp-form-cancel { padding: 12px 20px; background: #f1f5f9; color: #475569; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; min-height: 44px; }
  .mtp-vars-hint { font-size: 11px; color: #94a3b8; margin-top: 4px; }
  .mtp-empty { text-align: center; padding: 40px 20px; color: #94a3b8; font-size: 14px; }
  .mtp-access-box { background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; margin-top: 8px; }
  .mtp-user-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .mtp-user-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: 500; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
  .mtp-user-chip-x { cursor: pointer; font-size: 14px; color: #64748b; margin-left: 2px; }
  .mtp-user-add { display: flex; gap: 8px; margin-top: 8px; }
  .mtp-user-select { flex: 1; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; min-height: 38px; background: #fff; }
  .mtp-user-add-btn { padding: 8px 14px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; min-height: 38px; }
  body.dark-mode .mtp-card { background: #0f172a; border-color: #1e293b; }
  body.dark-mode .mtp-card-name { color: #e2e8f0; }
  body.dark-mode .mtp-card-body { background: #0b1220; border-color: #334155; color: #94a3b8; }
  body.dark-mode .mtp-modal { background: #0f172a; }
  body.dark-mode .mtp-modal h2 { color: #e2e8f0; }
  body.dark-mode .mtp-form-input, body.dark-mode .mtp-form-textarea, body.dark-mode .mtp-form-select, body.dark-mode .mtp-user-select { background: #0b1220; border-color: #334155; color: #e2e8f0; }
  body.dark-mode .mtp-form-ch-btn { background: #0b1220; border-color: #334155; color: #e2e8f0; }
  body.dark-mode .mtp-form-ch-btn.active { border-color: #60a5fa; background: #2563eb; color: white; }
  body.dark-mode .mtp-access-box { background: #422006; border-color: #854d0e; }
  body.dark-mode .mtp-user-chip { background: #1e1b4b; color: #c4b5fd; border-color: #4c1d95; }
`;

const SUPPORTED_VARIABLES = ['firstName', 'lastName', 'fullName', 'specialization', 'productName', 'senderName', 'senderRole'];
const API_CHANNELS = ['VIBER', 'MESSENGER', 'WHATSAPP', 'EMAIL'];

const emptyForm = {
  name: '', description: '', category: '', channels: [], bodyTemplate: '',
  variables: [], accessLevel: 'all', allowedUsers: [],
};

const MessageTemplatesPage = () => {
  const { options: categoryOpts } = useLookupOptions('MSG_TEMPLATE_CATEGORY');
  const { options: channelOpts } = useLookupOptions('COMM_CHANNEL');

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // BDM list for access control picker
  const [bdms, setBdms] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await messageTemplateService.getAll();
      setTemplates(res.data || []);
    } catch {
      toast.error('Failed to load templates.');
    }
    setLoading(false);
  };

  const loadBdms = async () => {
    try {
      const result = await userService.getAll({ role: 'contractor', limit: 200 });
      setBdms(result.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadTemplates(); loadBdms(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (t) => {
    setEditingId(t._id);
    setForm({
      name: t.name || '',
      description: t.description || '',
      category: t.category || '',
      channels: t.channels || [],
      bodyTemplate: t.bodyTemplate || '',
      variables: t.variables || [],
      accessLevel: t.accessLevel || 'all',
      allowedUsers: (t.allowedUsers || []).map((u) => (typeof u === 'object' ? u : { _id: u })),
    });
    setShowModal(true);
  };

  const toggleChannel = (ch) => {
    setForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter((c) => c !== ch)
        : [...prev.channels, ch],
    }));
  };

  const toggleVariable = (v) => {
    setForm((prev) => ({
      ...prev,
      variables: prev.variables.includes(v)
        ? prev.variables.filter((x) => x !== v)
        : [...prev.variables, v],
    }));
  };

  const addAllowedUser = () => {
    if (!selectedUserId) return;
    const already = form.allowedUsers.some((u) => (u._id || u) === selectedUserId);
    if (already) { toast.error('User already added.'); return; }
    const user = bdms.find((b) => b._id === selectedUserId);
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      allowedUsers: [...prev.allowedUsers, { _id: user._id, name: user.name, email: user.email }],
    }));
    setSelectedUserId('');
  };

  const removeAllowedUser = (userId) => {
    setForm((prev) => ({
      ...prev,
      allowedUsers: prev.allowedUsers.filter((u) => (u._id || u) !== userId),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.bodyTemplate.trim()) {
      toast.error('Name and body are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        allowedUsers: form.allowedUsers.map((u) => u._id || u),
      };
      if (editingId) {
        await messageTemplateService.update(editingId, payload);
        toast.success('Template updated.');
      } else {
        await messageTemplateService.create(payload);
        toast.success('Template created.');
      }
      setShowModal(false);
      loadTemplates();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save template.');
    }
    setSaving(false);
  };

  const handleToggleStatus = async (t) => {
    try {
      const newStatus = t.status === 'active' ? 'inactive' : 'active';
      await messageTemplateService.update(t._id, { status: newStatus });
      toast.success(`Template ${newStatus === 'active' ? 'activated' : 'deactivated'}.`);
      loadTemplates();
    } catch {
      toast.error('Failed to update status.');
    }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      await messageTemplateService.delete(t._id);
      toast.success('Template deleted.');
      loadTemplates();
    } catch {
      toast.error('Failed to delete template.');
    }
  };

  const apiChannelOpts = channelOpts.filter((opt) => API_CHANNELS.includes(opt.value));

  // Helper to render allowed user names from template data
  const renderAccessInfo = (t) => {
    if (t.accessLevel === 'all') return null;
    const names = (t.allowedUsers || [])
      .map((u) => (typeof u === 'object' ? u.name || u.email : u))
      .filter(Boolean);
    return names.length > 0
      ? `Access: ${names.join(', ')}`
      : 'Restricted (no users assigned)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '20px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
          <style>{pageStyles}</style>
          <PageGuide pageKey="message-templates" />

          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: '#1e293b' }}>
            Message Templates
          </h1>

          <button className="mtp-btn-create" onClick={openCreate}>+ New Template</button>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading...</div>
          ) : templates.length === 0 ? (
            <div className="mtp-empty">No templates yet. Create one to get started.</div>
          ) : (
            <div className="mtp-grid">
              {templates.map((t) => (
                <div key={t._id} className="mtp-card">
                  <div className="mtp-card-header">
                    <div className="mtp-card-name">{t.name}</div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <span className={`mtp-badge ${t.accessLevel === 'restricted' ? 'mtp-badge-restricted' : 'mtp-badge-all'}`}>
                        {t.accessLevel === 'restricted' ? 'Restricted' : 'All BDMs'}
                      </span>
                      <span className={`mtp-badge ${t.status === 'active' ? 'mtp-badge-active' : 'mtp-badge-inactive'}`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                  {t.description && <div className="mtp-card-desc">{t.description}</div>}
                  <div className="mtp-card-body">{t.bodyTemplate}</div>
                  <div className="mtp-card-meta">
                    {t.category && <span className="mtp-badge mtp-badge-cat">{t.category}</span>}
                    {(t.channels || []).map((ch) => (
                      <span key={ch} className="mtp-badge mtp-badge-ch">{ch}</span>
                    ))}
                    {(!t.channels || t.channels.length === 0) && (
                      <span className="mtp-badge mtp-badge-ch">All channels</span>
                    )}
                  </div>
                  {t.accessLevel === 'restricted' && (
                    <div className="mtp-card-access">{renderAccessInfo(t)}</div>
                  )}
                  <div className="mtp-card-actions">
                    <button className="mtp-btn mtp-btn-edit" onClick={() => openEdit(t)}>Edit</button>
                    <button className="mtp-btn mtp-btn-toggle" onClick={() => handleToggleStatus(t)}>
                      {t.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="mtp-btn mtp-btn-del" onClick={() => handleDelete(t)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create/Edit Modal */}
          {showModal && (
            <div className="mtp-modal-overlay" onClick={() => setShowModal(false)}>
              <div className="mtp-modal" onClick={(e) => e.stopPropagation()}>
                <h2>{editingId ? 'Edit Template' : 'New Template'}</h2>
                <form onSubmit={handleSave}>
                  <div className="mtp-form-row">
                    <label className="mtp-form-label">Name *</label>
                    <input className="mtp-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Follow-up After Visit" maxLength={100} />
                  </div>

                  <div className="mtp-form-row">
                    <label className="mtp-form-label">Description</label>
                    <input className="mtp-form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description for BDMs" maxLength={300} />
                  </div>

                  <div className="mtp-form-row">
                    <label className="mtp-form-label">Category</label>
                    <select className="mtp-form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="">General</option>
                      {categoryOpts.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="mtp-form-row">
                    <label className="mtp-form-label">Channels (empty = all)</label>
                    <div className="mtp-form-ch-list">
                      {apiChannelOpts.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          className={`mtp-form-ch-btn${form.channels.includes(opt.value) ? ' active' : ''}`}
                          onClick={() => toggleChannel(opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mtp-form-row">
                    <label className="mtp-form-label">Message Body *</label>
                    <textarea
                      className="mtp-form-textarea"
                      value={form.bodyTemplate}
                      onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })}
                      placeholder={'Hi {{firstName}},\n\nThank you for your time during our visit...'}
                      maxLength={5000}
                    />
                    <div className="mtp-vars-hint">
                      Use {'{{variableName}}'} for dynamic values. Available: {SUPPORTED_VARIABLES.map((v) => `{{${v}}}`).join(', ')}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>{form.bodyTemplate.length}/5000</div>
                  </div>

                  <div className="mtp-form-row">
                    <label className="mtp-form-label">Variables Used</label>
                    <div className="mtp-form-ch-list">
                      {SUPPORTED_VARIABLES.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`mtp-form-ch-btn${form.variables.includes(v) ? ' active' : ''}`}
                          onClick={() => toggleVariable(v)}
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Access Control */}
                  <div className="mtp-form-row">
                    <label className="mtp-form-label">Access Level</label>
                    <select className="mtp-form-select" value={form.accessLevel} onChange={(e) => setForm({ ...form, accessLevel: e.target.value })}>
                      <option value="all">All BDMs — everyone can see and use this template</option>
                      <option value="restricted">Restricted — only selected BDMs (and admin/president)</option>
                    </select>

                    {form.accessLevel === 'restricted' && (
                      <div className="mtp-access-box">
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                          Trusted BDMs who can access this template:
                        </div>

                        {/* Current allowed users */}
                        <div className="mtp-user-chips">
                          {form.allowedUsers.length === 0 && (
                            <span style={{ fontSize: 12, color: '#b45309' }}>No BDMs added yet. Only admin/president will see this template.</span>
                          )}
                          {form.allowedUsers.map((u) => (
                            <span key={u._id || u} className="mtp-user-chip">
                              {u.name || u.email || u._id}
                              <span className="mtp-user-chip-x" onClick={() => removeAllowedUser(u._id || u)}>&times;</span>
                            </span>
                          ))}
                        </div>

                        {/* Add user */}
                        <div className="mtp-user-add">
                          <select className="mtp-user-select" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                            <option value="">Select a BDM...</option>
                            {bdms
                              .filter((b) => !form.allowedUsers.some((u) => (u._id || u) === b._id))
                              .map((b) => (
                                <option key={b._id} value={b._id}>{b.name || b.email}</option>
                              ))}
                          </select>
                          <button type="button" className="mtp-user-add-btn" onClick={addAllowedUser}>Add</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mtp-form-actions">
                    <button type="button" className="mtp-form-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                    <button type="submit" className="mtp-form-submit" disabled={saving}>
                      {saving ? 'Saving...' : editingId ? 'Update Template' : 'Create Template'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default MessageTemplatesPage;
