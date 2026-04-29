import { useState, useEffect, useRef } from 'react';
import useErpApi from './useErpApi';

/**
 * Title Case normalizer for hospital names.
 * "ILOILO DOCTORS HOSPITAL" → "Iloilo Doctors Hospital"
 * Preserves known acronyms (E&R, GOZO, etc.)
 */
function toTitleCase(str) {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/(?:^|\s|[-/])\S/g, c => c.toUpperCase())
    .replace(/\b(Of|And|The|De|In|At|To|For|On)\b/g, w => w.toLowerCase())
    .replace(/^\S/, c => c.toUpperCase()); // ensure first char is upper
}

function decorate(list) {
  const data = (list || []).map(h => ({
    ...h,
    hospital_name_display: toTitleCase(h.hospital_name)
  }));
  const seen = new Set();
  return data
    .sort((a, b) => a.hospital_name_display.localeCompare(b.hospital_name_display))
    .filter(h => {
      const key = h.hospital_name_clean || h.hospital_name_display.toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Fetch hospitals for dropdowns. Caches the no-args case for the session.
 *
 * Default (no args): backend filters to user's tagged hospitals via warehouse
 * membership.
 *
 * `{ warehouseId }`: scope to hospitals tied to a specific warehouse — used by
 * SalesEntry so a proxy filing on behalf of another BDM sees the TARGET
 * warehouse's hospitals (not the proxy's own). Backend gates the warehouse
 * choice the same way GET /warehouse/my does, so this can't be abused to
 * enumerate hospitals on warehouses the caller has no access to. The session
 * cache is bypassed when scoped so toggling warehouse always refetches.
 */
let cachedHospitals = null;

export default function useHospitals(opts = {}) {
  const { warehouseId } = opts;
  const scoped = Boolean(warehouseId);

  const api = useErpApi();
  const [hospitals, setHospitals] = useState(scoped ? [] : (cachedHospitals || []));
  const fetchedRef = useRef(false);

  useEffect(() => {
    // Scoped fetch — always re-runs when warehouseId changes; never touches the
    // module cache (which represents "self-scope").
    if (scoped) {
      const params = new URLSearchParams({ limit: '0', status: 'ACTIVE' });
      params.set('warehouse_id', String(warehouseId));
      let cancelled = false;
      api.get(`/hospitals?${params.toString()}`).then(res => {
        if (cancelled) return;
        setHospitals(decorate(res?.data || []));
      }).catch(err => {
        if (cancelled) return;
        console.error('[useHospitals] scoped fetch failed:', err?.response?.status, err?.response?.data?.message || err.message);
        setHospitals([]);
      });
      return () => { cancelled = true; };
    }

    // Default cached path — unchanged behavior.
    if (cachedHospitals || fetchedRef.current) {
      if (cachedHospitals) setHospitals(cachedHospitals);
      return;
    }
    fetchedRef.current = true;

    api.get('/hospitals?limit=0&status=ACTIVE').then(res => {
      const deduped = decorate(res?.data || []);
      cachedHospitals = deduped;
      setHospitals(deduped);
    }).catch(err => {
      console.error('[useHospitals] fetch failed:', err?.response?.status, err?.response?.data?.message || err.message);
      fetchedRef.current = false; // allow retry on next mount after auth recovery
    });
  }, [scoped, warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    if (scoped) {
      const params = new URLSearchParams({ limit: '0', status: 'ACTIVE' });
      params.set('warehouse_id', String(warehouseId));
      return api.get(`/hospitals?${params.toString()}`).then(res => {
        const deduped = decorate(res?.data || []);
        setHospitals(deduped);
        return deduped;
      });
    }
    cachedHospitals = null;
    fetchedRef.current = false;
    return api.get('/hospitals?limit=0&status=ACTIVE').then(res => {
      const deduped = decorate(res?.data || []);
      cachedHospitals = deduped;
      setHospitals(deduped);
      return deduped;
    });
  };

  return { hospitals, loading: api.loading, error: api.error, refresh };
}
