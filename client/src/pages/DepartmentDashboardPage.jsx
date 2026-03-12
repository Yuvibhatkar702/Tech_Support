import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOfficialStore, useToastStore } from '../store';
import { officialApi } from '../services/api';
import { XMarkIcon } from '@heroicons/react/24/outline';

// ─── Status badge component ────────────────────────────────────────
function StatusBadge({ status }) {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    assigned: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-indigo-100 text-indigo-800',
    closed: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  const labels = {
    pending: 'Pending',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    closed: 'Closed',
    rejected: 'Rejected',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

// ─── Progress bar ───────────────────────────────────────────────────
function ProgressBar({ value }) {
  const color = value >= 100 ? 'bg-green-500' : value >= 70 ? 'bg-indigo-500' : value >= 40 ? 'bg-blue-500' : 'bg-yellow-500';
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
    </div>
  );
}

// ─── Stat card ──────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div className={`rounded-xl p-5 ${color} shadow-sm`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '');

export default function DepartmentDashboardPage() {
  const navigate = useNavigate();
  const { official, token, isAuthenticated, logout } = useOfficialStore();
  const { addToast } = useToastStore();
  const [imagePreview, setImagePreview] = useState(null);

  const [stats, setStats] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [selectedOfficer, setSelectedOfficer] = useState('');
  const [detailComplaint, setDetailComplaint] = useState(null);

  // Password change state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Note: Session verification removed - OfficialProtectedRoute handles auth

  const fetchData = useCallback(async () => {
    // Don't fetch if no token (prevents logout on hydration race)
    const currentToken = useOfficialStore.getState().token;
    if (!currentToken) return;
    
    setLoading(true);
    try {
      const [statsRes, complaintsRes, officersRes] = await Promise.all([
        officialApi.getDepartmentStats(),
        officialApi.getDepartmentComplaints({ status: statusFilter, page, limit: 15 }),
        officialApi.getDepartmentOfficers(),
      ]);
      if (statsRes.success) setStats(statsRes.data);
      if (complaintsRes.success) {
        // Sort: pending (unassigned) first, then assigned/in_progress, then closed
        const statusOrder = { pending: 0, reopened: 1, assigned: 2, in_progress: 3, closed: 4, rejected: 5 };
        const sorted = [...complaintsRes.data].sort((a, b) => {
          const oa = statusOrder[a.status] ?? 9;
          const ob = statusOrder[b.status] ?? 9;
          if (oa !== ob) return oa - ob;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        setComplaints(sorted);
        setPagination(complaintsRes.pagination);
      }
      if (officersRes.success) setOfficers(officersRes.data);
    } catch (error) {
      console.error('Fetch error:', error);
      // Note: 401 handling moved to API interceptor to prevent logout race conditions
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { if (token) fetchData(); }, [fetchData, token]);

  const handleAssign = async () => {
    if (!selectedComplaint || !selectedOfficer) {
      addToast('Select an officer', 'error');
      return;
    }
    try {
      const res = await officialApi.assignOfficer(selectedComplaint._id, selectedOfficer);
      if (res.success) {
        addToast(res.message, 'success');
        setAssignModalOpen(false);
        setSelectedComplaint(null);
        setSelectedOfficer('');
        fetchData();
      }
    } catch (error) {
      addToast(error.response?.data?.message || 'Assignment failed', 'error');
    }
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
      const res = await officialApi.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
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

  const deptName = official?.departmentCode?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Support';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Support Dashboard</h1>
            <p className="text-sm text-gray-500">Welcome, {official?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPasswordModalOpen(true)} className="px-4 py-2 text-sm bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition" title="Change Password">
              🔑 Change Password
            </button>
            <button onClick={handleLogout} className="px-4 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Total" value={stats.total} color="bg-white border" />
            <StatCard label="Pending" value={stats.pending} color="bg-yellow-50 text-yellow-900" />
            <StatCard label="Assigned" value={stats.assigned} color="bg-blue-50 text-blue-900" />
            <StatCard label="In Progress" value={stats.inProgress} color="bg-indigo-50 text-indigo-900" />
            <StatCard label="Closed" value={stats.closed} color="bg-green-50 text-green-900" />
            <StatCard label="Overdue" value={stats.overdue} color="bg-red-50 text-red-900" />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Filter:</label>
          {['', 'pending', 'assigned', 'in_progress', 'closed'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'
              }`}
            >
              {s === '' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Complaints */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl p-12 text-center text-gray-400 shadow-sm">Loading…</div>
          ) : complaints.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center text-gray-400 shadow-sm">No complaints found</div>
          ) : (
            complaints.map((c) => {
              const rawPath = c.image?.filePath || c.images?.[0]?.filePath || '';
              const imgSrc = rawPath
                ? `${API_BASE}/${rawPath.replace(/\\/g, '/')}`
                : null;
              // Resolution proof image
              const proofPath = c.resolutionProof?.[0]?.filePath || '';
              const proofSrc = proofPath
                ? `${API_BASE}/${proofPath.replace(/\\/g, '/')}`
                : null;
              return (
                <div key={c._id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition">
                  {/* Header row */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-gray-900">{c.complaintId}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Countdown */}
                      {c.countdown && (
                        c.countdown.isOverdue ? (
                          <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                            ⚠ Overdue by {c.countdown.remainingDays}d {c.countdown.remainingHours}h
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                            ⏱ {c.countdown.remainingDays}d {c.countdown.remainingHours}h left
                          </span>
                        )
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(c.createdAt).toLocaleDateString()} {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {c.status === 'pending' && !c.assignedTo && (
                        <button
                          onClick={() => { setSelectedComplaint(c); setAssignModalOpen(true); }}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition font-medium"
                        >
                          Assign
                        </button>
                      )}
                      {c.assignedTo && (
                        <button
                          disabled
                          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg font-medium opacity-80 cursor-not-allowed"
                        >
                          ✓ Assigned
                        </button>
                      )}
                      <button
                        onClick={() => setDetailComplaint(c)}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition font-medium"
                      >
                        View Details
                      </button>
                    </div>
                  </div>

                  {/* Content: Image + Details */}
                  <div className="flex gap-4">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt="complaint"
                        className="w-24 h-24 rounded-lg object-cover cursor-pointer border flex-shrink-0 hover:opacity-80 transition"
                        onClick={() => setImagePreview(imgSrc)}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300 text-xs border">No image</div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      {c.websiteName && <p className="text-sm text-gray-800"><span className="font-semibold">Website:</span> {c.websiteName}</p>}
                      <p className="text-sm text-gray-800"><span className="font-semibold">Page/Module:</span> {c.category}</p>
                      {c.issueType && <p className="text-sm text-gray-800"><span className="font-semibold">Issue Type:</span> {c.issueType}</p>}
                      {c.priority && (
                        <p className="text-sm text-gray-800">
                          <span className="font-semibold">Priority:</span>{' '}
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            c.priority === 'critical' ? 'bg-red-100 text-red-800' :
                            c.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                            c.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                          }`}>{c.priority}</span>
                        </p>
                      )}
                      <p className="text-sm text-gray-800"><span className="font-semibold">Phone:</span> {c.user?.phoneNumber || '—'}</p>
                      {c.user?.name && <p className="text-sm text-gray-800"><span className="font-semibold">Name:</span> {c.user.name}</p>}
                      <p className="text-sm text-gray-800"><span className="font-semibold">Developer:</span> {c.assignedTo?.name || '—'}</p>
                      {c.description && (
                        <p className="text-sm text-gray-600 line-clamp-2"><span className="font-semibold text-gray-800">Description:</span> {c.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Resolution Proof */}
                  {proofSrc && ['closed'].includes(c.status) && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-green-700 mb-2">📷 Resolution Proof</p>
                      <div className="flex gap-2">
                        {c.resolutionProof.map((p, i) => {
                          const pSrc = `${API_BASE}/${(p.filePath || '').replace(/\\/g, '/')}`;
                          return (
                            <img
                              key={i}
                              src={pSrc}
                              alt={`Proof ${i + 1}`}
                              className="w-16 h-16 rounded-lg object-cover cursor-pointer border hover:opacity-80 transition"
                              onClick={() => setImagePreview(pSrc)}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          );
                        })}
                      </div>
                      {c.resolution?.description && (
                        <p className="text-xs text-gray-500 mt-1"><strong>Remarks:</strong> {c.resolution.description}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Image Preview Modal */}
        {imagePreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setImagePreview(null)}>
            <img src={imagePreview} alt="Preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm">
            <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages} ({pagination.total} total)</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 hover:bg-white transition">Prev</button>
              <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 hover:bg-white transition">Next</button>
            </div>
          </div>
        )}

        {/* Officers */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Developers ({officers.length})</h2>
          <div className="flex flex-wrap gap-3">
            {officers.map((o) => {
              const ratingInfo = stats?.officerRatings?.find(r => r.officerId === o._id);
              return (
                <div key={o._id} className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="w-8 h-8 bg-blue-200 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm">
                    {o.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{o.name}</p>
                    <p className="text-xs text-gray-500">
                      {o.designation || 'Developer'}
                      {ratingInfo && (
                        <span className="ml-1 text-yellow-600 font-medium">⭐ {ratingInfo.avgRating} ({ratingInfo.totalRatings})</span>
                      )}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    (o.activeComplaints || 0) === 0
                      ? 'bg-green-100 text-green-700'
                      : (o.activeComplaints || 0) >= 3
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {o.activeComplaints || 0}
                  </span>
                </div>
              );
            })}
            {officers.length === 0 && <p className="text-sm text-gray-400">No developers assigned yet</p>}
          </div>
        </div>

        {/* Officer Ratings Leaderboard */}
        {stats?.officerRatings && stats.officerRatings.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Developer Ratings Leaderboard</h2>
            <div className="space-y-3">
              {stats.officerRatings.map((officer, index) => (
                <div key={officer.officerId} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                    index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-blue-400'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{officer.name}</p>
                    <p className="text-xs text-gray-500">{officer.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star} className={`text-sm ${star <= Math.round(officer.avgRating) ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                      ))}
                    </div>
                    <span className="text-sm font-bold text-gray-900">{officer.avgRating}</span>
                    <span className="text-xs text-gray-500">({officer.totalRatings})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Complaint Detail Modal */}
      {detailComplaint && (() => {
        const d = detailComplaint;
        const dImgPath = d.image?.filePath || d.images?.[0]?.filePath || '';
        const dImgSrc = dImgPath ? `${API_BASE}/${dImgPath.replace(/\\/g, '/')}` : null;
        const resolvedTime = d.closedAt || d.resolvedAt || d.resolution?.resolvedAt
          || d.statusHistory?.slice().reverse().find(h => h.status === 'closed')?.changedAt;
        const createdTime = new Date(d.createdAt);
        const assignedTime = d.assignedAt ? new Date(d.assignedAt) : createdTime;
        const resolvedDate = resolvedTime ? new Date(resolvedTime) : null;
        // Total time: from complaint filed to closed
        const totalMinutes = resolvedDate ? Math.max(0, Math.round((resolvedDate - createdTime) / (1000 * 60))) : null;
        const totalTimeStr = totalMinutes !== null
          ? (totalMinutes >= 1440
            ? `${Math.floor(totalMinutes / 1440)}d ${Math.floor((totalMinutes % 1440) / 60)}h`
            : totalMinutes >= 60
              ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
              : `${totalMinutes}m`)
          : '—';
        // Officer turnaround: from assigned to closed
        const officerMinutes = resolvedDate && d.assignedAt ? Math.max(0, Math.round((resolvedDate - assignedTime) / (1000 * 60))) : null;
        const officerTimeStr = officerMinutes !== null
          ? (officerMinutes >= 1440
            ? `${Math.floor(officerMinutes / 1440)}d ${Math.floor((officerMinutes % 1440) / 60)}h`
            : officerMinutes >= 60
              ? `${Math.floor(officerMinutes / 60)}h ${officerMinutes % 60}m`
              : `${officerMinutes}m`)
          : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDetailComplaint(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Ticket Details</h3>
                  <p className="text-sm text-gray-500 font-mono">{d.complaintId}</p>
                </div>
                <button onClick={() => setDetailComplaint(null)} className="p-2 hover:bg-gray-100 rounded-lg transition text-gray-400 hover:text-gray-600">
                  ✕
                </button>
              </div>

              {/* Status Badge */}
              <div className="mb-4">
                <StatusBadge status={d.status} />
                {d.priority && (
                  <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    d.priority === 'critical' ? 'bg-red-100 text-red-800' :
                    d.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                    d.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                  }`}>{d.priority}</span>
                )}
              </div>

              {/* Complaint Image */}
              {dImgSrc && (
                <img src={dImgSrc} alt="complaint" className="w-full h-48 object-cover rounded-xl mb-4 cursor-pointer hover:opacity-90 transition" onClick={() => setImagePreview(dImgSrc)} onError={(e) => { e.target.style.display = 'none'; }} />
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Website Name</p>
                  <p className="text-sm font-semibold text-gray-900">{d.websiteName || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Page / Module</p>
                  <p className="text-sm font-semibold text-gray-900">{d.category || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Issue Type</p>
                  <p className="text-sm font-semibold text-gray-900">{d.issueType || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Priority</p>
                  <p className="text-sm font-semibold">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      d.priority === 'critical' ? 'bg-red-100 text-red-800' :
                      d.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                      d.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                    }`}>{d.priority || 'medium'}</span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Submitted By</p>
                  <p className="text-sm font-semibold text-gray-900">{d.user?.name || d.user?.phoneNumber || '—'}</p>
                  {d.user?.name && d.user?.phoneNumber && (
                    <p className="text-xs text-gray-500">📞 {d.user.phoneNumber}</p>
                  )}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Filed On</p>
                  <p className="text-sm font-semibold text-gray-900">{createdTime.toLocaleDateString()} {createdTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>

              {d.description && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                  <p className="text-xs text-gray-500 mb-1">Description</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{d.description}</p>
                </div>
              )}

              {/* Additional Files */}
              {d.additionalFiles && d.additionalFiles.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                  <p className="text-xs text-gray-500 mb-2">Additional Files ({d.additionalFiles.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {d.additionalFiles.map((file, i) => {
                      const isImage = file.mimeType?.startsWith('image/');
                      const fileSrc = `${API_BASE}/${(file.filePath || '').replace(/\\/g, '/')}`;
                      return isImage ? (
                        <img
                          key={i}
                          src={fileSrc}
                          alt={file.originalName || `File ${i + 1}`}
                          className="w-20 h-20 rounded-lg object-cover cursor-pointer border hover:opacity-80 transition"
                          onClick={() => setImagePreview(fileSrc)}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <a
                          key={i}
                          href={fileSrc}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg hover:bg-blue-50 transition text-sm text-blue-700"
                        >
                          📄 {file.originalName || `File ${i + 1}`}
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Officer & Time Info */}
              <div className="border-t pt-4 mb-4">
                <h4 className="text-sm font-bold text-gray-900 mb-3">📋 Resolution Summary</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                    <p className="text-xs text-blue-600 mb-1">Assigned Developer</p>
                    <p className="text-sm font-bold text-blue-900">{d.assignedTo?.name || '—'}</p>
                    {d.assignedTo?.email && <p className="text-xs text-blue-600">{d.assignedTo.email}</p>}
                    {d.assignedTo?.phone && <p className="text-xs text-blue-600">{d.assignedTo.phone}</p>}
                  </div>
                  <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                    <p className="text-xs text-green-600 mb-1">Resolved On</p>
                    <p className="text-sm font-bold text-green-900">
                      {resolvedDate ? `${resolvedDate.toLocaleDateString()} ${resolvedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '—'}
                    </p>
                  </div>
                  <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                    <p className="text-xs text-indigo-600 mb-1">Estimated Time (SLA)</p>
                    <p className="text-sm font-bold text-indigo-900">{d.estimatedResolution || `${d.resolutionDays || 5} days`}</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3 border border-purple-100">
                    <p className="text-xs text-purple-600 mb-1">Actual Time Taken</p>
                    <p className="text-sm font-bold text-purple-900">{totalTimeStr}</p>
                    {officerTimeStr && (
                      <p className="text-xs text-purple-500 mt-0.5">Officer: {officerTimeStr}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Resolution Remarks & Proof */}
              {d.resolution?.description && (
                <div className="bg-green-50 rounded-xl p-3 border border-green-100 mb-4">
                  <p className="text-xs text-green-700 font-semibold mb-1">Developer's Remarks</p>
                  <p className="text-sm text-green-900">{d.resolution.description}</p>
                </div>
              )}

              {d.resolutionProof && d.resolutionProof.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-green-700 mb-2">📷 Resolution Proof ({d.resolutionProof.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {d.resolutionProof.map((p, i) => {
                      const pSrc = `${API_BASE}/${(p.filePath || '').replace(/\\/g, '/')}`;
                      return (
                        <img key={i} src={pSrc} alt={`Proof ${i + 1}`}
                          className="w-20 h-20 rounded-lg object-cover cursor-pointer border hover:opacity-80 transition"
                          onClick={() => setImagePreview(pSrc)}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reopen Info */}
              {d.reopenCount > 0 && (
                <div className="border-t pt-4 mb-4">
                  <h4 className="text-sm font-bold text-red-700 mb-3">🔄 Reopen Information</h4>
                  <div className="bg-red-50 rounded-xl p-3 border border-red-100 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600">Times Reopened:</span>
                      <span className="text-sm font-bold text-red-900">{d.reopenCount}</span>
                    </div>
                    {d.reopenedAt && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600">Last Reopened:</span>
                        <span className="text-sm font-semibold text-red-900">
                          {new Date(d.reopenedAt).toLocaleDateString()} {new Date(d.reopenedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                    {d.reopenReason && (
                      <div>
                        <span className="text-xs text-red-600">Reason:</span>
                        <p className="text-sm text-red-900 mt-0.5">{d.reopenReason}</p>
                      </div>
                    )}
                    {d.reopenProof && d.reopenProof.length > 0 && (
                      <div>
                        <p className="text-xs text-red-600 mb-1">Reopen Proof:</p>
                        <div className="flex flex-wrap gap-2">
                          {d.reopenProof.map((p, i) => {
                            const rpSrc = `${API_BASE}/${(p.filePath || '').replace(/\\/g, '/')}`;
                            return (
                              <img key={i} src={rpSrc} alt={`Reopen ${i + 1}`}
                                className="w-16 h-16 rounded-lg object-cover cursor-pointer border hover:opacity-80 transition"
                                onClick={() => setImagePreview(rpSrc)}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Status History / Timeline */}
              {d.statusHistory && d.statusHistory.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">📜 Status Timeline</h4>
                  <div className="space-y-2">
                    {d.statusHistory.map((h, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="mt-1 w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {h.status?.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </p>
                          <p className="text-xs text-gray-500">
                            {h.changedAt ? `${new Date(h.changedAt).toLocaleDateString()} ${new Date(h.changedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                            {h.changedBy?.name ? ` — by ${h.changedBy.name}` : ''}
                          </p>
                          {h.remarks && <p className="text-xs text-gray-400 mt-0.5">{h.remarks}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Assign Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Assign Developer</h3>
            <p className="text-sm text-gray-500 mb-4">Ticket: {selectedComplaint?.complaintId}</p>

            <select
              value={selectedOfficer}
              onChange={(e) => setSelectedOfficer(e.target.value)}
              className="w-full px-4 py-3 border rounded-xl mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select developer…</option>
              {officers.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.name} — {o.designation || 'Developer'} ({o.activeComplaints || 0} active)
                </option>
              ))}
            </select>

            <div className="flex gap-3">
              <button onClick={() => { setAssignModalOpen(false); setSelectedOfficer(''); }} className="flex-1 py-2.5 border rounded-xl text-gray-700 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button onClick={handleAssign} disabled={!selectedOfficer} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition">
                Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter current password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter new password (min 8 chars)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
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
                className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50"
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
