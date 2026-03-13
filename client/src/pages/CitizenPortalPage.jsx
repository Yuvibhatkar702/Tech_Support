import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const _rawApiUrl = import.meta.env.VITE_API_URL || '/api';
const API_BASE = _rawApiUrl.endsWith('/api') || _rawApiUrl === '/api' ? _rawApiUrl : `${_rawApiUrl.replace(/\/$/, '')}/api`;
const SESSION_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
const ACTIVITY_EVENTS = ['mousemove', 'click', 'keydown', 'scroll', 'touchstart'];

export default function CitizenPortalPage() {
  const { t } = useTranslation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [citizenData, setCitizenData] = useState(null);
  const [token, setToken] = useState(null);
  
  // Login state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Dashboard state
  const [complaints, setComplaints] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  // Restore citizen session from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('citizenToken');
    if (savedToken && !token) {
      setToken(savedToken);
      localStorage.setItem('citizenSession', Date.now().toString());
    }
  }, []);

  // ── Citizen session activity tracking & auto-logout ───────────────
  const touchCitizenSession = useCallback(() => {
    if (!token) return;
    localStorage.setItem('citizenSession', Date.now().toString());
  }, [token]);

  // Activity listeners
  useEffect(() => {
    if (!token) return;
    const handler = () => touchCitizenSession();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
  }, [token, touchCitizenSession]);

  // 30-second interval check for session expiry
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      const lastActive = parseInt(localStorage.getItem('citizenSession') || '0', 10);
      if (lastActive > 0 && Date.now() - lastActive > SESSION_TIMEOUT) {
        clearInterval(id);
        // Inline logout to avoid stale closure
        localStorage.removeItem('citizenToken');
        localStorage.removeItem('citizenSession');
        setToken(null);
        setIsLoggedIn(false);
        setCitizenData(null);
        setComplaints([]);
        setStats(null);
        setPhoneNumber('');
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (token && !isLoggedIn) {
      fetchProfile(token);
    }
  }, [token]);

  const fetchProfile = async (authToken) => {
    const t = authToken || token;
    try {
      const response = await fetch(`${API_BASE}/citizen/profile`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await response.json();
      
      if (data.success) {
        setCitizenData(data.data);
        setStats(data.data.stats);
        setIsLoggedIn(true);
        fetchComplaints('' , t);
      } else {
        handleLogout();
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      handleLogout();
    }
  };

  const fetchComplaints = async (status = '', authToken) => {
    const t = authToken || token;
    try {
      const params = new URLSearchParams({ limit: 50 });
      if (status) params.append('status', status);
      
      const response = await fetch(`${API_BASE}/citizen/complaints?${params}`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      const data = await response.json();
      
      if (data.success) {
        setComplaints(data.data.complaints);
      }
    } catch (error) {
      console.error('Error fetching complaints:', error);
    }
  };

  const handleLoginByPhone = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/citizen/login-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      });
      const data = await response.json();

      if (data.success) {
        localStorage.setItem('citizenToken', data.data.token);
        localStorage.setItem('citizenSession', Date.now().toString());
        setToken(data.data.token);
      } else {
        setError(data.message || 'Failed to login');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/citizen/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      // Ignore logout errors
    }
    
    localStorage.removeItem('citizenToken');
    localStorage.removeItem('citizenSession');
    setToken(null);
    setIsLoggedIn(false);
    setCitizenData(null);
    setComplaints([]);
    setPhoneNumber('');
  };

  const handleSubmitFeedback = async (complaintId, rating, comment) => {
    try {
      const response = await fetch(`${API_BASE}/citizen/complaints/${complaintId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rating, comment }),
      });
      const data = await response.json();
      
      if (data.success) {
        fetchComplaints();
      }
      return data;
    } catch (error) {
      return { success: false, message: 'Failed to submit feedback' };
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      in_progress: 'bg-blue-100 text-blue-700 border-blue-200',
      closed: 'bg-green-100 text-green-700 border-green-200',
      rejected: 'bg-red-100 text-red-700 border-red-200',
    };
    return colors[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  // Login View
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-600 to-indigo-600 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">👤</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Citizen Portal</h1>
            <p className="text-gray-500 mt-2">Enter your phone number to continue</p>
          </div>

          <motion.form
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onSubmit={handleLoginByPhone}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !phoneNumber}
              className="w-full bg-primary-600 text-white py-3 rounded-xl font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Continue'}
            </button>
          </motion.form>

          <div className="mt-6 pt-6 border-t text-center">
            <Link to="/" className="text-primary-600 hover:underline text-sm">
              ← Back to Home
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // Dashboard View
  const filteredComplaints = activeTab === 'all' 
    ? complaints 
    : complaints.filter(c => c.status === activeTab);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <span className="text-xl">👤</span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">
                {citizenData?.name || 'Citizen'}
              </h1>
              <p className="text-sm text-gray-500">{citizenData?.phoneNumber}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total" value={stats?.total || 0} icon="📋" color="blue" />
          <StatCard label="Pending" value={stats?.pending || 0} icon="⏳" color="yellow" />
          <StatCard label="In Progress" value={stats?.inProgress || 0} icon="🔄" color="blue" />
          <StatCard label="Closed" value={stats?.closed || 0} icon="✅" color="green" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {['all', 'pending', 'in_progress', 'closed', 'rejected'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab === 'all' ? 'All' : tab.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Tickets List */}
        <div className="space-y-4">
          {filteredComplaints.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center">
              <p className="text-gray-500">No tickets found</p>
              <Link
                to="/submit"
                className="inline-block mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg"
              >
                Create a Ticket
              </Link>
            </div>
          ) : (
            filteredComplaints.map((complaint) => (
              <ComplaintCard
                key={complaint._id}
                complaint={complaint}
                onFeedback={handleSubmitFeedback}
                t={t}
                getStatusColor={getStatusColor}
              />
            ))
          )}
        </div>

        {/* New Ticket CTA */}
        <div className="fixed bottom-6 right-6">
          <Link
            to="/submit"
            className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-colors"
          >
            <span className="text-xl">+</span>
            <span className="font-medium">New Ticket</span>
          </Link>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <span className="text-xl">{icon}</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ComplaintCard({ complaint, onFeedback, t, getStatusColor }) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
        setComment((prev) => (prev + ' ' + transcript).trim());
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

  const handleSubmit = async () => {
    setSubmitting(true);
    const result = await onFeedback(complaint.complaintId, rating, comment);
    setSubmitting(false);
    if (result.success) {
      setShowFeedback(false);
    }
  };

  const rawPath = complaint.image?.filePath || '';
  const imgSrc = rawPath ? `/${rawPath.replace(/\\/g, '/')}` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-sm border overflow-hidden"
    >
      <div className="p-5">
        {/* Header row: ID + Status + Date/Time + Track link */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-gray-900">{complaint.complaintId}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(complaint.status)}`}>
              {complaint.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {new Date(complaint.createdAt).toLocaleDateString()} {new Date(complaint.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Link
              to={`/track/${complaint.complaintId}`}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Track Ticket
            </Link>
          </div>
        </div>

        {/* Content: Image + Details */}
        <div className="flex gap-4">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt="Screenshot"
              className="w-24 h-24 rounded-lg object-cover cursor-pointer border flex-shrink-0 hover:opacity-80 transition"
              onClick={() => setImagePreview(imgSrc)}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="w-24 h-24 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300 text-xs border">No image</div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm text-gray-800"><span className="font-semibold">Category:</span> {complaint.category}</p>
            <p className="text-sm text-gray-800"><span className="font-semibold">Status:</span> {complaint.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
            {complaint.description && (
              <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">Description:</span> {complaint.description}</p>
            )}
            {complaint.address?.fullAddress && (
              <p className="text-sm text-gray-500"><span className="font-semibold text-gray-700">Address:</span> {complaint.address.fullAddress}</p>
            )}
          </div>
        </div>

        {/* Status Timeline */}
        {complaint.statusHistory && complaint.statusHistory.length > 1 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs font-medium text-gray-500 mb-2">Status History</p>
            <div className="space-y-2">
              {complaint.statusHistory.slice(-3).reverse().map((history, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${
                    history.status === 'closed' ? 'bg-green-500' :
                    history.status === 'in_progress' ? 'bg-blue-500' :
                    'bg-yellow-500'
                  }`} />
                  <span className="text-gray-600">{history.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                  <span className="text-gray-400">
                    {new Date(history.changedAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feedback Section */}
        {complaint.status === 'closed' && !complaint.feedback?.rating && (
          <div className="mt-4 pt-4 border-t">
            {!showFeedback ? (
              <button
                onClick={() => setShowFeedback(true)}
                className="text-primary-600 text-sm font-medium hover:underline"
              >
                ⭐ Rate Resolution
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">How was the resolution?</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className={`text-2xl ${star <= rating ? 'text-yellow-400' : 'text-gray-300'}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Share your feedback (optional)"
                    className="w-full px-3 py-2 pr-12 border rounded-lg text-sm"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={`absolute right-2 top-2 p-1.5 rounded-full transition-colors ${
                      isListening
                        ? 'bg-red-100 text-red-600 animate-pulse'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={isListening ? 'Stop recording' : 'Start voice input'}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                </div>
                {isListening && <p className="text-xs text-red-500">🎤 Listening...</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                  <button
                    onClick={() => setShowFeedback(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show existing feedback */}
        {complaint.feedback?.rating && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-gray-500">Your Rating</p>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className={`text-lg ${star <= complaint.feedback.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                  >
                    ★
                  </span>
                ))}
              </div>
              {complaint.feedback.comment && (
                <span className="text-sm text-gray-600">"{complaint.feedback.comment}"</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Image Preview Modal */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setImagePreview(null)}>
          <img src={imagePreview} alt="Preview" className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </motion.div>
  );
}
