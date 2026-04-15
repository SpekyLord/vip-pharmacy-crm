import React, { useState, useEffect, useCallback } from 'react';
import useErpAccess from '../hooks/useErpAccess';

import SelectField from '../../components/common/Select';

const LEVELS = ['NONE', 'VIEW', 'FULL'];

const styles = `
  .eam-wrap { padding: 16px 0; }
  .eam-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--erp-border, #e5e7eb); }
  .eam-row:last-child { border-bottom: none; }
  .eam-label { width: 110px; font-size: 13px; font-weight: 500; color: var(--erp-text, #1a1a2e); }
  .eam-radios { display: flex; gap: 12px; }
  .eam-radios label { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--erp-muted, #64748b); cursor: pointer; }
  .eam-radios input { cursor: pointer; }
  .eam-toggle { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .eam-toggle label { font-size: 13px; font-weight: 600; }
  .eam-tpl-row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
  .eam-tpl-row select { flex: 1; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--erp-border, #d1d5db); font-size: 13px; }
  .eam-btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .eam-btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .eam-btn-primary:hover { opacity: 0.9; }
  .eam-btn-outline { background: transparent; border: 1px solid var(--erp-border, #d1d5db); color: var(--erp-text, #1a1a2e); }
  .eam-actions { display: flex; gap: 8px; margin-top: 14px; }
  .eam-msg { font-size: 12px; margin-top: 8px; }
  .eam-msg-ok { color: #16a34a; }
  .eam-msg-err { color: #dc2626; }
  .eam-approve { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 13px; }
  .eam-sub-section { background: var(--erp-accent-soft, #f0f4ff); border-radius: 8px; padding: 8px 12px; margin: 4px 0 8px 110px; }
  .eam-sub-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .eam-sub-header span { font-size: 11px; font-weight: 600; color: var(--erp-muted, #64748b); }
  .eam-sub-all { font-size: 11px; color: var(--erp-accent, #1e5eff); cursor: pointer; text-decoration: underline; }
  .eam-sub-row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
  .eam-sub-row span { font-size: 12px; flex: 1; }
  .eam-sub-row input { cursor: pointer; }
  .eam-sub-badge { font-size: 10px; color: #22c55e; margin-left: 6px; }
`;

