import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore, useToastStore } from '../store';
import { adminApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { StatsSkeleton, TableSkeleton, MapSkeleton } from '../components/Skeletons';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const createMarkerIcon = (color) => new L.Icon({
  iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const markerIcons = {
  pending: createMarkerIcon('orange'),
  assigned: createMarkerIcon('blue'),
  in_progress: createMarkerIcon('yellow'),
  closed: createMarkerIcon('green'),
  rejected: createMarkerIcon('red'),
};

function MapBoundsUpdater({ complaints }) {
  const map = useMap();
  useEffect(() => {
    if (complaints.length > 0) {
      const bounds = complaints.filter(c => c.location?.coordinates).map(c => [c.location.coordinates[1], c.location.coordinates[0]]);
      if (bounds.length > 0) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13 });
    }
  }, [complaints, map]);
  return null;
}

// SLA Timer Component
function SLATimer({ createdAt, status, priority }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    const slaHours = priority === 'critical' ? 4 : priority === 'high' ? 12 : priority === 'medium' ? 24 : 48;
    const deadline = new Date(createdAt).getTime() + slaHours * 60 * 60 * 1000;

    const updateTimer = () => {
      if (['closed', 'rejected'].includes(status)) {
        setTimeLeft('Closed');
        return;
      }

      const now = Date.now();
      const diff = deadline - now;

      if (diff <= 0) {
        setIsOverdue(true);
        const overdue = Math.abs(diff);
        const hours = Math.floor(overdue / (1000 * 60 * 60));
        setTimeLeft(`${hours}h overdue`);
      } else {
        setIsOverdue(false);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [createdAt, status, priority]);

  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
      isOverdue ? 'bg-red-100 text-red-700 animate-pulse' : 
      timeLeft === 'Closed' ? 'bg-gray-100 text-gray-600' :
      'bg-blue-100 text-blue-700'
    }`}>
      {isOverdue ? '⚠️ ' : '⏱️ '}{timeLeft}
    </span>
  );
}

export default function AdminDashboardV2() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { admin, logout, isAuthenticated } = useAuthStore();
  const { addToast } = useToastStore();

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [mapComplaints, setMapComplaints] = useState([]);
  const [filters, setFilters] = useState({ status: '', category: '', priority: '', startDate: '', endDate: '', search: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, totalPages: 1, totalDocs: 0 });
  const [view, setView] = useState('list');
  const [selectedComplaints, setSelectedComplaints] = useState([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]);
  const [mapCenter] = useState([20.5937, 78.9629]);

  useEffect(() => {
    if (!isAuthenticated) navigate('/official-login');
  }, [isAuthenticated, navigate]);

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

  const fetchStats = useCallback(async () => {
    try {
      const result = await adminApi.getStats();
      if (result.success) setStats(result.data);
    } catch (error) { console.error('Stats error:', error); }
  }, []);

  const fetchComplaints = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = { page: pagination.page, limit: pagination.limit, ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '')) };
      const result = await adminApi.getComplaints(params);
      if (result.success) {
        setComplaints(result.data.complaints);
        setPagination(prev => ({ ...prev, totalPages: result.data.pagination.totalPages, totalDocs: result.data.pagination.totalDocs }));
      }
    } catch (error) { addToast('Failed to fetch complaints', 'error'); }
    finally { setIsLoading(false); }
  }, [pagination.page, pagination.limit, filters, addToast]);

  const fetchMapData = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== ''));
      const result = await adminApi.getMapData(params);
      if (result.success) setMapComplaints(result.data.complaints);
    } catch (error) { console.error('Map data error:', error); }
  }, [filters]);

  useEffect(() => { if (isAuthenticated) fetchStats(); }, [isAuthenticated, fetchStats]);
  useEffect(() => { if (isAuthenticated && view === 'list') fetchComplaints(); }, [isAuthenticated, view, fetchComplaints]);
  useEffect(() => { if (isAuthenticated && view === 'map') fetchMapData(); }, [isAuthenticated, view, fetchMapData]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedComplaints(complaints.map(c => c._id));
    else setSelectedComplaints([]);
  };

  const handleSelectComplaint = (id) => {
    setSelectedComplaints(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkStatusUpdate = async () => {
    if (!bulkStatus || selectedComplaints.length === 0) return;
    setIsProcessingBulk(true);
    try {
      for (const id of selectedComplaints) {
        await adminApi.updateComplaint(id, { status: bulkStatus });
      }
      addToast(`Updated ${selectedComplaints.length} complaints`, 'success');
      setSelectedComplaints([]);
      setBulkStatus('');
      setShowBulkActions(false);
      fetchComplaints();
      fetchStats();
    } catch (error) {
      addToast('Failed to update some complaints', 'error');
    } finally { setIsProcessingBulk(false); }
  };

  const saveCurrentFilter = () => {
    const filterName = prompt('Enter a name for this filter:');
    if (filterName) {
      const newFilter = { name: filterName, filters: { ...filters }, createdAt: new Date().toISOString() };
      setSavedFilters(prev => [...prev, newFilter]);
      localStorage.setItem('savedFilters', JSON.stringify([...savedFilters, newFilter]));
      addToast('Filter saved', 'success');
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem('savedFilters');
    if (stored) setSavedFilters(JSON.parse(stored));
  }, []);

  const loadSavedFilter = (filter) => {
    setFilters(filter.filters);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const categories = ['roads', 'water', 'electricity', 'sanitation', 'public_safety', 'environment', 'transportation', 'healthcare', 'education', 'other'];
  const statuses = ['pending', 'assigned', 'in_progress', 'closed', 'rejected'];
  const priorities = ['low', 'medium', 'high', 'critical'];

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                  <span className="text-xl">🏛️</span>
                </div>
                <span className="text-lg font-bold text-gray-900 hidden sm:block">{t('app_name')}</span>
              </Link>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600 font-medium">Admin Dashboard</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{admin?.name}</p>
                <p className="text-xs text-gray-500 capitalize">{admin?.role?.replace('_', ' ')}</p>
              </div>
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                admin?.role === 'super_admin' ? 'bg-purple-100 text-purple-700' :
                admin?.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {admin?.role?.replace('_', ' ')}
              </div>
              <button onClick={() => { logout(); navigate('/official-login'); }} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats */}
        {!stats ? <StatsSkeleton /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            {[
              { value: stats.total || 0, label: 'Total', color: 'gray', icon: '📊' },
              { value: stats.byStatus?.pending || 0, label: 'Pending', color: 'yellow', icon: '⏳' },
              { value: stats.byStatus?.in_progress || 0, label: 'In Progress', color: 'blue', icon: '🔄' },
              { value: stats.byStatus?.closed || 0, label: 'Closed', color: 'green', icon: '✅' },
              { value: stats.byStatus?.rejected || 0, label: 'Rejected', color: 'red', icon: '❌' },
              { value: stats.todayCount || 0, label: 'Today', color: 'primary', icon: '📅' },
            ].map((stat, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition cursor-pointer"
                onClick={() => stat.label !== 'Total' && stat.label !== 'Today' && handleFilterChange('status', stat.label.toLowerCase().replace(' ', '_'))}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl">{stat.icon}</span>
                  <span className={`text-2xl font-bold text-${stat.color}-600`}>{stat.value}</span>
                </div>
                <p className="text-sm text-gray-600">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* View Toggle & Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'list' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                📋 List
              </button>
              <button onClick={() => setView('map')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'map' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                🗺️ Map
              </button>
            </div>

            {/* Search */}
            <div className="flex-1">
              <input type="text" value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)} placeholder="Search complaints..." className="w-full text-sm rounded-lg" />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className="text-sm rounded-lg">
                <option value="">All Status</option>
                {statuses.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
              </select>
              <select value={filters.category} onChange={(e) => handleFilterChange('category', e.target.value)} className="text-sm rounded-lg">
                <option value="">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
              </select>
              <select value={filters.priority} onChange={(e) => handleFilterChange('priority', e.target.value)} className="text-sm rounded-lg">
                <option value="">All Priority</option>
                {priorities.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
              <input type="date" value={filters.startDate} onChange={(e) => handleFilterChange('startDate', e.target.value)} className="text-sm rounded-lg" />
              <input type="date" value={filters.endDate} onChange={(e) => handleFilterChange('endDate', e.target.value)} className="text-sm rounded-lg" />
            </div>

            {/* Saved Filters */}
            <div className="flex items-center gap-2">
              <button onClick={saveCurrentFilter} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                💾 Save Filter
              </button>
              {savedFilters.length > 0 && (
                <select onChange={(e) => loadSavedFilter(savedFilters[parseInt(e.target.value)])} className="text-sm rounded-lg">
                  <option value="">Load Saved...</option>
                  {savedFilters.map((f, i) => <option key={i} value={i}>{f.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        <AnimatePresence>
          {selectedComplaints.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-4 flex items-center justify-between">
              <span className="text-primary-700 font-medium">
                {selectedComplaints.length} complaint(s) selected
              </span>
              <div className="flex items-center gap-3">
                <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="text-sm rounded-lg">
                  <option value="">Select Action...</option>
                  {statuses.map(s => <option key={s} value={s}>Mark as {t(`status.${s}`)}</option>)}
                </select>
                <button onClick={handleBulkStatusUpdate} disabled={!bulkStatus || isProcessingBulk} className="btn-primary text-sm py-2">
                  {isProcessingBulk ? 'Processing...' : 'Apply'}
                </button>
                <button onClick={() => setSelectedComplaints([])} className="text-sm text-gray-600 hover:text-gray-900">
                  Clear Selection
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        {view === 'list' ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {isLoading ? <TableSkeleton rows={5} cols={8} /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 w-12">
                        <input type="checkbox" onChange={handleSelectAll} checked={selectedComplaints.length === complaints.length && complaints.length > 0} className="rounded" />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SLA</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {complaints.length === 0 ? (
                      <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-500">No complaints found</td></tr>
                    ) : complaints.map((complaint) => (
                      <motion.tr key={complaint._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedComplaints.includes(complaint._id)} onChange={() => handleSelectComplaint(complaint._id)} className="rounded" />
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-primary-600">{complaint.complaintId}</td>
                        <td className="px-4 py-3 text-sm">{t(`categories.${complaint.category}`)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{complaint.location?.address || 'N/A'}</td>
                        <td className="px-4 py-3"><StatusBadge status={complaint.status} /></td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            complaint.priority === 'critical' ? 'bg-red-100 text-red-700' :
                            complaint.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                            complaint.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>{complaint.priority}</span>
                        </td>
                        <td className="px-4 py-3">
                          <SLATimer createdAt={complaint.createdAt} status={complaint.status} priority={complaint.priority} />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{new Date(complaint.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <Link to={`/admin/complaints/${complaint._id}`} className="text-primary-600 hover:text-primary-700 text-sm font-medium">View</Link>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.totalDocs)} of {pagination.totalDocs}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))} disabled={pagination.page === 1} className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50">Previous</button>
                  <span className="text-sm text-gray-600">Page {pagination.page} of {pagination.totalPages}</span>
                  <button onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))} disabled={pagination.page === pagination.totalPages} className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="h-[600px] relative">
              <MapContainer center={mapCenter} zoom={5} style={{ height: '100%', width: '100%' }}>
                <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapBoundsUpdater complaints={mapComplaints} />
                {mapComplaints.map((complaint) => {
                  if (!complaint.location?.coordinates) return null;
                  const [lng, lat] = complaint.location.coordinates;
                  return (
                    <Marker key={complaint._id} position={[lat, lng]} icon={markerIcons[complaint.status] || markerIcons.pending}>
                      <Popup>
                        <div className="min-w-[200px]">
                          <p className="font-mono text-sm text-primary-600 mb-1">{complaint.complaintId}</p>
                          <p className="font-medium text-sm mb-1">{t(`categories.${complaint.category}`)}</p>
                          <div className="flex items-center justify-between">
                            <StatusBadge status={complaint.status} size="sm" />
                            <Link to={`/admin/complaints/${complaint._id}`} className="text-xs text-primary-600 hover:underline">View →</Link>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
              
              {/* Legend */}
              <div className="absolute bottom-4 right-4 bg-white p-3 rounded-lg shadow-lg z-[1000]">
                <p className="text-xs font-medium text-gray-700 mb-2">Legend</p>
                <div className="space-y-1">
                  {[['🟠', 'Pending'], ['🟡', 'In Progress'], ['🟢', 'Closed'], ['🔴', 'Rejected']].map(([icon, label]) => (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      <span>{icon}</span><span className="text-gray-600">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">{mapComplaints.length} complaints</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
