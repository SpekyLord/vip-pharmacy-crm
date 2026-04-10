/**
 * PerformanceChart Component
 *
 * Reusable chart wrapper for Recharts library.
 * Supports Line, Bar, and Area chart types.
 *
 * Props:
 * @prop {string} type - 'line' | 'bar' | 'area'
 * @prop {array} data - Array of data objects
 * @prop {string} dataKey - Key to measure (y-axis)
 * @prop {string} xAxisKey - Key for x-axis (default: 'date')
 * @prop {string} color - Primary color (default: '#3b82f6')
 * @prop {string} secondaryDataKey - Optional second data series
 * @prop {string} secondaryColor - Color for second series
 * @prop {string} title - Chart title
 * @prop {number} height - Chart height (default: 300)
 * @prop {boolean} showGrid - Show grid lines (default: true)
 * @prop {boolean} showTooltip - Show tooltip (default: true)
 * @prop {boolean} showLegend - Show legend (default: false)
 */

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

/* =============================================================================
   STYLES
   ============================================================================= */

const styles = `
  .perf-chart-wrapper {
    width: 100%;
    background: white;
    border-radius: 12px;
    padding: 20px;
    border: 1px solid #e5e7eb;
  }

  .perf-chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .perf-chart-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .perf-chart-subtitle {
    font-size: 13px;
    color: #6b7280;
    margin: 4px 0 0 0;
  }

  .perf-chart-container {
    width: 100%;
  }

  /* Custom Tooltip */
  .chart-tooltip {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .chart-tooltip-label {
    font-size: 12px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 6px;
  }

  .chart-tooltip-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #4b5563;
    margin-top: 4px;
  }

  .chart-tooltip-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .chart-tooltip-value {
    font-weight: 600;
    color: #1f2937;
  }
`;

/* =============================================================================
   CUSTOM TOOLTIP
   ============================================================================= */

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((entry, index) => (
        <div key={index} className="chart-tooltip-item">
          <span
            className="chart-tooltip-dot"
            style={{ backgroundColor: entry.color }}
          />
          <span>{entry.name}:</span>
          <span className="chart-tooltip-value">{entry.value}</span>
        </div>
      ))}
    </div>
  );
};

/* =============================================================================
   COMPONENT
   ============================================================================= */

const PerformanceChart = ({
  type = 'line',
  data = [],
  dataKey = 'value',
  xAxisKey = 'date',
  color = '#3b82f6',
  secondaryDataKey = null,
  secondaryColor = '#9ca3af',
  secondaryName = 'Dept. Average',
  title = '',
  subtitle = '',
  height = 300,
  showGrid = true,
  showTooltip = true,
  showLegend = false,
}) => {
  // Gradient ID for area charts
  const gradientId = `gradient-${dataKey}`;
  const gradientIdSecondary = `gradient-${secondaryDataKey}`;

  // Common chart props
  const commonProps = {
    data,
    margin: { top: 10, right: 20, left: 0, bottom: 0 },
  };

  // Render the appropriate chart type
  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            )}
            <XAxis
              dataKey={xAxisKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              dx={-10}
            />
            {showTooltip && (
              <Tooltip
                content={<CustomTooltip dataKey={dataKey} secondaryDataKey={secondaryDataKey} />}
              />
            )}
            {showLegend && <Legend />}
            <Bar
              dataKey={dataKey}
              fill={color}
              radius={[4, 4, 0, 0]}
              name={dataKey.charAt(0).toUpperCase() + dataKey.slice(1)}
            />
            {secondaryDataKey && (
              <Bar
                dataKey={secondaryDataKey}
                fill={secondaryColor}
                radius={[4, 4, 0, 0]}
                name={secondaryName}
              />
            )}
          </BarChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              {secondaryDataKey && (
                <linearGradient id={gradientIdSecondary} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={secondaryColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={secondaryColor} stopOpacity={0} />
                </linearGradient>
              )}
            </defs>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            )}
            <XAxis
              dataKey={xAxisKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              dx={-10}
            />
            {showTooltip && (
              <Tooltip
                content={<CustomTooltip dataKey={dataKey} secondaryDataKey={secondaryDataKey} />}
              />
            )}
            {showLegend && <Legend />}
            {secondaryDataKey && (
              <Area
                type="monotone"
                dataKey={secondaryDataKey}
                stroke={secondaryColor}
                strokeWidth={2}
                fill={`url(#${gradientIdSecondary})`}
                name={secondaryName}
              />
            )}
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              name={dataKey.charAt(0).toUpperCase() + dataKey.slice(1)}
            />
          </AreaChart>
        );

      case 'line':
      default:
        return (
          <LineChart {...commonProps}>
            {showGrid && (
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            )}
            <XAxis
              dataKey={xAxisKey}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              dx={-10}
            />
            {showTooltip && (
              <Tooltip
                content={<CustomTooltip dataKey={dataKey} secondaryDataKey={secondaryDataKey} />}
              />
            )}
            {showLegend && <Legend />}
            {secondaryDataKey && (
              <Line
                type="monotone"
                dataKey={secondaryDataKey}
                stroke={secondaryColor}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                name={secondaryName}
              />
            )}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 4, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: color, strokeWidth: 0 }}
              name={dataKey.charAt(0).toUpperCase() + dataKey.slice(1)}
            />
          </LineChart>
        );
    }
  };

  return (
    <div className="perf-chart-wrapper">
      <style>{styles}</style>
      {(title || subtitle) && (
        <div className="perf-chart-header">
          <div>
            {title && <h3 className="perf-chart-title">{title}</h3>}
            {subtitle && <p className="perf-chart-subtitle">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="perf-chart-container">
        <ResponsiveContainer width="100%" height={height}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PerformanceChart;