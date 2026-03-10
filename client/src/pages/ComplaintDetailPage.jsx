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
        addToast('Ticket not found', 'error');
        navigate('/admin/dashboard');
      }
    } catch (error) {
      console.error('Error fetching complaint:', error);
      addToast('Failed to fetch ticket', 'error');
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
        addToast('Ticket updated successfully', 'success');
        setShowUpdateModal(false);
        fetchComplaint();
      }
    } catch (error) {
      console.error('Error updating complaint:', error);
      addToast('Failed to update ticket', 'error');
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
        <p className="text-gray-600">Ticket not found</p>
      </div>
    );
  }

  const location = complaint.location?.coordinates
    ? { lat: complaint.location.coordinates[1], lng: complaint.location.coordinates[0] }
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <Link
            to="/admin/dashboard"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium transition"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* ── Ticket Header Card ─────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Top banner */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-primary-200 text-xs uppercase tracking-wide">Ticket ID</p>
                <h1 className="text-2xl font-bold font-mono text-white">
                  {complaint.complaintId}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={complaint.status} size="lg" />
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  complaint.priority === 'critical' ? 'bg-red-50 text-red-700 border-red-200' :
                  complaint.priority === 'high' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                  complaint.priority === 'medium' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                  'bg-white/90 text-gray-700 border-gray-200'
                }`}>
                  {complaint.priority} priority
                </span>
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Category</p>
              <p className="font-medium text-gray-900">{complaint.category}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Submitted</p>
              <p className="font-medium text-gray-900">
                {new Date(complaint.createdAt).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Phone</p>
              <p className="font-medium text-gray-900">{complaint.user?.phoneNumber || complaint.whatsappNumber || 'N/A'}</p>
            </div>
            {complaint.assignedTo ? (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Assigned To</p>
                <p className="font-medium text-gray-900">{complaint.assignedTo.name}</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Department</p>
                <p className="font-medium text-gray-900">{complaint.department || 'Unassigned'}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Description ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Description</h2>
          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
            {complaint.description || 'No description provided'}
          </p>
        </div>

        {/* ── Location + Image side-by-side on large screens ─ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Location */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Location</h2>
            <p className="text-sm text-gray-600 mb-3">
              {complaint.address?.fullAddress || complaint.location?.address || 'Address not available'}
            </p>
            {location && (
              <div className="h-56 rounded-xl overflow-hidden border border-gray-200">
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

          {/* Screenshot */}
          {complaint.image?.filePath ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Screenshot</h2>
              <div className="rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img
                  src={`${API_BASE}/${complaint.image.filePath.replace(/\\/g, '/')}`}
                  alt="Screenshot"
                  className="w-full max-h-80 object-contain cursor-pointer hover:opacity-90 transition"
                  onClick={() => window.open(`${API_BASE}/${complaint.image.filePath.replace(/\\/g, '/')}`, '_blank')}
                />
              </div>
            </div>
          ) : (
            /* keep grid balanced when no image */
            <div />
          )}
        </div>

        {/* ── Resolution Proof Images ───────────────────────── */}
        {complaint.resolutionProof && complaint.resolutionProof.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Resolution Proof ({complaint.resolutionProof.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {complaint.resolutionProof.map((proof, index) => {
                const proofUrl = proof.url || (proof.filePath ? `${API_BASE}/${proof.filePath.replace(/\\/g, '/')}` : null);
                if (!proofUrl) return null;
                return (
                  <a
                    key={index}
                    href={proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 hover:opacity-90 transition"
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

        {/* ── Internal Notes / Duplicate Info (inline) ──────── */}
        {(complaint.internalNotes || complaint.duplicateOf) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {complaint.internalNotes && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Internal Notes</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{complaint.internalNotes}</p>
              </div>
            )}
            {complaint.duplicateOf && (
              <div className="bg-yellow-50 rounded-2xl shadow-sm border border-yellow-200 p-6">
                <h2 className="text-base font-semibold text-yellow-800 mb-2">⚠️ Duplicate</h2>
                <p className="text-sm text-yellow-700">
                  This is a duplicate of ticket{' '}
                  <Link to={`/admin/complaints/${complaint.duplicateOf}`} className="font-medium underline">
                    {complaint.duplicateOf}
                  </Link>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Status History ────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Status History</h2>
          <div className="space-y-4">
            {complaint.statusHistory && complaint.statusHistory.length > 0 ? (
              complaint.statusHistory.map((entry, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ring-4 ring-white ${
                      entry.status === 'closed' ? 'bg-green-500' :
                      entry.status === 'rejected' ? 'bg-red-500' :
                      entry.status === 'in_progress' ? 'bg-blue-500' :
                      'bg-gray-400'
                    }`} />
                    {index < complaint.statusHistory.length - 1 && (
                      <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={entry.status} size="sm" />
                      <span className="text-xs text-gray-400">
                        {new Date(entry.changedAt).toLocaleString()}
                      </span>
                    </div>
                    {entry.changedBy && (
                      <p className="text-sm text-gray-500">by {entry.changedBy.name || 'Admin'}</p>
                    )}
                    {entry.notes && (
                      <p className="text-sm text-gray-700 mt-1">{entry.notes}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-sm">No status history available</p>
            )}
          </div>
        </div>
      </main>

      {/* Update Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold mb-4">Update Ticket</h2>
            
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
