import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useToastStore } from '../store';
import { adminApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '');
const toAssetUrl = (filePath) => {
  if (!filePath) return null;
  const normalized = String(filePath).replace(/\\/g, '/');
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('/api/uploads/')) return `${API_BASE}${normalized.replace('/api', '')}`;
  const marker = '/uploads/';
  const idx = normalized.lastIndexOf(marker);
  if (idx >= 0) return `${API_BASE}/uploads/${normalized.slice(idx + marker.length)}`;
  if (normalized.startsWith('/uploads/')) return `${API_BASE}${normalized}`;
  if (normalized.startsWith('uploads/')) return `${API_BASE}/${normalized}`;
  const bareIdx = normalized.lastIndexOf('uploads/');
  if (bareIdx >= 0) return `${API_BASE}/${normalized.slice(bareIdx)}`;
  return `${API_BASE}/${normalized.replace(/^\/+/, '')}`;
};

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
  const [officials, setOfficials] = useState([]);
  const [assignToId, setAssignToId] = useState('');

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
      // If assigning to an official, do it first
      if (assignToId) {
        await adminApi.assignComplaint(id, assignToId);
      }
      const result = await adminApi.updateComplaint(id, updateForm);
      if (result.success) {
        addToast('Ticket updated successfully', 'success');
        setShowUpdateModal(false);
        setAssignToId('');
        fetchComplaint();
      }
    } catch (error) {
      console.error('Error updating complaint:', error);
      addToast(error.response?.data?.message || 'Failed to update ticket', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const openUpdateModal = async () => {
    setShowUpdateModal(true);
    setAssignToId('');
    try {
      const res = await adminApi.getOfficials();
      if (res.success) setOfficials(res.data);
    } catch (err) {
      console.error('Failed to load officials:', err);
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
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-primary-200 text-xs uppercase tracking-wide">Ticket ID</p>
                <h1 className="text-2xl font-bold font-mono text-white">{complaint.complaintId}</h1>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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
        </div>

        {/* ── Submitter Info ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Submitter Info</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Name</p>
              <p className="font-medium text-gray-900">{complaint.user?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Phone</p>
              <p className="font-medium text-gray-900">{complaint.user?.phoneNumber || complaint.whatsappNumber || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">College Name</p>
              <p className="font-medium text-gray-900">{complaint.user?.collegeName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">College Code</p>
              <p className="font-medium text-gray-900">{complaint.user?.collegeCode || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Language</p>
              <p className="font-medium text-gray-900">{complaint.user?.preferredLanguage?.toUpperCase() || 'EN'}</p>
            </div>
          </div>
        </div>

        {/* ── Ticket Details ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Ticket Details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Category</p>
              <p className="font-medium text-gray-900">{complaint.category}</p>
            </div>
            {complaint.issueType && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Issue Type</p>
                <p className="font-medium text-gray-900">{complaint.issueType.replace(/_/g, ' ')}</p>
              </div>
            )}
            {complaint.websiteName && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Website</p>
                <p className="font-medium text-gray-900 break-all">{complaint.websiteName}</p>
              </div>
            )}
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Submitted</p>
              <p className="font-medium text-gray-900">
                {new Date(complaint.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Last Updated</p>
              <p className="font-medium text-gray-900">
                {new Date(complaint.updatedAt).toLocaleString()}
              </p>
            </div>
            {complaint.upvoteCount > 0 && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Upvotes</p>
                <p className="font-medium text-gray-900">{complaint.upvoteCount}</p>
              </div>
            )}
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Public</p>
              <p className="font-medium text-gray-900">{complaint.isPublic ? 'Yes' : 'No'}</p>
            </div>
          </div>
        </div>

        {/* ── Assignment & Department ────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Assignment</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Department</p>
              <p className="font-medium text-gray-900">{complaint.departmentName || complaint.department || 'Unassigned'}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Assigned To (Current)</p>
              <p className="font-medium text-gray-900">{complaint.assignedTo?.name || 'Unassigned'}</p>
            </div>
            {complaint.assignedBy && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Assigned By</p>
                <p className="font-medium text-gray-900">{complaint.assignedBy?.name || complaint.assignedBy}</p>
              </div>
            )}
            {complaint.assignedAt && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Assigned At</p>
                <p className="font-medium text-gray-900">{new Date(complaint.assignedAt).toLocaleString()}</p>
              </div>
            )}
          </div>

          {/* Full Assignment History */}
          {complaint.assignmentHistory?.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Assignment History ({complaint.assignmentHistory.length} records)</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Assigned By</th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 uppercase">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {complaint.assignmentHistory.map((h, i) => (
                      <tr key={i} className={i === complaint.assignmentHistory.length - 1 ? 'bg-blue-50' : ''}>
                        <td className="py-2 pr-4 text-gray-500">{i + 1}</td>
                        <td className="py-2 pr-4 font-medium text-gray-900">{h.assignedTo?.name || 'Unknown'}</td>
                        <td className="py-2 pr-4 text-gray-700">{h.assignedBy?.name || 'System'}</td>
                        <td className="py-2 pr-4 text-gray-600">{new Date(h.assignedAt).toLocaleString()}</td>
                        <td className="py-2 pr-4 text-gray-500 italic">{h.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── SLA & Timeline ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">SLA & Timeline</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {complaint.estimatedResolution && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Est. Resolution</p>
                <p className="font-medium text-gray-900">{complaint.estimatedResolution}</p>
              </div>
            )}
            {complaint.expectedResolveAt && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Expected By</p>
                <p className="font-medium text-gray-900">{new Date(complaint.expectedResolveAt).toLocaleString()}</p>
              </div>
            )}
            {complaint.sla?.targetResolutionDate && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">SLA Target</p>
                <p className="font-medium text-gray-900">{new Date(complaint.sla.targetResolutionDate).toLocaleString()}</p>
              </div>
            )}
            {complaint.sla && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">SLA Status</p>
                <p className={`font-medium ${complaint.sla.isOverdue ? 'text-red-600' : 'text-green-600'}`}>
                  {complaint.sla.isOverdue ? 'Overdue' : 'On Track'}
                  {complaint.sla.escalationLevel > 0 && ` (Escalation L${complaint.sla.escalationLevel})`}
                </p>
              </div>
            )}
            {complaint.startedAt && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Work Started</p>
                <p className="font-medium text-gray-900">{new Date(complaint.startedAt).toLocaleString()}</p>
              </div>
            )}
            {complaint.resolvedAt && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Resolved At</p>
                <p className="font-medium text-gray-900">{new Date(complaint.resolvedAt).toLocaleString()}</p>
              </div>
            )}
            {complaint.closedAt && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Closed At</p>
                <p className="font-medium text-gray-900">{new Date(complaint.closedAt).toLocaleString()}</p>
              </div>
            )}
            {complaint.resolutionDays != null && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Resolution Days</p>
                <p className="font-medium text-gray-900">{complaint.resolutionDays} days</p>
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

        {/* ── Screenshot & Images ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {complaint.image?.filePath && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Screenshot</h2>
              <div className="rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                <img
                  src={toAssetUrl(complaint.image.filePath)}
                  alt="Screenshot"
                  className="w-full max-h-80 object-contain cursor-pointer hover:opacity-90 transition"
                  onClick={() => window.open(toAssetUrl(complaint.image.filePath), '_blank')}
                />
              </div>
            </div>
          )}

          {/* All Screenshots */}
          {complaint.images && complaint.images.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Screenshots ({complaint.images.length})</h2>
              <div className="grid grid-cols-2 gap-2">
                {complaint.images.map((img, i) => {
                  const imgUrl = toAssetUrl(img.url || img.filePath);
                  if (!imgUrl) return null;
                  return (
                    <a key={i} href={imgUrl} target="_blank" rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:opacity-90 transition">
                      <img src={imgUrl} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Additional Files ──────────────────────────────── */}
        {complaint.additionalFiles && complaint.additionalFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Attachments ({complaint.additionalFiles.length})</h2>
            <div className="space-y-2">
              {complaint.additionalFiles.map((file, i) => {
                const fileUrl = toAssetUrl(file.url || file.filePath);
                return (
                  <a key={i} href={fileUrl || '#'} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                    <span className="text-lg">📎</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.originalName || file.fileName}</p>
                      {file.size && <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Voice Note ────────────────────────────────────── */}
        {complaint.voiceNote?.filePath && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Voice Note</h2>
            <audio controls className="w-full mb-2">
              <source src={toAssetUrl(complaint.voiceNote.filePath)} />
            </audio>
            {complaint.voiceNote.duration && (
              <p className="text-xs text-gray-500">Duration: {complaint.voiceNote.duration}s</p>
            )}
            {complaint.voiceNote.transcription && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Transcription</p>
                <p className="text-sm text-gray-700">{complaint.voiceNote.transcription}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Location / Address ─────────────────────────────── */}
        {(complaint.address?.fullAddress || complaint.location?.address) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Location</h2>
            <p className="text-sm text-gray-700">{complaint.address?.fullAddress || complaint.location?.address}</p>
            {complaint.location?.coordinates && (
              <p className="text-xs text-gray-400 mt-2">
                Coordinates: {complaint.location.coordinates[1]}, {complaint.location.coordinates[0]}
              </p>
            )}
          </div>
        )}

        {/* ── Resolution ────────────────────────────────────── */}
        {complaint.resolution?.description && (
          <div className="bg-green-50 rounded-2xl shadow-sm border border-green-200 p-6">
            <h2 className="text-base font-semibold text-green-900 mb-3">Resolution</h2>
            <p className="text-sm text-green-800 whitespace-pre-wrap">{complaint.resolution.description}</p>
            {complaint.resolution.resolvedAt && (
              <p className="text-xs text-green-600 mt-2">Resolved: {new Date(complaint.resolution.resolvedAt).toLocaleString()}</p>
            )}
            {complaint.resolution.images && complaint.resolution.images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {complaint.resolution.images.map((img, i) => {
                  const imgUrl = toAssetUrl(img.url || img.filePath);
                  if (!imgUrl) return null;
                  return (
                    <a key={i} href={imgUrl} target="_blank" rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden bg-white border border-green-200">
                      <img src={imgUrl} alt={`Resolution ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Resolution Proof Images ───────────────────────── */}
        {complaint.resolutionProof && complaint.resolutionProof.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">
              Resolution Proof ({complaint.resolutionProof.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {complaint.resolutionProof.map((proof, index) => {
                const proofUrl = toAssetUrl(proof.url || proof.filePath);
                if (!proofUrl) return null;
                return (
                  <a key={index} href={proofUrl} target="_blank" rel="noopener noreferrer"
                    className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 hover:opacity-90 transition">
                    <img src={proofUrl} alt={`Resolution proof ${index + 1}`} className="w-full h-full object-cover" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Reopen Info ───────────────────────────────────── */}
        {complaint.reopenCount > 0 && (
          <div className="bg-orange-50 rounded-2xl shadow-sm border border-orange-200 p-6">
            <h2 className="text-base font-semibold text-orange-900 mb-3">Reopen History</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-orange-500 text-xs uppercase tracking-wide mb-1">Reopen Count</p>
                <p className="font-medium text-orange-900">{complaint.reopenCount}</p>
              </div>
              {complaint.reopenedAt && (
                <div>
                  <p className="text-orange-500 text-xs uppercase tracking-wide mb-1">Last Reopened</p>
                  <p className="font-medium text-orange-900">{new Date(complaint.reopenedAt).toLocaleString()}</p>
                </div>
              )}
            </div>
            {complaint.reopenReason && (
              <div className="mt-3 p-3 bg-white/60 rounded-lg">
                <p className="text-xs text-orange-500 uppercase tracking-wide mb-1">Reason</p>
                <p className="text-sm text-orange-800">{complaint.reopenReason}</p>
              </div>
            )}
            {complaint.reopenProof && complaint.reopenProof.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {complaint.reopenProof.map((proof, i) => {
                  const proofUrl = toAssetUrl(proof.url || proof.filePath);
                  if (!proofUrl) return null;
                  return (
                    <a key={i} href={proofUrl} target="_blank" rel="noopener noreferrer"
                      className="aspect-square rounded-lg overflow-hidden bg-white border border-orange-200">
                      <img src={proofUrl} alt={`Reopen proof ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Feedback & Rating ─────────────────────────────── */}
        {(complaint.feedback?.rating || complaint.officerRating?.rating) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Feedback</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {complaint.feedback?.rating && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Citizen Feedback</p>
                  <p className="text-lg font-bold text-gray-900">{'⭐'.repeat(complaint.feedback.rating)} ({complaint.feedback.rating}/5)</p>
                  {complaint.feedback.comment && <p className="text-sm text-gray-700 mt-1">{complaint.feedback.comment}</p>}
                  {complaint.feedback.submittedAt && <p className="text-xs text-gray-400 mt-1">{new Date(complaint.feedback.submittedAt).toLocaleString()}</p>}
                </div>
              )}
              {complaint.officerRating?.rating && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Officer Rating</p>
                  <p className="text-lg font-bold text-gray-900">{'⭐'.repeat(complaint.officerRating.rating)} ({complaint.officerRating.rating}/5)</p>
                  {complaint.officerRating.comment && <p className="text-sm text-gray-700 mt-1">{complaint.officerRating.comment}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Internal Notes / Duplicate Info ────────────────── */}
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
                <h2 className="text-base font-semibold text-yellow-800 mb-2">Duplicate</h2>
                <p className="text-sm text-yellow-700">
                  Duplicate of{' '}
                  <Link to={`/admin/complaints/${complaint.duplicateOf}`} className="font-medium underline">
                    {complaint.duplicateOf}
                  </Link>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── SLA Escalation History ─────────────────────────── */}
        {complaint.sla?.escalationHistory && complaint.sla.escalationHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Escalation History</h2>
            <div className="space-y-2">
              {complaint.sla.escalationHistory.map((esc, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                  <span className="text-red-500 text-sm">L{esc.level}</span>
                  <div className="flex-1">
                    <p className="text-sm text-red-800">{esc.reason || 'Escalated'}</p>
                    <p className="text-xs text-red-500">{new Date(esc.escalatedAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
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
                    {entry.remarks && (
                      <p className="text-sm text-gray-700 mt-1 bg-gray-50 px-3 py-2 rounded-lg">{entry.remarks}</p>
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
    </div>
  );
}
