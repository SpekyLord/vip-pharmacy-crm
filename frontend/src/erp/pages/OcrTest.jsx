import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { processDocument, extractExifDateTime } from '../services/ocrService';
import useHospitals from '../hooks/useHospitals';
import useProducts from '../hooks/useProducts';

import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';

const DOC_TYPES_FALLBACK = [
  { value: 'CSI', label: 'Charge Sales Invoice (CSI)' },
  { value: 'CR', label: 'Collection Receipt (CR)' },
  { value: 'CWT_2307', label: 'BIR 2307 (Withholding Tax)' },
  { value: 'GAS_RECEIPT', label: 'Gas Station Receipt' },
  { value: 'ODOMETER', label: 'Odometer' },
  { value: 'OR', label: 'Expense Receipt / OR' },
  { value: 'UNDERTAKING', label: 'Undertaking of Receipt (GRN)' },
  { value: 'DR', label: 'Delivery Receipt (DR)' },
];

const CONFIDENCE_COLORS = {
  HIGH: '#1a1a1a',
  MEDIUM: '#f59e0b',
  LOW: '#ef4444',
};

const CONFIDENCE_COLORS_DARK = {
  HIGH: '#e2e8f0',
  MEDIUM: '#f59e0b',
  LOW: '#ef4444',
};

/* ─── Styles ─── */
const pageStyles = `
  :root {
    --ocr-bg: #f4f7fb;
    --ocr-panel: #ffffff;
    --ocr-border: #dbe4f0;
    --ocr-text: #132238;
    --ocr-muted: #607188;
    --ocr-accent: #0b6bcb;
    --ocr-input-bg: #ffffff;
  }
  body.dark-mode {
    --ocr-bg: #0f172a;
    --ocr-panel: #111c31;
    --ocr-border: #20304f;
    --ocr-text: #f8fafc;
    --ocr-muted: #9fb0ca;
    --ocr-accent: #7ec8ff;
    --ocr-input-bg: #1a2640;
  }
  .admin-page.ocr-page {
    background: var(--ocr-bg);
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  }
  .admin-page.ocr-page .admin-content {
    display: flex; flex: 1; min-height: 0; overflow: hidden;
  }
  .admin-page.ocr-page .admin-main {
    flex: 1; min-width: 0; overflow-y: auto;
  }
  .ocr-main { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
  .ocr-panel {
    border: 1px solid var(--ocr-border); border-radius: 16px;
    background: var(--ocr-panel); padding: 24px;
    box-shadow: 0 4px 12px rgba(15,23,42,0.06);
  }
  .ocr-panel h1 { margin: 0 0 6px; color: var(--ocr-text); font-size: 1.5rem; }
  .ocr-panel p { margin: 0; color: var(--ocr-muted); font-size: 14px; }
  .ocr-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end; }
  .ocr-row > * { flex: 1; min-width: 180px; }
  .ocr-select, .ocr-btn, .ocr-btn-outline {
    min-height: 44px; border-radius: 10px; font-size: 14px; font-weight: 600;
    padding: 0 16px; cursor: pointer;
  }
  .ocr-select {
    width: 100%; border: 1px solid var(--ocr-border);
    background: var(--ocr-input-bg); color: var(--ocr-text);
    appearance: auto; -webkit-appearance: menulist;
    position: relative; z-index: 1;
  }
  .ocr-btn {
    background: var(--ocr-accent); color: #fff; border: none;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  }
  .ocr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ocr-btn-outline {
    background: transparent; border: 1px solid var(--ocr-border); color: var(--ocr-text);
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  }
  .ocr-results-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
  }
  @media (max-width: 768px) {
    .ocr-main { padding: 16px; }
    .ocr-results-grid { grid-template-columns: 1fr; }
  }
  .ocr-photo-preview {
    border-radius: 10px; border: 1px solid var(--ocr-border);
    overflow: hidden; background: #000;
  }
  .ocr-photo-preview img {
    width: 100%; height: auto; display: block; max-height: 500px; object-fit: contain;
  }
  .ocr-form-fields { display: flex; flex-direction: column; gap: 12px; }
  .ocr-field label {
    display: block; font-size: 12px; font-weight: 600;
    color: var(--ocr-muted); margin-bottom: 4px; text-transform: uppercase;
  }
  .ocr-field input {
    width: 100%; min-height: 38px; border-radius: 8px;
    padding: 0 12px; font-size: 14px;
    background: var(--ocr-input-bg); color: var(--ocr-text);
    border-width: 2px; border-style: solid;
    box-sizing: border-box;
  }
  .ocr-field .verify-hint {
    font-size: 11px; color: #ef4444; margin-top: 2px;
  }
  .ocr-flags {
    margin-top: 12px; padding: 12px; border-radius: 10px;
    background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  }
  .ocr-flags h4 { margin: 0 0 6px; color: #ef4444; font-size: 13px; }
  .ocr-flags li { font-size: 13px; color: var(--ocr-text); margin: 4px 0; }
  .ocr-spinner {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 60px 0; gap: 16px; color: var(--ocr-muted);
  }
  .ocr-spinner .dot-pulse {
    width: 36px; height: 36px; border-radius: 50%;
    border: 3px solid var(--ocr-border); border-top-color: var(--ocr-accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .ocr-line-items { margin-top: 8px; }
  .ocr-line-item {
    border: 1px solid var(--ocr-border); border-radius: 10px;
    padding: 12px; margin-bottom: 10px; background: var(--ocr-input-bg);
  }
  .ocr-line-item h5 { margin: 0 0 8px; font-size: 13px; color: var(--ocr-accent); }
  .ocr-line-item-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .ocr-actions-bar {
    display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap;
  }
  .ocr-toast {
    position: fixed; bottom: 24px; right: 24px; padding: 12px 20px;
    border-radius: 10px; background: #059669; color: #fff;
    font-size: 14px; font-weight: 600; z-index: 9999;
    animation: fadeInUp 0.3s ease;
  }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .hidden-input { display: none; }
`;

