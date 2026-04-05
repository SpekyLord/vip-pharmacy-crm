/**
 * CustomerPicker — Phase 18
 *
 * Unified dropdown that searches both Hospital and Customer records.
 * Debounced search (300ms) against both /erp/hospitals and /erp/customers.
 *
 * Props:
 *   value      — { type: 'hospital'|'customer', id: string } or null
 *   onChange   — (type, id, name) => void
 *   saleType   — optional string, passed as context (not used for filtering here)
 *   disabled   — optional boolean
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';

const pickerStyles = `
  .cpk-wrap { position: relative; width: 100%; max-width: 400px; }
  .cpk-input { width: 100%; padding: 8px 10px; border: 1px solid var(--erp-border, #dbe4f0); border-radius: 8px; font-size: 13px; background: var(--erp-panel, #fff); }
  .cpk-input:focus { outline: none; border-color: var(--erp-accent, #1e5eff); }
  .cpk-input:disabled { background: var(--erp-accent-soft, #f0f4ff); opacity: 0.7; }
  .cpk-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 8px; margin-top: 4px; max-height: 260px; overflow-y: auto; box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .cpk-item { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .cpk-item:hover { background: var(--erp-accent-soft, #f0f4ff); }
  .cpk-item.selected { background: var(--erp-accent-soft); font-weight: 600; }
  .cpk-type-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; flex-shrink: 0; }
  .cpk-type-hospital { background: #dbeafe; color: #1e40af; }
  .cpk-type-customer { background: #dcfce7; color: #166534; }
  .cpk-empty { padding: 16px; text-align: center; color: var(--erp-muted, #5f7188); font-size: 13px; }
  .cpk-loading { padding: 12px; text-align: center; color: var(--erp-muted); font-size: 12px; }
  .cpk-clear { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 16px; color: var(--erp-muted); cursor: pointer; padding: 2px 4px; line-height: 1; }
  .cpk-clear:hover { color: var(--erp-text); }
`;

export default function CustomerPicker({ value, onChange, saleType, disabled = false }) {
  const [query, setQuery] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  // Set display text when value changes externally
  useEffect(() => {
    if (value && value.id) {
      // If we have a display name stashed, keep it; otherwise show id
      // The parent should set displayText via onChange name param
    } else {
      setDisplayText('');
      setQuery('');
    }
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      // Fetch from both endpoints in parallel
      const [hospRes, custRes] = await Promise.allSettled([
        api.get('/erp/hospitals', { params: { q, limit: 50 } }),
        api.get('/erp/customers', { params: { q, limit: 50 } }),
      ]);

      const items = [];

      // Hospital results
      if (hospRes.status === 'fulfilled') {
        const hospitals = hospRes.value?.data?.data || hospRes.value?.data || [];
        (Array.isArray(hospitals) ? hospitals : []).forEach(h => {
          items.push({
            type: 'hospital',
            id: h._id,
            name: h.hospital_name || h.name || 'Unknown Hospital',
            sub: h.address || '',
          });
        });
      }

      // Customer results
      if (custRes.status === 'fulfilled') {
        const custs = custRes.value?.data?.data || custRes.value?.data || [];
        (Array.isArray(custs) ? custs : []).forEach(c => {
          items.push({
            type: 'customer',
            id: c._id,
            name: c.customer_name || 'Unknown Customer',
            sub: c.customer_type ? c.customer_type.replace(/_/g, ' ') : '',
          });
        });
      }

      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setDisplayText(val);
    setOpen(true);

    // Debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (item) => {
    setDisplayText(item.name);
    setQuery('');
    setOpen(false);
    setResults([]);
    onChange(item.type, item.id, item.name);
  };

  const handleClear = () => {
    setDisplayText('');
    setQuery('');
    setResults([]);
    setOpen(false);
    onChange(null, null, null);
  };

  const handleFocus = () => {
    if (query.length >= 2 || results.length > 0) {
      setOpen(true);
    }
  };

  const isSelected = (item) => value && value.type === item.type && value.id === item.id;

  return (
    <div className="cpk-wrap" ref={wrapRef}>
      <style>{pickerStyles}</style>
      <input
        className="cpk-input"
        type="text"
        value={displayText}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder="Search hospital or customer..."
        disabled={disabled}
      />
      {displayText && !disabled && (
        <button className="cpk-clear" onClick={handleClear} type="button">&times;</button>
      )}

      {open && (
        <div className="cpk-dropdown">
          {loading && <div className="cpk-loading">Searching...</div>}
          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="cpk-empty">No results found</div>
          )}
          {!loading && query.length < 2 && results.length === 0 && (
            <div className="cpk-empty">Type at least 2 characters to search</div>
          )}
          {results.map(item => (
            <div
              key={`${item.type}-${item.id}`}
              className={`cpk-item${isSelected(item) ? ' selected' : ''}`}
              onClick={() => handleSelect(item)}
            >
              <span className={`cpk-type-badge cpk-type-${item.type}`}>
                {item.type === 'hospital' ? 'HOSP' : 'CUST'}
              </span>
              <div>
                <div>{item.name}</div>
                {item.sub && <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{item.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
