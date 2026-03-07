/**
 * CallPlanPage
 *
 * BDM's Call Planning Tool (CPT) view (read-only).
 * Two tabs:
 *   - "Call Plan": 20-day grid, DCR summary, daily MD count, extra calls
 *   - "Performance": stats, weekly chart, VIP coverage, engagement, visited/not-visited
 *
 * Performance data is lazy-loaded only when the tab is first clicked.
 *
 * Route: /employee/cpt
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import CallPlanView from '../../components/employee/CallPlanView';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import scheduleService from '../../services/scheduleService';
import visitService from '../../services/visitService';
import doctorService from '../../services/doctorService';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

/* =============================================================================
   HELPERS
   ============================================================================= */

const CYCLE_ANCHOR = new Date(2026, 0, 5);

const getCycleWeek = (date) => {
  const diffDays = Math.floor((date.getTime() - CYCLE_ANCHOR.getTime()) / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  return Math.floor(dayInCycle / 7) + 1;
};

const getMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
};

const ENGAGEMENT_LABELS = {
  5: 'Active partner',
  4: 'In group chat',
  3: 'Tried products',
  2: 'Knows BDM',
  1: 'Visited 4x',
};

const ENGAGEMENT_COLORS = {
  5: '#22c55e',
  4: '#4ade80',
  3: '#f59e0b',
  2: '#f87171',
  1: '#ef4444',
  0: '#9ca3af',
};

/* =============================================================================
   STYLES
   ============================================================================= */

