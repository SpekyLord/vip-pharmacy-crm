/**
 * MyPerformancePage
 *
 * BDM self-service performance stats page (Task B.5a):
 * - Monthly stat cards (total visits, compliance %, unique visited, total assigned)
 * - Behind-schedule warning banner
 * - Weekly breakdown bar chart (Recharts)
 * - VIP coverage breakdown (2x vs 4x)
 * - Engagement distribution
 * - Not-yet-visited VIP Clients table
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import visitService from '../../services/visitService';
import doctorService from '../../services/doctorService';
import scheduleService from '../../services/scheduleService';
import DCRSummaryTable from '../../components/employee/DCRSummaryTable';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const performanceStyles = `
  .main-content h1 {
    margin: 0 0 24px 0;
    font-size: 28px;
    font-weight: 600;
    color: #1f2937;
  }

  .perf-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .perf-header h1 {
    margin: 0 !important;
  }

  .perf-month-picker select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
  }

  .perf-warning {
    padding: 14px 18px;
    border-radius: 10px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    font-weight: 500;
  }

  .perf-warning.yellow {
    background: #fef3c7;
    border: 1px solid #f59e0b;
    color: #92400e;
  }

  .perf-warning.red {
    background: #fee2e2;
    border: 1px solid #ef4444;
    color: #991b1b;
  }

  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
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

  .stat-card .stat-value {
    font-size: 36px;
    font-weight: 700;
    color: #2563eb;
    line-height: 1;
    margin-bottom: 8px;
  }

  .stat-card .stat-value.green { color: #16a34a; }
  .stat-card .stat-value.yellow { color: #d97706; }
  .stat-card .stat-value.red { color: #dc2626; }

  .stat-card .stat-label {
    font-size: 14px;
    color: #6b7280;
    font-weight: 500;
  }

  .dashboard-section {
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    margin-bottom: 24px;
  }

  .dashboard-section h2 {
    margin: 0 0 20px 0;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    padding-bottom: 12px;
    border-bottom: 2px solid #e5e7eb;
  }

  .perf-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
  }

  .coverage-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .coverage-item:last-child {
    border-bottom: none;
  }

  .coverage-label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .coverage-bar-wrap {
    flex: 1;
    margin: 0 16px;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .coverage-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s ease;
  }

  .coverage-fraction {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    min-width: 60px;
    text-align: right;
  }

  .engagement-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
  }

  .engagement-level {
    min-width: 80px;
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
  }

  .engagement-bar-wrap {
    flex: 1;
    height: 20px;
    background: #f3f4f6;
    border-radius: 4px;
    overflow: hidden;
  }

  .engagement-bar-fill {
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

  .engagement-count {
    min-width: 24px;
    font-size: 14px;
    font-weight: 600;
    color: #374151;
    text-align: right;
  }

  .perf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .perf-table th {
    text-align: left;
    padding: 10px 12px;
    background: #f9fafb;
    color: #6b7280;
    font-weight: 600;
    border-bottom: 2px solid #e5e7eb;
  }

  .perf-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
  }

  .perf-table tr:hover td {
    background: #f9fafb;
  }

  .eng-badge {
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

  .eng-badge.level-1, .eng-badge.level-2 { background: #ef4444; }
  .eng-badge.level-3 { background: #f59e0b; }
  .eng-badge.level-4, .eng-badge.level-5 { background: #22c55e; }
  .eng-badge.level-none { background: #9ca3af; }

  .perf-empty {
    text-align: center;
    padding: 32px;
    color: #9ca3af;
    font-size: 14px;
  }

  @media (max-width: 768px) {
    .perf-two-col {
      grid-template-columns: 1fr;
    }

    .stats-row {
      grid-template-columns: repeat(2, 1fr);
    }

    .stat-card .stat-value {
      font-size: 28px;
    }

    .perf-table {
      font-size: 13px;
    }

    .perf-table th, .perf-table td {
      padding: 8px 6px;
    }
  }
`;

/**
 * 4-week cycle anchor: Jan 5, 2026 (Monday) = W1D1.
 * Matches Visit model's getCyclePosition().
 */
