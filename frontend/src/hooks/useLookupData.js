/**
 * useLookupData — Fetches and caches programs + support types for use in forms and filters.
 *
 * Returns { programs: string[], supportTypes: string[], loading: boolean }
 */

import { useState, useEffect } from 'react';
import programService from '../services/programService';
import supportTypeService from '../services/supportTypeService';

// Module-level cache to avoid refetching on every mount
let cachedPrograms = null;
let cachedSupportTypes = null;
let fetchPromise = null;

const fetchLookupData = async () => {
  if (cachedPrograms && cachedSupportTypes) {
    return { programs: cachedPrograms, supportTypes: cachedSupportTypes };
  }

  if (fetchPromise) return fetchPromise;

  fetchPromise = Promise.all([
    programService.getAll({ active: true }),
    supportTypeService.getAll({ active: true }),
  ])
    .then(([programsRes, supportTypesRes]) => {
      cachedPrograms = (programsRes.data || []).map((p) => p.name);
      cachedSupportTypes = (supportTypesRes.data || []).map((s) => s.name);
      fetchPromise = null;
      return { programs: cachedPrograms, supportTypes: cachedSupportTypes };
    })
    .catch(() => {
      fetchPromise = null;
      return { programs: [], supportTypes: [] };
    });

  return fetchPromise;
};

// Call this after admin adds/removes items to bust the cache
export const invalidateLookupCache = () => {
  cachedPrograms = null;
  cachedSupportTypes = null;
  fetchPromise = null;
};

const useLookupData = () => {
  const [programs, setPrograms] = useState(cachedPrograms || []);
  const [supportTypes, setSupportTypes] = useState(cachedSupportTypes || []);
  const [loading, setLoading] = useState(!cachedPrograms);

  useEffect(() => {
    let mounted = true;

    fetchLookupData().then((data) => {
      if (mounted) {
        setPrograms(data.programs);
        setSupportTypes(data.supportTypes);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return { programs, supportTypes, loading };
};

export default useLookupData;
