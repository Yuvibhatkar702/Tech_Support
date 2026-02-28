import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Squares2X2Icon,
  MapIcon,
  TableCellsIcon,
  ArrowPathIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  UserGroupIcon,
  ChartBarIcon,
  DocumentArrowDownIcon,
  AdjustmentsHorizontalIcon,
  BellAlertIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useAuthStore, useToastStore } from '../store';
import { adminApi, departmentApi, officialApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import NotificationCenter from '../components/NotificationCenter';
import { useSocket, requestNotificationPermission } from '../hooks/useSocket';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icons by status
const createMarkerIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const markerIcons = {
  pending: createMarkerIcon('orange'),
  assigned: createMarkerIcon('blue'),
  in_progress: createMarkerIcon('yellow'),
  resolved: createMarkerIcon('green'),
  rejected: createMarkerIcon('red'),
  closed: createMarkerIcon('grey'),
};

// Map bounds updater
function MapBoundsUpdater({ complaints }) {
  const map = useMap();
  useEffect(() => {
    if (complaints.length > 0) {
      const bounds = complaints
        .filter(c => (c.coordinates?.lat != null) || c.location?.coordinates)
        .map(c => {
          const lat = c.coordinates?.lat ?? c.location?.coordinates?.[1];
          const lng = c.coordinates?.lng ?? c.location?.coordinates?.[0];
          return [lat, lng];
        })
        .filter(([lat, lng]) => lat != null && lng != null);
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13 });
      }
    }
  }, [complaints, map]);
  return null;
}

// SLA Timer Component
function SLATimer({ createdAt, slaHours = 72, status }) {
  const { t } = useTranslation();
  
  if (['resolved', 'rejected', 'closed'].includes(status)) {
    return null;
  }

  const created = new Date(createdAt);
  const deadline = new Date(created.getTime() + slaHours * 60 * 60 * 1000);
  const now = new Date();
  const remaining = deadline - now;
  const hoursRemaining = Math.floor(remaining / (1000 * 60 * 60));
  const isOverdue = remaining < 0;
  const isUrgent = hoursRemaining <= 12 && hoursRemaining > 0;

  if (isOverdue) {
    const hoursOverdue = Math.abs(hoursRemaining);
    return (
      <div className="flex items-center gap-1 text-red-600 text-xs font-medium animate-pulse">
        <BellAlertIcon className="w-4 h-4" />
        <span>{hoursOverdue}h {t('overdue')}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 text-xs font-medium ${
      isUrgent ? 'text-orange-600' : 'text-gray-500'
    }`}>
      <ClockIcon className="w-4 h-4" />
      <span>{hoursRemaining}h {t('remaining')}</span>
    </div>
  );
}

// Priority Badge
function PriorityBadge({ priority }) {
  const colors = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${colors[priority] || colors.medium}`}>
      {priority}
    </span>
  );
}

// Stats Card
function StatCard({ icon: Icon, label, value, trend, color = 'primary', onClick }) {
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-left w-full hover:shadow-md transition"
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={`text-xs font-medium flex items-center gap-1 ${
            trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-500'
          }`}>
            {trend > 0 ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </motion.button>
  );
}

// Bulk Actions Bar
function BulkActionsBar({ selectedCount, onBulkAction, onClearSelection }) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-4 z-50"
    >
      <div className="flex items-center gap-2">
        <CheckIcon className="w-5 h-5 text-primary-400" />
        <span className="font-medium">{selectedCount} {t('selected')}</span>
      </div>
      
      <div className="w-px h-6 bg-gray-700" />
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => onBulkAction('assign')}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition"
        >
          {t('assign')}
        </button>
        <button
          onClick={() => onBulkAction('resolve')}
          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition"
        >
          {t('resolve')}
        </button>
        <button
          onClick={() => onBulkAction('reject')}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition"
        >
          {t('reject')}
        </button>
      </div>

      <button
        onClick={onClearSelection}
        className="p-1.5 hover:bg-gray-800 rounded-lg transition"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>
    </motion.div>
  );
}

