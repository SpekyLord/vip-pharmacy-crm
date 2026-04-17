/**
 * Dashboard Component (Admin)
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  MapPin,
  Stethoscope,
  Target,
  Users,
} from 'lucide-react';
import userService from '../../services/userService';

const dashboardStyles = `
  :root {
    --bg: #f1f5f9;
    --card: #ffffff;
    --text: #0f172a;
    --sub: #64748b;
    --border: #dbe4f0;
    --shadow: 0 14px 32px rgba(15, 23, 42, 0.06);
    --gold-1: #f59e0b;
    --gold-2: #fbbf24;
    --cream-1: #fff7ed;
  }

  body.dark-mode {
    --bg: #0f172a;
    --card: #111827;
    --text: #f8fafc;
    --sub: #94a3b8;
    --border: #334155;
    --shadow: none;
  }

  .db-shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(280px, 22vw, 340px);
    gap: clamp(18px, 2vw, 24px);
    padding: 12px 20px 0;
    align-items: start;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--bg);
  }

  .db-main {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
    min-height: 0;
  }

  .db-sidebar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    align-self: start;
  }

  .db-greeting {
    position: relative;
    overflow: hidden;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
    gap: 18px;
    padding: clamp(20px, 2.1vw, 30px);
    border-radius: 24px;
    border: 1px solid rgba(245, 158, 11, 0.28);
    background: linear-gradient(135deg, var(--gold-1) 0%, var(--gold-2) 38%, var(--cream-1) 100%);
    box-shadow: 0 22px 44px rgba(245, 158, 11, 0.14);
    min-height: 208px;
  }

  body.dark-mode .db-greeting {
    border-color: rgba(251, 191, 36, 0.18);
    box-shadow: none;
  }

  .db-greeting::before,
  .db-greeting::after {
    content: '';
    position: absolute;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.24);
    pointer-events: none;
  }

  .db-greeting::before {
    width: 260px;
    height: 260px;
    right: -80px;
    top: -90px;
  }

  .db-greeting::after {
    width: 180px;
    height: 180px;
    right: 40px;
    bottom: -90px;
  }

  .db-greeting-copy,
  .db-greeting-actions {
    position: relative;
    z-index: 1;
  }

  .db-greeting-copy {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 680px;
  }

  .db-greeting-eyebrow {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    padding: 6px 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.72);
    color: rgba(15, 23, 42, 0.76);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .db-greeting-text h2 {
    margin: 0;
    color: rgba(15, 23, 42, 0.95);
    font-size: clamp(26px, 2.45vw, 38px);
    font-weight: 800;
    line-height: 1.02;
    letter-spacing: -0.04em;
  }

  .db-greeting-text p {
    margin: 8px 0 0;
    max-width: 34rem;
    color: rgba(15, 23, 42, 0.76);
    font-size: clamp(13px, 0.92vw, 15px);
    line-height: 1.45;
  }

  .db-greeting-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .db-greeting-pill {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 108px;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.74);
    backdrop-filter: blur(6px);
  }

  .db-greeting-pill-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(15, 23, 42, 0.55);
  }

  .db-greeting-pill-value {
    color: rgba(15, 23, 42, 0.9);
    font-size: 14px;
    font-weight: 700;
  }

  .db-primary-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    padding: 10px 15px;
    border-radius: 12px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    background: rgba(15, 23, 42, 0.94);
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
    box-shadow: 0 16px 30px rgba(15, 23, 42, 0.18);
  }

  .db-primary-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 18px 34px rgba(15, 23, 42, 0.22);
  }

  .db-greeting-actions {
    display: grid;
    align-content: center;
    gap: 10px;
  }

  .db-quick-btn {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.72);
    background: rgba(255, 255, 255, 0.6);
    color: rgba(15, 23, 42, 0.88);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: background 0.18s ease, transform 0.18s ease;
  }

  .db-quick-btn:hover {
    background: rgba(255, 255, 255, 0.78);
    transform: translateY(-1px);
  }

  .db-quick-btn.primary {
    background: rgba(15, 23, 42, 0.95);
    border-color: rgba(15, 23, 42, 0.95);
    color: #ffffff;
  }

  .db-section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .db-section-title {
    margin: 0;
    color: var(--text);
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .db-section-note {
    margin: 4px 0 0;
    color: var(--sub);
    font-size: 13px;
    line-height: 1.4;
  }

  .db-overview {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
  }

  .db-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    flex: 1;
    min-height: 0;
    align-content: stretch;
  }

  .db-stat-box {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 16px 18px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 12px;
    box-shadow: var(--shadow);
    transition: transform 0.18s ease, border-color 0.18s ease;
  }

  .db-stat-box:hover {
    transform: translateY(-2px);
    border-color: rgba(59, 130, 246, 0.28);
  }

  .db-stat-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .db-stat-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .db-stat-label {
    color: var(--sub);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .db-stat-value {
    color: var(--text);
    font-size: clamp(24px, 2vw, 34px);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.04em;
    overflow-wrap: anywhere;
  }

  .db-stat-sub {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: var(--sub);
    font-size: 11px;
    line-height: 1.35;
  }

  .db-stat-sub .dot-vip,
  .db-stat-sub .dot-reg,
  .db-stat-sub .dot-neutral {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .db-stat-sub .dot-vip::before,
  .db-stat-sub .dot-reg::before,
  .db-stat-sub .dot-neutral::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 999px;
  }

  .db-stat-sub .dot-vip::before { background: #f59e0b; }
  .db-stat-sub .dot-reg::before { background: #3b82f6; }
  .db-stat-sub .dot-neutral::before { background: #64748b; }

  .db-stat-sub .call-rate-good { color: #15803d; font-weight: 700; }
  .db-stat-sub .call-rate-warn { color: #b45309; font-weight: 700; }
  .db-stat-sub .call-rate-bad { color: #b91c1c; font-weight: 700; }

  .db-stat-icon {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .db-stat-icon svg {
    width: 20px;
    height: 20px;
  }

  .db-stat-icon.blue { background: #dbeafe; color: #2563eb; }
  .db-stat-icon.purple { background: #ede9fe; color: #7c3aed; }
  .db-stat-icon.green { background: #dcfce7; color: #16a34a; }
  .db-stat-icon.amber { background: #fef3c7; color: #d97706; }
  .db-stat-icon.rose { background: #fce7f3; color: #db2777; }
  .db-stat-icon.cyan { background: #e0f2fe; color: #0284c7; }

  body.dark-mode .db-stat-icon.blue { background: #1e3a8a; color: #93c5fd; }
  body.dark-mode .db-stat-icon.purple { background: #4c1d95; color: #c4b5fd; }
  body.dark-mode .db-stat-icon.green { background: #14532d; color: #86efac; }
  body.dark-mode .db-stat-icon.amber { background: #78350f; color: #fcd34d; }
  body.dark-mode .db-stat-icon.rose { background: #831843; color: #f9a8d4; }
  body.dark-mode .db-stat-icon.cyan { background: #164e63; color: #67e8f9; }

  .db-sidebar-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .db-card-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 13px 15px;
    background: none;
    border: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .db-card-toggle:hover {
    background: rgba(148, 163, 184, 0.06);
  }

  .db-toggle-label {
    flex: 1;
    font-size: 13px;
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

  .db-collapse-wrap {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows 0.28s ease;
    overflow: hidden;
  }

  .db-collapse-wrap.closed {
    grid-template-rows: 0fr;
  }

  .db-collapse-wrap.closed .db-collapse-inner {
    padding: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .db-collapse-inner {
    overflow: hidden;
    padding: 0 15px 15px;
  }

  .cal-month {
    font-size: 11px;
    font-weight: 700;
    color: var(--sub);
  }

  .cal-nav {
    display: flex;
    gap: 4px;
  }

  .cal-nav-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    color: var(--sub);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cal-nav-btn:hover {
    background: #3b82f6;
    border-color: #3b82f6;
    color: #ffffff;
  }

  .cal-days-header,
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  .cal-days-header {
    margin-bottom: 8px;
  }

  .cal-day-name {
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    color: var(--sub);
    text-transform: uppercase;
  }

  .cal-cell {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    font-size: 12px;
    color: var(--sub);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .cal-cell:hover {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .cal-cell.today {
    background: #3b82f6;
    color: #ffffff;
    font-weight: 700;
    box-shadow: 0 10px 20px rgba(59, 130, 246, 0.22);
  }

  .cal-cell.empty {
    cursor: default;
  }

  .cal-cell.empty:hover {
    background: transparent;
    color: var(--sub);
  }

  .db-online-dot {
    width: 8px;
    height: 8px;
    background: #22c55e;
    border-radius: 999px;
    flex-shrink: 0;
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16);
  }

  .db-online-count {
    font-size: 10px;
    font-weight: 700;
    color: #15803d;
    background: #dcfce7;
    padding: 3px 8px;
    border-radius: 999px;
  }

  body.dark-mode .db-online-count {
    background: #14532d;
    color: #86efac;
  }

  .db-users-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .db-user-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 12px;
    background: rgba(148, 163, 184, 0.08);
    transition: background 0.15s ease;
  }

  .db-user-row:hover {
    background: #dbeafe;
  }

  body.dark-mode .db-user-row:hover {
    background: #1e3a8a;
  }

  .db-user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    position: relative;
  }

  .db-user-avatar .online-dot {
    position: absolute;
    right: 1px;
    bottom: 1px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: 2px solid var(--card);
    background: #22c55e;
  }

  .db-user-info {
    flex: 1;
    min-width: 0;
  }

  .db-user-name {
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .db-user-role {
    margin-top: 2px;
    color: var(--sub);
    font-size: 11px;
  }

  .db-no-users {
    color: var(--sub);
    text-align: center;
    font-size: 12px;
    padding: 8px 0 2px;
  }

  @media (min-width: 1181px) {
    .db-shell {
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 16px;
      padding: 10px 20px 0;
    }

    .db-greeting {
      min-height: 196px;
    }

    .db-stats {
      grid-auto-rows: minmax(0, 1fr);
    }

    .db-stat-box {
      height: 100%;
    }
  }

  @media (min-width: 1181px) and (max-height: 900px) {
    .db-shell {
      gap: 14px;
      padding-top: 8px;
    }

    .db-main {
      gap: 12px;
    }

    .db-greeting {
      min-height: 178px;
      padding: 18px 20px;
    }

    .db-greeting-copy {
      gap: 12px;
    }

    .db-greeting-text h2 {
      font-size: clamp(24px, 2.2vw, 34px);
    }

    .db-greeting-text p {
      font-size: 12px;
      line-height: 1.35;
    }

    .db-greeting-meta {
      gap: 6px;
    }

    .db-greeting-pill {
      padding: 8px 10px;
    }

    .db-greeting-actions {
      gap: 8px;
    }

    .db-primary-btn,
    .db-quick-btn {
      padding-top: 9px;
      padding-bottom: 9px;
      font-size: 12px;
    }

    .db-overview {
      gap: 10px;
    }

    .db-section-title {
      font-size: 18px;
    }

    .db-section-note {
      font-size: 12px;
    }

    .db-stats {
      gap: 10px;
    }

    .db-stat-box {
      padding: 14px 16px;
      gap: 10px;
    }

    .db-stat-value {
      font-size: clamp(22px, 1.7vw, 30px);
    }

    .db-stat-sub {
      font-size: 10px;
    }

    .db-stat-icon {
      width: 40px;
      height: 40px;
    }

    .db-card-toggle {
      padding: 11px 13px;
    }

    .db-collapse-inner {
      padding: 0 13px 13px;
    }

    .cal-days-header,
    .cal-grid {
      gap: 3px;
    }

    .cal-cell {
      font-size: 11px;
    }
  }

  @media (max-width: 1180px) {
    .db-shell {
      grid-template-columns: 1fr;
      height: auto;
      overflow: visible;
    }

    .db-sidebar {
      position: static;
    }
  }

  @media (max-width: 900px) {
    .db-greeting {
      grid-template-columns: 1fr;
      min-height: unset;
    }

    .db-greeting-actions {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
  }

  @media (max-width: 768px) {
    .db-shell {
      padding: 16px 16px 0;
      gap: 16px;
    }

    .db-greeting {
      padding: 22px;
      border-radius: 24px;
    }

    .db-greeting-text h2 {
      font-size: 30px;
    }

    .db-greeting-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .db-greeting-pill {
      min-width: 0;
    }

    .db-greeting-actions {
      grid-template-columns: 1fr;
    }

    .db-primary-btn,
    .db-quick-btn {
      width: 100%;
      justify-content: center;
    }

    .db-stats {
      grid-template-columns: 1fr;
    }

    .db-stat-box {
      min-height: 156px;
    }
  }
`;

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const initials = (name) => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const Dashboard = ({ user, stats = {}, onViewAllActivity }) => {
  const navigate = useNavigate();
  const [activeUsers, setActiveUsers] = useState([]);
  const [calDate, setCalDate] = useState(new Date());
  const [calOpen, setCalOpen] = useState(true);
  const [bdmsOpen, setBdmsOpen] = useState(true);

  const fetchActiveUsers = useCallback(async () => {
    try {
      const res = await userService.getActiveUsers();
      setActiveUsers(res.data || []);
    } catch {
      // Keep the widget non-blocking if the activity call fails.
    }
  }, []);

  useEffect(() => {
    fetchActiveUsers();
    const timer = setInterval(fetchActiveUsers, 30000);
    return () => clearInterval(timer);
  }, [fetchActiveUsers]);

  const {
    totalDoctors = 0,
    totalEmployees = 0,
    totalVisits = 0,
    vipVisits = 0,
    regularVisits = 0,
    visitsThisWeek = 0,
    vipVisitsThisWeek = 0,
    regularVisitsThisWeek = 0,
    targetVisits = 0,
    actualVisits = 0,
    visitsToday = 0,
    vipVisitsToday = 0,
    regularVisitsToday = 0,
  } = stats;

  const callRate = targetVisits > 0 ? Math.round((actualVisits / targetVisits) * 100) : 0;

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  })();

  const firstName = user?.name?.split(' ')[0] || 'Admin';

  const heroPills = [
    { label: 'Today', value: `${visitsToday} visits` },
    { label: 'This week', value: `${visitsThisWeek} logged` },
    { label: 'Call rate', value: `${callRate}%` },
  ];

  const statCards = [
    {
      label: 'VIP Clients',
      value: totalDoctors,
      iconClass: 'blue',
      icon: <Stethoscope size={20} />,
      subContent: null,
    },
    {
      label: 'BDMs',
      value: totalEmployees,
      iconClass: 'purple',
      icon: <Users size={20} />,
      subContent: null,
    },
    {
      label: 'Cycle Visits',
      value: totalVisits,
      iconClass: 'green',
      icon: <MapPin size={20} />,
      subContent: (
        <>
          <span className="dot-vip">{vipVisits} VIP</span>
          <span className="dot-reg">{regularVisits} Regular</span>
        </>
      ),
    },
    {
      label: 'This Week',
      value: visitsThisWeek,
      iconClass: 'amber',
      icon: <Calendar size={20} />,
      subContent: (
        <>
          <span className="dot-vip">{vipVisitsThisWeek} VIP</span>
          <span className="dot-reg">{regularVisitsThisWeek} Regular</span>
        </>
      ),
    },
    {
      label: 'Target vs Actual',
      value: `${actualVisits}/${targetVisits}`,
      iconClass: 'rose',
      icon: <Target size={20} />,
      subContent: (
        <span className={callRate >= 80 ? 'call-rate-good' : callRate >= 50 ? 'call-rate-warn' : 'call-rate-bad'}>
          {callRate}% call rate
        </span>
      ),
    },
    {
      label: "Today's Visits",
      value: visitsToday,
      iconClass: 'cyan',
      icon: <Clock size={20} />,
      subContent: (
        <>
          <span className="dot-vip">{vipVisitsToday} VIP</span>
          <span className="dot-reg">{regularVisitsToday} Regular</span>
        </>
      ),
    },
  ];

  const handleViewActivity = () => {
    if (typeof onViewAllActivity === 'function') {
      onViewAllActivity();
      return;
    }
    navigate('/admin/activity');
  };

  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const today = new Date().getDate();
  const isThisMonth = new Date().getMonth() === month && new Date().getFullYear() === year;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return (
    <div className="db-shell">
      <style>{dashboardStyles}</style>

      <div className="db-main">
        <section className="db-greeting">
          <div className="db-greeting-copy">
            <span className="db-greeting-eyebrow">Admin command center</span>
            <div className="db-greeting-text">
              <h2>{greeting}, {firstName}</h2>
              <p>
                Track BDM activity, visit coverage, and client momentum without the layout crowding your key numbers.
              </p>
            </div>

            <div className="db-greeting-meta">
              {heroPills.map((pill) => (
                <div key={pill.label} className="db-greeting-pill">
                  <span className="db-greeting-pill-label">{pill.label}</span>
                  <span className="db-greeting-pill-value">{pill.value}</span>
                </div>
              ))}
            </div>

            <button type="button" className="db-primary-btn" onClick={handleViewActivity}>
              View Activity
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="db-greeting-actions">
            <button type="button" className="db-quick-btn primary" onClick={() => navigate('/admin/doctors')}>
              <Stethoscope size={18} />
              Manage Clients
            </button>
            <button type="button" className="db-quick-btn" onClick={() => navigate('/admin/employees')}>
              <Users size={18} />
              BDM Management
            </button>
            <button type="button" className="db-quick-btn" onClick={() => navigate('/admin/reports')}>
              <FileText size={18} />
              Reports
            </button>
          </div>
        </section>

        <section className="db-overview">
          <div className="db-section-head">
            <div>
              <h3 className="db-section-title">Overview</h3>
              <p className="db-section-note">
                Current cycle and daily visit signals across VIP clients, regular visits, and BDM activity.
              </p>
            </div>
          </div>

          <div className="db-stats">
            {statCards.map((card) => (
              <article key={card.label} className="db-stat-box">
                <div className="db-stat-head">
                  <div className="db-stat-copy">
                    <span className="db-stat-label">{card.label}</span>
                    <span className="db-stat-value">{card.value}</span>
                  </div>
                  <div className={`db-stat-icon ${card.iconClass}`}>{card.icon}</div>
                </div>
                {card.subContent && <div className="db-stat-sub">{card.subContent}</div>}
              </article>
            ))}
          </div>
        </section>
      </div>

      <aside className="db-sidebar">
        <section className="db-sidebar-card">
          <div
            className="db-card-toggle"
            role="button"
            tabIndex={0}
            aria-expanded={calOpen}
            aria-controls="admin-dashboard-calendar"
            onClick={() => setCalOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setCalOpen((open) => !open);
              }
            }}
          >
            <ChevronDown size={14} className={`db-toggle-chevron ${calOpen ? 'open' : 'closed'}`} />
            <span className="db-toggle-label">Calendar</span>
            <span className="cal-month">{MONTHS[month]} {year}</span>
            <div className="cal-nav" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="cal-nav-btn" onClick={() => setCalDate(new Date(year, month - 1, 1))}>
                <ChevronLeft size={14} />
              </button>
              <button type="button" className="cal-nav-btn" onClick={() => setCalDate(new Date(year, month + 1, 1))}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div id="admin-dashboard-calendar" className={`db-collapse-wrap${calOpen ? '' : ' closed'}`}>
            <div className="db-collapse-inner">
              <div className="cal-days-header">
                {DAYS.map((day) => (
                  <div key={day} className="cal-day-name">{day}</div>
                ))}
              </div>
              <div className="cal-grid">
                {Array.from({ length: firstDay }).map((_, index) => (
                  <div key={`empty-${index}`} className="cal-cell empty" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, index) => (
                  <div
                    key={index + 1}
                    className={`cal-cell${isThisMonth && index + 1 === today ? ' today' : ''}`}
                  >
                    {index + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="db-sidebar-card">
          <button type="button" className="db-card-toggle" onClick={() => setBdmsOpen((open) => !open)}>
            <ChevronDown size={14} className={`db-toggle-chevron ${bdmsOpen ? 'open' : 'closed'}`} />
            <span className="db-online-dot" />
            <span className="db-toggle-label">Online Users</span>
            <span className="db-online-count">{activeUsers.length} online</span>
          </button>

          <div className={`db-collapse-wrap${bdmsOpen ? '' : ' closed'}`}>
            <div className="db-collapse-inner">
              {activeUsers.length === 0 ? (
                <div className="db-no-users">No BDMs currently online</div>
              ) : (
                <div className="db-users-list">
                  {activeUsers.map((activeUser) => (
                    <div key={activeUser._id || activeUser.id} className="db-user-row">
                      <div className="db-user-avatar">
                        {initials(activeUser.name)}
                        <span className="online-dot" />
                      </div>
                      <div className="db-user-info">
                        <div className="db-user-name">{activeUser.name}</div>
                        <div className="db-user-role">BDM</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
};

export default Dashboard;
