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
import { adminApi, departmentApi, officialApi, collegeApi } from '../services/api';
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
function SLATimer({ createdAt, slaHours = 24, status }) {
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
function FilterPanel({ filters, onChange, onClear, categories, statuses, priorities, departments }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  // Filter categories based on selected department
  const filteredCategories = useMemo(() => {
    if (!filters.department) return categories;
    const dept = departments.find(d => d.code === filters.department);
    if (!dept) return categories;
    return (dept.supportedCategories || []).map(sc => sc.name).sort();
  }, [filters.department, departments, categories]);

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
                value={filters.department}
                onChange={(e) => onChange('department', e.target.value)}
                className="text-sm rounded-lg"
              >
                <option value="">All Departments</option>
                {departments.map(d => (
                  <option key={d.code} value={d.code}>{d.name}</option>
                ))}
              </select>

              <select
                value={filters.category}
                onChange={(e) => onChange('category', e.target.value)}
                className="text-sm rounded-lg"
              >
                <option value="">{t('all_categories')}</option>
                {filteredCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
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
function ManagePanel({ onDepartmentChange }) {
  const { addToast } = useToastStore();
  const [departments, setDepartments] = useState([]);
  const [officials, setOfficials] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [activeSection, setActiveSection] = useState('colleges');
  const [loading, setLoading] = useState(true);
  const [collegeSearch, setCollegeSearch] = useState('');

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
    name: '', email: '', role: 'developer', isActive: true,
  };
  const [officialForm, setOfficialForm] = useState(OFFICIAL_FORM_INITIAL);
  const [showOfficialForm, setShowOfficialForm] = useState(false);

  // College form
  const COLLEGE_FORM_INITIAL = { name: '', city: '' };
  const [collegeForm, setCollegeForm] = useState(COLLEGE_FORM_INITIAL);
  const [newCollegeFaculty, setNewCollegeFaculty] = useState({ name: '', number: '' });
  const [collegeFacultyDraft, setCollegeFacultyDraft] = useState([]);
  const [showCollegeForm, setShowCollegeForm] = useState(false);

  // Faculty form
  const FACULTY_FORM_INITIAL = { name: '', number: '' };
  const [facultyForm, setFacultyForm] = useState(FACULTY_FORM_INITIAL);
  const [showFacultyForm, setShowFacultyForm] = useState(false);
  const [selectedFacultyCollege, setSelectedFacultyCollege] = useState(null);
  const [editingFacultyId, setEditingFacultyId] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [deptRes, officialRes, collegeRes] = await Promise.all([
        departmentApi.getAll(),
        officialApi.getAllOfficials(),
        collegeApi.getAll(),
      ]);
      if (deptRes.success) setDepartments(deptRes.data);
      if (officialRes.success) setOfficials(officialRes.data);
      if (collegeRes.success) setColleges(collegeRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!selectedFacultyCollege?._id) return;
    const latest = colleges.find((c) => c._id === selectedFacultyCollege._id);
    if (latest) {
      setSelectedFacultyCollege(latest);
    }
  }, [colleges, selectedFacultyCollege?._id]);

  const handleCreateDept = async (e) => {
    e.preventDefault();
    try {
      const res = await departmentApi.create(deptForm);
      if (res.success) {
        addToast(res.message || 'Department created', 'success');
        setDeptForm(DEPT_FORM_INITIAL);
        setShowDeptForm(false);
        fetchData();
        onDepartmentChange?.();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleCreateOfficial = async (e) => {
    e.preventDefault();
    try {
      const res = await officialApi.createOfficer({
        ...officialForm,
        designation: officialForm.role === 'support' ? 'Support Engineer' : 'Developer',
        departmentCode: officialForm.role,
        department: officialForm.role,
      });
      if (res.success) {
        addToast(`${officialForm.role === 'support' ? 'Support' : 'Developer'} created (default password: Pass@123)`, 'success');
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
        onDepartmentChange?.();
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

  // College handlers
  const handleAddFacultyToDraft = () => {
    const name = String(newCollegeFaculty.name || '').trim();
    const number = String(newCollegeFaculty.number || '').replace(/\D/g, '').slice(0, 10);

    if (!name || !/^[0-9]{10}$/.test(number)) {
      addToast('Enter faculty name and valid 10-digit number', 'error');
      return;
    }

    const duplicate = collegeFacultyDraft.some(
      (f) => f.name.toLowerCase() === name.toLowerCase() && f.number === number
    );
    if (duplicate) {
      addToast('Faculty already added in list', 'error');
      return;
    }

    setCollegeFacultyDraft((prev) => [...prev, { name, number }]);
    setNewCollegeFaculty({ name: '', number: '' });
  };

  const handleRemoveFacultyFromDraft = (idx) => {
    setCollegeFacultyDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateCollege = async (e) => {
    e.preventDefault();
    try {
      const draftName = String(newCollegeFaculty.name || '').trim();
      const draftNumber = String(newCollegeFaculty.number || '').replace(/\D/g, '').slice(0, 10);
      if (draftName || draftNumber) {
        addToast('Click "Add Faculty" to include the typed faculty entry', 'warning');
        return;
      }

      const payload = {
        name: collegeForm.name,
        city: collegeForm.city,
        faculty: collegeFacultyDraft,
      };

      const res = await collegeApi.create(payload);
      if (res.success) {
        addToast(`College created with code: ${res.data.code}`, 'success');
        setCollegeForm(COLLEGE_FORM_INITIAL);
        setNewCollegeFaculty({ name: '', number: '' });
        setCollegeFacultyDraft([]);
        setShowCollegeForm(false);
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to create college', 'error');
    }
  };

  const handleDeleteCollege = async (college) => {
    if (!window.confirm(`Are you sure you want to deactivate "${college.name}"?`)) return;
    try {
      const res = await collegeApi.delete(college._id);
      if (res.success) {
        addToast('College deactivated', 'success');
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to deactivate college', 'error');
    }
  };

  const handleGenerateCode = async (college) => {
    try {
      const res = await collegeApi.generateCode(college._id);
      if (res.success) {
        addToast(`Generated code: ${res.data.code}`, 'success');
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to generate code', 'error');
    }
  };

  const handleOpenFacultyForm = (college) => {
    setSelectedFacultyCollege(college);
    setFacultyForm(FACULTY_FORM_INITIAL);
    setEditingFacultyId('');
    setShowFacultyForm(true);
  };

  const handleEditFaculty = (faculty) => {
    setEditingFacultyId(String(faculty._id));
    setFacultyForm({
      name: faculty.name || '',
      number: String(faculty.number || '').replace(/\D/g, '').slice(0, 10),
    });
  };

  const handleRemoveFaculty = async (faculty) => {
    if (!selectedFacultyCollege?._id || !faculty?._id) return;
    if (!window.confirm(`Remove faculty "${faculty.name}"?`)) return;

    try {
      const res = await collegeApi.removeFaculty(selectedFacultyCollege._id, faculty._id);
      if (res.success) {
        addToast('Faculty removed successfully', 'success');
        if (editingFacultyId && String(faculty._id) === editingFacultyId) {
          setEditingFacultyId('');
          setFacultyForm(FACULTY_FORM_INITIAL);
        }
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to remove faculty', 'error');
    }
  };

  const handleAddFaculty = async (e) => {
    e.preventDefault();
    if (!selectedFacultyCollege?._id) return;

    const cleanedNumber = String(facultyForm.number || '').replace(/\D/g, '').slice(0, 10);
    if (!facultyForm.name.trim() || !/^[0-9]{10}$/.test(cleanedNumber)) {
      addToast('Please enter faculty name and valid 10-digit number', 'error');
      return;
    }

    try {
      const payload = {
        name: facultyForm.name.trim(),
        number: cleanedNumber,
      };
      const res = editingFacultyId
        ? await collegeApi.updateFaculty(selectedFacultyCollege._id, editingFacultyId, payload)
        : await collegeApi.addFaculty(selectedFacultyCollege._id, payload);

      if (res.success) {
        addToast(editingFacultyId ? 'Faculty updated successfully' : 'Faculty added successfully', 'success');
        setEditingFacultyId('');
        setFacultyForm(FACULTY_FORM_INITIAL);
        fetchData();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to save faculty', 'error');
    }
  };

  // Filter colleges by search
  const filteredColleges = colleges.filter(c => 
    c.name.toLowerCase().includes(collegeSearch.toLowerCase()) ||
    c.city.toLowerCase().includes(collegeSearch.toLowerCase()) ||
    c.code?.toLowerCase().includes(collegeSearch.toLowerCase())
  );

  const roleLabel = { support: 'Support', developer: 'Developer' };

  return (
    <div className="space-y-6">
      {/* Section Tabs */}
      <div className="flex gap-2">
        {[{ key: 'colleges', label: 'Colleges' }, { key: 'officials', label: 'Officials' }].map(s => (
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

      {/* Colleges Section */}
      {activeSection === 'colleges' && (
        <div className="bg-white rounded-2xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Colleges ({colleges.length})</h2>
            <button onClick={() => {
              if (showCollegeForm) {
                setCollegeForm(COLLEGE_FORM_INITIAL);
                setNewCollegeFaculty({ name: '', number: '' });
                setCollegeFacultyDraft([]);
              }
              setShowCollegeForm(!showCollegeForm);
            }} className="px-4 py-2 bg-primary-600 text-white text-sm rounded-xl hover:bg-primary-700 transition">
              {showCollegeForm ? 'Cancel' : '+ Add College'}
            </button>
          </div>

          {/* College Form */}
          {showCollegeForm && (
            <form onSubmit={handleCreateCollege} className="mb-6 p-5 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">College Name <span className="text-red-500">*</span></label>
                  <input 
                    value={collegeForm.name} 
                    onChange={e => setCollegeForm({ ...collegeForm, name: e.target.value })} 
                    placeholder="e.g. ABC Engineering College" 
                    required 
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City <span className="text-red-500">*</span></label>
                  <input 
                    value={collegeForm.city} 
                    onChange={e => setCollegeForm({ ...collegeForm, city: e.target.value })} 
                    placeholder="e.g. Amravati" 
                    required 
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Faculty Name (Optional)</label>
                  <input
                    value={newCollegeFaculty.name}
                    onChange={e => setNewCollegeFaculty({ ...newCollegeFaculty, name: e.target.value })}
                    placeholder="e.g. John Smith"
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Faculty Number (Optional)</label>
                  <input
                    type="tel"
                    value={newCollegeFaculty.number}
                    onChange={e => setNewCollegeFaculty({ ...newCollegeFaculty, number: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    placeholder="e.g. 9876543210"
                    maxLength={10}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddFacultyToDraft}
                    className="px-3 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                  >
                    + Add Faculty
                  </button>
                </div>
              </div>

              {collegeFacultyDraft.length > 0 && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-xs font-semibold text-indigo-900 mb-2">Faculty to be added ({collegeFacultyDraft.length})</p>
                  <div className="space-y-2">
                    {collegeFacultyDraft.map((f, idx) => (
                      <div key={`${f.name}-${f.number}-${idx}`} className="flex items-center justify-between gap-2 bg-white border border-indigo-100 rounded px-2 py-1.5">
                        <p className="text-xs text-gray-700">{f.name} - {f.number}</p>
                        <button
                          type="button"
                          onClick={() => handleRemoveFacultyFromDraft(idx)}
                          className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">A unique college code will be automatically generated upon creation.</p>
              </div>
              <button type="submit" className="w-full py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold">
                Create College
              </button>
            </form>
          )}

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by name, city, or code..."
              value={collegeSearch}
              onChange={e => setCollegeSearch(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {showFacultyForm && selectedFacultyCollege && (
            <form onSubmit={handleAddFaculty} className="mb-6 p-5 bg-indigo-50 rounded-xl border border-indigo-200 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-indigo-900">Manage Faculty</h3>
                  <p className="text-xs text-indigo-700">
                    {selectedFacultyCollege.name} ({selectedFacultyCollege.code || 'No Code'})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowFacultyForm(false);
                    setSelectedFacultyCollege(null);
                    setEditingFacultyId('');
                    setFacultyForm(FACULTY_FORM_INITIAL);
                  }}
                  className="text-xs px-2 py-1 bg-white border border-indigo-200 text-indigo-700 rounded hover:bg-indigo-100"
                >
                  Cancel
                </button>
              </div>

              <div className="rounded-lg border border-indigo-200 bg-white p-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Existing Faculty</p>
                {(selectedFacultyCollege.faculty || []).filter((f) => f.isActive !== false).length === 0 ? (
                  <p className="text-xs text-gray-500">No faculty added yet.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-auto pr-1">
                    {(selectedFacultyCollege.faculty || [])
                      .filter((f) => f.isActive !== false)
                      .map((f) => (
                        <div key={f._id} className="flex items-center justify-between gap-2 border border-gray-200 rounded px-2 py-1.5">
                          <p className="text-xs text-gray-700">{f.name} - {f.number}</p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditFaculty(f)}
                              className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded hover:bg-amber-100"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFaculty(f)}
                              className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Faculty Name <span className="text-red-500">*</span></label>
                  <input
                    value={facultyForm.name}
                    onChange={(e) => setFacultyForm({ ...facultyForm, name: e.target.value })}
                    placeholder="e.g. John Smith"
                    required
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Faculty Number <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={facultyForm.number}
                    onChange={(e) => setFacultyForm({ ...facultyForm, number: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                    placeholder="e.g. 9876543210"
                    maxLength={10}
                    required
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="submit" className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-semibold">
                  {editingFacultyId ? 'Update Faculty' : 'Add Faculty'}
                </button>
                {editingFacultyId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFacultyId('');
                      setFacultyForm(FACULTY_FORM_INITIAL);
                    }}
                    className="px-3 py-2.5 text-xs bg-white border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-100"
                  >
                    Clear Edit
                  </button>
                )}
              </div>
              <button type="button" onClick={fetchData} className="w-full py-2 text-xs bg-white border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 transition">
                Refresh Faculty List
              </button>
            </form>
          )}

          {/* College List */}
          {loading ? <p className="text-gray-400 text-center py-8">Loading…</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b">
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Code</th>
                    <th className="px-3 py-2 text-left font-semibold">College Name</th>
                    <th className="px-3 py-2 text-left font-semibold">City</th>
                    <th className="px-3 py-2 text-center font-semibold">Faculty</th>
                    <th className="px-3 py-2 text-center font-semibold">Status</th>
                    <th className="px-3 py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredColleges.map((college, idx) => (
                    <tr key={college._id} className="hover:bg-gray-50 transition">
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2">
                        {college.code ? (
                          <span className="font-mono text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">{college.code}</span>
                        ) : (
                          <button 
                            onClick={() => handleGenerateCode(college)}
                            className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition"
                          >
                            Generate Code
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-900">{college.name}</td>
                      <td className="px-3 py-2 text-gray-600">{college.city}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          {(college.faculty || []).filter((f) => f.isActive !== false).length}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${college.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {college.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {college.isActive && (
                            <button
                              onClick={() => handleOpenFacultyForm(college)}
                              className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition"
                            >
                              Manage Faculty
                            </button>
                          )}
                          {college.isActive && (
                            <button 
                              onClick={() => handleDeleteCollege(college)}
                              className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition"
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredColleges.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                        {collegeSearch ? 'No colleges match your search' : 'No colleges added yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                </div>
              </div>

              {/* Section: Role */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Role</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="officialRole" value="support" checked={officialForm.role === 'support'} onChange={e => setOfficialForm({ ...officialForm, role: e.target.value })} className="text-primary-600 focus:ring-primary-500" />
                    <span className="text-sm text-gray-700">Support</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="officialRole" value="developer" checked={officialForm.role === 'developer'} onChange={e => setOfficialForm({ ...officialForm, role: e.target.value })} className="text-primary-600 focus:ring-primary-500" />
                    <span className="text-sm text-gray-700">Developer</span>
                  </label>
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

              <button type="submit" className="w-full py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold">Create {officialForm.role === 'support' ? 'Support' : 'Developer'}</button>
            </form>
          )}

          {loading ? <p className="text-gray-400 text-center py-8">Loading…</p> : (() => {
            // Group officials by department, heads first
            const grouped = {};
            officials.forEach(o => {
              const deptKey = o.departmentCode || o.department || 'unassigned';
              if (!grouped[deptKey]) grouped[deptKey] = { officers: [] };
              grouped[deptKey].officers.push(o);
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
                      <span className="text-xs text-gray-500 font-medium">{group.officers.length} member{group.officers.length !== 1 ? 's' : ''}</span>
                    </div>

                    {/* Team Members */}
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
                                <p className="text-xs text-gray-500">{o.designation || (o.role === 'support' ? 'Support Engineer' : 'Developer')}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="hidden sm:inline text-gray-500">{o.email}</span>
                              <span className="hidden sm:inline text-gray-400">|</span>
                              <span className="hidden sm:inline text-gray-500">{o.phone || '—'}</span>
                              <span className={`px-2 py-0.5 rounded-full font-medium ${o.role === 'support' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{o.role === 'support' ? 'Support' : 'Developer'}</span>
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

                    {group.officers.length === 0 && (
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
    department: '',
    category: '',
    priority: '',
    startDate: '',
    endDate: '',
    sla: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
    totalDocs: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashDepartments, setDashDepartments] = useState([]);

  // Assign modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignComplaintId, setAssignComplaintId] = useState(null);
  const [allOfficials, setAllOfficials] = useState([]);
  const [selectedOfficialId, setSelectedOfficialId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [isClosing, setIsClosing] = useState(null); // holds complaint _id while closing
  const [expandedHistory, setExpandedHistory] = useState({}); // track expanded assignment history rows

  // Password change modal state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Build categories dynamically from departments' supportedCategories + AI categories
  const categories = useMemo(() => {
    const catSet = new Set();
    // From departments
    dashDepartments.forEach(dept => {
      (dept.supportedCategories || []).forEach(sc => {
        if (sc.name) catSet.add(sc.name);
      });
    });
    // AI-predicted categories (always include these)
    ['Damaged Road Issue', 'Garbage and Trash Issue', 'Street Light Issue', 'Fallen Trees', 'Illegal Drawing on Walls', 'Other'].forEach(c => catSet.add(c));
    return Array.from(catSet).sort();
  }, [dashDepartments]);
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

  const fetchDashDepartments = useCallback(async () => {
    try {
      const result = await departmentApi.getAll();
      if (result.success) {
        setDashDepartments(result.data);
      }
    } catch (error) {
      console.error('Error fetching departments for filters:', error);
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
      fetchDashDepartments();
    }
  }, [isAuthenticated, fetchStats, fetchDashDepartments]);

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
    // When setting sla filter, clear status filter and vice versa
    if (key === 'sla') {
      setFilters(prev => ({ ...prev, status: '', sla: value }));
    } else if (key === 'status') {
      setFilters(prev => ({ ...prev, sla: '', status: value }));
    } else {
      setFilters(prev => ({ ...prev, [key]: value }));
    }
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleClearFilters = () => {
    setFilters({
      status: '',
      department: '',
      category: '',
      priority: '',
      startDate: '',
      endDate: '',
      sla: '',
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/official-login');
  };

  // Password change handler
  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      addToast('Please fill all fields', 'error');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast('New passwords do not match', 'error');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      addToast('Password must be at least 8 characters', 'error');
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await adminApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      if (res.success) {
        addToast('Password changed successfully', 'success');
        setPasswordModalOpen(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to change password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ─── Priority change handler ──────────────────────────────────────
  const handlePriorityChange = async (complaintId, newPriority) => {
    try {
      const res = await adminApi.updateComplaint(complaintId, { priority: newPriority });
      if (res.success) {
        addToast(`Priority set to ${newPriority}`, 'success');
        fetchComplaints();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to update priority', 'error');
    }
  };

  // ─── Assign / Close handlers ──────────────────────────────────────
  const openAssignModal = async (complaintId) => {
    setAssignComplaintId(complaintId);
    setSelectedOfficialId('');
    setAssignModalOpen(true);
    try {
      const res = await adminApi.getOfficials();
      if (res.success) setAllOfficials(res.data);
    } catch (err) {
      addToast('Failed to load officials', 'error');
    }
  };

  const handleAssign = async () => {
    if (!selectedOfficialId) {
      addToast('Select an official to assign', 'error');
      return;
    }
    setIsAssigning(true);
    try {
      const res = await adminApi.assignComplaint(assignComplaintId, selectedOfficialId);
      if (res.success) {
        addToast(res.message || 'Assigned successfully', 'success');
        setAssignModalOpen(false);
        fetchComplaints();
        fetchStats();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Assignment failed', 'error');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleClose = async (complaintId) => {
    if (!window.confirm('Are you sure you want to close this ticket?')) return;
    setIsClosing(complaintId);
    try {
      const res = await adminApi.updateComplaint(complaintId, { status: 'closed', remarks: 'Closed by Admin' });
      if (res.success) {
        addToast('Ticket closed', 'success');
        fetchComplaints();
        fetchStats();
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to close ticket', 'error');
    } finally {
      setIsClosing(null);
    }
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
                  <p className="text-sm font-medium text-gray-900">{admin?.name || 'Admin'}</p>
                  <p className="text-xs text-gray-500 capitalize">{admin?.role?.replace('_', ' ') || 'Super Admin'}</p>
                </div>
                <button
                  onClick={() => setPasswordModalOpen(true)}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition"
                  title="Change Password"
                >
                  🔑
                </button>
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
              label={t('assigned', 'Assigned')}
              value={stats.byStatus?.assigned || 0}
              color="indigo"
              onClick={() => handleFilterChange('status', 'assigned')}
            />
            <StatCard
              icon={ArrowPathIcon}
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
                const headers = ['Ticket ID','Category','Status','Priority','Date','Location','Phone','Description'];
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
                a.download = `tickets_${new Date().toISOString().slice(0,10)}.csv`;
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

        {/* Content */}
        {view === 'table' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ticket ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('category')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{t('priority')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Assigned To</th>
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
                          <select
                            value={complaint.priority || 'medium'}
                            onChange={(e) => handlePriorityChange(complaint._id, e.target.value)}
                            className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer focus:ring-2 focus:ring-primary-500 ${
                              complaint.priority === 'critical' ? 'bg-purple-100 text-purple-700' :
                              complaint.priority === 'high' ? 'bg-red-100 text-red-700' :
                              complaint.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {complaint.assignedTo?.name || <span className="text-gray-400">Unassigned</span>}
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
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/admin/complaints/${complaint._id}`}
                              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                            >
                              {t('view')}
                            </Link>
                            {!['closed', 'rejected'].includes(complaint.status) && (
                              <>
                                <button
                                  onClick={() => openAssignModal(complaint._id)}
                                  className="px-2 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                                >
                                  Assign
                                </button>
                                <button
                                  onClick={() => handleClose(complaint._id)}
                                  disabled={isClosing === complaint._id}
                                  className="px-2 py-1 text-xs font-medium rounded bg-green-50 text-green-700 hover:bg-green-100 transition disabled:opacity-50"
                                >
                                  {isClosing === complaint._id ? '...' : 'Close'}
                                </button>
                              </>
                            )}
                          </div>
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
        {view === 'manage' && <ManagePanel onDepartmentChange={fetchDashDepartments} />}
      </main>

      {/* ── Assign Modal ───────────────────────────────────── */}
      {assignModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Assign Ticket</h2>
              <button onClick={() => setAssignModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Select a Support Engineer or Developer to assign this ticket to:</p>
            <select
              value={selectedOfficialId}
              onChange={(e) => setSelectedOfficialId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 mb-4"
            >
              <option value="">-- Select Official --</option>
              {allOfficials
                .filter(o => ['developer', 'support'].includes(o.role) && o.isActive !== false)
                .map(o => {
                  const activeCount = complaints.filter(c =>
                    c.assignedTo?._id === o._id && !['closed', 'rejected'].includes(c.status)
                  ).length;
                  return (
                    <option key={o._id} value={o._id}>
                      {o.name} ({o.role === 'support' ? 'Support' : 'Developer'}) — {activeCount} active
                    </option>
                  );
                })
              }
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setAssignModalOpen(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={isAssigning || !selectedOfficialId}
                className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition disabled:opacity-50"
              >
                {isAssigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Password Change Modal ───────────────────────────────────── */}
      {passwordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
              <button onClick={() => setPasswordModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter new password (min 8 chars)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setPasswordModalOpen(false); setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleChangePassword}
                disabled={isChangingPassword}
                className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition disabled:opacity-50"
              >
                {isChangingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
