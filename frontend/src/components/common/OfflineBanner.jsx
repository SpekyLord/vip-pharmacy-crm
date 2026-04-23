/**
 * OfflineBanner — Persistent banner showing offline status, sync queue, and auth state
 *
 * Displays:
 *   - Yellow warning banner when offline
 *   - Blue sync banner when back online with pending items
 *   - Red auth banner when sync failed due to expired tokens (re-login required)
 *   - Green success flash when sync completes
 *   - Hidden when online with no pending items
 *
 * Placement: Top of the app layout, below Navbar.
 */
import { useState, useEffect, useCallback } from 'react';
import { Wifi, RefreshCw, CloudOff, Upload, AlertTriangle, LogIn } from 'lucide-react';
import { useOffline } from '../../hooks/useOffline';

const OfflineBanner = () => {
  const { isOnline, queueCount, triggerSync, authRequired, clearAuth } = useOffline();
  const [syncing, setSyncing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  // Reset dismissed state when going offline
  useEffect(() => {
    if (!isOnline) {
      setDismissed(false);
      setShowSyncSuccess(false);
    }
  }, [isOnline]);

  // Show sync success briefly when queue empties after being online
  useEffect(() => {
    if (isOnline && queueCount === 0 && syncing) {
      setSyncing(false);
      setShowSyncSuccess(true);
      const timer = setTimeout(() => setShowSyncSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, queueCount, syncing]);

  const handleSync = useCallback(() => {
    setSyncing(true);
    triggerSync();
  }, [triggerSync]);

  const handleReLogin = useCallback(() => {
    clearAuth();
    // Navigate to login — the auth:logout event will clear tokens
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }, [clearAuth]);

  // Auth required — red banner (highest priority)
  if (authRequired && queueCount > 0) {
    return (
      <div style={styles.authBanner}>
        <AlertTriangle size={16} />
        <span style={styles.bannerText}>
          <strong>Session expired.</strong> {queueCount} offline {queueCount === 1 ? 'session' : 'sessions'} waiting.
          Please log in again to sync your data.
        </span>
        <button onClick={handleReLogin} style={styles.authBtn}>
          <LogIn size={14} />
          Log In
        </button>
      </div>
    );
  }

  // Nothing to show
  if (isOnline && queueCount === 0 && !showSyncSuccess && dismissed) return null;
  if (isOnline && queueCount === 0 && !showSyncSuccess) return null;

  // Sync success flash
  if (showSyncSuccess) {
    return (
      <div style={styles.successBanner}>
        <Wifi size={16} />
        <span>All data synced successfully</span>
      </div>
    );
  }

  // Online but has queued items
  if (isOnline && queueCount > 0) {
    return (
      <div style={styles.syncBanner}>
        <Upload size={16} />
        <span>
          {queueCount} offline {queueCount === 1 ? 'session' : 'sessions'} pending sync
        </span>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={styles.syncBtn}
        >
          <RefreshCw size={14} className={syncing ? 'spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
      </div>
    );
  }

  // Offline
  if (!isOnline && dismissed) return null;

  return (
    <div style={styles.offlineBanner}>
      <div style={styles.bannerContent}>
        <CloudOff size={16} />
        <span style={styles.bannerText}>
          <strong>You are offline.</strong> CLM presentations still work. Data will sync when you reconnect.
        </span>
        {queueCount > 0 && (
          <span style={styles.queueBadge}>
            {queueCount} queued
          </span>
        )}
      </div>
      <button onClick={() => setDismissed(true)} style={styles.dismissBtn}>
        Dismiss
      </button>
    </div>
  );
};

const styles = {
  offlineBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #92400e, #b45309)',
    color: '#fef3c7',
    fontSize: '13px',
    fontWeight: 500,
    zIndex: 1000,
    flexShrink: 0,
    gap: '12px',
  },
  bannerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  bannerText: {
    lineHeight: 1.4,
  },
  queueBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    background: 'rgba(255,255,255,0.2)',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  dismissBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fef3c7',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  syncBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #1e40af, #1d4ed8)',
    color: '#dbeafe',
    fontSize: '13px',
    fontWeight: 500,
    zIndex: 1000,
    flexShrink: 0,
  },
  syncBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: 'auto',
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: '#dbeafe',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #065f46, #059669)',
    color: '#d1fae5',
    fontSize: '13px',
    fontWeight: 500,
    zIndex: 1000,
    flexShrink: 0,
  },
  authBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #991b1b, #dc2626)',
    color: '#fecaca',
    fontSize: '13px',
    fontWeight: 500,
    zIndex: 1000,
    flexShrink: 0,
  },
  authBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: 'auto',
    background: 'rgba(255,255,255,0.25)',
    border: 'none',
    color: '#fff',
    padding: '4px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default OfflineBanner;
