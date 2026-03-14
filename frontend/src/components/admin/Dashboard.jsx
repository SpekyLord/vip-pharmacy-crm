/**
 * Dashboard Component (Admin)
 * Layout inspired by Hireism HR dashboard
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope, Users,
  MapPin, Calendar, ChevronLeft, ChevronRight, ChevronDown, FileText,
} from 'lucide-react';
import userService from '../../services/userService';

/* =============================================================================
   STYLES
   ============================================================================= */

const dashboardStyles = `
  :root {
    --bg: #f1f5f9;
    --card: #ffffff;
    --text: #0f172a;
    --sub: #64748b;
    --border: #e2e8f0;
    --shadow: 0 1px 4px rgba(0,0,0,0.08);

    /* Login palette-inspired accents (gold/yellow/cream) */
    --gold-1: #ffc700;
    --gold-2: #ffd64a;
    --cream-1: #fff3cf;
    --cream-2: #fff7ed;
  }

  body.dark-mode {
    --bg: #0f172a;
    --card: #1e293b;
    --text: #f1f5f9;
    --sub: #94a3b8;
    --border: #334155;
    --shadow: 0 1px 4px rgba(0,0,0,0.3);
  }

  /* ---- Page shell ---- */
  .db-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--bg);
  }

  /* ---- Main left column ---- */
  .db-main {
    padding: clamp(12px, 1.2vw, 22px) clamp(20px, 2vw, 36px)
      clamp(24px, 2.4vw, 40px) clamp(28px, 2.4vw, 44px);
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 1.2vw, 20px);
  }

  .db-main::-webkit-scrollbar { width: 4px; }
  .db-main::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* Greeting card */
  .db-greeting {
    background: linear-gradient(
      135deg,
      var(--gold-1) 0%,
      var(--gold-2) 44%,
      var(--cream-2) 100%
    );
    border-radius: 16px;
    padding: clamp(28px, 3vw, 56px) clamp(28px, 3.2vw, 64px);
    color: rgba(11, 11, 11, 0.92);
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: clamp(120px, 22vh, 220px);
    position: relative;
    overflow: hidden;
  }

  body.dark-mode .db-greeting {
    background: linear-gradient(
      135deg,
      #f59e0b 0%,
      #fde68a 52%,
      rgba(255, 255, 255, 0.92) 100%
    );
    color: rgba(11, 11, 11, 0.92);
  }

  .db-greeting::after {
    content: '';
    position: absolute;
    right: -20px;
    top: -30px;
    width: 200px;
    height: 200px;
    background: rgba(255,255,255,0.35);
    border-radius: 50%;
  }

  .db-greeting::before {
    content: '';
    position: absolute;
    right: 60px;
    bottom: -40px;
    width: 150px;
    height: 150px;
    background: rgba(255,255,255,0.22);
    border-radius: 50%;
  }

  .db-greeting-text h2 {
    margin: 0 0 6px 0;
    font-size: clamp(22px, 1.6vw, 32px);
    font-weight: 700;
    letter-spacing: -0.3px;
  }

  .db-greeting-text p {
    margin: 0;
    font-size: clamp(12px, 0.9vw, 15px);
    opacity: 0.85;
    max-width: clamp(300px, 25vw, 420px);
  }

  .db-greeting-action {
    margin-top: 16px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: clamp(7px, 0.7vw, 10px) clamp(14px, 1.2vw, 22px);
    background: rgba(255,255,255,0.62);
    border: 1px solid rgba(255,255,255,0.78);
    border-radius: 8px;
    color: rgba(11, 11, 11, 0.92);
    font-size: clamp(11px, 0.8vw, 13px);
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition: background 0.2s;
    backdrop-filter: blur(4px);
  }

  .db-greeting-action:hover { background: rgba(255,255,255,0.82); }

  body.dark-mode .db-greeting-action {
    background: rgba(255,255,255,0.92);
    border-color: rgba(255,255,255,0.85);
    color: rgba(11, 11, 11, 0.92);
  }

  body.dark-mode .db-greeting-action:hover {
    background: #ffffff;
  }

  .db-greeting-illustration {
    font-size: clamp(56px, 5vw, 96px);
    opacity: 0.15;
    position: absolute;
    right: 180px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 0;
    pointer-events: none;
    user-select: none;
  }

  /* Greeting quick actions */
  .db-greeting-actions {
    display: flex;
    flex-direction: column;
    gap: clamp(8px, 0.9vw, 14px);
    z-index: 1;
    flex-shrink: 0;
  }

  .db-quick-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: clamp(8px, 0.8vw, 11px) clamp(12px, 1.1vw, 18px);
    border-radius: 10px;
    font-size: clamp(11px, 0.8vw, 13px);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    text-decoration: none;
    border: 1px solid rgba(255,255,255,0.70);
    background: rgba(255,255,255,0.55);
    color: rgba(11, 11, 11, 0.92);
    backdrop-filter: blur(4px);
  }

  .db-quick-btn:hover {
    background: rgba(255,255,255,0.78);
    border-color: rgba(255,255,255,0.88);
  }

  .db-quick-btn.primary {
    background: rgba(11, 11, 11, 0.92);
    color: white;
    border-color: transparent;
  }

  .db-quick-btn.primary:hover {
    background: rgba(11, 11, 11, 1);
  }

  .db-greeting-action svg,
  .db-quick-btn svg {
    width: clamp(12px, 1vw, 16px);
    height: clamp(12px, 1vw, 16px);
  }

  /* Section header */
  .db-section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .db-section-title {
    font-size: clamp(14px, 1vw, 17px);
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }

  .db-view-all {
    font-size: clamp(11px, 0.8vw, 13px);
    color: #3b82f6;
    cursor: pointer;
    font-weight: 500;
    background: none;
    border: none;
    padding: 0;
  }

  .db-view-all:hover { text-decoration: underline; }

  /* Stat boxes */
  .db-overview {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .db-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: auto;
    gap: clamp(12px, 1.4vw, 18px);
    min-height: 0;
    align-content: start;
  }

  .db-stat-box {
    background: var(--card);
    border-radius: 12px;
    padding: clamp(14px, 1.4vw, 20px);
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 10px;
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    transition: transform 0.2s, box-shadow 0.2s;
    height: auto;
  }

  .db-stat-box:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }

  .db-stat-icon {
    width: clamp(36px, 2.6vw, 46px);
    height: clamp(36px, 2.6vw, 46px);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .db-stat-icon svg {
    width: clamp(16px, 1.4vw, 22px);
    height: clamp(16px, 1.4vw, 22px);
  }

  .db-stat-icon.blue  { background: #dbeafe; color: #2563eb; }
  .db-stat-icon.purple{ background: #ede9fe; color: #7c3aed; }
  .db-stat-icon.green { background: #dcfce7; color: #16a34a; }
  .db-stat-icon.amber { background: #fef3c7; color: #d97706; }

  body.dark-mode .db-stat-icon.blue   { background: #1e3a8a; color: #93c5fd; }
  body.dark-mode .db-stat-icon.purple { background: #4c1d95; color: #c4b5fd; }
  body.dark-mode .db-stat-icon.green  { background: #14532d; color: #86efac; }
  body.dark-mode .db-stat-icon.amber  { background: #78350f; color: #fcd34d; }

  .db-stat-value {
    font-size: clamp(22px, 1.8vw, 30px);
    font-weight: 800;
    color: var(--text);
    line-height: 1;
  }

  .db-stat-label {
    font-size: clamp(10px, 0.8vw, 12px);
    color: var(--sub);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .db-stat-sub {
    font-size: clamp(9px, 0.75vw, 11px);
    color: var(--sub);
    margin-top: 2px;
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .db-stat-sub .dot-vip {
    display: inline-flex; align-items: center; gap: 3px;
  }
  .db-stat-sub .dot-vip::before {
    content: ''; width: 5px; height: 5px;
    background: #fbbf24; border-radius: 50%;
  }

  .db-stat-sub .dot-reg {
    display: inline-flex; align-items: center; gap: 3px;
  }
  .db-stat-sub .dot-reg::before {
    content: ''; width: 5px; height: 5px;
    background: #60a5fa; border-radius: 50%;
  }

  /* ---- Right sidebar ---- */
  .db-sidebar {
    padding: clamp(20px, 2vw, 32px) clamp(16px, 1.8vw, 28px)
      clamp(20px, 2vw, 32px) clamp(16px, 1.8vw, 28px);
    display: flex;
    flex-direction: column;
    gap: clamp(8px, 1vw, 14px);
    border-left: 1px solid var(--border);
  }

  /* Sidebar card */
  .db-sidebar-card {
    background: var(--card);
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  /* Collapsible section toggle header */
  .db-card-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: clamp(10px, 1vw, 14px) clamp(12px, 1.2vw, 16px);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text);
    text-align: left;
  }

  .db-card-toggle:hover { background: var(--bg); }

  .db-toggle-label {
    flex: 1;
    font-size: clamp(11px, 0.85vw, 13px);
    font-weight: 700;
    color: var(--text);
  }

  .db-toggle-chevron {
    color: var(--sub);
    transition: transform 0.28s ease;
    flex-shrink: 0;
  }

  .db-toggle-chevron.open { transform: rotate(0deg); }
  .db-toggle-chevron.closed { transform: rotate(-90deg); }

  /* CSS grid row animation — smoother than max-height */
  .db-collapse-wrap {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows 0.28s ease;
    overflow: hidden;
  }

  .db-collapse-wrap.closed {
    grid-template-rows: 0fr;
  }

  .db-collapse-wrap.bdms.closed {
    display: none;
  }

  .db-collapse-wrap.closed .db-collapse-inner {
    padding: 0;
    height: 0;
    max-height: 0;
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }

  .db-collapse-wrap.closed .db-users-list,
  .db-collapse-wrap.closed .db-no-users {
    display: none;
  }

  .db-collapse-inner {
    overflow: hidden;
    padding: 0 clamp(12px, 1.2vw, 16px) clamp(12px, 1.2vw, 16px);
  }

  .db-collapse-wrap.bdms .db-collapse-inner {
    padding-top: 8px;
  }

  /* Calendar */
  .cal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .cal-month {
    font-size: clamp(10px, 0.8vw, 12px);
    font-weight: 600;
    color: var(--sub);
  }

  .cal-nav {
    display: flex;
    gap: 4px;
  }

  .cal-nav-btn {
    width: clamp(20px, 1.6vw, 24px);
    height: clamp(20px, 1.6vw, 24px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--sub);
    transition: all 0.15s;
  }

  .cal-nav-btn:hover { background: #3b82f6; color: white; border-color: #3b82f6; }

  .cal-days-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 4px;
  }

  .cal-day-name {
    text-align: center;
    font-size: clamp(8px, 0.7vw, 10px);
    font-weight: 700;
    color: var(--sub);
    text-transform: uppercase;
    padding: 2px 0;
  }

  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
  }

  .cal-cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: clamp(9px, 0.75vw, 11px);
    color: var(--sub);
    cursor: pointer;
    transition: all 0.15s;
  }

  .cal-cell:hover { background: #dbeafe; color: #2563eb; }
  .cal-cell.today { background: #3b82f6; color: white; font-weight: 700; }
  .cal-cell.empty { cursor: default; }
  .cal-cell.empty:hover { background: transparent; }

  /* Online BDMs */
  .db-online-dot {
    width: 7px;
    height: 7px;
    background: #22c55e;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 2px rgba(34,197,94,0.25);
  }

  .db-online-count {
    font-size: clamp(9px, 0.75vw, 11px);
    font-weight: 600;
    color: #22c55e;
    background: #dcfce7;
    padding: 2px 7px;
    border-radius: 20px;
  }

  body.dark-mode .db-online-count { background: #14532d; }

  .db-users-list {
    display: flex;
    flex-direction: column;
    margin-top: 8px;
    gap: 4px;
  }

  .db-user-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 4px 7px;
    border-radius: 8px;
    background: var(--bg);
    transition: background 0.15s;
  }

  .db-user-row:hover { background: #dbeafe; }
  body.dark-mode .db-user-row:hover { background: #1e3a8a; }

  .db-user-avatar {
    width: clamp(28px, 2.2vw, 36px);
    height: clamp(28px, 2.2vw, 36px);
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(9px, 0.75vw, 11px);
    font-weight: 700;
    flex-shrink: 0;
    position: relative;
  }

  .db-user-avatar .online-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 8px;
    height: 8px;
    background: #22c55e;
    border-radius: 50%;
    border: 2px solid var(--card);
  }

  .db-user-info { flex: 1; min-width: 0; }

  .db-user-name {
    font-size: clamp(10px, 0.8vw, 12px);
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .db-user-role {
    font-size: clamp(9px, 0.75vw, 11px);
    color: var(--sub);
  }

  .db-no-users {
    text-align: center;
    font-size: clamp(10px, 0.8vw, 12px);
    color: var(--sub);
    margin-top: 8px;
    padding: 8px 0;
  }

  /* Responsive */
  @media (min-width: 1025px) {
    .db-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) clamp(300px, 25vw, 420px);
      overflow: hidden;
    }

    .db-main {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .db-sidebar {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
  }

  @media (max-width: 1024px) {
    .db-main {
      padding: 16px;
    }

    .db-sidebar {
      padding: 0 16px 16px;
      border-left: none;
      border-top: 1px solid var(--border);
    }

    .db-stats {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
  }

  @media (max-width: 768px) {
    .db-greeting {
      flex-direction: column;
      align-items: flex-start;
      gap: 20px;
      padding: 24px;
    }

    .db-greeting-text h2 { font-size: 22px; }

    .db-greeting-actions {
      width: 100%;
      flex-direction: column;
      gap: 10px;
    }

    .db-quick-btn {
      width: 100%;
      justify-content: center;
      padding: 12px;
      font-size: 14px;
    }

    .db-greeting-illustration {
      display: none;
    }
  }
`;

