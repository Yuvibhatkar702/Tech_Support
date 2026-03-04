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
  closed: createMarkerIcon('green'),
  rejected: createMarkerIcon('red'),
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
  
  if (['closed', 'rejected'].includes(status)) {
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
  const DEPT_FORM_INITIAL = {
    name: '', description: '',
    subcategories: [],
    priority: 'medium', isActive: true,
  };
  const [deptForm, setDeptForm] = useState(DEPT_FORM_INITIAL);
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [newSubcategory, setNewSubcategory] = useState('');
  const [newSubcategorySla, setNewSubcategorySla] = useState('3-5 Days');

  const SLA_OPTIONS = [
    'Same Day', '1 Day', '1-2 Days', '1-3 Days', '2-3 Days',
    '2-4 Days', '2-5 Days', '3-5 Days', '3-7 Days', '7-15 Days',
    '15-30 Days', '1 Month', '1-2 Months',
  ];

  // Official form
  const OFFICIAL_FORM_INITIAL = {
    name: '', email: '', phone: '', designation: '',
    employeeId: '', departmentCode: '', role: 'officer', isActive: true,
  };
  const [officialForm, setOfficialForm] = useState(OFFICIAL_FORM_INITIAL);
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
        addToast(res.message || 'Department created', 'success');
        setDeptForm(DEPT_FORM_INITIAL);
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
        addToast(`${officialForm.role === 'department_head' ? 'Department Head' : 'Officer'} created (default password: Pass@123)`, 'success');
        setOfficialForm(OFFICIAL_FORM_INITIAL);
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
            <form onSubmit={handleCreateDept} className="mb-6 p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-5">
              {/* Section: Department Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Department Info</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Department Name <span className="text-red-500">*</span></label>
                    <input value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} placeholder="e.g. Road Department (PWD)" required className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} placeholder="Brief description" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                  </div>
                </div>
              </div>

              {/* Section: Configuration */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Configuration</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Priority Level</label>
                    <select value={deptForm.priority} onChange={e => setDeptForm({ ...deptForm, priority: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                    <select value={deptForm.isActive} onChange={e => setDeptForm({ ...deptForm, isActive: e.target.value === 'true' })} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section: Subcategories with individual SLA */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                  Subcategories <span className="text-red-500">*</span>
                  <span className="text-xs font-normal text-gray-400 ml-2">({deptForm.subcategories.length} added)</span>
                </h3>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <input
                    value={newSubcategory}
                    onChange={e => setNewSubcategory(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = newSubcategory.trim();
                        if (val && !deptForm.subcategories.some(s => s.name === val)) {
                          setDeptForm(prev => ({ ...prev, subcategories: [...prev.subcategories, { name: val, sla: newSubcategorySla }] }));
                          setNewSubcategory('');
                        }
                      }
                    }}
                    placeholder="Subcategory name"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <select
                    value={newSubcategorySla}
                    onChange={e => setNewSubcategorySla(e.target.value)}
                    className="w-full sm:w-40 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    {SLA_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const val = newSubcategory.trim();
                      if (val && !deptForm.subcategories.some(s => s.name === val)) {
                        setDeptForm(prev => ({ ...prev, subcategories: [...prev.subcategories, { name: val, sla: newSubcategorySla }] }));
                        setNewSubcategory('');
                      }
                    }}
                    className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition font-medium whitespace-nowrap"
                  >
                    + Add
                  </button>
                </div>
                {deptForm.subcategories.length > 0 ? (
                  <div className="space-y-1.5">
                    {deptForm.subcategories.map((sub, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg">
                        <span className="text-sm font-medium text-gray-700">{sub.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">SLA: {sub.sla}</span>
                          <button
                            type="button"
                            onClick={() => setDeptForm(prev => ({ ...prev, subcategories: prev.subcategories.filter((_, i) => i !== idx) }))}
                            className="text-gray-400 hover:text-red-500 transition text-lg leading-none"
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-red-500">Add at least one subcategory</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={deptForm.subcategories.length === 0}
                className="w-full py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Department
              </button>
            </form>
          )}

          {loading ? <p className="text-gray-400 text-center py-8">Loading…</p> : (
            <div className="space-y-2">
              {departments.map(d => (
                <div key={d._id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{d.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{d.code}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {d.priority && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          d.priority === 'critical' ? 'bg-red-100 text-red-700' :
                          d.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                          d.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {d.priority}
                        </span>
                      )}
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
                  {/* Subcategories table */}
                  {d.supportedCategories && d.supportedCategories.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-100 text-gray-600">
                            <th className="px-3 py-1.5 text-left font-semibold w-10">#</th>
                            <th className="px-3 py-1.5 text-left font-semibold">Sub Category</th>
                            <th className="px-3 py-1.5 text-right font-semibold w-32">SLA Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.supportedCategories.map((cat, i) => (
                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                              <td className="px-3 py-1.5 text-gray-700 font-medium">{typeof cat === 'object' ? cat.name : cat}</td>
                              <td className="px-3 py-1.5 text-right">
                                <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium">
                                  {typeof cat === 'object' && cat.sla ? cat.sla : '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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
            <form onSubmit={handleCreateOfficial} className="mb-6 p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-5">
              {/* Section: Personal Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Personal Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Full Name <span className="text-red-500">*</span></label>
                    <input value={officialForm.name} onChange={e => setOfficialForm({ ...officialForm, name: e.target.value })} placeholder="Full Name" required className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-500">*</span></label>
                    <input type="email" value={officialForm.email} onChange={e => setOfficialForm({ ...officialForm, email: e.target.value })} placeholder="email@example.com" required className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number <span className="text-red-500">*</span></label>
                    <input value={officialForm.phone} onChange={e => setOfficialForm({ ...officialForm, phone: e.target.value.replace(/\D/g, '') })} placeholder="10-digit number" required maxLength={10} className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Designation <span className="text-red-500">*</span></label>
                    <input value={officialForm.designation} onChange={e => setOfficialForm({ ...officialForm, designation: e.target.value })} placeholder="e.g. Executive Engineer" required className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Employee ID <span className="text-gray-400">(optional)</span></label>
                    <input value={officialForm.employeeId} onChange={e => setOfficialForm({ ...officialForm, employeeId: e.target.value })} placeholder="e.g. EMP-001" className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
                  </div>
                </div>
              </div>

              {/* Section: Assignment & Role */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Department & Role</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Select Department <span className="text-red-500">*</span></label>
                    <select value={officialForm.departmentCode} onChange={e => setOfficialForm({ ...officialForm, departmentCode: e.target.value })} required className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                      <option value="">Select Department</option>
                      {departments.map(d => <option key={d._id} value={d.code}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Role <span className="text-red-500">*</span></label>
                    <div className="flex gap-4 mt-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="officialRole" value="department_head" checked={officialForm.role === 'department_head'} onChange={e => setOfficialForm({ ...officialForm, role: e.target.value })} className="text-primary-600 focus:ring-primary-500" />
                        <span className="text-sm text-gray-700">Department Head</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="officialRole" value="officer" checked={officialForm.role === 'officer'} onChange={e => setOfficialForm({ ...officialForm, role: e.target.value })} className="text-primary-600 focus:ring-primary-500" />
                        <span className="text-sm text-gray-700">Officer</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Status */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Status</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="officialStatus" value="true" checked={officialForm.isActive === true} onChange={() => setOfficialForm({ ...officialForm, isActive: true })} className="text-green-600 focus:ring-green-500" />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="officialStatus" value="false" checked={officialForm.isActive === false} onChange={() => setOfficialForm({ ...officialForm, isActive: false })} className="text-red-600 focus:ring-red-500" />
                    <span className="text-sm text-gray-700">Inactive</span>
                  </label>
                </div>
              </div>

              <p className="text-xs text-amber-600">Default login password: <span className="font-mono font-bold">Pass@123</span></p>

              <button type="submit" className="w-full py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold">Create {officialForm.role === 'department_head' ? 'Department Head' : 'Officer'}</button>
            </form>
          )}

          {loading ? <p className="text-gray-400 text-center py-8">Loading…</p> : (() => {
            // Group officials by department, heads first
            const grouped = {};
            officials.forEach(o => {
              const deptKey = o.departmentCode || o.department || 'unassigned';
              if (!grouped[deptKey]) grouped[deptKey] = { heads: [], officers: [] };
              if (o.role === 'department_head') grouped[deptKey].heads.push(o);
              else grouped[deptKey].officers.push(o);
            });
            const deptNames = {};
            departments.forEach(d => { deptNames[d.code] = d.name; });

            return Object.keys(grouped).length === 0 ? (
              <p className="text-gray-400 text-center py-8">No officials yet</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(grouped).map(([deptCode, group]) => (
                  <div key={deptCode} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Department header */}
                    <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-sm">{deptNames[deptCode] || deptCode}</h3>
                        <p className="text-xs text-gray-500 font-mono">{deptCode}</p>
                      </div>
                      <span className="text-xs text-gray-500 font-medium">{group.heads.length + group.officers.length} member{group.heads.length + group.officers.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Department Head(s) */}
                    {group.heads.map(h => (
                      <div key={h._id} className="px-4 py-3 bg-purple-50 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                            {h.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 text-sm">{h.name}</p>
                            <p className="text-xs text-gray-500">{h.designation || 'Department Head'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="hidden sm:inline text-gray-500">{h.email}</span>
                          <span className="hidden sm:inline text-gray-400">|</span>
                          <span className="hidden sm:inline text-gray-500">{h.phone || '—'}</span>
                          <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">Head</span>
                          <span className={`px-2 py-0.5 rounded-full ${h.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {h.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {h.isActive && (
                            <button onClick={() => handleDeleteOfficial(h)} className="px-2 py-0.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium">Remove</button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Officers */}
                    {group.officers.length > 0 && (
                      <div className="divide-y divide-gray-100">
                        {group.officers.map((o, idx) => (
                          <div key={o._id} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                                {idx + 1}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{o.name}</p>
                                <p className="text-xs text-gray-500">{o.designation || 'Officer'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="hidden sm:inline text-gray-500">{o.email}</span>
                              <span className="hidden sm:inline text-gray-400">|</span>
                              <span className="hidden sm:inline text-gray-500">{o.phone || '—'}</span>
                              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Officer</span>
                              <span className={`px-2 py-0.5 rounded-full ${o.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {o.isActive ? 'Active' : 'Inactive'}
                              </span>
                              {o.isActive && (
                                <button onClick={() => handleDeleteOfficial(o)} className="px-2 py-0.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium">Remove</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {group.heads.length === 0 && group.officers.length === 0 && (
                      <p className="text-gray-400 text-center py-4 text-xs">No officials assigned</p>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
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
          navigate('/official-login');
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
  const statuses = ['pending', 'assigned', 'in_progress', 'closed', 'rejected'];
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

  const handleLogout = () => {
    logout();
    navigate('/official-login');
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
              label={t('closed')}
              value={stats.byStatus?.closed || 0}
              color="green"
              onClick={() => handleFilterChange('status', 'closed')}
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
                      <td colSpan="7" className="px-4 py-12 text-center">
                        <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
                      </td>
                    </tr>
                  ) : complaints.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-12 text-center text-gray-500">
                        {t('no_complaints_found')}
                      </td>
                    </tr>
                  ) : (
                    complaints.map((complaint) => (
                      <tr key={complaint._id} className="hover:bg-gray-50 transition">
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

        {/* === MANAGE PANEL (Departments, Officials) === */}
        {view === 'manage' && <ManagePanel />}
      </main>

    </div>
  );
}
