import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { complaintApi } from '../services/api';

// Fix Leaflet default marker icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom markers for different statuses
const createCustomIcon = (status, priority) => {
  const colors = {
    pending: '#f59e0b',
    in_progress: '#3b82f6',
    closed: '#10b981',
    rejected: '#ef4444',
    duplicate: '#6b7280',
  };

  const prioritySize = {
    low: 24,
    medium: 28,
    high: 32,
    critical: 36,
  };

  const color = colors[status] || '#6b7280';
  const size = prioritySize[priority] || 28;

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="color: white; font-size: ${size/2}px;">📍</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size],
  });
};

// Cluster icon
const createClusterIcon = (cluster) => {
  const count = cluster.getChildCount();
  let size = 40;
  let color = '#3b82f6';

  if (count > 100) {
    size = 60;
    color = '#ef4444';
  } else if (count > 50) {
    size = 50;
    color = '#f59e0b';
  }

  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${size/3}px;
      ">
        ${count}
      </div>
    `,
    className: 'marker-cluster-custom',
    iconSize: [size, size],
  });
};

// Map controller component
function MapController({ center, zoom }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  
  return null;
}

export default function InteractiveMap({ onComplaintSelect }) {
  const { t } = useTranslation();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: '',
    category: '',
    priority: '',
  });
  const [mapCenter, setMapCenter] = useState([19.076, 72.8777]); // Mumbai default
  const [mapZoom, setMapZoom] = useState(12);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  useEffect(() => {
    fetchComplaints();
  }, [filters]);

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      const result = await complaintApi.getForMap(filters);
      if (result.success) {
        setComplaints(result.data.complaints || []);
        
        // Auto-center on first load
        if (result.data.complaints?.length > 0 && mapCenter[0] === 19.076) {
          const coords = result.data.complaints[0].location.coordinates;
          setMapCenter([coords[1], coords[0]]);
        }
      }
    } catch (error) {
      console.error('Error fetching map data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkerClick = (complaint) => {
    setSelectedComplaint(complaint);
    if (onComplaintSelect) {
      onComplaintSelect(complaint);
    }
  };

  const statuses = ['pending', 'in_progress', 'closed', 'rejected'];
  const categories = [
    'road_damage', 'street_light', 'water_supply', 'sewage', 'garbage',
    'encroachment', 'noise_pollution', 'illegal_construction', 'traffic', 'other'
  ];
  const priorities = ['low', 'medium', 'high', 'critical'];

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="bg-white border-b p-4 flex flex-wrap gap-3">
        <select
          value={filters.status}
          onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All Status</option>
          {statuses.map(s => (
            <option key={s} value={s}>{t(`status.${s}`)}</option>
          ))}
        </select>

        <select
          value={filters.category}
          onChange={(e) => setFilters(f => ({ ...f, category: e.target.value }))}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>{t(`categories.${c}`)}</option>
          ))}
        </select>

        <select
          value={filters.priority}
          onChange={(e) => setFilters(f => ({ ...f, priority: e.target.value }))}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">All Priorities</option>
          {priorities.map(p => (
            <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
          ))}
        </select>

        <button
          onClick={fetchComplaints}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
        >
          Refresh
        </button>

        <div className="ml-auto text-sm text-gray-500">
          {complaints.length} complaints shown
        </div>
      </div>

      {/* Map Legend */}
      <div className="bg-white border-b p-2 flex flex-wrap gap-4 text-xs">
        <span className="font-medium text-gray-700">Status:</span>
        {Object.entries({
          pending: '#f59e0b',
          in_progress: '#3b82f6',
          closed: '#10b981',
          rejected: '#ef4444',
        }).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span>{t(`status.${status}`)}</span>
          </div>
        ))}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        )}
        
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          className="h-full w-full"
          style={{ minHeight: '500px' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <MapController center={mapCenter} zoom={mapZoom} />
          
          {complaints.map((complaint) => (
            <Marker
              key={complaint._id}
              position={[
                complaint.location.coordinates[1],
                complaint.location.coordinates[0]
              ]}
              icon={createCustomIcon(complaint.status, complaint.priority)}
              eventHandlers={{
                click: () => handleMarkerClick(complaint),
              }}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="font-bold text-primary-600 mb-2">
                    {complaint.complaintId}
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">Category:</span>{' '}
                      {t(`categories.${complaint.category}`)}
                    </p>
                    <p>
                      <span className="font-medium">Status:</span>{' '}
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        complaint.status === 'closed' ? 'bg-green-100 text-green-700' :
                        complaint.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        complaint.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {t(`status.${complaint.status}`)}
                      </span>
                    </p>
                    {complaint.address?.fullAddress && (
                      <p className="text-gray-600 text-xs mt-2">
                        📍 {complaint.address.fullAddress}
                      </p>
                    )}
                    {complaint.upvoteCount > 0 && (
                      <p className="text-gray-500 text-xs">
                        👍 {complaint.upvoteCount} upvotes
                      </p>
                    )}
                  </div>
                  
                  <button
                    onClick={() => onComplaintSelect && onComplaintSelect(complaint)}
                    className="mt-3 w-full px-3 py-1.5 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"
                  >
                    View Details
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