/* =============================================================================
   HELPERS
   ============================================================================= */

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const initials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

/* =============================================================================
   COMPONENT
   ============================================================================= */

const Dashboard = ({ user, stats = {} }) => {
  const navigate = useNavigate();
  const [activeUsers, setActiveUsers] = useState([]);
  const [calDate, setCalDate] = useState(new Date());
  const [calOpen, setCalOpen] = useState(true);
  const [bdmsOpen, setBdmsOpen] = useState(true);

  const fetchActiveUsers = useCallback(async () => {
    try {
      const res = await userService.getActiveUsers();
      setActiveUsers(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchActiveUsers();
    const t = setInterval(fetchActiveUsers, 30000);
    return () => clearInterval(t);
  }, [fetchActiveUsers]);

  const {
    totalDoctors = 0, totalEmployees = 0,
    totalVisits = 0, vipVisits = 0, regularVisits = 0,
    visitsThisWeek = 0, vipVisitsThisWeek = 0, regularVisitsThisWeek = 0,
  } = stats;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  })();

  const firstName = user?.name?.split(' ')[0] || 'Admin';

  /* Calendar helpers */
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const today = new Date().getDate();
  const isThisMonth =
    new Date().getMonth() === month && new Date().getFullYear() === year;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonth = () => setCalDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCalDate(new Date(year, month + 1, 1));

  return (
    <div className="db-shell">
      <style>{dashboardStyles}</style>

      {/* ────── On large screens, this is the left column ────── */}
      <div className="db-main">

        {/* Greeting card */}
        <div className="db-greeting">
          <div className="db-greeting-text">
            <h2>{greeting}, {firstName} 👋</h2>
            <p>Here's what's happening with your pharmacy today.</p>
            <a className="db-greeting-action" href="/admin/activity">
              View Activity <ChevronRight size={13} />
            </a>
          </div>
          <div className="db-greeting-illustration" aria-hidden>💊</div>
          <div className="db-greeting-actions">
            <button className="db-quick-btn primary" onClick={() => navigate('/admin/doctors')}>
              <Stethoscope size={14} /> Manage Clients
            </button>
            <button className="db-quick-btn" onClick={() => navigate('/admin/employees')}>
              <Users size={14} /> BDMs
            </button>
            <button className="db-quick-btn" onClick={() => navigate('/admin/reports')}>
              <FileText size={14} /> Reports
            </button>
          </div>
        </div>

        {/* Stats section */}
        <div className="db-overview">
          <div className="db-section-head" style={{ marginBottom: 12 }}>
            <h3 className="db-section-title">Overview</h3>
          </div>
          <div className="db-stats">

            <div className="db-stat-box">
              <div className="db-stat-icon blue"><Stethoscope size={18} /></div>
              <div>
                <div className="db-stat-value">{totalDoctors}</div>
                <div className="db-stat-label">VIP Clients</div>
              </div>
            </div>

            <div className="db-stat-box">
              <div className="db-stat-icon purple"><Users size={18} /></div>
              <div>
                <div className="db-stat-value">{totalEmployees}</div>
                <div className="db-stat-label">BDMs</div>
              </div>
            </div>

            <div className="db-stat-box">
              <div className="db-stat-icon green"><MapPin size={18} /></div>
              <div>
                <div className="db-stat-value">{totalVisits}</div>
                <div className="db-stat-label">Total Visits</div>
                <div className="db-stat-sub">
                  <span className="dot-vip">{vipVisits} VIP</span>
                  <span className="dot-reg">{regularVisits} Regular</span>
                </div>
              </div>
            </div>

            <div className="db-stat-box">
              <div className="db-stat-icon amber"><Calendar size={18} /></div>
              <div>
                <div className="db-stat-value">{visitsThisWeek}</div>
                <div className="db-stat-label">This Week</div>
                <div className="db-stat-sub">
                  <span className="dot-vip">{vipVisitsThisWeek} VIP</span>
                  <span className="dot-reg">{regularVisitsThisWeek} Reg</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* ────── On large screens, this is the right column ────── */}
      <div className="db-sidebar">

        {/* Calendar — collapsible */}
        <div className="db-sidebar-card">
          <div
            className="db-card-toggle"
            role="button"
            tabIndex={0}
            aria-expanded={calOpen}
            aria-controls="admin-dashboard-calendar"
            onClick={() => setCalOpen(o => !o)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setCalOpen(o => !o);
              }
            }}
          >
            <ChevronDown
              size={13}
              className={`db-toggle-chevron ${calOpen ? 'open' : 'closed'}`}
            />
            <span className="db-toggle-label">Calendar</span>
            <span className="cal-month">{MONTHS[month]} {year}</span>
            <div className="cal-nav" onClick={e => e.stopPropagation()}>
              <button type="button" className="cal-nav-btn" onClick={prevMonth}><ChevronLeft size={11} /></button>
              <button type="button" className="cal-nav-btn" onClick={nextMonth}><ChevronRight size={11} /></button>
            </div>
          </div>
          <div id="admin-dashboard-calendar" className={`db-collapse-wrap${calOpen ? '' : ' closed'}`}>
            <div className="db-collapse-inner">
              <div className="cal-days-header">
                {DAYS.map(d => <div key={d} className="cal-day-name">{d}</div>)}
              </div>
              <div className="cal-grid">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e-${i}`} className="cal-cell empty" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => (
                  <div
                    key={i + 1}
                    className={`cal-cell${isThisMonth && i + 1 === today ? ' today' : ''}`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Online BDMs — collapsible */}
        <div className="db-sidebar-card">
          <button className="db-card-toggle" onClick={() => setBdmsOpen(o => !o)}>
            <ChevronDown
              size={13}
              className={`db-toggle-chevron ${bdmsOpen ? 'open' : 'closed'}`}
            />
            <span className="db-online-dot" />
            <span className="db-toggle-label">Online Users</span>
            <span className="db-online-count">{activeUsers.length} online</span>
          </button>
          {bdmsOpen && (
            <div className="db-collapse-wrap bdms">
              <div className="db-collapse-inner">
                {activeUsers.length === 0 ? (
                  <div className="db-no-users">No BDMs currently online</div>
                ) : (
                  <div className="db-users-list">
                    {activeUsers.map((u) => (
                      <div key={u._id || u.id} className="db-user-row">
                        <div className="db-user-avatar">
                          {initials(u.name)}
                          <span className="online-dot" />
                        </div>
                        <div className="db-user-info">
                          <div className="db-user-name">{u.name}</div>
                          <div className="db-user-role">BDM</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

export default Dashboard;