export default function ErpAccessManager({ userId, readOnly = false }) {
  const access = useErpAccess();
  const [enabled, setEnabled] = useState(false);
  const [moduleKeys, setModuleKeys] = useState([]);
  const [modules, setModules] = useState({});
  const [subPermissions, setSubPermissions] = useState({});
  const [subPermKeys, setSubPermKeys] = useState({});
  const [canApprove, setCanApprove] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tplRes, userRes, spkRes, modRes] = await Promise.all([
        access.getTemplates(),
        access.getUserAccess(userId),
        access.getSubPermissionKeys(),
        access.getModuleKeys(),
      ]);
      setTemplates(tplRes?.data || []);
      setSubPermKeys(spkRes?.data || {});
      const mods = (modRes?.data || []).map(m => ({ key: m.key, label: m.label }));
      if (mods.length) setModuleKeys(mods);
      const ua = userRes?.data?.erp_access || {};
      setEnabled(!!ua.enabled);
      setModules(ua.modules || {});
      setSubPermissions(ua.sub_permissions || {});
      setCanApprove(!!ua.can_approve);
      setTemplateId(ua.template_id || '');
      setLoaded(true);
    } catch { setLoaded(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  const handleModuleChange = (mod, level) => {
    setModules(prev => ({ ...prev, [mod]: level }));
    // Clear sub-permissions if set to NONE
    if (level === 'NONE') {
      setSubPermissions(prev => {
        const updated = { ...prev };
        delete updated[mod];
        return updated;
      });
    }
  };

  const toggleSubPerm = (modKey, subKey) => {
    setSubPermissions(prev => {
      const updated = { ...prev };
      if (!updated[modKey]) updated[modKey] = {};
      if (updated[modKey][subKey]) {
        // Toggling off: delete key instead of setting false
        const { [subKey]: _unused, ...rest } = updated[modKey];
        if (Object.keys(rest).length === 0) { delete updated[modKey]; } else { updated[modKey] = rest; }
      } else {
        updated[modKey] = { ...updated[modKey], [subKey]: true };
      }
      return updated;
    });
  };

  const selectAllSubs = (modKey, value) => {
    const keys = subPermKeys[modKey];
    if (!keys) return;
    setSubPermissions(prev => {
      const updated = { ...prev };
      if (value) {
        updated[modKey] = {};
        keys.forEach(k => { updated[modKey][k.key] = true; });
      } else {
        // Deselect all: remove module entry entirely
        delete updated[modKey];
      }
      return updated;
    });
  };

  const handleApplyTemplate = async () => {
    if (!templateId) return;
    try {
      const res = await access.applyTemplate(userId, templateId);
      const ua = res?.data?.erp_access || {};
      setEnabled(!!ua.enabled);
      setModules(ua.modules || {});
      setSubPermissions(ua.sub_permissions || {});
      setCanApprove(!!ua.can_approve);
      setMsg({ type: 'ok', text: 'Template applied' });
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Failed to apply template' });
    }
  };

  const handleSave = async () => {
    try {
      await access.setUserAccess(userId, {
        enabled,
        modules,
        sub_permissions: subPermissions,
        can_approve: canApprove,
        template_id: templateId || undefined,
      });
      setMsg({ type: 'ok', text: 'Access saved' });
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Failed to save' });
    }
  };

  if (!loaded) return <div style={{ padding: 16, color: '#64748b', fontSize: 13 }}>Loading access...</div>;

  return (
    <div className="eam-wrap">
      <style>{styles}</style>
      <div className="eam-toggle">
        <input type="checkbox" id="eam-enabled" checked={enabled} disabled={readOnly}
          onChange={e => setEnabled(e.target.checked)} />
        <label htmlFor="eam-enabled">ERP Access Enabled</label>
      </div>
      {enabled && (
        <>
          <div className="eam-tpl-row">
            <SelectField value={templateId} disabled={readOnly}
              onChange={e => setTemplateId(e.target.value)}>
              <option value="">-- Select Template --</option>
              {templates.map(t => (
                <option key={t._id} value={t._id}>{t.template_name}</option>
              ))}
            </SelectField>
            {!readOnly && (
              <button className="eam-btn eam-btn-outline" onClick={handleApplyTemplate}
                disabled={!templateId}>Apply</button>
            )}
          </div>

          {moduleKeys.map(m => {
            const level = modules[m.key] || 'NONE';
            const hasSubKeys = !!subPermKeys[m.key];
            const showSubs = hasSubKeys && (level === 'VIEW' || level === 'FULL');
            const modSubs = subPermissions[m.key] || {};
            const keys = subPermKeys[m.key] || [];
            const hasAnySubs = Object.keys(modSubs).length > 0;
            const allEnabled = keys.length > 0 && keys.every(k => modSubs[k.key]);

            return (
              <React.Fragment key={m.key}>
                <div className="eam-row">
                  <span className="eam-label">
                    {m.label}
                    {hasSubKeys && level !== 'NONE' && !hasAnySubs && level === 'FULL' && (
                      <span className="eam-sub-badge">All</span>
                    )}
                  </span>
                  <div className="eam-radios">
                    {LEVELS.map(lv => (
                      <label key={lv}>
                        <input type="radio" name={`eam-${m.key}`}
                          checked={level === lv}
                          disabled={readOnly}
                          onChange={() => handleModuleChange(m.key, lv)} />
                        {lv}
                      </label>
                    ))}
                  </div>
                </div>
                {showSubs && !readOnly && (
                  <div className="eam-sub-section">
                    <div className="eam-sub-header">
                      <span>Sub-Permissions</span>
                      <span className="eam-sub-all" onClick={() => selectAllSubs(m.key, !allEnabled)}>
                        {allEnabled ? 'Deselect All' : 'Select All'}
                      </span>
                    </div>
                    {keys.map(sk => (
                      <div className="eam-sub-row" key={sk.key}>
                        <span>{sk.label}</span>
                        <input type="checkbox"
                          checked={!!modSubs[sk.key]}
                          onChange={() => toggleSubPerm(m.key, sk.key)} />
                      </div>
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          <div className="eam-approve">
            <input type="checkbox" id="eam-approve" checked={canApprove} disabled={readOnly}
              onChange={e => setCanApprove(e.target.checked)} />
            <label htmlFor="eam-approve">Can Approve (GRN, deletions, payroll posting)</label>
          </div>
        </>
      )}
      {!readOnly && (
        <div className="eam-actions">
          <button className="eam-btn eam-btn-primary" onClick={handleSave}>Save Access</button>
        </div>
      )}
      {msg && <div className={`eam-msg ${msg.type === 'ok' ? 'eam-msg-ok' : 'eam-msg-err'}`}>{msg.text}</div>}
    </div>
  );
}
