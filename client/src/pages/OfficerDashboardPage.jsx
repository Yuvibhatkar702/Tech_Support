import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOfficialStore, useToastStore } from '../store';
import { officialApi } from '../services/api';
import { MicrophoneIcon } from '@heroicons/react/24/outline';

// ─── Status badge ───────────────────────────────────────────────────
function StatusBadge({ status }) {
  const colors = {
    assigned: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-indigo-100 text-indigo-800',
    closed: 'bg-green-100 text-green-800',
    reopened: 'bg-orange-100 text-orange-800',
  };
  const labels = {
    assigned: 'Assigned',
    in_progress: 'In Progress',
    closed: 'Closed',
    reopened: 'Reopened',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
      {labels[status] || status}
    </span>
  );
}

// ─── Countdown display ──────────────────────────────────────────────
function Countdown({ countdown }) {
  if (!countdown) return null;
  if (countdown.isOverdue) {
    return <span className="text-red-600 text-xs font-semibold">Overdue by {countdown.remainingDays}d {countdown.remainingHours}h</span>;
  }
  return <span className="text-gray-600 text-xs">{countdown.remainingDays}d {countdown.remainingHours}h left</span>;
}

// ─── Stat card ──────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  return (
    <div className={`rounded-xl p-5 ${color} shadow-sm`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm font-medium opacity-80">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '');

export default function OfficerDashboardPage() {
  const navigate = useNavigate();
  const { official, isAuthenticated, logout } = useOfficialStore();
  const { addToast } = useToastStore();

  const [stats, setStats] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [closeRemarks, setCloseRemarks] = useState('');
  const [closeFiles, setCloseFiles] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-IN';

      recognitionRef.current.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
        }
        setCloseRemarks((prev) => (prev + ' ' + transcript).trim());
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const toggleVoice = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Verify session is valid on mount (handles cases where server restarted with new JWT secret)
  useEffect(() => {
    const verifySession = async () => {
      try {
        const res = await officialApi.getProfile();
        // Update official in store with fresh data from server
        if (res.success && res.data.official) {
          // The store already has login, we just verified it's still valid
        }
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
      const [statsRes, complaintsRes] = await Promise.all([
        officialApi.getOfficerStats(),
        officialApi.getOfficerComplaints({ status: statusFilter, page, limit: 15 }),
      ]);
      if (statsRes.success) setStats(statsRes.data);
      if (complaintsRes.success) {
        const statusOrder = { reopened: 0, assigned: 1, in_progress: 2, pending: 3, closed: 4, rejected: 5 };
        const sorted = [...complaintsRes.data].sort((a, b) => {
          const oa = statusOrder[a.status] ?? 9;
          const ob = statusOrder[b.status] ?? 9;
          if (oa !== ob) return oa - ob;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        setComplaints(sorted);
        setPagination(complaintsRes.pagination);
      }
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

  const handleStartWork = async (complaint) => {
    setActionLoading(complaint._id);
    try {
      const res = await officialApi.startWork(complaint._id);
      if (res.success) {
        addToast('Work started', 'success');
        fetchData();
      }
    } catch (error) {
      addToast(error.response?.data?.message || 'Failed to start work', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async () => {
    if (!selectedComplaint) return;
    setActionLoading(selectedComplaint._id);
    try {
      const formData = new FormData();
      formData.append('remarks', closeRemarks || 'Issue closed');
      if (closeFiles) {
        Array.from(closeFiles).forEach((f) => formData.append('proof', f));
      }
      const res = await officialApi.resolveComplaint(selectedComplaint._id, formData);
      if (res.success) {
        addToast('Ticket closed', 'success');
        setCloseModalOpen(false);
        setSelectedComplaint(null);
        setCloseRemarks('');
        setCloseFiles(null);
        fetchData();
      }
    } catch (error) {
      addToast(error.response?.data?.message || 'Failed to close', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/official-login');
  };

  if (!isAuthenticated || official?.role !== 'officer') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Developer Dashboard</h1>
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Total Assigned" value={stats.total} icon="📋" color="bg-white border" />
            <StatCard label="Awaiting Start" value={stats.assigned} icon="⏳" color="bg-blue-50 text-blue-900" />
            <StatCard label="In Progress" value={stats.inProgress} icon="🔧" color="bg-indigo-50 text-indigo-900" />
            <StatCard label="Closed" value={stats.closed} icon="✅" color="bg-green-50 text-green-900" />
            <StatCard label="Avg Rating" value={stats.avgRating ? `${stats.avgRating} ⭐` : 'N/A'} icon="⭐" color="bg-yellow-50 text-yellow-900" />
          </div>
        )}

        {/* Rating Summary */}
        {stats?.avgRating && (
          <div className="bg-white rounded-xl shadow-sm p-5 border">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Your Rating</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span key={star} className={`text-2xl ${star <= Math.round(stats.avgRating) ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                ))}
              </div>
              <div>
                <span className="text-2xl font-bold text-gray-900">{stats.avgRating}</span>
                <span className="text-sm text-gray-500 ml-1">/ 5</span>
              </div>
              <span className="text-sm text-gray-500">({stats.totalRatings} {stats.totalRatings === 1 ? 'rating' : 'ratings'})</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600">Filter:</label>
          {['', 'assigned', 'in_progress', 'closed'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border'
              }`}
            >
              {s === '' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Tickets */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl p-12 text-center text-gray-400 shadow-sm">Loading…</div>
          ) : complaints.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center text-gray-400 shadow-sm">No tickets found</div>
          ) : (
            complaints.map((c) => {
              // If complaint was reopened and has reopen proof, show that instead of original
              const hasReopenProof = c.reopenCount > 0 && c.reopenProof?.length > 0;
              const latestReopenProof = hasReopenProof ? c.reopenProof[c.reopenProof.length - 1] : null;
              
              const rawPath = latestReopenProof?.filePath || c.image?.filePath || c.images?.[0]?.filePath || '';
              const imgSrc = rawPath
                ? `${API_BASE}/${rawPath.replace(/\\/g, '/')}`
                : null;
              
              // Show reopen reason if reopened, otherwise original description
              const displayDescription = c.reopenCount > 0 && c.reopenReason 
                ? c.reopenReason 
                : c.description;
              const isReopened = c.reopenCount > 0;
              
              return (
              <div key={c._id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-gray-900">{c.complaintId}</span>
                    <StatusBadge status={c.status} />
                    {isReopened && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        Reopened {c.reopenCount}x
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Countdown countdown={c.countdown} />
                    <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString()} {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>

                <div className="flex gap-4 mb-3">
                  {/* Image thumbnail - show reopen proof if available */}
                  {imgSrc ? (
                    <div className="relative flex-shrink-0">
                      <img
                        src={imgSrc}
                        alt="complaint"
                        className="w-24 h-24 rounded-lg object-cover cursor-pointer border hover:opacity-80"
                        onClick={() => setImagePreview(imgSrc)}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      {hasReopenProof && (
                        <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full">New</span>
                      )}
                    </div>
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300 text-xs border">No image</div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm text-gray-700"><strong>Category:</strong> {c.category}</p>
                    <p className="text-sm text-gray-700"><strong>Phone:</strong> {c.user?.phoneNumber || '—'}</p>
                    {c.assignedBy?.name && (
                      <p className="text-sm text-gray-700"><strong>Assigned By:</strong> {c.assignedBy.name}</p>
                    )}
                    {displayDescription && (
                      <div>
                        {isReopened && (
                          <span className="text-xs font-medium text-orange-600 mr-1">Reopen reason:</span>
                        )}
                        <p className={`text-sm ${isReopened ? 'text-orange-700' : 'text-gray-600'}`}>{displayDescription}</p>
                      </div>
                    )}
                    {c.address?.fullAddress && <p className="text-xs text-gray-400">{c.address.fullAddress}</p>}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{c.progress || 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        c.progress >= 100 ? 'bg-green-500' : c.progress >= 70 ? 'bg-indigo-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${c.progress || 0}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {c.status === 'assigned' && (
                    <button
                      onClick={() => handleStartWork(c)}
                      disabled={actionLoading === c._id}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                      {actionLoading === c._id ? 'Starting…' : 'Start Work'}
                    </button>
                  )}
                  {['assigned', 'in_progress'].includes(c.status) && (
                    <button
                      onClick={() => { setSelectedComplaint(c); setCloseModalOpen(true); }}
                      disabled={actionLoading === c._id}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                    >
                      Close Ticket
                    </button>
                  )}
                </div>
              </div>
            );
            })
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 hover:bg-white transition">Prev</button>
              <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 hover:bg-white transition">Next</button>
            </div>
          </div>
        )}
      </main>

      {/* Image Preview Modal */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setImagePreview(null)}>
          <img src={imagePreview} alt="Preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
        </div>
      )}

      {/* Close Ticket Modal */}
      {closeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Close Ticket</h3>
            <p className="text-sm text-gray-500 mb-4">{selectedComplaint?.complaintId}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Closing Remarks</label>
                <div className="relative">
                  <textarea
                    value={closeRemarks}
                    onChange={(e) => setCloseRemarks(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 pr-12 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="Describe the resolution…"
                  />
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={`absolute right-3 top-2 p-2 rounded-full transition-colors ${
                      isListening
                        ? 'bg-red-100 text-red-600 animate-pulse'
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                    title={isListening ? 'Stop recording' : 'Start voice input'}
                  >
                    <MicrophoneIcon className="w-5 h-5" />
                  </button>
                </div>
                {isListening && <p className="text-xs text-red-500 mt-1">🎤 Listening...</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Upload Proof (optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => setCloseFiles(e.target.files)}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setCloseModalOpen(false); setCloseRemarks(''); setCloseFiles(null); }}
                className="flex-1 py-2.5 border rounded-xl text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={actionLoading === selectedComplaint?._id}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition"
              >
                {actionLoading === selectedComplaint?._id ? 'Closing…' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
