/**
 * NotificationBell — Phase G9.R5
 *
 * Lightweight inbox bell for the top navbar. Polls /api/messages/counts every
 * 30 s and refreshes immediately when the global `inbox:updated` event fires
 * (already dispatched by every read/write helper). Click navigates to /inbox.
 *
 * Two badges:
 *   - Red dot + count = action_required (highest priority, e.g. an approval awaits)
 *   - Blue dot + count = unread only (no pending action)
 */
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import messageService from '../../services/messageInboxService';

const styles = `
  .nb-wrap { position: relative; display: inline-flex; }
  .nb-btn { background: transparent; border: 0; color: inherit; padding: 6px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
  .nb-btn:hover { background: rgba(0,0,0,0.06); }
  body.dark-mode .nb-btn:hover { background: rgba(255,255,255,0.08); }
  .nb-badge { position: absolute; top: 2px; right: 2px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; color: #fff; pointer-events: none; }
  .nb-badge.action { background: #dc2626; box-shadow: 0 0 0 2px #fff; }
  .nb-badge.unread { background: #2563eb; box-shadow: 0 0 0 2px #fff; }
  body.dark-mode .nb-badge.action { box-shadow: 0 0 0 2px #0f172a; }
  body.dark-mode .nb-badge.unread { box-shadow: 0 0 0 2px #0f172a; }
`;

const POLL_MS = 30_000;
const EVENT_DEBOUNCE_MS = 2_000;

export default function NotificationBell() {
  const [counts, setCounts] = useState({ unread: 0, action_required: 0 });

  const refresh = useCallback(async () => {
    try {
      const json = await messageService.getCounts();
      const c = json?.data || {};
      setCounts({
        unread: Number(c.unread || 0),
        action_required: Number(c.action_required || 0),
      });
    } catch {
      // soft-fail — bell just stays at last value
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    let debounceTimer = null;
    const onInboxUpdate = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, EVENT_DEBOUNCE_MS);
    };
    window.addEventListener('inbox:updated', onInboxUpdate);
    return () => {
      clearInterval(interval);
      clearTimeout(debounceTimer);
      window.removeEventListener('inbox:updated', onInboxUpdate);
    };
  }, [refresh]);

  const showAction = counts.action_required > 0;
  const badgeCount = showAction ? counts.action_required : counts.unread;
  const badgeClass = showAction ? 'action' : 'unread';
  const ariaLabel = showAction
    ? `Inbox — ${counts.action_required} action(s) required`
    : counts.unread > 0
      ? `Inbox — ${counts.unread} unread`
      : 'Inbox';

  return (
    <>
      <style>{styles}</style>
      <span className="nb-wrap">
        <Link to="/inbox" className="nb-btn" aria-label={ariaLabel} title={ariaLabel}>
          <Bell size={20} />
          {badgeCount > 0 && (
            <span className={`nb-badge ${badgeClass}`}>
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </Link>
      </span>
    </>
  );
}
