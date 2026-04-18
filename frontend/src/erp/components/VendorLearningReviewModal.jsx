import { useState, useEffect, useCallback } from 'react';
import { getVendorLearning, reviewVendorLearning } from '../services/ocrService';
import useAccounting from '../hooks/useAccounting';
import { showError } from '../utils/errorToast';

const styles = `
  .vlr-modal { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 110; }
  .vlr-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 22px; width: 560px; max-width: 95vw; max-height: 92vh; overflow-y: auto; }
  .vlr-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
  .vlr-header h3 { margin: 0; font-size: 16px; }
  .vlr-chip { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #ede9fe; color: #6d28d9; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .vlr-fg { margin-bottom: 10px; }
  .vlr-fg label { display: block; font-size: 11px; font-weight: 600; margin-bottom: 4px; color: #64748b; text-transform: uppercase; letter-spacing: .4px; }
  .vlr-fg input, .vlr-fg select { width: 100%; padding: 7px 9px; border-radius: 6px; border: 1px solid var(--erp-border, #e2e8f0); font-size: 13px; box-sizing: border-box; }
  .vlr-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .vlr-hint { font-size: 11px; color: #64748b; margin-top: 4px; }
  .vlr-hint a { color: #1e5eff; cursor: pointer; text-decoration: underline; }
  .vlr-snippet { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; font-family: ui-monospace, Menlo, monospace; font-size: 11px; max-height: 140px; overflow-y: auto; white-space: pre-wrap; color: #334155; }
  .vlr-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap; }
  .vlr-btn { padding: 7px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .vlr-btn:disabled { opacity: .5; cursor: not-allowed; }
  .vlr-btn-cancel { background: #e2e8f0; color: #334155; }
  .vlr-btn-reject { background: #dc2626; color: #fff; }
  .vlr-btn-approve { background: #16a34a; color: #fff; }
  .vlr-btn-edit-approve { background: var(--erp-accent, #1e5eff); color: #fff; }
  .vlr-loading { padding: 30px; text-align: center; color: #64748b; }
  @media(max-width:420px){ .vlr-row { grid-template-columns: 1fr; } .vlr-actions { flex-direction: column-reverse; } .vlr-actions .vlr-btn { width: 100%; } }
`;