const CYCLE_ANCHOR = new Date(2026, 0, 5);

const getCycleWeek = (date) => {
  const diffDays = Math.floor((date.getTime() - CYCLE_ANCHOR.getTime()) / 86400000);
  const dayInCycle = ((diffDays % 28) + 28) % 28;
  return Math.floor(dayInCycle / 7) + 1; // 1-4
};

const getCycleNumber = (date) => {
  const diffMs = date.getTime() - CYCLE_ANCHOR.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return Math.floor(diffDays / 28);
};

// Generate last 6 months as options for month picker
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

const MyPerformancePage = () => {
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [statsData, setStatsData] = useState(null);
  const [complianceData, setComplianceData] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [visits, setVisits] = useState([]);
  const [dcrSummary, setDcrSummary] = useState([]);
  const [dcrTotal, setDcrTotal] = useState({});

  const fetchData = useCallback(async (monthYear) => {
    try {
      setLoading(true);
      setError(null);

      const currentCycleNumber = getCycleNumber(new Date());

      const [statsResult, complianceResult, doctorsResult, visitsResult, cptResult] = await Promise.allSettled([
        visitService.getStats({ monthYear }),
        visitService.getWeeklyCompliance(monthYear),
        doctorService.getAll({ limit: 0 }),
        visitService.getMy({ monthYear, limit: 0 }),
        scheduleService.getCPTGrid(currentCycleNumber),
      ]);

      setStatsData(statsResult.status === 'fulfilled' ? statsResult.value.data : null);
      setComplianceData(complianceResult.status === 'fulfilled' ? complianceResult.value.data : null);
      setDoctors(doctorsResult.status === 'fulfilled' ? (doctorsResult.value.data || []) : []);
      setVisits(visitsResult.status === 'fulfilled' ? (visitsResult.value.data || []) : []);

      if (cptResult.status === 'fulfilled' && cptResult.value.data) {
        setDcrSummary(cptResult.value.data.dcrSummary || []);
        setDcrTotal(cptResult.value.data.dcrTotal || {});
      } else {
        setDcrSummary([]);
        setDcrTotal({});
      }

      const allFailed = [statsResult, complianceResult, doctorsResult, visitsResult].every(
        (r) => r.status === 'rejected'
      );
      if (allFailed) {
        setError('Failed to load performance data. Please try again.');
      }
    } catch (err) {
      console.error('Failed to fetch performance data:', err);
      setError(err.response?.data?.message || 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedMonth);
  }, [selectedMonth, fetchData]);

  // Derived calculations
  const derived = useMemo(() => {
    const totalVisits = complianceData?.totalVisits ?? statsData?.summary?.totalVisits ?? 0;
    const compliancePct = complianceData?.compliancePercentage ?? 0;
    const expectedVisits = complianceData?.expectedVisits ?? 0;
    const totalDoctors = doctors.length;

    // Visited doctor IDs from visits
    const visitedDoctorIds = new Set(
      visits.map((v) => (typeof v.doctor === 'object' ? v.doctor?._id : v.doctor)?.toString()).filter(Boolean)
    );
    const uniqueVisited = visitedDoctorIds.size;

    // VIP coverage by frequency
    const freq2Doctors = doctors.filter((d) => d.visitFrequency === 2);
    const freq4Doctors = doctors.filter((d) => d.visitFrequency === 4);
    const freq2Visited = freq2Doctors.filter((d) => visitedDoctorIds.has(d._id?.toString())).length;
    const freq4Visited = freq4Doctors.filter((d) => visitedDoctorIds.has(d._id?.toString())).length;

    // Engagement distribution
    const engagementDist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
    doctors.forEach((d) => {
      const lvl = d.levelOfEngagement;
      if (lvl >= 1 && lvl <= 5) {
        engagementDist[lvl]++;
      } else {
        engagementDist[0]++;
      }
    });
    const maxEngCount = Math.max(1, ...Object.values(engagementDist));

    // Behind-schedule check — use anchor-based cycle week
    const now = new Date();
    const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = selectedMonth === currentMonthYear;
    const weekOfMonth = getCycleWeek(now); // 1-4 based on Jan 5 anchor

    const expectedByNow = isCurrentMonth
      ? Math.ceil((expectedVisits / 4) * weekOfMonth)
      : expectedVisits;
    const isBehind = isCurrentMonth && expectedByNow > 0 && totalVisits < expectedByNow * 0.8;
    const behindPct = expectedByNow > 0 ? Math.round((totalVisits / expectedByNow) * 100) : 100;

    // Weekly breakdown chart data
    const weeklyBreakdown = statsData?.weeklyBreakdown || [];
    const chartData = [1, 2, 3, 4].map((w) => {
      const found = weeklyBreakdown.find((wb) => wb.week === w);
      return { name: `W${w}`, visits: found?.visitCount || 0, doctors: found?.doctorCount || 0 };
    });

    // Visited doctors (with visit count)
    const visitCountByDoctor = {};
    visits.forEach((v) => {
      const docId = (typeof v.doctor === 'object' ? v.doctor?._id : v.doctor)?.toString();
      if (docId) visitCountByDoctor[docId] = (visitCountByDoctor[docId] || 0) + 1;
    });

    const visited = doctors
      .filter((d) => visitedDoctorIds.has(d._id?.toString()))
      .map((d) => ({ ...d, visitCount: visitCountByDoctor[d._id?.toString()] || 0 }));

    // Not yet visited
    const notVisited = doctors.filter((d) => !visitedDoctorIds.has(d._id?.toString()));

    // Compliance color
    let complianceColor = 'red';
    if (compliancePct >= 80) complianceColor = 'green';
    else if (compliancePct >= 50) complianceColor = 'yellow';

    return {
      totalVisits,
      compliancePct,
      complianceColor,
      expectedVisits,
      totalDoctors,
      uniqueVisited,
      freq2Doctors,
      freq4Doctors,
      freq2Visited,
      freq4Visited,
      engagementDist,
      maxEngCount,
      isBehind,
      behindPct,
      expectedByNow,
      weekOfMonth,
      chartData,
      visited,
      notVisited,
      isCurrentMonth,
    };
  }, [statsData, complianceData, doctors, visits, selectedMonth]);

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{performanceStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          {/* Header + Month Picker */}
          <div className="perf-header">
            <h1>My Performance</h1>
            <div className="perf-month-picker">
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
          </div>

          {error && (
            <ErrorMessage message={error} onRetry={() => fetchData(selectedMonth)} />
          )}

          {/* Behind-Schedule Warning */}
          {derived.isBehind && (
            <div className={`perf-warning ${derived.behindPct < 50 ? 'red' : 'yellow'}`}>
              <span>&#9888;</span>
              <span>
                You are behind schedule: {derived.totalVisits} visits completed out of{' '}
                {derived.expectedByNow} expected by Week {derived.weekOfMonth} ({derived.behindPct}%)
              </span>
            </div>
          )}

          {/* Stat Cards */}
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-value">{derived.totalVisits}</span>
              <span className="stat-label">Total Visits</span>
            </div>
            <div className="stat-card">
              <span className={`stat-value ${derived.complianceColor}`}>
                {derived.compliancePct}%
              </span>
              <span className="stat-label">Compliance</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{derived.uniqueVisited}</span>
              <span className="stat-label">Unique Visited</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{derived.totalDoctors}</span>
              <span className="stat-label">Total Assigned</span>
            </div>
          </div>

          {/* Weekly Breakdown Chart */}
          <section className="dashboard-section">
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
              <p className="perf-empty">No visits recorded for this month</p>
            )}
          </section>

          {/* DCR Summary */}
          {dcrSummary.length > 0 && (
            <section className="dashboard-section">
              <h2>DCR Summary — Cycle {getCycleNumber(new Date())}</h2>
              <DCRSummaryTable dcrSummary={dcrSummary} dcrTotal={dcrTotal} />
            </section>
          )}

          {/* Two-column: VIP Coverage + Engagement Distribution */}
          <div className="perf-two-col">
            {/* VIP Coverage */}
            <section className="dashboard-section">
              <h2>VIP Coverage</h2>
              <div className="coverage-item">
                <span className="coverage-label">2x/month</span>
                <div className="coverage-bar-wrap">
                  <div
                    className="coverage-bar-fill"
                    style={{
                      width: `${derived.freq2Doctors.length > 0 ? (derived.freq2Visited / derived.freq2Doctors.length) * 100 : 0}%`,
                      background: '#8b5cf6',
                    }}
                  />
                </div>
                <span className="coverage-fraction">
                  {derived.freq2Visited}/{derived.freq2Doctors.length}
                </span>
              </div>
              <div className="coverage-item">
                <span className="coverage-label">4x/month</span>
                <div className="coverage-bar-wrap">
                  <div
                    className="coverage-bar-fill"
                    style={{
                      width: `${derived.freq4Doctors.length > 0 ? (derived.freq4Visited / derived.freq4Doctors.length) * 100 : 0}%`,
                      background: '#3b82f6',
                    }}
                  />
                </div>
                <span className="coverage-fraction">
                  {derived.freq4Visited}/{derived.freq4Doctors.length}
                </span>
              </div>
              <div className="coverage-item" style={{ borderTop: '2px solid #e5e7eb', paddingTop: 12 }}>
                <span className="coverage-label" style={{ fontWeight: 600 }}>Total</span>
                <div className="coverage-bar-wrap">
                  <div
                    className="coverage-bar-fill"
                    style={{
                      width: `${derived.totalDoctors > 0 ? (derived.uniqueVisited / derived.totalDoctors) * 100 : 0}%`,
                      background: '#059669',
                    }}
                  />
                </div>
                <span className="coverage-fraction">
                  {derived.uniqueVisited}/{derived.totalDoctors}
                </span>
              </div>
            </section>

            {/* Engagement Distribution */}
            <section className="dashboard-section">
              <h2>Engagement Distribution</h2>
              {[5, 4, 3, 2, 1].map((level) => (
                <div key={level} className="engagement-row">
                  <span className="engagement-level">Lv {level}: {ENGAGEMENT_LABELS[level]}</span>
                  <div className="engagement-bar-wrap">
                    <div
                      className="engagement-bar-fill"
                      style={{
                        width: `${(derived.engagementDist[level] / derived.maxEngCount) * 100}%`,
                        background: ENGAGEMENT_COLORS[level],
                      }}
                    >
                      {derived.engagementDist[level] > 0 ? derived.engagementDist[level] : ''}
                    </div>
                  </div>
                  <span className="engagement-count">{derived.engagementDist[level]}</span>
                </div>
              ))}
              <div className="engagement-row" style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                <span className="engagement-level" style={{ color: '#9ca3af' }}>Not set</span>
                <div className="engagement-bar-wrap">
                  <div
                    className="engagement-bar-fill"
                    style={{
                      width: `${(derived.engagementDist[0] / derived.maxEngCount) * 100}%`,
                      background: ENGAGEMENT_COLORS[0],
                    }}
                  >
                    {derived.engagementDist[0] > 0 ? derived.engagementDist[0] : ''}
                  </div>
                </div>
                <span className="engagement-count">{derived.engagementDist[0]}</span>
              </div>
            </section>
          </div>

          {/* Visited This Month */}
          {derived.visited.length > 0 && (
            <section className="dashboard-section">
              <h2>Visited This Month ({derived.visited.length})</h2>
              <div style={{ overflowX: 'auto' }}>
                <table className="perf-table">
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
                            <span className={`eng-badge level-${doc.levelOfEngagement}`}>
                              {doc.levelOfEngagement}
                            </span>
                          ) : (
                            <span className="eng-badge level-none">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Not Yet Visited This Month */}
          <section className="dashboard-section">
            <h2>Not Yet Visited This Month ({derived.notVisited.length})</h2>
            {derived.notVisited.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="perf-table">
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
                            <span className={`eng-badge level-${doc.levelOfEngagement}`}>
                              {doc.levelOfEngagement}
                            </span>
                          ) : (
                            <span className="eng-badge level-none">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="perf-empty">
                {derived.totalDoctors === 0
                  ? 'No VIP Clients assigned'
                  : 'All VIP Clients have been visited this month!'}
              </p>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default MyPerformancePage;
