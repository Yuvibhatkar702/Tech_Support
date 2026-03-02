import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useAuthStore, useToastStore } from '../store';
import { adminApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '');

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function ComplaintDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { admin, isAuthenticated } = useAuthStore();
  const { addToast } = useToastStore();

  const [complaint, setComplaint] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    status: '',
    priority: '',
    internalNotes: '',
  });

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/official-login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (id && isAuthenticated) {
      fetchComplaint();
    }
  }, [id, isAuthenticated]);

  const fetchComplaint = async () => {
    setIsLoading(true);
    try {
      const result = await adminApi.getComplaint(id);
      if (result.success) {
        setComplaint(result.data.complaint);
        setUpdateForm({
          status: result.data.complaint.status,
          priority: result.data.complaint.priority,
          internalNotes: '',
        });
      } else {
        addToast('Complaint not found', 'error');
        navigate('/admin/dashboard');
      }
    } catch (error) {
      console.error('Error fetching complaint:', error);
      addToast('Failed to fetch complaint', 'error');
      navigate('/admin/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!updateForm.status) {
      addToast('Please select a status', 'error');
      return;
    }

    setIsUpdating(true);
    try {
      const result = await adminApi.updateComplaint(id, updateForm);
      if (result.success) {
        addToast('Complaint updated successfully', 'success');
        setShowUpdateModal(false);
        fetchComplaint();
      }
    } catch (error) {
      console.error('Error updating complaint:', error);
      addToast('Failed to update complaint', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="spinner w-12 h-12" />
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Complaint not found</p>
      </div>
    );
  }

  const location = complaint.location?.coordinates
    ? { lat: complaint.location.coordinates[1], lng: complaint.location.coordinates[0] }
    : null;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/admin/dashboard"
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back to Dashboard
              </Link>
            </div>
            <button
              onClick={() => setShowUpdateModal(true)}
              className="btn-primary"
            >
              Update Status
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Complaint Header */}
            <div className="card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Complaint ID</p>
                  <h1 className="text-2xl font-bold font-mono text-primary-600">
                    {complaint.complaintId}
                  </h1>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={complaint.status} size="lg" />
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    complaint.priority === 'critical' ? 'bg-red-100 text-red-700' :
                    complaint.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                    complaint.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {complaint.priority} priority
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Category</p>
                  <p className="font-medium">{complaint.category}</p>
                </div>
                <div>
                  <p className="text-gray-500">Submitted</p>
                  <p className="font-medium">
                    {new Date(complaint.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Phone Number</p>
                  <p className="font-medium">{complaint.user?.phoneNumber || complaint.whatsappNumber || 'N/A'}</p>
                </div>
                {complaint.assignedTo && (
                  <div>
                    <p className="text-gray-500">Assigned To</p>
                    <p className="font-medium">{complaint.assignedTo.name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Description</h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {complaint.description || 'No description provided'}
              </p>
            </div>

            {/* Location */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Location</h2>
              <p className="text-gray-700 mb-4">
                {complaint.address?.fullAddress || complaint.location?.address || 'Address not available'}
              </p>
              
              {location && (
                <div className="h-64 rounded-lg overflow-hidden">
                  <MapContainer
                    center={[location.lat, location.lng]}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={[location.lat, location.lng]}>
                      <Popup>
                        <div>
                          <p className="font-medium">{complaint.complaintId}</p>
                          <p className="text-sm text-gray-600">{complaint.location?.address}</p>
                        </div>
                      </Popup>
                    </Marker>
                  </MapContainer>
                </div>
              )}
            </div>

            {/* Complaint Image */}
            {complaint.image?.filePath && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-4">Complaint Photo</h2>
                <div className="rounded-lg overflow-hidden bg-gray-100">
                  <img
                    src={`${API_BASE}/${complaint.image.filePath.replace(/\\/g, '/')}`}
                    alt="Complaint"
                    className="w-full max-h-[500px] object-contain cursor-pointer"
                    onClick={() => window.open(`${API_BASE}/${complaint.image.filePath.replace(/\\/g, '/')}`, '_blank')}
                  />
                </div>
              </div>
            )}

            {/* Resolution Proof Images */}
            {complaint.resolutionProof && complaint.resolutionProof.length > 0 && (
              <div className="card">
                <h2 className="text-lg font-semibold mb-4">Resolution Proof ({complaint.resolutionProof.length})</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {complaint.resolutionProof.map((proof, index) => {
                    const proofUrl = proof.url || (proof.filePath ? `${API_BASE}/${proof.filePath.replace(/\\/g, '/')}` : null);
                    if (!proofUrl) return null;
                    return (
                      <a
                        key={index}
                        href={proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition"
                      >
                        <img
                          src={proofUrl}
                          alt={`Resolution proof ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Status History */}
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Status History</h2>
              <div className="space-y-4">
                {complaint.statusHistory && complaint.statusHistory.length > 0 ? (
                  complaint.statusHistory.map((entry, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${
                          entry.status === 'closed' ? 'bg-green-500' :
                          entry.status === 'rejected' ? 'bg-red-500' :
                          entry.status === 'in_progress' ? 'bg-blue-500' :
                          'bg-gray-400'
                        }`} />
                        {index < complaint.statusHistory.length - 1 && (
                          <div className="w-0.5 h-full bg-gray-200 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between mb-1">
                          <StatusBadge status={entry.status} size="sm" />
                          <span className="text-xs text-gray-500">
                            {new Date(entry.changedAt).toLocaleString()}
                          </span>
                        </div>
                        {entry.changedBy && (
                          <p className="text-sm text-gray-600">
                            by {entry.changedBy.name || 'Admin'}
                          </p>
                        )}
                        {entry.notes && (
                          <p className="text-sm text-gray-700 mt-1">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">No status history available</p>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="card">
              <h3 className="font-semibold mb-4">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="btn-secondary w-full justify-center text-sm"
                >
                  📝 Update Status
                </button>
                {complaint.whatsappNumber && (
                  <a
                    href={`https://wa.me/${complaint.whatsappNumber.replace('+', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary w-full justify-center text-sm"
                  >
                    💬 WhatsApp
                  </a>
                )}
                {location && (
                  <a
                    href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary w-full justify-center text-sm"
                  >
                    🗺️ Open in Maps
                  </a>
                )}
              </div>
            </div>

            {/* Reporter Info */}
            <div className="card">
              <h3 className="font-semibold mb-4">Reporter Information</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">Phone</p>
                  <p className="font-medium">{complaint.user?.phoneNumber || complaint.whatsappNumber || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Preferred Language</p>
                  <p className="font-medium capitalize">{complaint.preferredLanguage || 'English'}</p>
                </div>
                {complaint.metadata?.deviceInfo && (
                  <div>
                    <p className="text-gray-500">Device</p>
                    <p className="font-medium text-xs">
                      {complaint.metadata.deviceInfo.userAgent?.substring(0, 50)}...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Internal Notes */}
            {complaint.internalNotes && (
              <div className="card">
                <h3 className="font-semibold mb-4">Internal Notes</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {complaint.internalNotes}
                </p>
              </div>
            )}

            {/* Duplicate Info */}
            {complaint.duplicateOf && (
              <div className="card bg-yellow-50 border-yellow-200">
                <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Duplicate</h3>
                <p className="text-sm text-yellow-700">
                  This is a duplicate of complaint{' '}
                  <Link
                    to={`/admin/complaints/${complaint.duplicateOf}`}
                    className="font-medium underline"
                  >
                    {complaint.duplicateOf}
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Update Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold mb-4">Update Complaint</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={updateForm.status}
                  onChange={(e) => setUpdateForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="pending">Pending</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="closed">Closed</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={updateForm.priority}
                  onChange={(e) => setUpdateForm(f => ({ ...f, priority: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (optional)
                </label>
                <textarea
                  value={updateForm.internalNotes}
                  onChange={(e) => setUpdateForm(f => ({ ...f, internalNotes: e.target.value }))}
                  rows={3}
                  placeholder="Add internal notes..."
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowUpdateModal(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                disabled={isUpdating}
                className="btn-primary flex-1"
              >
                {isUpdating ? (
                  <>
                    <div className="spinner w-4 h-4 mr-2" />
                    Updating...
                  </>
                ) : (
                  'Update'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