export default function VendorLearningReviewModal({ vendorId, isOpen, onClose, onReviewed }) {
  const { listAccounts } = useAccounting();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [coaOptions, setCoaOptions] = useState([]);
  const [edits, setEdits] = useState({
    vendor_name: '',
    default_coa_code: '',
    default_expense_category: '',
    vendor_aliases: '',
  });

  const loadVendor = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    try {
      const v = await getVendorLearning(vendorId);
      setData(v);
      setEdits({
        vendor_name: v.vendor_name || '',
        default_coa_code: v.default_coa_code || '',
        default_expense_category: v.default_expense_category || '',
        vendor_aliases: Array.isArray(v.vendor_aliases) ? v.vendor_aliases.join(', ') : '',
      });
    } catch (err) {
      showError(err, 'Could not load vendor details');
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [vendorId, onClose]);

  useEffect(() => {
    if (!isOpen || !vendorId) return;
    loadVendor();
    listAccounts({ is_active: true })
      .then(res => {
        const accounts = res?.data || [];
        setCoaOptions(
          accounts
            .filter(a => a.account_type === 'EXPENSE')
            .map(a => ({ code: a.account_code, label: `${a.account_code} — ${a.account_name}` }))
        );
      })
      .catch(err => console.error('[VendorLearningReview] COA load failed:', err.message));
  }, [isOpen, vendorId, loadVendor]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const submit = async (action, withEdits) => {
    setSubmitting(true);
    try {
      const payload = withEdits
        ? {
            vendor_name: edits.vendor_name.trim(),
            default_coa_code: edits.default_coa_code.trim(),
            default_expense_category: edits.default_expense_category.trim(),
            vendor_aliases: edits.vendor_aliases.split(',').map(s => s.trim()).filter(Boolean),
          }
        : {};
      await reviewVendorLearning(vendorId, action, payload);
      onReviewed?.();
    } catch (err) {
      showError(err, `Could not ${action.toLowerCase()} vendor`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = () => {
    if (!window.confirm('Reject this auto-learned vendor? It will be deactivated so OCR stops matching it.')) return;
    submit('REJECT', false);
  };

  const learnCount = data?.learning_meta?.learn_count || 0;
  const suggestedCoa = data?.learning_meta?.suggested_coa_code;
  const rawSnippet = data?.learning_meta?.source_raw_snippet;
  const aiConfidence = data?.learning_meta?.ai_confidence;
  const docType = data?.learning_meta?.source_doc_type;

  return (
    <div className="vlr-modal" onClick={onClose}>
      <style>{styles}</style>
      <div className="vlr-body" onClick={e => e.stopPropagation()}>
        <div className="vlr-header">
          <h3>Review AI-Learned Vendor</h3>
          {learnCount > 0 && <span className="vlr-chip">{learnCount}× learned</span>}
        </div>

        {loading && <div className="vlr-loading">Loading vendor details…</div>}

        {!loading && data && (
          <>
            <div className="vlr-fg">
              <label>Vendor Name</label>
              <input
                value={edits.vendor_name}
                onChange={e => setEdits(v => ({ ...v, vendor_name: e.target.value }))}
              />
            </div>

            <div className="vlr-row">
              <div className="vlr-fg">
                <label>Default COA Code</label>
                <select
                  value={edits.default_coa_code}
                  onChange={e => setEdits(v => ({ ...v, default_coa_code: e.target.value }))}
                >
                  <option value="">— Select account —</option>
                  {coaOptions.map(o => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                  {edits.default_coa_code && !coaOptions.find(o => o.code === edits.default_coa_code) && (
                    <option value={edits.default_coa_code}>{edits.default_coa_code} (current)</option>
                  )}
                </select>
                {suggestedCoa && (
                  <div className="vlr-hint">
                    Claude suggested: <strong>{suggestedCoa}</strong>
                    {suggestedCoa !== edits.default_coa_code && (
                      <>
                        {' · '}
                        <a onClick={() => setEdits(v => ({ ...v, default_coa_code: suggestedCoa }))}>use this</a>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="vlr-fg">
                <label>Expense Category</label>
                <input
                  value={edits.default_expense_category}
                  onChange={e => setEdits(v => ({ ...v, default_expense_category: e.target.value }))}
                />
              </div>
            </div>

            <div className="vlr-fg">
              <label>Aliases (comma-separated)</label>
              <input
                value={edits.vendor_aliases}
                onChange={e => setEdits(v => ({ ...v, vendor_aliases: e.target.value }))}
                placeholder="e.g. SHELL, SHELL ALABANG HILLS"
              />
              <div className="vlr-hint">All variations of this vendor's name that appear on receipts. Uppercased on save.</div>
            </div>

            <div className="vlr-fg">
              <label>
                Raw OCR Snippet
                {docType && ` · ${docType}`}
                {aiConfidence && ` · Claude confidence: ${aiConfidence}`}
              </label>
              <div className="vlr-snippet">{rawSnippet || '(no snippet stored)'}</div>
            </div>

            <div className="vlr-actions">
              <button className="vlr-btn vlr-btn-cancel" onClick={onClose} disabled={submitting}>Cancel</button>
              <button className="vlr-btn vlr-btn-reject" onClick={handleReject} disabled={submitting}>Reject</button>
              <button className="vlr-btn vlr-btn-approve" onClick={() => submit('APPROVE', false)} disabled={submitting}>Approve</button>
              <button className="vlr-btn vlr-btn-edit-approve" onClick={() => submit('APPROVE', true)} disabled={submitting || !edits.vendor_name.trim()}>
                Edit + Approve
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
