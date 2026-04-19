/**
 * useAiCoworkFeature — Phase G6.10
 *
 *   const { available, button, invoke, loading, error } = useAiCoworkFeature('APPROVAL_FIX_HELPER');
 *
 * - `available` = true when the feature row exists, is_active, and the current
 *   user's role is in allowed_roles. Returns false (button hidden) when missing
 *   or disabled — `fallback_behavior: 'hide_button'` is the default.
 * - `button.label` = the label to render on the button.
 * - `invoke(context)` calls the backend endpoint and returns { text, cost, ... }.
 *
 * Caches the feature list per session for 5 minutes to avoid hammering the
 * lookup endpoint on every page mount. The cache invalidates when the user
 * explicitly toggles a feature in AgentSettings (`window.dispatchEvent(new Event('ai-cowork:invalidate'))`).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { listAiCoworkFeatures, invokeAiCoworkFeature } from '../services/aiCoworkService';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null; // { ts, features }

async function loadFeatures(force = false) {
  if (!force && cache && (Date.now() - cache.ts) < CACHE_TTL_MS) return cache.features;
  try {
    const features = await listAiCoworkFeatures();
    cache = { ts: Date.now(), features };
    return features;
  } catch {
    return [];
  }
}

export function invalidateAiCoworkCache() {
  cache = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('ai-cowork:invalidate'));
}

export function useAiCoworkFeature(code) {
  const { user } = useAuth();
  const [features, setFeatures] = useState(cache?.features || []);
  const [loading, setLoading] = useState(false);
  const [invokeLoading, setInvokeLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadFeatures().then((f) => { if (mounted) { setFeatures(f); setLoading(false); } });
    const onInvalidate = () => loadFeatures(true).then((f) => mounted && setFeatures(f));
    if (typeof window !== 'undefined') window.addEventListener('ai-cowork:invalidate', onInvalidate);
    return () => {
      mounted = false;
      if (typeof window !== 'undefined') window.removeEventListener('ai-cowork:invalidate', onInvalidate);
    };
  }, []);

  const feature = useMemo(() => features.find((f) => f.code === code), [features, code]);

  const available = useMemo(() => {
    if (!feature) return false;
    const md = feature.metadata || {};
    const allowed = md.allowed_roles;
    if (!Array.isArray(allowed) || allowed.length === 0) return true; // open
    if (['president', 'ceo'].includes(user?.role)) return true;
    return allowed.map((r) => String(r).toLowerCase()).includes(String(user?.role || '').toLowerCase());
  }, [feature, user]);

  const button = useMemo(() => ({
    label: feature?.metadata?.button_label || feature?.label || 'AI',
    description: feature?.metadata?.description || '',
  }), [feature]);

  const invoke = useCallback(async (context = {}) => {
    if (!feature) throw new Error(`AI feature '${code}' not available`);
    setInvokeLoading(true);
    setError(null);
    try {
      const res = await invokeAiCoworkFeature(code, context);
      return res?.data || res;
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'AI call failed';
      setError(msg);
      throw new Error(msg);
    } finally {
      setInvokeLoading(false);
    }
  }, [code, feature]);

  return { available, button, invoke, loading, invokeLoading, error, feature };
}

export default useAiCoworkFeature;
