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

/**
 * Fetch hospitals for dropdowns. Caches for the session.
 * BDMs see only their tagged hospitals (backend filters by req.user).
 */
let cachedHospitals = null;

export default function useHospitals() {
  const api = useErpApi();
  const [hospitals, setHospitals] = useState(cachedHospitals || []);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (cachedHospitals || fetchedRef.current) {
      if (cachedHospitals) setHospitals(cachedHospitals);
      return;
    }
    fetchedRef.current = true;

    api.get('/hospitals?limit=0&status=ACTIVE').then(res => {
      const data = (res?.data || []).map(h => ({
        ...h,
        hospital_name_display: toTitleCase(h.hospital_name)
      }));
      // Sort by display name and deduplicate by hospital_name_clean
      const seen = new Set();
      const deduped = data
        .sort((a, b) => a.hospital_name_display.localeCompare(b.hospital_name_display))
        .filter(h => {
          const key = h.hospital_name_clean || h.hospital_name_display.toUpperCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      cachedHospitals = deduped;
      setHospitals(deduped);
    }).catch(() => {
      // fail silently — don't retry on error
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    cachedHospitals = null;
    fetchedRef.current = false;
    return api.get('/hospitals?limit=0&status=ACTIVE').then(res => {
      const data = (res?.data || []).map(h => ({
        ...h,
        hospital_name_display: toTitleCase(h.hospital_name)
      }));
      const seen = new Set();
      const deduped = data
        .sort((a, b) => a.hospital_name_display.localeCompare(b.hospital_name_display))
        .filter(h => {
          const key = h.hospital_name_clean || h.hospital_name_display.toUpperCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      cachedHospitals = deduped;
      setHospitals(deduped);
      return deduped;
    });
  };

  return { hospitals, loading: api.loading, error: api.error, refresh };
}
