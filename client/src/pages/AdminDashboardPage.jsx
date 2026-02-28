import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuthStore, useToastStore } from '../store';
import { adminApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';

// Fix Leaflet default icon issue
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

// Map bounds updater component
function MapBoundsUpdater({ complaints }) {
  const map = useMap();
  
  useEffect(() => {
    if (complaints.length > 0) {
      const bounds = complaints
        .filter(c => c.location?.coordinates)
        .map(c => [c.location.coordinates[1], c.location.coordinates[0]]);
      
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 13 });
      }
    }
  }, [complaints, map]);
  
  return null;
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { admin, logout, isAuthenticated } = useAuthStore();
  const { addToast } = useToastStore();

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [mapComplaints, setMapComplaints] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    priority: '',
    startDate: '',
    endDate: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 1,
    totalDocs: 0,
  });
  const [view, setView] = useState('list'); // 'list' or 'map'
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [mapCenter, setMapCenter] = useState([20.5937, 78.9629]); // India center

  // Check auth
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/admin/login');
    }
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
          navigate('/admin/login');
        }
      }
    };
    verifySession();
  }, [isAuthenticated, logout, navigate]);

  // Fetch stats
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

  // Fetch complaints for list view
  const fetchComplaints = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
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
      addToast('Failed to fetch complaints', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, addToast]);

  // Fetch map data
  const fetchMapData = useCallback(async () => {
    try {
      const params = {
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '')),
      };
      
      const result = await adminApi.getMapData(params);
      if (result.success) {
        setMapComplaints(result.data.complaints);
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
    if (isAuthenticated && view === 'list') {
      fetchComplaints();
    }
  }, [isAuthenticated, view, fetchComplaints]);

  useEffect(() => {
    if (isAuthenticated && view === 'map') {
      fetchMapData();
    }
  }, [isAuthenticated, view, fetchMapData]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const categories = [
    'roads', 'water', 'electricity', 'sanitation', 'public_safety',
    'environment', 'transportation', 'healthcare', 'education', 'other'
  ];

  const statuses = [
    'pending', 'assigned', 'in_progress', 'resolved', 'rejected', 'closed'
  ];

  const priorities = ['low', 'medium', 'high', 'critical'];

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top Navigation */}
      <header className="bg-white shadow-sm">
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
              <span className="text-gray-600">Admin Dashboard</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{admin?.name}</p>
                <p className="text-xs text-gray-500 capitalize">{admin?.role?.replace('_', ' ')}</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div className="card p-4">
              <p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p>
              <p className="text-sm text-gray-600">Total</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-yellow-600">{stats.byStatus?.pending || 0}</p>
              <p className="text-sm text-gray-600">Pending</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-blue-600">{stats.byStatus?.in_progress || 0}</p>
              <p className="text-sm text-gray-600">In Progress</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-green-600">{stats.byStatus?.resolved || 0}</p>
              <p className="text-sm text-gray-600">Resolved</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-red-600">{stats.byStatus?.rejected || 0}</p>
              <p className="text-sm text-gray-600">Rejected</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-primary-600">
                {stats.todayCount || 0}
              </p>
              <p className="text-sm text-gray-600">Today</p>
            </div>
          </div>
        )}

        {/* View Toggle & Filters */}
        <div className="card mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('list')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  view === 'list'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📋 List View
              </button>
              <button
                onClick={() => setView('map')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  view === 'map'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                🗺️ Map View
              </button>
            </div>

            {/* Filters */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="text-sm"
              >
                <option value="">All Status</option>
                {statuses.map(s => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>

              <select
                value={filters.category}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="text-sm"
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{t(`categories.${c}`)}</option>
                ))}
              </select>

              <select
                value={filters.priority}
                onChange={(e) => handleFilterChange('priority', e.target.value)}
                className="text-sm"
              >
                <option value="">All Priority</option>
                {priorities.map(p => (
                  <option key={p} value={p} className="capitalize">{p}</option>
                ))}
              </select>

              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="text-sm"
                placeholder="Start Date"
              />

              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="text-sm"
                placeholder="End Date"
              />
            </div>
          </div>
        </div>

        {/* Main Content */}
        {view === 'list' ? (
          <>
            {/* Complaints Table */}
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {isLoading ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-8 text-center">
                          <div className="spinner mx-auto" />
                        </td>
                      </tr>
                    ) : complaints.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                          No complaints found
                        </td>
                      </tr>
                    ) : (
                      complaints.map((complaint) => (
                        <tr key={complaint._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-mono text-primary-600">
                            {complaint.complaintId}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {t(`categories.${complaint.category}`)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                            {complaint.description}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                            {complaint.location?.address || 'N/A'}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={complaint.status} />
                          </td>
                          <td className="px-4 py-3 text-sm capitalize">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              complaint.priority === 'critical' ? 'bg-red-100 text-red-700' :
                              complaint.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                              complaint.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {complaint.priority}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(complaint.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              to={`/admin/complaints/${complaint._id}`}
                              className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                            >
                              View
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
                    Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                    {Math.min(pagination.page * pagination.limit, pagination.totalDocs)} of{' '}
                    {pagination.totalDocs} complaints
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Map View */
          <div className="card overflow-hidden">
            <div className="h-[600px] relative">
              <MapContainer
                center={mapCenter}
                zoom={5}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapBoundsUpdater complaints={mapComplaints} />
                
                {mapComplaints.map((complaint) => {
                  if (!complaint.location?.coordinates) return null;
                  
                  const [lng, lat] = complaint.location.coordinates;
                  const icon = markerIcons[complaint.status] || markerIcons.pending;
                  
                  return (
                    <Marker
                      key={complaint._id}
                      position={[lat, lng]}
                      icon={icon}
                    >
                      <Popup>
                        <div className="min-w-[200px]">
                          <p className="font-mono text-sm text-primary-600 mb-1">
                            {complaint.complaintId}
                          </p>
                          <p className="font-medium text-sm mb-1">
                            {t(`categories.${complaint.category}`)}
                          </p>
                          <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                            {complaint.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <StatusBadge status={complaint.status} size="sm" />
                            <Link
                              to={`/admin/complaints/${complaint._id}`}
                              className="text-xs text-primary-600 hover:underline"
                            >
                              View Details →
                            </Link>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>

              {/* Map Legend */}
              <div className="absolute bottom-4 right-4 bg-white p-3 rounded-lg shadow-lg z-[1000]">
                <p className="text-xs font-medium text-gray-700 mb-2">Legend</p>
                <div className="space-y-1">
                  {Object.entries({
                    pending: ['🟠', 'Pending'],
                    in_progress: ['🟡', 'In Progress'],
                    resolved: ['🟢', 'Resolved'],
                    rejected: ['🔴', 'Rejected'],
                  }).map(([key, [icon, label]]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span>{icon}</span>
                      <span className="text-gray-600">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {mapComplaints.length} complaints
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
