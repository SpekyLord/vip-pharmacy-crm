/**
 * EmployeeAnalytics Component
 *
 * Performance analytics section that appears below the visit report table.
 * Shows metrics, charts, and comparison data for selected employee.
 *
 * Props:
 * @prop {string} employeeId - Selected employee ID
 * @prop {string} employeeName - Selected employee name
 * @prop {string} month - Selected month (YYYY-MM format)
 * @prop {array} visits - Visit data for the employee
 * @prop {array} allEmployees - List of all employees for comparison
 *
 * Features:
 * - Key metrics cards (Total Visits, Completion Rate, Coverage, Avg/Day)
 * - Visits over time chart (Line/Area)
 * - Product performance chart (Bar)
 * - Compare mode toggle (Employee vs Department Average)
 * - Compare with another employee
 * - Date range filter
 * - Export analytics data
 */

import { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Calendar,
  BarChart3,
  Activity,
  Percent,
  Package,
  ToggleLeft,
  ToggleRight,
  Download,
  FileSpreadsheet,
  CalendarRange,
  UserCheck,
} from 'lucide-react';
import PerformanceChart from './PerformanceChart';

import SelectField from '../common/Select';

/* =============================================================================
   MOCK DATA GENERATOR
   ============================================================================= */

const generateMockPerformanceData = (month, employeeId) => {
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const data = [];

  // Generate daily data
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, monthNum - 1, day).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Employee performance (varies by employee)
    const baseVisits = employeeId === 'emp-001' ? 5 : employeeId === 'emp-002' ? 4 : 3;
    const visits = isWeekend ? 0 : Math.floor(baseVisits + Math.random() * 3);
    
    // Department average (consistent baseline)
    const deptAvg = isWeekend ? 0 : Math.floor(3.5 + Math.random() * 2);

    data.push({
      date: `${monthNum}/${day}`,
      fullDate: date,
      visits,
      deptAvg,
      completionRate: visits > 0 ? Math.floor(75 + Math.random() * 25) : 0,
    });
  }

  return data;
};

const generateProductData = (employeeId) => {
  const products = [
    { name: 'CardioMax', presented: 0, deptAvg: 0 },
    { name: 'NeuroPlus', presented: 0, deptAvg: 0 },
    { name: 'GastroShield', presented: 0, deptAvg: 0 },
    { name: 'ImmunoBoost', presented: 0, deptAvg: 0 },
    { name: 'VitaPlus', presented: 0, deptAvg: 0 },
  ];

  // Generate random counts based on employee
  const multiplier = employeeId === 'emp-001' ? 1.2 : employeeId === 'emp-002' ? 1 : 0.8;

  return products.map(p => ({
    ...p,
    presented: Math.floor((15 + Math.random() * 20) * multiplier),
    deptAvg: Math.floor(12 + Math.random() * 10),
  }));
};

/* =============================================================================
   STYLES
   ============================================================================= */

