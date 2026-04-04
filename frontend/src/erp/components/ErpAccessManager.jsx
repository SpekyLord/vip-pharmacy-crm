import React, { useState, useEffect, useCallback } from 'react';
import useErpAccess from '../hooks/useErpAccess';

import SelectField from '../../components/common/Select';

const MODULES = [
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'collections', label: 'Collections' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'reports', label: 'Reports' },
  { key: 'people', label: 'People' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'purchasing', label: 'Purchasing' },
  { key: 'banking', label: 'Banking' },
];

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
`;

export default function ErpAccessManager({ userId, readOnly = false }) {
  const access = useErpAccess();
  const [enabled, setEnabled] = useState(false);
  const [modules, setModules] = useState({});
  const [canApprove, setCanApprove] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tplRes, userRes] = await Promise.all([
        access.getTemplates(),
        access.getUserAccess(userId),
      ]);
      setTemplates(tplRes?.data || []);
      const ua = userRes?.data?.erp_access || {};
      setEnabled(!!ua.enabled);
      setModules(ua.modules || {});
      setCanApprove(!!ua.can_approve);
      setTemplateId(ua.template_id || '');
      setLoaded(true);
    } catch { setLoaded(true); }
  }, [userId]);

  useEffect(() => { if (userId) load(); }, [userId, load]);

  const handleModuleChange = (mod, level) => {
    setModules(prev => ({ ...prev, [mod]: level }));
  };

  const handleApplyTemplate = async () => {
    if (!templateId) return;
    try {
      const res = await access.applyTemplate(userId, templateId);
      const ua = res?.data?.erp_access || {};
      setEnabled(!!ua.enabled);
      setModules(ua.modules || {});
      setCanApprove(!!ua.can_approve);
      setMsg({ type: 'ok', text: 'Template applied' });
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Failed to apply template' });
    }
  };

  const handleSave = async () => {
    try {
      await access.setUserAccess(userId, { enabled, modules, can_approve: canApprove, template_id: templateId || undefined });
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

          {MODULES.map(m => (
            <div className="eam-row" key={m.key}>
              <span className="eam-label">{m.label}</span>
              <div className="eam-radios">
                {LEVELS.map(lv => (
                  <label key={lv}>
                    <input type="radio" name={`eam-${m.key}`}
                      checked={(modules[m.key] || 'NONE') === lv}
                      disabled={readOnly}
                      onChange={() => handleModuleChange(m.key, lv)} />
                    {lv}
                  </label>
                ))}
              </div>
            </div>
          ))}

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