/* ─── Field renderer with smart dropdown for LOW/MEDIUM confidence ─── */
function OcrField({ label, field, onChange, suggestions }) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState('');

  if (!field) return null;
  const isDark = document.body.classList.contains('dark-mode');
  const colors = isDark ? CONFIDENCE_COLORS_DARK : CONFIDENCE_COLORS;
  const borderColor = colors[field.confidence] || colors.LOW;

  const hasSuggestions = suggestions?.length > 0 && field.confidence !== 'HIGH';
  const filtered = hasSuggestions
    ? suggestions.filter(s => {
        const q = (filter || field.value || '').toLowerCase();
        return !q || s.label.toLowerCase().includes(q);
      }).slice(0, 10)
    : [];

  return (
    <div className="ocr-field" style={{ position: 'relative' }}>
      <label>{label}{hasSuggestions && <span style={{ fontSize: 9, marginLeft: 4, color: '#f59e0b' }}>▼ lookup</span>}</label>
      <input
        type="text"
        value={field.value ?? ''}
        onChange={(e) => { onChange(e.target.value); setFilter(e.target.value); }}
        onFocus={() => hasSuggestions && setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        style={{ borderColor }}
        placeholder="Required — enter manually"
      />
      {field.confidence === 'LOW' && (
        <div className="verify-hint">Please verify</div>
      )}
      {showDropdown && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--ocr-panel, #fff)', border: '1px solid var(--ocr-border)',
          borderRadius: 8, maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {filtered.map((s) => (
            <div key={s.value} style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--ocr-border)' }}
              onMouseDown={() => { onChange(s.value); setShowDropdown(false); }}>
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Line items renderer ─── */
function LineItems({ items, onItemChange, fieldSuggestions }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="ocr-line-items">
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ocr-muted)', textTransform: 'uppercase' }}>
        Line Items ({items.length})
      </label>
      {items.map((item, idx) => (
        <div key={idx} className="ocr-line-item">
          <h5>Item {idx + 1}</h5>
          <div className="ocr-line-item-grid">
            {Object.entries(item).map(([key, field]) => {
              if (!field || typeof field !== 'object' || !('confidence' in field)) return null;
              return (
                <OcrField
                  key={key}
                  label={key.replace(/_/g, ' ')}
                  field={field}
                  onChange={(val) => onItemChange(idx, key, val)}
                  suggestions={fieldSuggestions?.[key]}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ─── */
const OcrTest = () => {
  const { options: docTypeOpts } = useLookupOptions('DOC_TYPE');
  const DOC_TYPES = docTypeOpts.length > 0 ? docTypeOpts : DOC_TYPES_FALLBACK;
  const [docType, setDocType] = useState('CSI');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [exifDateTime, setExifDateTime] = useState(null);

  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  // Smart dropdown data for LOW/MEDIUM confidence fields
  const { hospitals } = useHospitals();
  const { products } = useProducts();

  const hospitalSuggestions = useMemo(() =>
    (hospitals || []).map(h => ({ label: h.hospital_name_display || h.hospital_name, value: h.hospital_name })),
    [hospitals]
  );
  const productSuggestions = useMemo(() =>
    (products || []).map(p => ({ label: `${p.brand_name} ${p.dosage_strength || ''} (${p.item_key || ''})`, value: p.brand_name })),
    [products]
  );

  // Map field keys to suggestion lists
  const fieldSuggestions = useMemo(() => ({
    hospital: hospitalSuggestions,
    supplier_name: hospitalSuggestions, // OR/expense supplier can match hospitals or vendors
    brand_name: productSuggestions,
  }), [hospitalSuggestions, productSuggestions]);

  async function handleFile(f) {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setResult(null);
    setError(null);

    // Extract EXIF timestamp from photo (works offline — reads file metadata)
    const exif = await extractExifDateTime(f);
    setExifDateTime(exif);
  }

  async function handleProcess() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await processDocument(file, docType, exifDateTime);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'OCR processing failed');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  }

  function handleConfirm() {
    // eslint-disable-next-line no-console
    console.log('Confirmed OCR data:', result);
    setToast('Data confirmed successfully');
    setTimeout(() => setToast(null), 3000);
  }

  function updateField(path, value) {
    if (!result) return;
    const updated = JSON.parse(JSON.stringify(result));
    const keys = path.split('.');
    let obj = updated.extracted;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) return;
      obj = obj[keys[i]];
    }
    const target = obj[keys[keys.length - 1]];
    if (target && typeof target === 'object' && 'value' in target) {
      target.value = value;
    }
    setResult(updated);
  }

  function updateLineItem(idx, key, value) {
    if (!result) return;
    const updated = JSON.parse(JSON.stringify(result));
    const items = updated.extracted.line_items;
    if (items && items[idx] && items[idx][key]) {
      items[idx][key].value = value;
    }
    setResult(updated);
  }

  const extracted = result?.extracted;
  const flags = result?.validation_flags || [];

  return (
    <div className="admin-page ocr-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-content">
        <Sidebar />
        <main className="admin-main ocr-main">
          {/* Header */}
          <section className="ocr-panel">
            <h1>OCR Document Scanner</h1>
            <p>Select a document type, take a photo or upload an image, then review the extracted data.</p>

            <div className="ocr-row" style={{ marginTop: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ocr-muted)', marginBottom: 4, display: 'block' }}>
                  DOCUMENT TYPE
                </label>
                <SelectField
                  className="ocr-select"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </SelectField>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden-input"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                <button
                  className="ocr-btn"
                  onClick={() => cameraRef.current?.click()}
                >
                  Take Photo
                </button>

                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  className="hidden-input"
                  onChange={(e) => handleFile(e.target.files[0])}
                />
                <button
                  className="ocr-btn-outline"
                  onClick={() => galleryRef.current?.click()}
                >
                  Upload from Gallery
                </button>
              </div>
            </div>

            {/* File selected indicator + process button */}
            {file && !result && !loading && (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, color: 'var(--ocr-text)' }}>
                  {file.name}
                </span>
                <button className="ocr-btn" onClick={handleProcess}>
                  Process Document
                </button>
              </div>
            )}
          </section>

          {/* Loading */}
          {loading && (
            <section className="ocr-panel">
              <div className="ocr-spinner">
                <div className="dot-pulse" />
                <span>Processing document...</span>
              </div>
            </section>
          )}

          {/* Error */}
          {error && (
            <section className="ocr-panel" style={{ borderColor: '#ef4444' }}>
              <p style={{ color: '#ef4444', fontWeight: 600 }}>{error}</p>
              <button className="ocr-btn-outline" style={{ marginTop: 10 }} onClick={handleReset}>
                Try Again
              </button>
            </section>
          )}

          {/* Results */}
          {result && extracted && (
            <section className="ocr-panel">
              <div className="ocr-results-grid">
                {/* Photo preview */}
                {previewUrl && (
                  <div className="ocr-photo-preview">
                    <img src={previewUrl} alt="Scanned document" />
                  </div>
                )}

                {/* Extracted fields form */}
                <div className="ocr-form-fields">
                  {Object.entries(extracted).map(([key, field]) => {
                    if (key === 'line_items') return null;
                    if (key === 'settled_csis') return null;
                    if (key === 'available_categories') return null;
                    if (key === 'validation_flags') return null;
                    // Skip null/undefined fields
                    if (field == null) return null;
                    // Totals sub-object
                    if (key === 'totals' && typeof field === 'object' && field !== null && !('confidence' in field)) {
                      return Object.entries(field).map(([subKey, subField]) => {
                        if (subField == null) return null;
                        return (
                          <OcrField
                            key={`totals.${subKey}`}
                            label={subKey.replace(/_/g, ' ')}
                            field={subField}
                            onChange={(val) => updateField(`totals.${subKey}`, val)}
                          />
                        );
                      });
                    }
                    if (typeof field !== 'object' || !('confidence' in field)) {
                      // Render simple values (e.g., price_computed, is_shell, vat_computed)
                      if (typeof field === 'boolean') {
                        return (
                          <div key={key} className="ocr-field">
                            <label>{key.replace(/_/g, ' ')}</label>
                            <input type="text" value={field ? 'Yes' : 'No'} readOnly style={{ borderColor: 'var(--ocr-border)' }} />
                          </div>
                        );
                      }
                      // Render string/number values
                      if (typeof field === 'string' || typeof field === 'number') {
                        return (
                          <div key={key} className="ocr-field">
                            <label>{key.replace(/_/g, ' ')}</label>
                            <input type="text" value={String(field)} readOnly style={{ borderColor: 'var(--ocr-border)' }} />
                          </div>
                        );
                      }
                      return null;
                    }
                    return (
                      <OcrField
                        key={key}
                        label={key.replace(/_/g, ' ')}
                        field={field}
                        onChange={(val) => updateField(key, val)}
                        suggestions={fieldSuggestions[key]}
                      />
                    );
                  })}

                  {/* Line items */}
                  {extracted.line_items && (
                    <LineItems items={extracted.line_items} onItemChange={updateLineItem} fieldSuggestions={fieldSuggestions} />
                  )}

                  {/* Settled CSIs (CR) */}
                  {extracted.settled_csis && extracted.settled_csis.length > 0 && (
                    <LineItems items={extracted.settled_csis} onItemChange={(idx, key, val) => {
                      const updated = JSON.parse(JSON.stringify(result));
                      updated.extracted.settled_csis[idx][key].value = val;
                      setResult(updated);
                    }} />
                  )}
                </div>
              </div>

              {/* Validation flags */}
              {flags.length > 0 && (
                <div className="ocr-flags">
                  <h4>Validation Flags</h4>
                  <ul>
                    {flags.map((f, i) => (
                      <li key={i}>{f.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Raw OCR Text (debug) */}
              {result.raw_ocr_text && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ocr-muted)' }}>
                    Show Raw OCR Text
                  </summary>
                  <pre style={{
                    marginTop: 8, padding: 12, borderRadius: 8,
                    background: 'var(--ocr-input-bg)', border: '1px solid var(--ocr-border)',
                    fontSize: 12, color: 'var(--ocr-text)', whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word', maxHeight: 400, overflow: 'auto'
                  }}>
                    {result.raw_ocr_text}
                  </pre>
                </details>
              )}

              {/* Actions */}
              <div className="ocr-actions-bar">
                <button className="ocr-btn" onClick={handleConfirm}>
                  Confirm
                </button>
                <button className="ocr-btn-outline" onClick={handleReset}>
                  Try Another
                </button>
                <Link to="/erp" className="ocr-btn-outline">
                  Back to Dashboard
                </Link>
              </div>
            </section>
          )}

          {/* No result yet — show back link */}
          {!result && !loading && (
            <div>
              <Link to="/erp" style={{ fontSize: 14, color: 'var(--ocr-accent)' }}>
                Back to ERP Dashboard
              </Link>
            </div>
          )}
        </main>
      </div>
      {toast && <div className="ocr-toast">{toast}</div>}
    </div>
  );
};

export default OcrTest;