const styles = `
  .emp-analytics {
    margin-top: 32px;
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .emp-analytics-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;
    flex-wrap: wrap;
    gap: 16px;
  }

  .emp-analytics-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .emp-analytics-title h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    color: #1f2937;
  }

  .emp-analytics-title .icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .emp-analytics-subtitle {
    font-size: 14px;
    color: #6b7280;
    margin: 4px 0 0 52px;
  }

  /* Controls Bar */
  .analytics-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 16px;
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    margin-bottom: 20px;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-label {
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    white-space: nowrap;
  }

  .control-input {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 13px;
    color: #374151;
    background: white;
  }

  .control-input:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }

  .control-select {
    padding: 8px 32px 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 13px;
    color: #374151;
    background: white;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    cursor: pointer;
    min-width: 160px;
  }

  .control-select:focus {
    outline: none;
    border-color: #8b5cf6;
  }

  .control-divider {
    width: 1px;
    height: 32px;
    background: #e5e7eb;
  }

  /* Compare Toggle */
  .compare-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: #f3f4f6;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }

  .compare-toggle:hover {
    background: #e5e7eb;
  }

  .compare-toggle.active {
    background: #ede9fe;
    color: #7c3aed;
  }

  /* Export Button */
  .export-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-left: auto;
  }

  .export-btn:hover {
    background: #16a34a;
  }

  /* Metrics Grid */
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .metric-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #e5e7eb;
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .metric-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .metric-icon.blue { background: #dbeafe; color: #2563eb; }
  .metric-icon.green { background: #dcfce7; color: #16a34a; }
  .metric-icon.purple { background: #f3e8ff; color: #7c3aed; }
  .metric-icon.amber { background: #fef3c7; color: #d97706; }

  .metric-content {
    flex: 1;
  }

  .metric-label {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .metric-value {
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1;
  }

  .metric-trend {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    font-size: 12px;
    font-weight: 500;
  }

  .metric-trend.up { color: #16a34a; }
  .metric-trend.down { color: #dc2626; }

  /* Charts Grid */
  .charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .chart-card {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .chart-card.full-width {
    grid-column: span 2;
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #f3f4f6;
  }

  .chart-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
  }

  .chart-title .icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .chart-title .icon.blue { background: #dbeafe; color: #2563eb; }
  .chart-title .icon.green { background: #dcfce7; color: #16a34a; }
  .chart-title .icon.purple { background: #f3e8ff; color: #7c3aed; }

  .chart-legend {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 12px;
  }

  .chart-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #6b7280;
  }

  .chart-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .chart-legend-line {
    width: 16px;
    height: 2px;
    border-radius: 1px;
  }

  .chart-legend-line.dashed {
    background: repeating-linear-gradient(
      90deg,
      #9ca3af 0px,
      #9ca3af 4px,
      transparent 4px,
      transparent 8px
    );
  }

  .chart-body {
    padding: 16px;
  }

  /* Responsive */
  @media (max-width: 1024px) {
    .metrics-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .charts-grid {
      grid-template-columns: 1fr;
    }
    .chart-card.full-width {
      grid-column: span 1;
    }
  }

  @media (max-width: 640px) {
    .metrics-grid {
      grid-template-columns: 1fr;
    }
    .emp-analytics-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .analytics-controls {
      flex-direction: column;
      align-items: stretch;
    }
    .control-divider {
      display: none;
    }
    .export-btn {
      margin-left: 0;
      justify-content: center;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

// Mock employees for comparison
const MOCK_EMPLOYEES = [
  { id: 'emp-001', name: 'Juan Dela Cruz' },
  { id: 'emp-002', name: 'Maria Garcia' },
  { id: 'emp-003', name: 'Pedro Martinez' },
  { id: 'emp-004', name: 'Ana Lopez' },
];

const EmployeeAnalytics = ({
  employeeId = 'emp-001',
  employeeName = 'Juan Dela Cruz',
  month = '2025-12',
  visits = [],
  allEmployees = MOCK_EMPLOYEES,
}) => {
  const [compareMode, setCompareMode] = useState(false);
  const [compareEmployeeId, setCompareEmployeeId] = useState('');
  
  // Date range state
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const [startDate, setStartDate] = useState(`${month}-01`);
  const [endDate, setEndDate] = useState(`${month}-${String(daysInMonth).padStart(2, '0')}`);

  // Generate performance data
  const performanceData = useMemo(
    () => generateMockPerformanceData(month, employeeId),
    [month, employeeId]
  );

  // Filter data by date range
  const filteredPerformanceData = useMemo(() => {
    return performanceData.filter(d => {
      const date = d.fullDate;
      return date >= startDate && date <= endDate;
    });
  }, [performanceData, startDate, endDate]);

  // Generate comparison employee data
  const compareEmployeeData = useMemo(() => {
    if (!compareMode || !compareEmployeeId) return null;
    return generateMockPerformanceData(month, compareEmployeeId);
  }, [month, compareEmployeeId, compareMode]);

  // Merge comparison data
  const chartDataWithComparison = useMemo(() => {
    if (!compareEmployeeData) return filteredPerformanceData;
    
    return filteredPerformanceData.map((d, i) => ({
      ...d,
      compareVisits: compareEmployeeData[i]?.visits || 0,
    }));
  }, [filteredPerformanceData, compareEmployeeData]);

  const productData = useMemo(
    () => generateProductData(employeeId),
    [employeeId]
  );

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalVisits = filteredPerformanceData.reduce((sum, d) => sum + d.visits, 0);
    const workDays = filteredPerformanceData.filter(d => d.visits > 0 || d.deptAvg > 0).length;
    const avgPerDay = workDays > 0 ? (totalVisits / workDays).toFixed(1) : 0;
    const avgCompletion = filteredPerformanceData.filter(d => d.completionRate > 0).length > 0
      ? Math.round(
          filteredPerformanceData.filter(d => d.completionRate > 0).reduce((sum, d) => sum + d.completionRate, 0) /
          filteredPerformanceData.filter(d => d.completionRate > 0).length
        )
      : 0;

    // Compare with department
    const deptTotal = filteredPerformanceData.reduce((sum, d) => sum + d.deptAvg, 0);
    const visitTrend = totalVisits > deptTotal ? 'up' : totalVisits < deptTotal ? 'down' : 'neutral';
    const visitDiff = deptTotal > 0 ? Math.abs(Math.round(((totalVisits - deptTotal) / deptTotal) * 100)) : 0;

    return {
      totalVisits,
      avgPerDay,
      completionRate: avgCompletion,
      coverage: Math.floor(70 + Math.random() * 25), // Mock coverage
      visitTrend,
      visitDiff,
    };
  }, [filteredPerformanceData]);

  // Export analytics data
  const handleExport = () => {
    const exportData = {
      employee: employeeName,
      employeeId,
      dateRange: { start: startDate, end: endDate },
      metrics: {
        totalVisits: metrics.totalVisits,
        completionRate: `${metrics.completionRate}%`,
        doctorCoverage: `${metrics.coverage}%`,
        avgVisitsPerDay: metrics.avgPerDay,
      },
      dailyData: filteredPerformanceData.map(d => ({
        date: d.fullDate,
        visits: d.visits,
        completionRate: d.completionRate,
        departmentAvg: d.deptAvg,
      })),
      productsPresented: productData.map(p => ({
        product: p.name,
        count: p.presented,
        departmentAvg: p.deptAvg,
      })),
    };

    console.log('📊 Exporting Performance Analytics:', exportData);
    console.log('📄 CSV Data:');
    console.log('Date,Visits,Completion Rate,Dept Avg');
    filteredPerformanceData.forEach(d => {
      console.log(`${d.fullDate},${d.visits},${d.completionRate}%,${d.deptAvg}`);
    });
    
    alert('Analytics data exported! Check console for details.');
  };

  // Get compare employee name
  const compareEmployeeName = allEmployees.find(e => e.id === compareEmployeeId)?.name || '';

  return (
    <div className="emp-analytics">
      <style>{styles}</style>
      {/* Header */}
      <div className="emp-analytics-header">
        <div className="emp-analytics-title">
          <div className="icon">
            <BarChart3 size={20} />
          </div>
          <div>
            <h2>Performance Analytics</h2>
            <p className="emp-analytics-subtitle">
              Viewing data for <strong>{employeeName}</strong>
            </p>
          </div>
        </div>
      </div>
      {/* Controls Bar */}
      <div className="analytics-controls">
        {/* Date Range */}
        <div className="control-group">
          <CalendarRange size={16} color="#6b7280" />
          <span className="control-label">From:</span>
          <input
            type="date"
            className="control-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="control-group">
          <span className="control-label">To:</span>
          <input
            type="date"
            className="control-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="control-divider" />

        {/* Compare Mode Toggle */}
        <button
          className={`compare-toggle ${compareMode ? 'active' : ''}`}
          onClick={() => {
            setCompareMode(!compareMode);
            if (!compareMode) setCompareEmployeeId('');
          }}
        >
          {compareMode ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          Compare
        </button>

        {/* Compare Employee Dropdown */}
        {compareMode && (
          <div className="control-group">
            <UserCheck size={16} color="#6b7280" />
            <SelectField
              className="control-select"
              value={compareEmployeeId}
              onChange={(e) => setCompareEmployeeId(e.target.value)}
            >
              <option value="">Select BDM...</option>
              <option value="dept-avg">Department Average</option>
              {allEmployees
                .filter(e => e.id !== employeeId)
                .map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
            </SelectField>
          </div>
        )}

        {/* Export Button */}
        <button className="export-btn" onClick={handleExport}>
          <Download size={16} />
          Export Analytics
        </button>
      </div>
      {/* Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon blue">
            <Calendar size={24} />
          </div>
          <div className="metric-content">
            <div className="metric-label">Total Visits</div>
            <div className="metric-value">{metrics.totalVisits}</div>
            <div className={`metric-trend ${metrics.visitTrend}`}>
              {metrics.visitTrend === 'up' ? (
                <TrendingUp size={14} />
              ) : metrics.visitTrend === 'down' ? (
                <TrendingDown size={14} />
              ) : null}
              {metrics.visitDiff > 0 && (
                <span>
                  {metrics.visitTrend === 'up' ? '+' : '-'}{metrics.visitDiff}% vs dept
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon green">
            <Percent size={24} />
          </div>
          <div className="metric-content">
            <div className="metric-label">Completion Rate</div>
            <div className="metric-value">{metrics.completionRate}%</div>
            <div className="metric-trend up">
              <TrendingUp size={14} />
              <span>+5% from last month</span>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon purple">
            <Users size={24} />
          </div>
          <div className="metric-content">
            <div className="metric-label">Doctor Coverage</div>
            <div className="metric-value">{metrics.coverage}%</div>
            <div className="metric-trend up">
              <Target size={14} />
              <span>Target: 80%</span>
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon amber">
            <Activity size={24} />
          </div>
          <div className="metric-content">
            <div className="metric-label">Avg. Visits/Day</div>
            <div className="metric-value">{metrics.avgPerDay}</div>
            <div className="metric-trend up">
              <TrendingUp size={14} />
              <span>+0.3 from last month</span>
            </div>
          </div>
        </div>
      </div>
      {/* Charts */}
      <div className="charts-grid">
        {/* Visits Over Time */}
        <div className="chart-card full-width">
          <div className="chart-header">
            <div className="chart-title">
              <div className="icon blue">
                <Activity size={16} />
              </div>
              Visits Over Time
            </div>
            {compareMode && compareEmployeeId && (
              <div className="chart-legend">
                <div className="chart-legend-item">
                  <span className="chart-legend-dot" style={{ background: '#3b82f6' }} />
                  {employeeName}
                </div>
                <div className="chart-legend-item">
                  <span className="chart-legend-line dashed" />
                  {compareEmployeeId === 'dept-avg' ? 'Dept. Average' : compareEmployeeName}
                </div>
              </div>
            )}
          </div>
          <div className="chart-body">
            <PerformanceChart
              type="area"
              data={chartDataWithComparison}
              dataKey="visits"
              xAxisKey="date"
              color="#3b82f6"
              secondaryDataKey={compareMode && compareEmployeeId ? (compareEmployeeId === 'dept-avg' ? 'deptAvg' : 'compareVisits') : null}
              secondaryColor="#9ca3af"
              secondaryName={compareEmployeeId === 'dept-avg' ? 'Dept. Average' : compareEmployeeName}
              height={280}
              showLegend={false}
            />
          </div>
        </div>

        {/* Product Performance */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">
              <div className="icon green">
                <Package size={16} />
              </div>
              Products Presented
            </div>
          </div>
          <div className="chart-body">
            <PerformanceChart
              type="bar"
              data={productData}
              dataKey="presented"
              xAxisKey="name"
              color="#22c55e"
              secondaryDataKey={compareMode && compareEmployeeId ? 'deptAvg' : null}
              secondaryColor="#d1d5db"
              secondaryName="Dept. Average"
              height={250}
            />
          </div>
        </div>

        {/* Completion Rate Trend */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-title">
              <div className="icon purple">
                <Target size={16} />
              </div>
              Completion Rate Trend
            </div>
          </div>
          <div className="chart-body">
            <PerformanceChart
              type="line"
              data={filteredPerformanceData.filter(d => d.completionRate > 0)}
              dataKey="completionRate"
              xAxisKey="date"
              color="#8b5cf6"
              height={250}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeAnalytics;