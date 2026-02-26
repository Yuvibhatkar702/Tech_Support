import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export default function CommunityFeed() {
  const { t } = useTranslation();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    sortBy: 'newest',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0,
  });
  const [trending, setTrending] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchFeed();
    fetchTrending();
    fetchStats();
  }, [filters, pagination.page]);

  const fetchFeed = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        sortBy: filters.sortBy,
        ...(filters.category && { category: filters.category }),
        ...(filters.status && { status: filters.status }),
      });
      
      const response = await fetch(`${API_BASE}/community/feed?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setComplaints(data.data.complaints);
        setPagination(prev => ({ ...prev, ...data.data.pagination }));
      }
    } catch (error) {
      console.error('Error fetching feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrending = async () => {
    try {
      const response = await fetch(`${API_BASE}/community/trending/list`);
      const data = await response.json();
      if (data.success) {
        setTrending(data.data.complaints);
      }
    } catch (error) {
      console.error('Error fetching trending:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/community/stats/summary`);
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleUpvote = async (complaintId) => {
    try {
      const response = await fetch(`${API_BASE}/community/${complaintId}/upvote`, {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        setComplaints(prev => prev.map(c => 
          c.complaintId === complaintId 
            ? { ...c, upvoteCount: data.data.upvoteCount, userUpvoted: data.data.upvoted }
            : c
        ));
      }
    } catch (error) {
      console.error('Error upvoting:', error);
    }
  };

  const categories = [
    'road_damage', 'street_light', 'water_supply', 'sewage', 'garbage',
    'encroachment', 'noise_pollution', 'illegal_construction', 'traffic', 'other'
  ];

  const getCategoryIcon = (category) => {
    const icons = {
      road_damage: '🛣️',
      street_light: '💡',
      water_supply: '💧',
      sewage: '🚰',
      garbage: '🗑️',
      encroachment: '🚧',
      noise_pollution: '🔊',
      illegal_construction: '🏗️',
      traffic: '🚦',
      other: '📋',
    };
    return icons[category] || '📋';
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-700',
      in_progress: 'bg-blue-100 text-blue-700',
      resolved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const formatTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-indigo-600 text-white py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">🏘️ Community Feed</h1>
          <p className="text-white/80">See what's happening in your community</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Feed */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-wrap gap-3">
              <select
                value={filters.category}
                onChange={(e) => {
                  setFilters(f => ({ ...f, category: e.target.value }));
                  setPagination(p => ({ ...p, page: 1 }));
                }}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c} value={c}>{t(`categories.${c}`)}</option>
                ))}
              </select>

              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters(f => ({ ...f, status: e.target.value }));
                  setPagination(p => ({ ...p, page: 1 }));
                }}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">All Status</option>
                <option value="pending">{t('status.pending')}</option>
                <option value="in_progress">{t('status.in_progress')}</option>
                <option value="resolved">{t('status.resolved')}</option>
              </select>

              <select
                value={filters.sortBy}
                onChange={(e) => {
                  setFilters(f => ({ ...f, sortBy: e.target.value }));
                  setPagination(p => ({ ...p, page: 1 }));
                }}
                className="px-3 py-2 border rounded-lg text-sm"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="most_upvoted">Most Upvoted</option>
              </select>
            </div>

            {/* Complaint Cards */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-3"></div>
                    <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : complaints.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <p className="text-gray-500">No complaints found</p>
              </div>
            ) : (
              <AnimatePresence>
                {complaints.map((complaint, index) => (
                  <motion.div
                    key={complaint._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-xl shadow-sm border hover:shadow-md transition-shadow"
                  >
                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{getCategoryIcon(complaint.category)}</span>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {t(`categories.${complaint.category}`)}
                            </h3>
                            <p className="text-xs text-gray-500">
                              {complaint.complaintId} • {formatTimeAgo(complaint.createdAt)}
                            </p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(complaint.status)}`}>
                          {t(`status.${complaint.status}`)}
                        </span>
                      </div>

                      {/* Description */}
                      {complaint.description && (
                        <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                          {complaint.description}
                        </p>
                      )}

                      {/* Location */}
                      {complaint.address?.fullAddress && (
                        <p className="text-gray-500 text-xs mb-4 flex items-center gap-1">
                          <span>📍</span>
                          {complaint.address.fullAddress}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-3 border-t">
                        <button
                          onClick={() => handleUpvote(complaint.complaintId)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            complaint.userUpvoted
                              ? 'bg-primary-100 text-primary-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          <span>👍</span>
                          <span>{complaint.upvoteCount || 0}</span>
                          <span className="text-xs">Support</span>
                        </button>

                        <Link
                          to={`/track/${complaint.complaintId}`}
                          className="text-primary-600 text-sm font-medium hover:underline"
                        >
                          View Details →
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                  disabled={pagination.page === 1}
                  className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-gray-600">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                  disabled={pagination.page === pagination.pages}
                  className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Community Stats */}
            {stats && (
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-900 mb-4">📊 Community Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Complaints</span>
                    <span className="font-semibold">{stats.totalComplaints}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Resolved</span>
                    <span className="font-semibold text-green-600">
                      {stats.byStatus?.resolved || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">In Progress</span>
                    <span className="font-semibold text-blue-600">
                      {stats.byStatus?.in_progress || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Upvotes</span>
                    <span className="font-semibold">{stats.totalUpvotes}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Trending */}
            {trending.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border p-5">
                <h3 className="font-semibold text-gray-900 mb-4">🔥 Trending This Week</h3>
                <div className="space-y-3">
                  {trending.slice(0, 5).map((complaint, index) => (
                    <Link
                      key={complaint._id}
                      to={`/track/${complaint.complaintId}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <span className="text-lg font-bold text-gray-400">
                        #{index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {t(`categories.${complaint.category}`)}
                        </p>
                        <p className="text-xs text-gray-500">
                          👍 {complaint.upvoteCount} upvotes
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="bg-gradient-to-br from-primary-600 to-indigo-600 rounded-xl p-5 text-white">
              <h3 className="font-semibold mb-2">Have an Issue?</h3>
              <p className="text-sm text-white/80 mb-4">
                Report problems in your area and help improve your community.
              </p>
              <Link
                to="/submit"
                className="block w-full bg-white text-primary-600 text-center py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                File a Complaint
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
