import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOfficialStore, useToastStore } from '../store';
import { officialApi } from '../services/api';

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

  // Verify session is valid on mount
  useEffect(() => {
    const verifySession = async () => {
      try {
        await officialApi.getProfile();
      } catch (error) {
        console.error('Session verification failed:', error);
        if (error.response?.status === 401) {
          addToast('Session expired. Please login again.', 'warning');
          logout();
          navigate('/official-login');
        }
      }
    };
    if (isAuthenticated) {
      verifySession();
    }
  }, [isAuthenticated, logout, navigate, addToast]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, complaintsRes, officersRes] = await Promise.all([
        officialApi.getDepartmentStats(),
        officialApi.getDepartmentComplaints({ status: statusFilter, page, limit: 15 }),
        officialApi.getDepartmentOfficers(),
      ]);
      if (statsRes.success) setStats(statsRes.data);
      if (complaintsRes.success) {
        setComplaints(complaintsRes.data);
        setPagination(complaintsRes.pagination);
      }
      if (officersRes.success) setOfficers(officersRes.data);
    } catch (error) {
      console.error('Fetch error:', error);
      if (error.response?.status === 401) {
        logout();
        navigate('/official-login');
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, logout, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  if (!isAuthenticated || official?.role !== 'department_head') return null;

  const deptName = official?.departmentCode?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Department';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{deptName}</h1>
            <p className="text-sm text-gray-500">Welcome, {official?.name}</p>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition">
            Logout
          </button>
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

        {/* Officers */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Officers ({officers.length})</h2>
          <div className="flex flex-wrap gap-3">
            {officers.map((o) => {
              // Find rating from stats if available
              const ratingInfo = stats?.officerRatings?.find(r => r.officerId === o._id);
              return (
                <div key={o._id} className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="w-8 h-8 bg-blue-200 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm">
                    {o.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{o.name}</p>
                    <p className="text-xs text-gray-500">
                      {o.email}
                      {ratingInfo && (
                        <span className="ml-1 text-yellow-600 font-medium">⭐ {ratingInfo.avgRating} ({ratingInfo.totalRatings})</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
            {officers.length === 0 && <p className="text-sm text-gray-400">No officers assigned yet</p>}
          </div>
        </div>

        {/* Officer Ratings Leaderboard */}
        {stats?.officerRatings && stats.officerRatings.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Officer Ratings Leaderboard</h2>
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
                      {['pending', 'assigned'].includes(c.status) && (
                        <button
                          onClick={() => { setSelectedComplaint(c); setAssignModalOpen(true); }}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition font-medium"
                        >
                          Assign
                        </button>
                      )}
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
                      <p className="text-sm text-gray-800"><span className="font-semibold">Category:</span> {c.category}</p>
                      <p className="text-sm text-gray-800"><span className="font-semibold">Phone:</span> {c.user?.phoneNumber || '—'}</p>
                      {c.user?.name && <p className="text-sm text-gray-800"><span className="font-semibold">Name:</span> {c.user.name}</p>}
                      <p className="text-sm text-gray-800"><span className="font-semibold">Officer:</span> {c.assignedTo?.name || '—'}</p>
                      {c.description && (
                        <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">Description:</span> {c.description}</p>
                      )}
                      {c.address?.fullAddress && (
                        <p className="text-sm text-gray-500"><span className="font-semibold text-gray-700">Address:</span> {c.address.fullAddress}</p>
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
      </main>

      {/* Assign Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Assign Officer</h3>
            <p className="text-sm text-gray-500 mb-4">Complaint: {selectedComplaint?.complaintId}</p>

            <select
              value={selectedOfficer}
              onChange={(e) => setSelectedOfficer(e.target.value)}
              className="w-full px-4 py-3 border rounded-xl mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select officer…</option>
              {officers.map((o) => (
                <option key={o._id} value={o._id}>{o.name} ({o.email})</option>
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
    </div>
  );
}
