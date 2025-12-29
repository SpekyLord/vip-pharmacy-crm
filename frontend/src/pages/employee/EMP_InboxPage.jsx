/**
 * EmployeeInbox Page (HRM Notifications)
 *
 * Employee inbox for admin/HR/system notifications with:
 * - Hardcoded inbox list (swap later to DB/API)
 * - Filters (type, read/unread, search)
 * - Pagination
 * - Details modal (view notification)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import MessageBox from '../../components/employee/MessageBox';
import messageService from '../../services/messageInboxService';
const API_BASE = 'http://localhost:5000';
 
const EmployeeInbox = () => {
  const navigate = useNavigate();

  // ✅ Dynamic data
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
  (async () => {
    try {
      setLoading(true);

   

    const json = await messageService.getAll(); // uses same api instance as visits
    const data = json?.data ?? [];

    const currentUserId = localStorage.getItem("userId"); // or your auth source

    const normalizeMessage = (m) => ({
    ...m,

    // ✅ what MessageBox renders
    message: m.message ?? m.body ?? "",
    from: m.from ?? m.senderName ?? "Admin",

    // ✅ schema readBy = [{ userId, readAt }]
    read: typeof m.read === "boolean"
    ? m.read
    : (Array.isArray(m.readBy) && currentUserId
        ? m.readBy.some(id => String(id) === String(currentUserId))
        : false),

    });

    setMessages(Array.isArray(data) ? data.map(normalizeMessage) : []);


    } catch (err) {
      console.error('Failed to load inbox:', err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  })();
}, []);

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all'); // all | unread | read
  const [search, setSearch] = useState('');

  // Pagination
  const [pagination, setPagination] = useState({ page: 1, limit: 8 });

  // Modal
  const [expandedId, setExpandedId] = useState(null);


  // Derived data
  const filteredMessages = useMemo(() => {
    const s = search.trim().toLowerCase();

return messages
  .filter(m => (typeFilter === 'all' ? true : m.category === typeFilter))
  .filter(m => {
    if (readFilter === 'unread') return !m.read;
    if (readFilter === 'read') return !!m.read;
    return true;
  })
  .filter(m => {
    if (!s) return true;

    const title = (m.title ?? '').toLowerCase();
    const body = (m.message ?? '').toLowerCase();

    const fromTxt = (m.from ?? m.senderName ?? "").toLowerCase();
    return title.includes(s) || body.includes(s) || fromTxt.includes(s);


   
  })
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  }, [messages, typeFilter, readFilter, search]);

  const pages = Math.max(1, Math.ceil(filteredMessages.length / pagination.limit));
  const pageSafe = Math.min(pages, Math.max(1, pagination.page));

  const pageItems = useMemo(() => {
    const start = (pageSafe - 1) * pagination.limit;
    const end = start + pagination.limit;
    return filteredMessages.slice(start, end);
  }, [filteredMessages, pageSafe, pagination.limit]);

  // Helpers
  const formatDateTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeMeta = (type) => {
    switch (type) {
      case 'announcement':
        return { label: 'Announcement', chip: 'chip chip-blue', icon: '📢' };
      case 'payroll':
        return { label: 'Payroll', chip: 'chip chip-purple', icon: '💰' };
      case 'leave':
        return { label: 'Leave', chip: 'chip chip-green', icon: '🕒' };
      case 'policy':
        return { label: 'Policy', chip: 'chip chip-orange', icon: '📄' };
      case 'system':
        return { label: 'System', chip: 'chip chip-red', icon: '⚠️' };
      default:
        return { label: 'Notice', chip: 'chip', icon: '🔔' };
    }
  };

  const unreadCount = useMemo(() => messages.filter(m => !m.read).length, [messages]);

    const markAsRead = (id) => {
    setMessages(prev => prev.map(m => (m._id === id ? { ...m, read: true } : m)));
    };


    const toggleRead = async (id) => {
    await messageService.markRead(id);
    setMessages(prev =>
        prev.map(m => (m._id === id ? { ...m, read: true } : m))
    );
    };



const toggleMessage = async (msgOrId) => {
  const id = typeof msgOrId === "string" ? msgOrId : msgOrId?._id;
  if (!id) return; // ✅ prevents "Cannot read properties of null"

  const msg = typeof msgOrId === "object"
    ? msgOrId
    : messages.find(m => m._id === id);

  if (!msg) return; // ✅ message not found (state not ready)

  setExpandedId(prev => (prev === id ? null : id));

  if (!msg.read) {
    try {
      await messageService.markRead(id);
      setMessages(prev =>
        prev.map(m => (m._id === id ? { ...m, read: true } : m))
      );
    } catch (e) {
      console.error("markRead failed:", e?.response?.data || e);
    }
  }
};





  const closeModal = () => setExpandedId(null);


  const changePage = (delta) => {
    setPagination(prev => ({
      ...prev,
      page: Math.max(1, Math.min(pages, prev.page + delta)),
    }));
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setReadFilter('all');
    setSearch('');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="dashboard-layout">
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />

        <main className="main-content">
          {/* Header */}
          <div className="page-header">
            <div className="header-left">
              <h1>Inbox</h1>
              <p className="subtle">
                Notifications from Admin / HR / System
                {unreadCount > 0 && (
                  <span className="unread-pill">{unreadCount} unread</span>
                )}
              </p>
            </div>

            <div className="header-right">
              <button
                className="btn btn-secondary"
                onClick={() => navigate('/employee')}
                title="Back to employee dashboard"
              >
                Back
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="filters-section">
            <div className="filters-row">
              <div className="filter-group">
                <label htmlFor="type-filter">Type</label>
                <select
                  id="type-filter"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPagination(p => ({ ...p, page: 1 }));
                  }}
                >
                  <option value="all">All</option>
                  <option value="announcement">Announcement</option>
                  <option value="payroll">Payroll</option>
                  <option value="leave">Leave</option>
                  <option value="policy">Policy</option>
                  <option value="system">System</option>
                </select>
              </div>

              <div className="filter-group">
                <label htmlFor="read-filter">Status</label>
                <select
                  id="read-filter"
                  value={readFilter}
                  onChange={(e) => {
                    setReadFilter(e.target.value);
                    setPagination(p => ({ ...p, page: 1 }));
                  }}
                >
                  <option value="all">All</option>
                  <option value="unread">Unread</option>
                  <option value="read">Read</option>
                </select>
              </div>

              <div className="filter-group grow">
                <label htmlFor="search">Search</label>
                <input
                  id="search"
                  type="text"
                  placeholder="Search title, content, sender..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPagination(p => ({ ...p, page: 1 }));
                  }}
                />
              </div>

              <div className="filter-actions">
                <button className="btn btn-primary btn-sm" onClick={clearFilters}>
                  Clear
                </button>
              </div>
            </div>
          </div>

        {/* ✅ UPDATED: inline dropdown details (no right preview panel) */}
        <div className="inbox-shell">
        <div className="inbox-list">
            {pageItems.length > 0 ? (
                pageItems.map((msg) => (
                    <MessageBox
                        key={msg._id}
                        message={msg}

                        isOpen={expandedId === msg._id}
                        onToggle={toggleMessage}
                        onToggleRead={toggleRead}
                        formatDateTime={formatDateTime}
                        getTypeMeta={getTypeMeta}
                    />
                ))
            ) : (
            <div className="no-data">
                <p>No notifications found.</p>
                <p className="hint">Try adjusting filters or search terms.</p>
            </div>
            )}

            {/* Pagination */}
            <div className="pagination">
            <button
                onClick={() => changePage(-1)}
                disabled={pageSafe === 1}
                className="btn btn-secondary btn-sm"
            >
                Previous
            </button>

            <span className="pagination-info">
                Page {pageSafe} of {pages} ({filteredMessages.length} total)
            </span>

            <button
                onClick={() => changePage(1)}
                disabled={pageSafe >= pages}
                className="btn btn-secondary btn-sm"
            >
                Next
            </button>
            </div>
        </div>
        </div>


        </main>
      </div>

      <style>{`
        /* --- Header --- */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .header-left h1 {
          margin: 0;
          font-size: 1.5rem;
        }
        .subtle {
          color: #6b7280;
          margin: 0.25rem 0 0;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .unread-pill {
          background: #eef2ff;
          color: #4338ca;
          padding: 0.2rem 0.5rem;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        /* --- Filters --- */
        .filters-section {
          background: white;
          padding: 1rem;
          border-radius: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          margin-bottom: 1rem;
        }
        .filters-row {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          align-items: flex-end;
        }
        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .filter-group.grow {
          flex: 1;
          min-width: 240px;
        }
        .filter-group label {
          font-size: 0.75rem;
          color: #6b7280;
          font-weight: 600;
        }
        .filter-group select,
        .filter-group input {
          padding: 0.55rem 0.65rem;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.9rem;
          background: #fff;
        }
        .filter-actions {
          display: flex;
          gap: 0.5rem;
        }

        /* --- Inbox shell (list + preview) --- */
       
        .inbox-shell {
        width: 100%;
        }

        .inbox-list {
        width: 100%;
        }

        .inbox-list {
        background: transparent;
        border-radius: 0;
        box-shadow: none;
        overflow: visible;

        display: flex;
        flex-direction: column;
        gap: 14px;            
        padding: 12px;          
        }

        /* --- Items --- */
        .inbox-item {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.1rem;   
        border-bottom: none;
        cursor: pointer;
        transition: background 120ms ease;
        }

        .inbox-item:hover {
          background: #f8fafc;
        }
        .inbox-item.is-selected {
          background: #eef2ff;
        }
        .inbox-item.is-unread .title {
          font-weight: 800;
          color: #111827;
        }
        .inbox-item.is-read .title {
          font-weight: 700;
          color: #1f2937;
        }

        .inbox-item .left {
          display: flex;
          gap: 0.75rem;
          min-width: 0;
          flex: 1;
        }

        .inbox-row {
        background: #ffffff;
        border-radius: 14px;
        border: 1px solid #eef2f7;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        overflow: hidden;
        }

        .inbox-row:last-child {
        border-bottom: none;
        }

        .inbox-dropdown {
        background: #fbfcff;
        padding: 0.85rem 1.1rem 1.1rem;
        border-top: 1px solid #eef2ff;
        }

        .dropdown-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        color: #6b7280;
        font-size: 0.85rem;
        margin-bottom: 0.5rem;
        }

        .dropdown-body {
        margin: 0;
        color: #374151;
        line-height: 1.5;
        }

        .dropdown-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 0.75rem;
        }

        .avatar {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: #f3f4f6;
          display: grid;
          place-items: center;
          font-size: 1.1rem;
          flex: 0 0 auto;
        }

        .content {
          min-width: 0;
          flex: 1;
        }

        .topline {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 0.2rem;
        }
        .from {
          font-size: 0.85rem;
          font-weight: 700;
          color: #111827;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #2563eb;
          display: inline-block;
        }
        .badge-important {
          background: #fee2e2;
          color: #991b1b;
          border-radius: 999px;
          padding: 0.12rem 0.5rem;
          font-size: 0.72rem;
          font-weight: 800;
        }

        .title {
          font-size: 0.95rem;
          margin-bottom: 0.25rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .preview {
          color: #6b7280;
          font-size: 0.85rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }

        .right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.35rem;
          flex: 0 0 auto;
        }
        .time {
          font-size: 0.75rem;
          color: #6b7280;
          white-space: nowrap;
        }
        .btn-link.mini {
          padding: 0;
          font-size: 0.8rem;
        }

        /* --- Chips --- */
        .chip {
          font-size: 0.72rem;
          font-weight: 700;
          padding: 0.15rem 0.5rem;
          border-radius: 999px;
          background: #f3f4f6;
          color: #374151;
        }
        .chip-blue { background: #e0f2fe; color: #075985; }
        .chip-purple { background: #ede9fe; color: #5b21b6; }
        .chip-green { background: #dcfce7; color: #166534; }
        .chip-orange { background: #ffedd5; color: #9a3412; }
        .chip-red { background: #fee2e2; color: #991b1b; }

        /* --- Pagination --- */
        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: #fff;
        }
        .pagination-info {
          color: #6b7280;
          font-size: 0.875rem;
        }

        /* --- Preview panel --- */
        .inbox-preview {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          padding: 1rem;
          min-height: 240px;
          position: sticky;
          top: 1rem;
        }
        .preview-empty {
          height: 220px;
          display: grid;
          place-items: center;
          color: #6b7280;
        }
        .preview-card h2 {
          margin: 0;
          font-size: 1.1rem;
          color: #111827;
        }
        .preview-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }
        .preview-meta {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin-top: 0.35rem;
          color: #6b7280;
          font-size: 0.85rem;
        }
        .preview-body p {
          margin: 0;
          color: #374151;
          line-height: 1.5;
        }

        /* --- No data --- */
        .no-data {
          text-align: center;
          padding: 3rem 1rem;
          color: #6b7280;
        }
        .no-data .hint {
          font-size: 0.875rem;
          color: #9ca3af;
          margin-top: 0.4rem;
        }

        /* --- Modal (mobile) --- */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 1rem;
        }
        .modal-content {
          background: white;
          border-radius: 12px;
          width: 100%;
          max-width: 700px;
          max-height: 90vh;
          overflow: auto;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .modal-header h2 {
          margin: 0;
          font-size: 1.05rem;
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 1.75rem;
          cursor: pointer;
          color: #6b7280;
        }
        .modal-body {
          padding: 1rem 1.25rem;
        }
        .modal-meta {
          color: #6b7280;
          font-size: 0.9rem;
          display: grid;
          gap: 0.25rem;
        }
        .modal-footer {
          padding: 1rem 1.25rem;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: flex-end;
        }

        /* --- Responsive: collapse preview on smaller screens --- */
        .mobile-only { display: none; }
        @media (max-width: 1024px) {
          .inbox-shell {
            grid-template-columns: 1fr;
          }
          .inbox-preview {
            display: none;
          }
          .mobile-only {
            display: flex;
          }
        }
        @media (max-width: 768px) {
          .filters-row {
            flex-direction: column;
            align-items: stretch;
          }
          .filter-group select,
          .filter-group input {
            width: 100%;
          }
          .right {
            display: none; /* tighter list on mobile */
          }
        }
      `}</style>
    </div>
  );
};

export default EmployeeInbox;
