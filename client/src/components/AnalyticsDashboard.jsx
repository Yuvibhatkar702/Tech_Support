import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { complaintApi } from '../services/api';
import { useToastStore } from '../store';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6b7280', '#8b5cf6', '#ec4899', '#06b6d4'];

const STATUS_COLORS = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  closed: '#10b981',
  rejected: '#ef4444',
  duplicate: '#6b7280',
};

export default function AnalyticsDashboard() {
  const { t } = useTranslation();
  const { addToast } = useToastStore();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('month');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const result = await complaintApi.getStats({ range: dateRange });
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      addToast('Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Transform data for charts
  const statusData = stats?.byStatus ? Object.entries(stats.byStatus).map(([name, value]) => ({
    name: t(`status.${name}`) || name,
    value,
    color: STATUS_COLORS[name],
  })) : [];

  const categoryData = stats?.byCategory ? Object.entries(stats.byCategory).map(([name, value]) => ({
    name: t(`categories.${name}`) || name,
    value,
  })) : [];

  const trendData = stats?.trend || [];
  const resolutionTimeData = stats?.resolutionTime || [];

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">📊 Analytics Dashboard</h2>
        <div className="flex gap-2">
          {['week', 'month', 'quarter', 'year'].map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRange === range
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Tickets"
          value={stats?.total || 0}
          icon="📋"
          color="blue"
          change={stats?.totalChange}
        />
        <SummaryCard
          title="Closed"
          value={stats?.byStatus?.closed || 0}
          icon="✅"
          color="green"
          change={stats?.closedChange}
        />
        <SummaryCard
          title="Pending"
          value={stats?.byStatus?.pending || 0}
          icon="⏳"
          color="yellow"
          change={stats?.pendingChange}
        />
        <SummaryCard
          title="Avg. Resolution Time"
          value={`${stats?.avgResolutionTime || 0}h`}
          icon="⏱️"
          color="purple"
          change={stats?.resolutionTimeChange}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Category Distribution Bar Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">By Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Line Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Ticket Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="new" stroke="#3b82f6" fillOpacity={1} fill="url(#colorNew)" name="New" />
              <Area type="monotone" dataKey="closed" stroke="#10b981" fillOpacity={1} fill="url(#colorClosed)" name="Closed" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Resolution Time Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Resolution Time by Category</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={resolutionTimeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="avgTime" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Avg. Hours" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SLA Performance */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">SLA Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SLACard
            title="Within SLA"
            value={stats?.slaStats?.withinSLA || 0}
            total={stats?.total || 0}
            color="green"
          />
          <SLACard
            title="SLA Warning"
            value={stats?.slaStats?.warning || 0}
            total={stats?.total || 0}
            color="yellow"
          />
          <SLACard
            title="SLA Breached"
            value={stats?.slaStats?.breached || 0}
            total={stats?.total || 0}
            color="red"
          />
          <SLACard
            title="Escalated"
            value={stats?.slaStats?.escalated || 0}
            total={stats?.total || 0}
            color="purple"
          />
        </div>
      </div>

      {/* Top Areas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Ticket Areas</h3>
        <div className="space-y-3">
          {(stats?.topAreas || []).map((area, index) => (
            <div key={index} className="flex items-center gap-4">
              <span className="text-gray-500 w-6">{index + 1}.</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{area.name}</span>
                  <span className="text-sm text-gray-500">{area.count} tickets</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(area.count / (stats?.total || 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({ title, value, icon, color, change }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${colorClasses[color]}`}>
          {icon}
        </div>
        {change !== undefined && (
          <span className={`text-sm font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// SLA Card Component
function SLACard({ title, value, total, color }) {
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
  
  const colorClasses = {
    green: 'text-green-600 bg-green-100',
    yellow: 'text-yellow-600 bg-yellow-100',
    red: 'text-red-600 bg-red-100',
    purple: 'text-purple-600 bg-purple-100',
  };

  return (
    <div className="text-center p-4 rounded-lg bg-gray-50">
      <p className="text-sm text-gray-500 mb-2">{title}</p>
      <p className={`text-3xl font-bold ${colorClasses[color].split(' ')[0]}`}>{value}</p>
      <p className="text-sm text-gray-400 mt-1">{percentage}% of total</p>
    </div>
  );
}
