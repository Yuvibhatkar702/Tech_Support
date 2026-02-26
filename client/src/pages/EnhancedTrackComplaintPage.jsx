import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  MapPinIcon,
  CalendarIcon,
  TagIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { complaintApi } from '../services/api';
import { useToastStore } from '../store';
import LanguageSelector from '../components/LanguageSelector';
import StatusBadge from '../components/StatusBadge';
import QRCodeScanner from '../components/QRCodeScanner';

// Status Timeline Component
function StatusTimeline({ history, currentStatus }) {
  const { t } = useTranslation();

  const allStatuses = [
    { key: 'pending', label: t('status.pending'), icon: ClockIcon },
    { key: 'assigned', label: t('status.assigned'), icon: TagIcon },
    { key: 'in_progress', label: t('status.in_progress'), icon: ArrowPathIcon },
    { key: 'resolved', label: t('status.resolved'), icon: CheckCircleIcon },
  ];

  const statusOrder = ['pending', 'assigned', 'in_progress', 'resolved'];
  const currentIndex = statusOrder.indexOf(currentStatus);
  const isRejected = currentStatus === 'rejected';

  return (
    <div className="py-4">
      <div className="relative">
        {allStatuses.map((status, index) => {
          const historyEntry = history?.find(h => h.status === status.key);
          const isCompleted = statusOrder.indexOf(status.key) < currentIndex;
          const isCurrent = status.key === currentStatus;
          const isPending = statusOrder.indexOf(status.key) > currentIndex;

          return (
            <div key={status.key} className="relative flex items-start mb-8 last:mb-0">
              {/* Connector Line */}
              {index < allStatuses.length - 1 && (
                <div
                  className={`absolute left-4 top-8 w-0.5 h-full -ml-px ${
                    isCompleted || isCurrent ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}

              {/* Status Icon */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full ${
                  isCompleted
                    ? 'bg-green-500'
                    : isCurrent
                    ? 'bg-primary-600 ring-4 ring-primary-100'
                    : 'bg-gray-200'
                }`}
              >
                {isCompleted ? (
                  <CheckCircleSolidIcon className="w-5 h-5 text-white" />
                ) : (
                  <status.icon className={`w-4 h-4 ${isCurrent ? 'text-white' : 'text-gray-500'}`} />
                )}
                
                {/* Pulse for current */}
                {isCurrent && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary-500"
                    animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </motion.div>

              {/* Content */}
              <div className="ml-4 flex-1">
                <div className="flex items-center justify-between">
                  <p className={`font-medium ${
                    isPending ? 'text-gray-400' : 'text-gray-900'
                  }`}>
                    {status.label}
                  </p>
                  {historyEntry && (
                    <span className="text-xs text-gray-500">
                      {new Date(historyEntry.changedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                {historyEntry?.notes && (
                  <p className="text-sm text-gray-600 mt-1">{historyEntry.notes}</p>
                )}
                {isCurrent && !isPending && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="inline-block mt-1 text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full"
                  >
                    {t('current_status')}
                  </motion.span>
                )}
              </div>
            </div>
          );
        })}

        {/* Rejected Status (if applicable) */}
        {isRejected && (
          <div className="relative flex items-start">
            <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-red-500">
              <ExclamationCircleIcon className="w-5 h-5 text-white" />
            </div>
            <div className="ml-4 flex-1">
              <p className="font-medium text-red-700">{t('status.rejected')}</p>
              {history?.find(h => h.status === 'rejected')?.notes && (
                <p className="text-sm text-red-600 mt-1">
                  {history.find(h => h.status === 'rejected').notes}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Complaint Card Component
function ComplaintCard({ complaint }) {
  const { t } = useTranslation();

  const categoryIcons = {
    road_damage: '🛣️',
    street_light: '💡',
    water_supply: '💧',
    sewage: '🚿',
    garbage: '🗑️',
    encroachment: '🚧',
    noise_pollution: '🔊',
    illegal_construction: '🏗️',
    traffic: '🚗',
    other: '📋',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-primary-100 text-sm">{t('complaint_id')}</p>
            <p className="text-white text-xl font-bold font-mono">
              {complaint.complaintId}
            </p>
          </div>
          <StatusBadge status={complaint.status} size="lg" />
        </div>
      </div>

      {/* Details */}
      <div className="p-5 space-y-4">
        {/* Category */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-xl">
            {categoryIcons[complaint.category] || '📋'}
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('category')}</p>
            <p className="font-medium text-gray-900">{t(`categories.${complaint.category}`)}</p>
          </div>
        </div>

        {/* Location */}
        {complaint.location?.address && (
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <MapPinIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('location')}</p>
              <p className="text-sm text-gray-900">{complaint.location.address}</p>
            </div>
          </div>
        )}

        {/* Date */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <CalendarIcon className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('submitted_on')}</p>
            <p className="font-medium text-gray-900">
              {new Date(complaint.createdAt).toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Description */}
        {complaint.description && (
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">{t('description')}</p>
            <p className="text-sm text-gray-700">{complaint.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Main Page Component
export default function EnhancedTrackComplaintPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { complaintId: urlComplaintId } = useParams();
  const { addToast } = useToastStore();

  const [searchId, setSearchId] = useState(() => {
    if (urlComplaintId) return urlComplaintId.replace(/^GRV/i, '');
    return '';
  });
  const [complaint, setComplaint] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (urlComplaintId) {
      setSearchId(urlComplaintId.replace(/^GRV/i, ''));
      fetchComplaint(urlComplaintId);
    }
  }, [urlComplaintId]);

  const fetchComplaint = async (id) => {
    if (!id.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await complaintApi.getStatus(id.trim());
      if (result.success) {
        setComplaint(result.data.complaint);
      } else {
        setError(result.message || t('complaint_not_found'));
        setComplaint(null);
      }
    } catch (err) {
      console.error('Error fetching complaint:', err);
      setError(t('complaint_not_found'));
      setComplaint(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchId.trim()) {
      const fullId = `GRV${searchId.trim()}`;
      navigate(`/track/${fullId}`);
      fetchComplaint(fullId);
    }
  };

  const handleRefresh = () => {
    if (complaint?.complaintId) {
      fetchComplaint(complaint.complaintId);
      addToast(t('refreshed'), 'success');
    }
  };

  const handleQRScan = (scannedId) => {
    if (!scannedId) return;
    const id = scannedId.trim().toUpperCase();
    if (!id) return;

    setSearchId(id.replace(/^GRV/i, ''));
    setShowScanner(false);
    navigate(`/track/${id}`);
    fetchComplaint(id);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
              </Link>
              <h1 className="font-semibold text-gray-900">{t('track_complaint')}</h1>
            </div>
            <LanguageSelector compact />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Search Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSearch}
          className="mb-6"
        >
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('enter_complaint_id')}
            </label>
            <div className="flex gap-3">
              <div className="flex-1 relative flex">
                <span className="inline-flex items-center px-4 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-gray-600 font-mono font-semibold text-sm select-none">
                  GRV
                </span>
                <input
                  type="text"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="2602260001"
                  className="w-full pl-3 pr-4 py-3 border border-gray-200 rounded-r-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !searchId.trim()}
                className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {isLoading ? (
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <MagnifyingGlassIcon className="w-5 h-5" />
                    <span className="hidden sm:inline">{t('search')}</span>
                  </>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="mt-3 w-full border border-dashed border-primary-300 text-primary-700 bg-primary-50/40 hover:bg-primary-50 rounded-xl px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <DocumentDuplicateIcon className="w-4 h-4" />
              {t('qr.scan_code', 'Scan QR code instead')}
            </button>
          </div>
        </motion.form>

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center mb-6"
            >
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ExclamationCircleIcon className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-red-900 mb-2">
                {t('complaint_not_found')}
              </h3>
              <p className="text-sm text-red-700 mb-4">
                {t('check_complaint_id')}
              </p>
              <button
                onClick={() => {
                  setError(null);
                  setSearchId('');
                }}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                {t('try_again')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading State */}
        {isLoading && !complaint && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-600">{t('searching')}</p>
          </div>
        )}

        {/* Complaint Details */}
        <AnimatePresence>
          {complaint && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Refresh Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  {t('refresh_status')}
                </button>
              </div>

              {/* Complaint Card */}
              <ComplaintCard complaint={complaint} />

              {/* Status Timeline */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="font-semibold text-gray-900 mb-4">
                  {t('status_timeline')}
                </h3>
                <StatusTimeline
                  history={complaint.statusHistory}
                  currentStatus={complaint.status}
                />
              </div>

              {/* Submit Another */}
              <div className="text-center">
                <Link
                  to="/submit"
                  className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                >
                  {t('submit_new_complaint')}
                  <ChevronRightIcon className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!complaint && !isLoading && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MagnifyingGlassIcon className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('enter_complaint_id_to_track')}
            </h3>
            <p className="text-gray-500 text-sm max-w-xs mx-auto">
              {t('tracking_instruction')}
            </p>
          </motion.div>
        )}
      </main>
      <AnimatePresence>
        {showScanner && (
          <QRCodeScanner
            onScan={handleQRScan}
            onClose={() => setShowScanner(false)}
            onError={(err) => {
              console.error('QR scan error:', err);
              setError(t('error_generic'));
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