// Filter Panel
function FilterPanel({ filters, onChange, onClear, categories, statuses, priorities }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
      >
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-5 h-5 text-gray-500" />
          <span className="font-medium text-gray-900">{t('filters')}</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
              {activeFilterCount}
            </span>
          )}
        </div>
        <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-gray-100 pt-4">
              <select
                value={filters.status}
                onChange={(e) => onChange('status', e.target.value)}
                className="text-sm rounded-lg"
              >
                <option value="">{t('all_status')}</option>
                {statuses.map(s => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>

              <select
                value={filters.category}
                onChange={(e) => onChange('category', e.target.value)}
                className="text-sm rounded-lg"
              >
                <option value="">{t('all_categories')}</option>
                {categories.map(c => (
                  <option key={c} value={c}>{t(`categories.${c}`)}</option>
                ))}
              </select>

              <select
                value={filters.priority}
                onChange={(e) => onChange('priority', e.target.value)}
                className="text-sm rounded-lg"
              >
                <option value="">{t('all_priority')}</option>
                {priorities.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              <select
                value={filters.sla}
                onChange={(e) => onChange('sla', e.target.value)}
                className="text-sm rounded-lg"
              >
                <option value="">{t('all_sla')}</option>
                <option value="overdue">{t('overdue')}</option>
                <option value="urgent">{t('urgent')}</option>
                <option value="on_track">{t('on_track')}</option>
              </select>

              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => onChange('startDate', e.target.value)}
                className="text-sm rounded-lg"
              />

              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => onChange('endDate', e.target.value)}
                className="text-sm rounded-lg"
              />
            </div>

            {activeFilterCount > 0 && (
              <div className="px-4 pb-4">
                <button
                  onClick={onClear}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  {t('clear_all_filters')}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Manage Panel ───────────────────────────────────────────────────
function ManagePanel() {
  const { addToast } = useToastStore();
  const [departments, setDepartments] = useState([]);
  const [officials, setOfficials] = useState([]);
  const [activeSection, setActiveSection] = useState('departments');
  const [loading, setLoading] = useState(true);

  // Department form
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });
  const [showDeptForm, setShowDeptForm] = useState(false);

  // Official form
  const [officialForm, setOfficialForm] = useState({ name: '', email: '', password: '', departmentCode: '', phone: '', role: 'officer' });
  const [showOfficialForm, setShowOfficialForm] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [deptRes, officialRes] = await Promise.all([
        departmentApi.getAll(),
        officialApi.getAllOfficials(),
      ]);
      if (deptRes.success) setDepartments(deptRes.data);
      if (officialRes.success) setOfficials(officialRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateDept = async (e) => {
    e.preventDefault();
    try {
      const res = await departmentApi.create(deptForm);
      if (res.success) {
        addToast('Department created', 'success');
        setDeptForm({ name: '', code: '', description: '' });
        setShowDeptForm(false);
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleCreateOfficial = async (e) => {
    e.preventDefault();
    try {
      const fn = officialForm.role === 'department_head'
        ? officialApi.createDepartmentHead
        : officialApi.createOfficer;
      const res = await fn(officialForm);
      if (res.success) {
        addToast(`${officialForm.role === 'department_head' ? 'Department Head' : 'Officer'} created`, 'success');
        setOfficialForm({ name: '', email: '', password: '', departmentCode: '', phone: '', role: 'officer' });
        setShowOfficialForm(false);
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleDeleteDepartment = async (dept) => {
    if (!window.confirm(`Are you sure you want to remove "${dept.name}"? This will deactivate the department.`)) return;
    try {
      const res = await departmentApi.delete(dept._id);
      if (res.success) {
        addToast('Department removed', 'success');
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to remove department', 'error');
    }
  };

  const handleDeleteOfficial = async (official) => {
    if (!window.confirm(`Are you sure you want to remove "${official.name}"? This will deactivate their account.`)) return;
    try {
      const res = await officialApi.deleteOfficial(official._id);
      if (res.success) {
        addToast(res.message || 'Official removed', 'success');
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to remove official', 'error');
    }
  };

  const roleLabel = { department_head: 'Dept Head', officer: 'Officer' };

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-2">
        {[{ key: 'departments', label: 'Departments' }, { key: 'officials', label: 'Officials' }].map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition ${
              activeSection === s.key ? 'bg-primary-600 text-white shadow' : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Departments */}
      {activeSection === 'departments' && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Departments</h2>
            <button onClick={() => setShowDeptForm(!showDeptForm)} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-xl hover:bg-primary-700 transition">
              {showDeptForm ? 'Cancel' : '+ New Department'}
            </button>
          </div>

          {showDeptForm && (
            <form onSubmit={handleCreateDept} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
              <input value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="Name" required className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500" />
              <input value={deptForm.code} onChange={e => setDeptForm({ ...deptForm, code: e.target.value.toLowerCase().replace(/\s/g, '_') })} placeholder="Code (e.g. road_department)" required className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500" />
              <input value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} placeholder="Description" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500" />
              <button type="submit" className="sm:col-span-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">Create</button>
            </form>
          )}

          {loading ? <p className="text-gray-400 text-center py-8">Loading…</p> : (
            <div className="space-y-2">
              {departments.map(d => (
                <div key={d._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="font-semibold text-gray-900">{d.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{d.code}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${d.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {d.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {d.isActive && (
                      <button
                        onClick={() => handleDeleteDepartment(d)}
                        className="text-xs px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {departments.length === 0 && <p className="text-gray-400 text-center py-4">No departments yet</p>}
            </div>
          )}
        </div>
      )}

      {/* Officials */}
      {activeSection === 'officials' && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Officials</h2>
            <button onClick={() => setShowOfficialForm(!showOfficialForm)} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-xl hover:bg-primary-700 transition">
              {showOfficialForm ? 'Cancel' : '+ New Official'}
            </button>
          </div>

          {showOfficialForm && (
            <form onSubmit={handleCreateOfficial} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 p-4 bg-gray-50 rounded-xl">
              <input value={officialForm.name} onChange={e => setOfficialForm({ ...officialForm, name: e.target.value })} placeholder="Full Name" required className="px-3 py-2 border rounded-lg" />
              <input type="email" value={officialForm.email} onChange={e => setOfficialForm({ ...officialForm, email: e.target.value })} placeholder="Email" required className="px-3 py-2 border rounded-lg" />
              <input type="password" value={officialForm.password} onChange={e => setOfficialForm({ ...officialForm, password: e.target.value })} placeholder="Password (min 8)" required minLength={8} className="px-3 py-2 border rounded-lg" />
              <input value={officialForm.phone} onChange={e => setOfficialForm({ ...officialForm, phone: e.target.value })} placeholder="Phone (optional)" className="px-3 py-2 border rounded-lg" />
              <select value={officialForm.departmentCode} onChange={e => setOfficialForm({ ...officialForm, departmentCode: e.target.value })} required className="px-3 py-2 border rounded-lg">
                <option value="">Select Department</option>
                {departments.map(d => <option key={d._id} value={d.code}>{d.name}</option>)}
              </select>
              <select value={officialForm.role} onChange={e => setOfficialForm({ ...officialForm, role: e.target.value })} className="px-3 py-2 border rounded-lg">
                <option value="officer">Officer</option>
                <option value="department_head">Department Head</option>
              </select>
              <button type="submit" className="sm:col-span-2 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">Create</button>
            </form>
          )}

          {loading ? <p className="text-gray-400 text-center py-8">Loading…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Department</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {officials.map(o => (
                    <tr key={o._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{o.name}</td>
                      <td className="px-4 py-3 text-gray-600">{o.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          o.role === 'department_head' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {roleLabel[o.role] || o.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{o.departmentCode || o.department}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${o.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {o.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {o.isActive && o.role !== 'super_admin' && (
                          <button
                            onClick={() => handleDeleteOfficial(o)}
                            className="text-xs px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {officials.length === 0 && <p className="text-gray-400 text-center py-8">No officials yet</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Main Dashboard Component
export default function EnhancedAdminDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { admin, logout, isAuthenticated } = useAuthStore();
  const { addToast } = useToastStore();

  // Real-time notifications
  const {
    isConnected,
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  } = useSocket(admin?._id, admin?.role);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Verify session on mount to handle token expiry
  useEffect(() => {
    const verifySession = async () => {
      if (!isAuthenticated) return;
      try {
        await adminApi.getProfile();
      } catch (error) {
        if (error.response?.status === 401) {
          console.warn('Admin session expired. Logging out...');
          logout();
          navigate('/admin/login');
        }
      }
    };
    verifySession();
  }, [isAuthenticated, logout, navigate]);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [mapComplaints, setMapComplaints] = useState([]);
  const [selectedComplaints, setSelectedComplaints] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState('table');
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    priority: '',
    sla: '',
    startDate: '',
    endDate: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
    totalDocs: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const categories = ['roads', 'water', 'electricity', 'sanitation', 'public_safety', 'environment', 'transportation', 'healthcare', 'education', 'other'];
  const statuses = ['pending', 'assigned', 'in_progress', 'resolved', 'rejected', 'closed'];
  const priorities = ['low', 'medium', 'high', 'critical'];

  // Fetch data
  const fetchStats = useCallback(async () => {
    try {
      const result = await adminApi.getStats();
      if (result.success) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchComplaints = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        search: searchQuery,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '')),
      };

      const result = await adminApi.getComplaints(params);
      if (result.success) {
        setComplaints(result.data.complaints);
        setPagination(prev => ({
          ...prev,
          totalPages: result.data.pagination.totalPages,
          totalDocs: result.data.pagination.totalDocs,
        }));
      }
    } catch (error) {
      console.error('Error fetching complaints:', error);
      addToast(t('failed_to_fetch'), 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, searchQuery, addToast, t]);

  const fetchMapData = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''));
      const result = await adminApi.getMapData(params);
      if (result.success) {
        setMapComplaints(Array.isArray(result.data) ? result.data : result.data.complaints || []);
      }
    } catch (error) {
      console.error('Error fetching map data:', error);
    }
  }, [filters]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
    }
  }, [isAuthenticated, fetchStats]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchComplaints();
    }
  }, [isAuthenticated, fetchComplaints]);

  useEffect(() => {
    if (isAuthenticated && view === 'map') {
      fetchMapData();
    }
  }, [isAuthenticated, view, fetchMapData]);

  // Handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchStats(), fetchComplaints()]);
    setIsRefreshing(false);
    addToast(t('refreshed'), 'success');
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({
      status: '',
      category: '',
      priority: '',
      sla: '',
      startDate: '',
      endDate: '',
    });
  };

  const handleSelectComplaint = (id) => {
    setSelectedComplaints(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedComplaints.size === complaints.length) {
      setSelectedComplaints(new Set());
    } else {
      setSelectedComplaints(new Set(complaints.map(c => c._id)));
    }
  };

  const handleBulkAction = async (action) => {
    const ids = Array.from(selectedComplaints);
    try {
      // Implement bulk action API call
      addToast(`${t('bulk_action_success')}: ${action}`, 'success');
      setSelectedComplaints(new Set());
      fetchComplaints();
    } catch (error) {
      addToast(t('bulk_action_failed'), 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-primary-600 to-primary-700 rounded-xl flex items-center justify-center shadow-sm">
                  <span className="text-xl">🏛️</span>
                </div>
                <div className="hidden sm:block">
                  <span className="text-lg font-bold text-gray-900">{t('app_name')}</span>
                  <p className="text-xs text-gray-500">{t('admin_dashboard')}</p>
                </div>
              </Link>
            </div>

            <div className="flex items-center gap-4">
              {/* Notification Center */}
              <NotificationCenter
                notifications={notifications}
                unreadCount={unreadCount}
                onMarkAsRead={markAsRead}
                onMarkAllAsRead={markAllAsRead}
                onClear={clearNotifications}
                isConnected={isConnected}
              />

              <button
                onClick={handleRefresh}
                className={`p-2 hover:bg-gray-100 rounded-lg transition ${isRefreshing ? 'animate-spin' : ''}`}
                disabled={isRefreshing}
              >
                <ArrowPathIcon className="w-5 h-5 text-gray-600" />
              </button>

              <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-gray-200">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{admin?.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{admin?.role?.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                >
                  {t('logout')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              icon={ChartBarIcon}
              label={t('total_complaints')}
              value={stats.total || 0}
              color="primary"
              onClick={() => handleClearFilters()}
            />
            <StatCard
              icon={ClockIcon}
              label={t('pending')}
              value={stats.byStatus?.pending || 0}
              color="yellow"
              onClick={() => handleFilterChange('status', 'pending')}
            />
            <StatCard
              icon={UserGroupIcon}
              label={t('in_progress')}
              value={stats.byStatus?.in_progress || 0}
              color="blue"
              onClick={() => handleFilterChange('status', 'in_progress')}
            />
            <StatCard
              icon={CheckIcon}
              label={t('resolved')}
              value={stats.byStatus?.resolved || 0}
              color="green"
              onClick={() => handleFilterChange('status', 'resolved')}
            />
            <StatCard
              icon={ExclamationTriangleIcon}
              label={t('overdue')}
              value={stats.overdueCount || 0}
              color="red"
              onClick={() => handleFilterChange('sla', 'overdue')}
            />
            <StatCard
              icon={BellAlertIcon}
              label={t('today')}
              value={stats.todayCount || 0}
              color="purple"
            />
          </div>
        )}

        {/* Search & View Toggle */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_complaints')}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setView('table')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  view === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                <TableCellsIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setView('cards')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  view === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                <Squares2X2Icon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setView('map')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  view === 'map' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                <MapIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setView('manage')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  view === 'manage' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                <AdjustmentsHorizontalIcon className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => {
                if (!complaints.length) return;
                const headers = ['Complaint ID','Category','Status','Priority','Date','Location','Phone','Description'];
                const rows = complaints.map(c => [
                  c.complaintId,
                  c.category,
                  c.status,
                  c.priority || '',
                  new Date(c.createdAt).toLocaleDateString(),
                  (c.address?.fullAddress || c.location?.address || '').replace(/,/g, ' '),
                  c.user?.phoneNumber || '',
                  (c.description || '').replace(/[\n\r,]/g, ' '),
                ]);
                const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `complaints_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              title="Download CSV"
            >
              <DocumentArrowDownIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <FilterPanel
          filters={filters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
          categories={categories}
          statuses={statuses}
          priorities={priorities}
        />

        {/* Content */}
        {view === 'table' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={selectedComplaints.size === complaints.length && complaints.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Complaint ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('category')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('priority')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Deadline</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-12 text-center">
                        <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                      </td>
                    </tr>
                  ) : complaints.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-12 text-center text-gray-500">
                        {t('no_complaints_found')}
                      </td>
                    </tr>
                  ) : (
                    complaints.map((complaint) => (
                      <tr key={complaint._id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedComplaints.has(complaint._id)}
                            onChange={() => handleSelectComplaint(complaint._id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/admin/complaints/${complaint._id}`}
                            className="font-mono text-primary-600 hover:text-primary-700 font-medium"
                          >
                            {complaint.complaintId}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {complaint.category}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={complaint.status} />
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={complaint.priority} />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(complaint.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <SLATimer
                            createdAt={complaint.createdAt}
                            status={complaint.status}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            to={`/admin/complaints/${complaint._id}`}
                            className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                          >
                            {t('view')}
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  {t('showing')} {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.totalDocs)} {t('of')} {pagination.totalDocs}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('previous')}
                  </button>
                  <span className="text-sm text-gray-600">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('next')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {complaints.map((complaint) => (
              <Link
                key={complaint._id}
                to={`/admin/complaints/${complaint._id}`}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="font-mono text-primary-600 font-medium">
                    {complaint.complaintId}
                  </span>
                  <StatusBadge status={complaint.status} size="sm" />
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  {complaint.category}
                </p>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                  {complaint.address?.fullAddress || complaint.location?.address || complaint.description}
                </p>
                <div className="flex items-center justify-between">
                  <PriorityBadge priority={complaint.priority} />
                  <SLATimer createdAt={complaint.createdAt} status={complaint.status} />
                </div>
              </Link>
            ))}
          </div>
        )}

        {view === 'map' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="h-[600px] relative">
              <MapContainer
                center={[20.5937, 78.9629]}
                zoom={5}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapBoundsUpdater complaints={mapComplaints} />
                
                {mapComplaints.map((complaint) => {
                  const lat = complaint.coordinates?.lat ?? complaint.location?.coordinates?.[1];
                  const lng = complaint.coordinates?.lng ?? complaint.location?.coordinates?.[0];
                  if (lat == null || lng == null) return null;
                  const icon = markerIcons[complaint.status] || markerIcons.pending;
                  
                  return (
                    <Marker key={complaint._id || complaint.id} position={[lat, lng]} icon={icon}>
                      <Popup>
                        <div className="min-w-[200px] p-1">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-primary-600 font-medium text-sm">
                              {complaint.complaintId}
                            </span>
                            <StatusBadge status={complaint.status} size="sm" />
                          </div>
                          <p className="font-medium text-sm mb-1">
                            {complaint.category}
                          </p>
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2">
                            {complaint.address || 'N/A'}
                          </p>
                          <Link
                            to={`/admin/complaints/${complaint._id}`}
                            className="text-xs text-primary-600 hover:underline font-medium"
                          >
                            {t('view_details')} →
                          </Link>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>

              {/* Legend */}
              <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-3 z-[1000]">
                <p className="text-xs font-semibold text-gray-700 mb-2">{t('legend')}</p>
                <div className="space-y-1 text-xs">
                  {[
                    { status: 'pending', color: '🟠', label: t('status.pending') },
                    { status: 'in_progress', color: '🟡', label: t('status.in_progress') },
                    { status: 'resolved', color: '🟢', label: t('status.resolved') },
                    { status: 'rejected', color: '🔴', label: t('status.rejected') },
                  ].map(({ status, color, label }) => (
                    <div key={status} className="flex items-center gap-2">
                      <span>{color}</span>
                      <span className="text-gray-600">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === MANAGE PANEL (Departments, Officials) === */}
        {view === 'manage' && <ManagePanel />}
      </main>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedComplaints.size > 0 && (
          <BulkActionsBar
            selectedCount={selectedComplaints.size}
            onBulkAction={handleBulkAction}
            onClearSelection={() => setSelectedComplaints(new Set())}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