const pageStyles = `
  .cpt-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .cpt-content {
    display: flex;
  }

  .cpt-main {
    flex: 1;
    padding: 24px;
    max-width: 1600px;
  }

  .cpt-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
  }

  .cpt-page-header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
  }

  .cpt-page-header p {
    margin: 4px 0 0 0;
    font-size: 14px;
    color: #6b7280;
  }

  .cpt-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .cpt-cycle-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    background: white;
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
  }

  .cpt-cycle-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: #f3f4f6;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #374151;
    transition: all 0.15s;
  }

  .cpt-cycle-btn:hover {
    background: #e5e7eb;
  }

  .cpt-cycle-label {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    min-width: 90px;
    text-align: center;
  }

  .cpt-cycle-dates {
    font-size: 11px;
    color: #9ca3af;
    text-align: center;
  }

  .cpt-summary-bar {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .cpt-summary-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 140px;
  }

  .cpt-summary-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .cpt-summary-value {
    font-size: 20px;
    font-weight: 700;
    color: #1f2937;
  }

  .cpt-summary-label {
    font-size: 12px;
    color: #6b7280;
  }

  /* Tab Bar */
  .cpt-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 20px;
    background: white;
    padding: 4px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
  }

  .cpt-tab-btn {
    flex: 1;
    padding: 10px 20px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
  }

  .cpt-tab-btn:hover {
    color: #374151;
    background: #f3f4f6;
  }

  .cpt-tab-btn.active {
    background: #3b82f6;
    color: white;
  }

  /* Performance Tab Styles */
  .cpt-perf-warning {
    padding: 14px 18px;
    border-radius: 10px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
  }

  .cpt-perf-warning.yellow {
    background: #fef3c7;
    border: 1px solid #f59e0b;
    color: #92400e;
  }

  .cpt-perf-warning.red {
    background: #fee2e2;
    border: 1px solid #ef4444;
    color: #991b1b;
  }

  .cpt-perf-stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .cpt-perf-stat-card {
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    border: 1px solid #e5e7eb;
  }

  .cpt-perf-stat-card .stat-value {
    font-size: 36px;
    font-weight: 700;
    color: #2563eb;
    line-height: 1;
    margin-bottom: 8px;
  }

  .cpt-perf-stat-card .stat-value.green { color: #16a34a; }
  .cpt-perf-stat-card .stat-value.yellow { color: #d97706; }
  .cpt-perf-stat-card .stat-value.red { color: #dc2626; }

  .cpt-perf-stat-card .stat-label {
    font-size: 14px;
    color: #6b7280;
    font-weight: 500;
  }

  .cpt-perf-section {
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    margin-bottom: 24px;
  }

  .cpt-perf-section h2 {
    margin: 0 0 20px 0;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    padding-bottom: 12px;
    border-bottom: 2px solid #e5e7eb;
  }

  .cpt-perf-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }

  .cpt-perf-coverage-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .cpt-perf-coverage-item:last-child {
    border-bottom: none;
  }

  .cpt-perf-coverage-label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .cpt-perf-coverage-bar-wrap {
    flex: 1;
    margin: 0 16px;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .cpt-perf-coverage-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s ease;
  }

  .cpt-perf-coverage-fraction {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    min-width: 60px;
    text-align: right;
  }

  .cpt-perf-eng-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
  }

  .cpt-perf-eng-level {
    min-width: 80px;
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
  }

  .cpt-perf-eng-bar-wrap {
    flex: 1;
    height: 20px;
    background: #f3f4f6;
    border-radius: 4px;
    overflow: hidden;
  }

  .cpt-perf-eng-bar-fill {
    height: 100%;
    border-radius: 4px;
    display: flex;
    align-items: center;
    padding-left: 8px;
    font-size: 12px;
    font-weight: 600;
    color: white;
    min-width: 24px;
    transition: width 0.4s ease;
  }

  .cpt-perf-eng-count {
    min-width: 24px;
    font-size: 14px;
    font-weight: 600;
    color: #374151;
    text-align: right;
  }

  .cpt-perf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .cpt-perf-table th {
    text-align: left;
    padding: 10px 12px;
    background: #f9fafb;
    color: #6b7280;
    font-weight: 600;
    border-bottom: 2px solid #e5e7eb;
  }

  .cpt-perf-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
  }

  .cpt-perf-table tr:hover td {
    background: #f9fafb;
  }

  .cpt-perf-eng-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    color: white;
  }

  .cpt-perf-eng-badge.level-1, .cpt-perf-eng-badge.level-2 { background: #ef4444; }
  .cpt-perf-eng-badge.level-3 { background: #f59e0b; }
  .cpt-perf-eng-badge.level-4, .cpt-perf-eng-badge.level-5 { background: #22c55e; }
  .cpt-perf-eng-badge.level-none { background: #9ca3af; }

  .cpt-perf-empty {
    text-align: center;
    padding: 32px;
    color: #9ca3af;
    font-size: 14px;
  }

  .cpt-perf-month-picker select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
  }

  .cpt-perf-collapse-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: #3b82f6;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 4px 0;
    margin-top: -12px;
    margin-bottom: 12px;
  }

  .cpt-perf-collapse-btn:hover {
    color: #2563eb;
  }

  @media (max-width: 768px) {
    .cpt-main {
      padding: 16px;
    }

    .cpt-page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .cpt-controls {
      width: 100%;
    }

    .cpt-summary-bar {
      gap: 8px;
    }

    .cpt-summary-card {
      min-width: 120px;
    }

    .cpt-perf-two-col {
      grid-template-columns: 1fr;
    }

    .cpt-perf-stats-row {
      grid-template-columns: repeat(2, 1fr);
    }

    .cpt-perf-stat-card .stat-value {
      font-size: 28px;
    }

    .cpt-perf-table {
      font-size: 13px;
    }

    .cpt-perf-table th, .cpt-perf-table td {
      padding: 8px 6px;
    }
  }

  @media (max-width: 480px) {
    .cpt-main {
      padding: 16px;
      padding-bottom: 80px;
    }
    .cpt-page-header h1 {
      font-size: 22px;
    }
    .cpt-summary-card {
      min-width: 100px;
    }
    .cpt-summary-value {
      font-size: 18px;
    }
    .cpt-tab-btn {
      padding: 8px 12px;
      font-size: 13px;
    }
    .cpt-perf-stats-row {
      grid-template-columns: repeat(2, 1fr);
    }
    .cpt-perf-stat-card .stat-value {
      font-size: 24px;
    }
    .cpt-perf-two-col {
      grid-template-columns: 1fr;
    }
    .cpt-perf-section {
      padding: 16px;
    }
    .cpt-perf-table {
      font-size: 12px;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const CallPlanPage = () => {
  // --- Call Plan tab state ---
  const [cptData, setCptData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cycleNumber, setCycleNumber] = useState(null);

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState('plan');

  // --- Performance tab state (lazy-loaded) ---
  const [perfLoaded, setPerfLoaded] = useState(false);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfError, setPerfError] = useState(null);
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [statsData, setStatsData] = useState(null);
  const [complianceData, setComplianceData] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [visits, setVisits] = useState([]);
  const [notVisitedExpanded, setNotVisitedExpanded] = useState(false);

  // --- Call Plan data fetch ---
  const fetchCptData = useCallback(async (cycle) => {
    try {
      setLoading(true);
      const response = await scheduleService.getCPTGrid(cycle);
      setCptData(response.data);
      if (cycle == null && response.data?.cycleNumber != null) {
        setCycleNumber(response.data.cycleNumber);
      }
    } catch (err) {
      console.error('Failed to fetch CPT grid:', err);
      toast.error(err.response?.data?.message || 'Failed to load Call Plan data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCptData(cycleNumber);
  }, [cycleNumber, fetchCptData]);

  // --- Performance data fetch ---
  const fetchPerformanceData = useCallback(async (monthYear) => {
    try {
      setPerfLoading(true);
      setPerfError(null);

      const [statsResult, complianceResult, doctorsResult, visitsResult] = await Promise.allSettled([
        visitService.getStats({ monthYear }),
        visitService.getWeeklyCompliance(monthYear),
        doctorService.getAll({ limit: 0 }),
        visitService.getMy({ monthYear, limit: 0 }),
      ]);

      setStatsData(statsResult.status === 'fulfilled' ? statsResult.value.data : null);
      setComplianceData(complianceResult.status === 'fulfilled' ? complianceResult.value.data : null);
      setDoctors(doctorsResult.status === 'fulfilled' ? (doctorsResult.value.data || []) : []);
      setVisits(visitsResult.status === 'fulfilled' ? (visitsResult.value.data || []) : []);

      const allFailed = [statsResult, complianceResult, doctorsResult, visitsResult].every(
        (r) => r.status === 'rejected'
      );
      if (allFailed) {
        setPerfError('Failed to load performance data. Please try again.');
      }
    } catch (err) {
      console.error('Failed to fetch performance data:', err);
      setPerfError(err.response?.data?.message || 'Failed to load performance data');
    } finally {
      setPerfLoading(false);
    }
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'performance' && !perfLoaded) {
      fetchPerformanceData(selectedMonth);
      setPerfLoaded(true);
    }
  };

  // Re-fetch when month changes (only if tab is active)
  useEffect(() => {
    if (perfLoaded) {
      fetchPerformanceData(selectedMonth);
    }
  }, [selectedMonth, perfLoaded, fetchPerformanceData]);

  // --- Derived performance calculations ---
  const derived = useMemo(() => {
    const totalVisits = complianceData?.totalVisits ?? statsData?.summary?.totalVisits ?? 0;
    const compliancePct = complianceData?.compliancePercentage ?? 0;
    const expectedVisits = complianceData?.expectedVisits ?? 0;
    const totalDoctors = doctors.length;

    const visitedDoctorIds = new Set(
      visits.map((v) => (typeof v.doctor === 'object' ? v.doctor?._id : v.doctor)?.toString()).filter(Boolean)
    );
    const uniqueVisited = visitedDoctorIds.size;

    const freq2Doctors = doctors.filter((d) => d.visitFrequency === 2);
    const freq4Doctors = doctors.filter((d) => d.visitFrequency === 4);
    const freq2Visited = freq2Doctors.filter((d) => visitedDoctorIds.has(d._id?.toString())).length;
    const freq4Visited = freq4Doctors.filter((d) => visitedDoctorIds.has(d._id?.toString())).length;

    const engagementDist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
    doctors.forEach((d) => {
      const lvl = d.levelOfEngagement;
      if (lvl >= 1 && lvl <= 5) engagementDist[lvl]++;
      else engagementDist[0]++;
    });
    const maxEngCount = Math.max(1, ...Object.values(engagementDist));

    const now = new Date();
    const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = selectedMonth === currentMonthYear;
    const weekOfMonth = getCycleWeek(now);
    const expectedByNow = isCurrentMonth ? Math.ceil((expectedVisits / 4) * weekOfMonth) : expectedVisits;
    const isBehind = isCurrentMonth && expectedByNow > 0 && totalVisits < expectedByNow * 0.8;
    const behindPct = expectedByNow > 0 ? Math.round((totalVisits / expectedByNow) * 100) : 100;

    const weeklyBreakdown = statsData?.weeklyBreakdown || [];
    const chartData = [1, 2, 3, 4].map((w) => {
      const found = weeklyBreakdown.find((wb) => wb.week === w);
      return { name: `W${w}`, visits: found?.visitCount || 0, doctors: found?.doctorCount || 0 };
    });

    const visitCountByDoctor = {};
    visits.forEach((v) => {
      const docId = (typeof v.doctor === 'object' ? v.doctor?._id : v.doctor)?.toString();
      if (docId) visitCountByDoctor[docId] = (visitCountByDoctor[docId] || 0) + 1;
    });

    const visited = doctors
      .filter((d) => visitedDoctorIds.has(d._id?.toString()))
      .map((d) => ({ ...d, visitCount: visitCountByDoctor[d._id?.toString()] || 0 }));

    const notVisited = doctors.filter((d) => !visitedDoctorIds.has(d._id?.toString()));

    let complianceColor = 'red';
    if (compliancePct >= 80) complianceColor = 'green';
    else if (compliancePct >= 50) complianceColor = 'yellow';

    return {
      totalVisits, compliancePct, complianceColor, expectedVisits,
      totalDoctors, uniqueVisited, freq2Doctors, freq4Doctors,
      freq2Visited, freq4Visited, engagementDist, maxEngCount,
      isBehind, behindPct, expectedByNow, weekOfMonth,
      chartData, visited, notVisited, isCurrentMonth,
    };
  }, [statsData, complianceData, doctors, visits, selectedMonth]);

  const handleCycleChange = (delta) => {
    setCycleNumber((prev) => (prev != null ? prev + delta : delta));
  };

  const formatCycleDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const summary = cptData?.summary || {};

  return (
    <div className="cpt-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="cpt-content">
        <Sidebar />
        <main className="cpt-main">
          {/* Page Header */}
          <div className="cpt-page-header">
            <div>
              <h1>Call Plan</h1>
              <p>4-week visit schedule with DCR summary</p>
            </div>

            <div className="cpt-controls">
              {/* Cycle Navigation (only visible on Call Plan tab) */}
              {activeTab === 'plan' && (
                <div className="cpt-cycle-nav">
                  <button className="cpt-cycle-btn" onClick={() => handleCycleChange(-1)}>
                    &#8249;
                  </button>
                  <div>
                    <div className="cpt-cycle-label">
                      Cycle {cptData?.cycleNumber ?? cycleNumber ?? '...'}
                    </div>
                    {cptData?.cycleStart && (
                      <div className="cpt-cycle-dates">
                        {formatCycleDate(cptData.cycleStart)}
                      </div>
                    )}
                  </div>
                  <button className="cpt-cycle-btn" onClick={() => handleCycleChange(1)}>
                    &#8250;
                  </button>
                </div>
              )}

              {/* Month Picker (only visible on Performance tab) */}
              {activeTab === 'performance' && (
                <div className="cpt-perf-month-picker">
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  >
                    {monthOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Summary Bar (Call Plan tab only) */}
          {activeTab === 'plan' && cptData && !loading && (
            <div className="cpt-summary-bar">
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#16a34a' }} />
                <div>
                  <div className="cpt-summary-value">{summary.completed || 0}</div>
                  <div className="cpt-summary-label">Completed</div>
                </div>
              </div>
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#2563eb' }} />
                <div>
                  <div className="cpt-summary-value">{summary.planned || 0}</div>
                  <div className="cpt-summary-label">Planned</div>
                </div>
              </div>
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#c2410c' }} />
                <div>
                  <div className="cpt-summary-value">{summary.carried || 0}</div>
                  <div className="cpt-summary-label">Carried</div>
                </div>
              </div>
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#dc2626' }} />
                <div>
                  <div className="cpt-summary-value">{summary.missed || 0}</div>
                  <div className="cpt-summary-label">Missed</div>
                </div>
              </div>
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#6b7280' }} />
                <div>
                  <div className="cpt-summary-value">{summary.total || 0}</div>
                  <div className="cpt-summary-label">Total</div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Bar */}
          <div className="cpt-tabs">
            <button
              className={`cpt-tab-btn ${activeTab === 'plan' ? 'active' : ''}`}
              onClick={() => handleTabChange('plan')}
            >
              Call Plan
            </button>
            <button
              className={`cpt-tab-btn ${activeTab === 'performance' ? 'active' : ''}`}
              onClick={() => handleTabChange('performance')}
            >
              Performance
            </button>
          </div>

          {/* ============ Call Plan Tab ============ */}
          {activeTab === 'plan' && (
            <CallPlanView cptData={cptData} loading={loading} />
          )}

          {/* ============ Performance Tab ============ */}
          {activeTab === 'performance' && (
            <>
              {perfLoading && <LoadingSpinner />}
              {perfError && (
                <ErrorMessage message={perfError} onRetry={() => fetchPerformanceData(selectedMonth)} />
              )}

              {!perfLoading && !perfError && (
                <>
                  {/* Behind-Schedule Warning */}
                  {derived.isBehind && (
                    <div className={`cpt-perf-warning ${derived.behindPct < 50 ? 'red' : 'yellow'}`}>
                      <span>&#9888;</span>
                      <span>
                        You are behind schedule: {derived.totalVisits} visits completed out of{' '}
                        {derived.expectedByNow} expected by Week {derived.weekOfMonth} ({derived.behindPct}%)
                      </span>
                    </div>
                  )}

                  {/* Stat Cards */}
                  <div className="cpt-perf-stats-row">
                    <div className="cpt-perf-stat-card">
                      <span className="stat-value">{derived.totalVisits}</span>
                      <span className="stat-label">Total Visits</span>
                    </div>
                    <div className="cpt-perf-stat-card">
                      <span className={`stat-value ${derived.complianceColor}`}>
                        {derived.compliancePct}%
                      </span>
                      <span className="stat-label">Compliance</span>
                    </div>
                    <div className="cpt-perf-stat-card">
                      <span className="stat-value">{derived.uniqueVisited}</span>
                      <span className="stat-label">Unique Visited</span>
                    </div>
                    <div className="cpt-perf-stat-card">
                      <span className="stat-value">{derived.totalDoctors}</span>
                      <span className="stat-label">Total Assigned</span>
                    </div>
                  </div>

                  {/* Weekly Breakdown Chart */}
                  <section className="cpt-perf-section">
                    <h2>Weekly Breakdown</h2>
                    {derived.chartData.some((d) => d.visits > 0) ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={derived.chartData} barSize={40}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="name" />
                          <YAxis allowDecimals={false} />
                          <Tooltip
                            formatter={(value, name) => [
                              value,
                              name === 'visits' ? 'Visits' : 'Unique Doctors',
                            ]}
                          />
                          <Bar dataKey="visits" fill="#3b82f6" radius={[4, 4, 0, 0]} name="visits" />
                          <Bar dataKey="doctors" fill="#93c5fd" radius={[4, 4, 0, 0]} name="doctors" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="cpt-perf-empty">No visits recorded for this month</p>
                    )}
                  </section>

                  {/* Two-column: VIP Coverage + Engagement Distribution */}
                  <div className="cpt-perf-two-col">
                    {/* VIP Coverage */}
                    <section className="cpt-perf-section">
                      <h2>VIP Coverage</h2>
                      <div className="cpt-perf-coverage-item">
                        <span className="cpt-perf-coverage-label">2x/month</span>
                        <div className="cpt-perf-coverage-bar-wrap">
                          <div
                            className="cpt-perf-coverage-bar-fill"
                            style={{
                              width: `${derived.freq2Doctors.length > 0 ? (derived.freq2Visited / derived.freq2Doctors.length) * 100 : 0}%`,
                              background: '#8b5cf6',
                            }}
                          />
                        </div>
                        <span className="cpt-perf-coverage-fraction">
                          {derived.freq2Visited}/{derived.freq2Doctors.length}
                        </span>
                      </div>
                      <div className="cpt-perf-coverage-item">
                        <span className="cpt-perf-coverage-label">4x/month</span>
                        <div className="cpt-perf-coverage-bar-wrap">
                          <div
                            className="cpt-perf-coverage-bar-fill"
                            style={{
                              width: `${derived.freq4Doctors.length > 0 ? (derived.freq4Visited / derived.freq4Doctors.length) * 100 : 0}%`,
                              background: '#3b82f6',
                            }}
                          />
                        </div>
                        <span className="cpt-perf-coverage-fraction">
                          {derived.freq4Visited}/{derived.freq4Doctors.length}
                        </span>
                      </div>
                      <div className="cpt-perf-coverage-item" style={{ borderTop: '2px solid #e5e7eb', paddingTop: 12 }}>
                        <span className="cpt-perf-coverage-label" style={{ fontWeight: 600 }}>Total</span>
                        <div className="cpt-perf-coverage-bar-wrap">
                          <div
                            className="cpt-perf-coverage-bar-fill"
                            style={{
                              width: `${derived.totalDoctors > 0 ? (derived.uniqueVisited / derived.totalDoctors) * 100 : 0}%`,
                              background: '#059669',
                            }}
                          />
                        </div>
                        <span className="cpt-perf-coverage-fraction">
                          {derived.uniqueVisited}/{derived.totalDoctors}
                        </span>
                      </div>
                    </section>

                    {/* Engagement Distribution */}
                    <section className="cpt-perf-section">
                      <h2>Engagement Distribution</h2>
                      {[5, 4, 3, 2, 1].map((level) => (
                        <div key={level} className="cpt-perf-eng-row">
                          <span className="cpt-perf-eng-level">Lv {level}: {ENGAGEMENT_LABELS[level]}</span>
                          <div className="cpt-perf-eng-bar-wrap">
                            <div
                              className="cpt-perf-eng-bar-fill"
                              style={{
                                width: `${(derived.engagementDist[level] / derived.maxEngCount) * 100}%`,
                                background: ENGAGEMENT_COLORS[level],
                              }}
                            >
                              {derived.engagementDist[level] > 0 ? derived.engagementDist[level] : ''}
                            </div>
                          </div>
                          <span className="cpt-perf-eng-count">{derived.engagementDist[level]}</span>
                        </div>
                      ))}
                      <div className="cpt-perf-eng-row" style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                        <span className="cpt-perf-eng-level" style={{ color: '#9ca3af' }}>Not set</span>
                        <div className="cpt-perf-eng-bar-wrap">
                          <div
                            className="cpt-perf-eng-bar-fill"
                            style={{
                              width: `${(derived.engagementDist[0] / derived.maxEngCount) * 100}%`,
                              background: ENGAGEMENT_COLORS[0],
                            }}
                          >
                            {derived.engagementDist[0] > 0 ? derived.engagementDist[0] : ''}
                          </div>
                        </div>
                        <span className="cpt-perf-eng-count">{derived.engagementDist[0]}</span>
                      </div>
                    </section>
                  </div>

                  {/* Visited This Month */}
                  {derived.visited.length > 0 && (
                    <section className="cpt-perf-section">
                      <h2>Visited This Month ({derived.visited.length})</h2>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="cpt-perf-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Specialization</th>
                              <th>Frequency</th>
                              <th>Visits / Target</th>
                              <th>Engagement</th>
                            </tr>
                          </thead>
                          <tbody>
                            {derived.visited.map((doc) => (
                              <tr key={doc._id}>
                                <td style={{ fontWeight: 500 }}>
                                  {doc.fullName || `${doc.firstName || ''} ${doc.lastName || ''}`.trim() || 'Unknown'}
                                </td>
                                <td>{doc.specialization || '-'}</td>
                                <td>{doc.visitFrequency}x/mo</td>
                                <td>
                                  <span style={{ color: doc.visitCount >= doc.visitFrequency ? '#16a34a' : '#d97706' }}>
                                    {doc.visitCount}
                                  </span>
                                  {' / '}{doc.visitFrequency}
                                </td>
                                <td>
                                  {doc.levelOfEngagement ? (
                                    <span className={`cpt-perf-eng-badge level-${doc.levelOfEngagement}`}>
                                      {doc.levelOfEngagement}
                                    </span>
                                  ) : (
                                    <span className="cpt-perf-eng-badge level-none">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* Not Yet Visited This Month (collapsible, collapsed by default) */}
                  <section className="cpt-perf-section">
                    <h2>Not Yet Visited This Month ({derived.notVisited.length})</h2>
                    {derived.notVisited.length > 0 ? (
                      <>
                        <button
                          className="cpt-perf-collapse-btn"
                          onClick={() => setNotVisitedExpanded(!notVisitedExpanded)}
                        >
                          {notVisitedExpanded ? 'Hide list' : 'Show list'}{' '}
                          {notVisitedExpanded ? '\u25B2' : '\u25BC'}
                        </button>
                        {notVisitedExpanded && (
                          <div style={{ overflowX: 'auto' }}>
                            <table className="cpt-perf-table">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Specialization</th>
                                  <th>Frequency</th>
                                  <th>Visits / Target</th>
                                  <th>Engagement</th>
                                </tr>
                              </thead>
                              <tbody>
                                {derived.notVisited.map((doc) => (
                                  <tr key={doc._id}>
                                    <td style={{ fontWeight: 500 }}>
                                      {doc.fullName || `${doc.firstName || ''} ${doc.lastName || ''}`.trim() || 'Unknown'}
                                    </td>
                                    <td>{doc.specialization || '-'}</td>
                                    <td>{doc.visitFrequency}x/mo</td>
                                    <td>0 / {doc.visitFrequency}</td>
                                    <td>
                                      {doc.levelOfEngagement ? (
                                        <span className={`cpt-perf-eng-badge level-${doc.levelOfEngagement}`}>
                                          {doc.levelOfEngagement}
                                        </span>
                                      ) : (
                                        <span className="cpt-perf-eng-badge level-none">-</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="cpt-perf-empty">
                        {derived.totalDoctors === 0
                          ? 'No VIP Clients assigned'
                          : 'All VIP Clients have been visited this month!'}
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default CallPlanPage;
