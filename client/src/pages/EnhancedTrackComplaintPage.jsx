import { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronRightIcon,
  ExclamationTriangleIcon,
  StarIcon,
  PhotoIcon,
  ArrowUturnLeftIcon,
  MicrophoneIcon,
  XMarkIcon,
  CameraIcon,
  DevicePhoneMobileIcon,
  IdentificationIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon, StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { complaintApi } from '../services/api';
import { useToastStore } from '../store';
import LanguageSelector from '../components/LanguageSelector';
import StatusBadge from '../components/StatusBadge';
import QRCodeScanner from '../components/QRCodeScanner';

const IMAGE_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

// Status Timeline Component
function StatusTimeline({ history, currentStatus }) {
  const { t } = useTranslation();

  const allStatuses = [
    { key: 'pending', label: t('status.pending'), icon: ClockIcon },
    { key: 'assigned', label: t('status.assigned'), icon: TagIcon },
    { key: 'in_progress', label: t('status.in_progress'), icon: ArrowPathIcon },
    { key: 'closed', label: t('status.closed'), icon: CheckCircleIcon },
  ];

  const statusOrder = ['pending', 'assigned', 'in_progress', 'closed'];
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

// Resolution Countdown Component
function ResolutionCountdown({ countdown }) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(null);

  const calculateRemaining = useCallback(() => {
    if (!countdown?.expectedResolveAt) return null;
    const now = new Date();
    const diff = new Date(countdown.expectedResolveAt).getTime() - now.getTime();
    if (diff <= 0) {
      return { remainingDays: 0, remainingHours: 0, remainingMinutes: 0, remainingSeconds: 0, isOverdue: true };
    }
    return {
      remainingDays: Math.floor(diff / (1000 * 60 * 60 * 24)),
      remainingHours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      remainingMinutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      remainingSeconds: Math.floor((diff % (1000 * 60)) / 1000),
      isOverdue: false,
    };
  }, [countdown]);

  useEffect(() => {
    setRemaining(calculateRemaining());
    const interval = setInterval(() => {
      setRemaining(calculateRemaining());
    }, 1000); // Update every second
    return () => clearInterval(interval);
  }, [calculateRemaining]);

  if (!remaining) return null;

  if (remaining.isOverdue) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-red-50 border border-red-200 rounded-2xl p-4"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="font-semibold text-red-800">
              {t('resolution_overdue', 'Resolution Time Exceeded')}
            </p>
            <p className="text-sm text-red-600 mt-0.5">
              {t('escalation_required', 'Escalation required — expected within')} {countdown.resolutionDays} {t('days', 'days')}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-blue-50 border border-blue-200 rounded-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <ClockIcon className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-blue-800">
            {t('expected_resolution_in', 'Expected Resolution In')}
          </p>
          <div className="flex items-baseline gap-1 mt-1">
            {remaining.remainingDays > 0 && (
              <span className="text-2xl font-bold text-blue-700">
                {remaining.remainingDays}<span className="text-sm font-medium ml-0.5">{t('d', 'd')}</span>
              </span>
            )}
            <span className="text-2xl font-bold text-blue-700">
              {String(remaining.remainingHours).padStart(2, '0')}<span className="text-sm font-medium ml-0.5">{t('h', 'h')}</span>
            </span>
            <span className="text-2xl font-bold text-blue-700">
              {String(remaining.remainingMinutes).padStart(2, '0')}<span className="text-sm font-medium ml-0.5">{t('m', 'm')}</span>
            </span>
            <span className="text-2xl font-bold text-blue-600">
              {String(remaining.remainingSeconds).padStart(2, '0')}<span className="text-sm font-medium ml-0.5">{t('s', 's')}</span>
            </span>
          </div>
          <p className="text-xs text-blue-500 mt-1">
            {countdown.estimatedResolution || `${countdown.resolutionDays} days`}
             — {t('live_countdown', 'live countdown')}
          </p>
        </div>
      </div>
    </motion.div>
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
            <p className="font-medium text-gray-900">{complaint.category}</p>
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

        {/* Complaint Image(s) */}
        {(() => {
          // Collect all available image paths
          const imgs = [];
          if (complaint.image?.filePath) imgs.push(complaint.image.filePath);
          if (complaint.images?.length) {
            complaint.images.forEach((img) => {
              if (img.filePath && !imgs.includes(img.filePath)) imgs.push(img.filePath);
            });
          }
          if (imgs.length === 0) return null;
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <PhotoIcon className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500 uppercase tracking-wide">{t('photo', 'Photo')}</p>
              </div>
              <div className={`grid gap-2 ${imgs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {imgs.map((fp, idx) => (
                  <div key={idx} className="rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                    <img
                      src={`${IMAGE_BASE}/${fp.replace(/\\/g, '/')}`}
                      alt={`Complaint photo ${idx + 1}`}
                      className="w-full max-h-64 object-contain cursor-pointer hover:opacity-90 transition"
                      onClick={() => window.open(`${IMAGE_BASE}/${fp.replace(/\\/g, '/')}`, '_blank')}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
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

  // Tab state: 'id' or 'mobile'
  const [activeTab, setActiveTab] = useState(urlComplaintId ? 'id' : 'id');

  // Mobile tracking state
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [mobileComplaints, setMobileComplaints] = useState(null);
  const [mobileError, setMobileError] = useState(null);
  const [resendTimer, setResendTimer] = useState(0);

  // Reopen state
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenImage, setReopenImage] = useState(null);
  const [reopenImagePreview, setReopenImagePreview] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState(null); // 'reopen' or 'rating'
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  // Rating state
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-IN';

      recognitionRef.current.onerror = () => { setIsListening(false); setActiveVoiceField(null); };
      recognitionRef.current.onend = () => { setIsListening(false); setActiveVoiceField(null); };
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const toggleVoice = (field) => {
    if (!recognitionRef.current) return;
    if (isListening && activeVoiceField === field) {
      recognitionRef.current.stop();
      setIsListening(false);
      setActiveVoiceField(null);
    } else {
      // Stop any current recording first
      if (isListening) recognitionRef.current.stop();
      
      // Set new onresult handler based on field
      recognitionRef.current.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
        }
        if (field === 'reopen') {
          setReopenReason((prev) => (prev + ' ' + transcript).trim());
        } else if (field === 'rating') {
          setRatingComment((prev) => (prev + ' ' + transcript).trim());
        }
      };
      
      recognitionRef.current.start();
      setIsListening(true);
      setActiveVoiceField(field);
    }
  };

  const handleReopenImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setReopenImage(file);
      setReopenImagePreview(URL.createObjectURL(file));
    }
  };

  const removeReopenImage = () => {
    setReopenImage(null);
    if (reopenImagePreview) URL.revokeObjectURL(reopenImagePreview);
    setReopenImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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

  const handleReopen = async () => {
    if (!reopenReason.trim()) {
      addToast('Please provide a reason for reopening', 'error');
      return;
    }
    setReopenLoading(true);
    try {
      const result = await complaintApi.reopenComplaint(complaint.complaintId, reopenReason.trim(), null, reopenImage);
      if (result.success) {
        addToast(result.message || 'Complaint reopened', 'success');
        setShowReopenForm(false);
        setReopenReason('');
        removeReopenImage();
        fetchComplaint(complaint.complaintId);
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to reopen', 'error');
    } finally {
      setReopenLoading(false);
    }
  };

  const handleRate = async () => {
    if (ratingValue < 1 || ratingValue > 5) {
      addToast('Please select a rating', 'error');
      return;
    }
    setRatingLoading(true);
    try {
      const result = await complaintApi.rateOfficer(complaint.complaintId, ratingValue, ratingComment.trim());
      if (result.success) {
        addToast(result.message || 'Thank you for your rating!', 'success');
        setShowRatingForm(false);
        setRatingValue(0);
        setRatingComment('');
        fetchComplaint(complaint.complaintId);
      }
    } catch (err) {
      addToast(err.response?.data?.message || 'Failed to submit rating', 'error');
    } finally {
      setRatingLoading(false);
    }
  };

  // ─── Mobile OTP Tracking Handlers ─────────────────────────────────

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  const handleSendOTP = async (e) => {
    e?.preventDefault();
    const phone = mobileNumber.trim();
    if (!phone) return;

    setOtpLoading(true);
    setMobileError(null);

    try {
      const result = await complaintApi.trackSendOTP(phone);
      if (result.success) {
        setOtpSent(true);
        setResendTimer(60); // 60s cooldown
        addToast(t('otp_sent'), 'success');
        // Dev mode: auto-fill OTP if returned
        if (result.otp) {
          setOtpValue(result.otp);
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || t('error_generic');
      if (err.response?.status === 404) {
        setMobileError(t('no_complaints_for_number'));
      } else if (err.response?.status === 429) {
        setMobileError(msg);
        setResendTimer(err.response?.data?.retryAfter || 60);
      } else {
        setMobileError(msg);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e?.preventDefault();
    const phone = mobileNumber.trim();
    const otp = otpValue.trim();
    if (!phone || !otp) return;

    setOtpLoading(true);
    setMobileError(null);

    try {
      const result = await complaintApi.trackVerifyOTP(phone, otp);
      if (result.success) {
        setMobileComplaints(result.data);
        addToast(t('otp_sent_hint'), 'success');
      }
    } catch (err) {
      const msg = err.response?.data?.message || t('otp_invalid');
      setMobileError(msg);
    } finally {
      setOtpLoading(false);
    }
  };

  const resetMobileSearch = () => {
    setOtpSent(false);
    setOtpValue('');
    setMobileComplaints(null);
    setMobileError(null);
    setMobileNumber('');
    setResendTimer(0);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError(null);
    setMobileError(null);
  };

  const API_BASE = import.meta.env.VITE_API_URL?.replace('/api', '') || '';

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
        {/* Tab Switcher */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 mb-6 flex">
          <button
            onClick={() => handleTabChange('id')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'id'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <IdentificationIcon className="w-5 h-5" />
            {t('tab_complaint_id')}
          </button>
          <button
            onClick={() => handleTabChange('mobile')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
              activeTab === 'mobile'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <DevicePhoneMobileIcon className="w-5 h-5" />
            {t('tab_mobile_number')}
          </button>
        </div>

        {/* ═══ TAB 1: Complaint ID Search ═══ */}
        {activeTab === 'id' && (
          <>
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

              {/* Assignment & Department Info */}
              {(complaint.department || complaint.assignedTo) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3"
                >
                  <h3 className="font-semibold text-gray-900">{t('assignment_info', 'Assignment Details')}</h3>
                  {complaint.department && (
                    <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">{t('department', 'Department')}</p>
                        <p className="font-medium text-gray-900">
                          {complaint.department.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </p>
                      </div>
                    </div>
                  )}
                  {complaint.assignedTo && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide">{t('assigned_officer', 'Assigned Officer')}</p>
                        <p className="font-medium text-gray-900">{complaint.assignedTo.name}</p>
                      </div>
                    </div>
                  )}
                  {complaint.assignedAt && (
                    <p className="text-xs text-gray-400 pl-1">
                      Assigned on {new Date(complaint.assignedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  )}
                </motion.div>
              )}

              {/* Resolution Countdown */}
              {complaint.countdown && (
                <ResolutionCountdown countdown={complaint.countdown} />
              )}

              {/* Resolution Proof Images */}
              {complaint.resolutionProof && complaint.resolutionProof.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <PhotoIcon className="w-5 h-5 text-green-600" />
                    <h3 className="font-semibold text-gray-900">Resolution Proof</h3>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {complaint.resolutionProof.map((proof, idx) => (
                      <a
                        key={idx}
                        href={`${API_BASE}${proof.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative block rounded-xl overflow-hidden border border-gray-200 hover:border-green-400 transition"
                      >
                        <img
                          src={`${API_BASE}${proof.url}`}
                          alt={`Proof ${idx + 1}`}
                          className="w-full h-32 object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                        <div className="hidden items-center justify-center w-full h-32 bg-gray-100 text-gray-400">
                          <PhotoIcon className="w-8 h-8" />
                        </div>
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                          <p className="text-white text-xs truncate">{proof.fileName || `Proof ${idx + 1}`}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                  {complaint.resolution?.description && (
                    <div className="mt-3 p-3 bg-green-50 rounded-xl">
                      <p className="text-sm text-green-800">
                        <strong>Officer remarks:</strong> {complaint.resolution.description}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Officer Rating (already rated) */}
              {complaint.officerRating?.rating && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-green-50 border border-green-200 rounded-2xl p-5"
                >
                  <h3 className="font-semibold text-green-900 mb-2">Your Rating</h3>
                  <div className="flex items-center gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <StarSolidIcon
                        key={star}
                        className={`w-6 h-6 ${star <= complaint.officerRating.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                      />
                    ))}
                    <span className="ml-2 text-sm font-medium text-green-800">{complaint.officerRating.rating}/5</span>
                  </div>
                  {complaint.officerRating.comment && (
                    <p className="text-sm text-green-700 mt-1">"{complaint.officerRating.comment}"</p>
                  )}
                </motion.div>
              )}

              {/* Reopen & Rate Buttons (only when closed and not yet rated) */}
              {complaint.status === 'closed' && !complaint.officerRating?.rating && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4"
                >
                  <h3 className="font-semibold text-gray-900">Is the issue resolved?</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* Rate (Satisfied) */}
                    <button
                      onClick={() => { setShowRatingForm(true); setShowReopenForm(false); }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition"
                    >
                      <StarIcon className="w-5 h-5" />
                      Yes, Rate Officer
                    </button>
                    {/* Reopen (Not satisfied) */}
                    {(complaint.reopenCount || 0) < 3 && (
                      <button
                        onClick={() => { setShowReopenForm(true); setShowRatingForm(false); }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition"
                      >
                        <ArrowUturnLeftIcon className="w-5 h-5" />
                        No, Reopen Complaint
                      </button>
                    )}
                  </div>

                  {/* Rating Form */}
                  <AnimatePresence>
                    {showRatingForm && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border border-green-200 rounded-xl p-4 bg-green-50 space-y-3">
                          <p className="text-sm font-medium text-green-900">Rate the officer's work:</p>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                onMouseEnter={() => setRatingHover(star)}
                                onMouseLeave={() => setRatingHover(0)}
                                onClick={() => setRatingValue(star)}
                                className="p-1 transition-transform hover:scale-110"
                              >
                                {star <= (ratingHover || ratingValue) ? (
                                  <StarSolidIcon className="w-8 h-8 text-yellow-400" />
                                ) : (
                                  <StarIcon className="w-8 h-8 text-gray-300" />
                                )}
                              </button>
                            ))}
                            {ratingValue > 0 && (
                              <span className="ml-2 text-sm font-medium text-green-800">{ratingValue}/5</span>
                            )}
                          </div>
                          <div className="relative">
                            <textarea
                              value={ratingComment}
                              onChange={(e) => setRatingComment(e.target.value)}
                              placeholder="Optional: Leave a comment about the officer's service..."
                              rows={2}
                              className="w-full px-3 py-2 pr-12 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => toggleVoice('rating')}
                              className={`absolute right-3 top-2 p-2 rounded-full transition-colors ${
                                isListening && activeVoiceField === 'rating'
                                  ? 'bg-red-100 text-red-600 animate-pulse'
                                  : 'bg-green-100 text-green-600 hover:bg-green-200'
                              }`}
                              title={isListening && activeVoiceField === 'rating' ? 'Stop recording' : 'Start voice input'}
                            >
                              <MicrophoneIcon className="w-5 h-5" />
                            </button>
                          </div>
                          {isListening && activeVoiceField === 'rating' && (
                            <p className="text-xs text-red-500">🎤 Listening...</p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowRatingForm(false)}
                              className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 text-sm transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleRate}
                              disabled={ratingValue < 1 || ratingLoading}
                              className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium transition"
                            >
                              {ratingLoading ? 'Submitting...' : 'Submit Rating'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Reopen Form */}
                  <AnimatePresence>
                    {showReopenForm && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border border-orange-200 rounded-xl p-4 bg-orange-50 space-y-3">
                          <p className="text-sm font-medium text-orange-900">
                            Why are you not satisfied? (Reopen {(complaint.reopenCount || 0) + 1}/3)
                          </p>
                          
                          {/* Description with voice-to-text */}
                          <div className="relative">
                            <textarea
                              value={reopenReason}
                              onChange={(e) => setReopenReason(e.target.value)}
                              placeholder="Explain why the issue is not resolved..."
                              rows={3}
                              className="w-full px-3 py-2 pr-12 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                              required
                            />
                            {/* Voice-to-text button */}
                            <button
                              type="button"
                              onClick={() => toggleVoice('reopen')}
                              className={`absolute right-3 top-2 p-2 rounded-full transition-colors ${
                                isListening && activeVoiceField === 'reopen'
                                  ? 'bg-red-100 text-red-600 animate-pulse'
                                  : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                              }`}
                              title={isListening && activeVoiceField === 'reopen' ? 'Stop recording' : 'Start voice input'}
                            >
                              <MicrophoneIcon className="w-5 h-5" />
                            </button>
                          </div>
                          {isListening && activeVoiceField === 'reopen' && (
                            <p className="text-xs text-red-500">🎤 Listening...</p>
                          )}

                          {/* Image Upload */}
                          <div className="space-y-2">
                            <p className="text-xs text-orange-700">Add latest proof image (optional)</p>
                            <input
                              type="file"
                              ref={fileInputRef}
                              accept="image/*"
                              onChange={handleReopenImageChange}
                              className="hidden"
                            />
                            {!reopenImagePreview ? (
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-3 border-2 border-dashed border-orange-300 rounded-lg text-orange-600 hover:bg-orange-100 transition flex items-center justify-center gap-2 text-sm"
                              >
                                <CameraIcon className="w-5 h-5" />
                                Add Photo
                              </button>
                            ) : (
                              <div className="relative">
                                <img
                                  src={reopenImagePreview}
                                  alt="Reopen proof"
                                  className="w-full h-32 object-cover rounded-lg"
                                />
                                <button
                                  type="button"
                                  onClick={removeReopenImage}
                                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                                >
                                  <XMarkIcon className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => { setShowReopenForm(false); removeReopenImage(); }}
                              className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 text-sm transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleReopen}
                              disabled={!reopenReason.trim() || reopenLoading}
                              className="flex-1 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 text-sm font-medium transition"
                            >
                              {reopenLoading ? 'Reopening...' : 'Reopen Complaint'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

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

        {/* Empty State (ID tab) */}
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
          </>
        )}

        {/* ═══ TAB 2: Mobile Number Search ═══ */}
        {activeTab === 'mobile' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Show complaints list if OTP verified */}
            {mobileComplaints ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{t('your_complaints')}</h3>
                    <p className="text-sm text-gray-500">
                      {mobileComplaints.totalComplaints} {t('total_found')}
                    </p>
                  </div>
                  <button
                    onClick={resetMobileSearch}
                    className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <ArrowLeftIcon className="w-4 h-4" />
                    {t('back_to_search')}
                  </button>
                </div>

                {mobileComplaints.complaints.map((c) => (
                  <Link
                    key={c.complaintId}
                    to={`/track/${c.complaintId}`}
                    onClick={() => { setActiveTab('id'); setSearchId(c.complaintId.replace(/^GRV/i, '')); }}
                    className="block bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:border-primary-200 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-primary-700">{c.complaintId}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <TagIcon className="w-4 h-4 text-gray-400" />
                        <span>{c.category}</span>
                      </div>
                      {c.location && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <MapPinIcon className="w-4 h-4 text-gray-400" />
                          <span className="truncate">{c.location}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <CalendarIcon className="w-4 h-4 text-gray-400" />
                        <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                      </div>
                      {c.description && (
                        <p className="text-sm text-gray-500 mt-1">{c.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-end mt-3 text-primary-600 text-sm font-medium">
                      {t('view_details')}
                      <ChevronRightIcon className="w-4 h-4 ml-1" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              /* Send OTP / Verify OTP Form */
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                {!otpSent ? (
                  /* Step 1: Enter phone number */
                  <form onSubmit={handleSendOTP}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('enter_mobile_number')}
                    </label>
                    <div className="flex gap-3">
                      <div className="flex-1 relative flex">
                        <span className="inline-flex items-center px-4 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-gray-600 font-semibold text-sm select-none">
                          +91
                        </span>
                        <input
                          type="tel"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                          className="w-full pl-3 pr-4 py-3 border border-gray-200 rounded-r-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                          maxLength={10}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={otpLoading || mobileNumber.trim().length !== 10}
                        className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center gap-2"
                      >
                        {otpLoading ? (
                          <ArrowPathIcon className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <DevicePhoneMobileIcon className="w-5 h-5" />
                            <span className="hidden sm:inline">{t('send_otp')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  /* Step 2: Enter OTP */
                  <form onSubmit={handleVerifyOTP}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-green-800">{t('otp_sent')}</p>
                        <p className="text-xs text-gray-500">+91 {mobileNumber}</p>
                      </div>
                    </div>

                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('enter_otp')}
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                        placeholder={t('otp_placeholder')}
                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-center text-lg tracking-widest"
                        maxLength={6}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={otpLoading || otpValue.trim().length < 6}
                        className="px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center gap-2"
                      >
                        {otpLoading ? (
                          <ArrowPathIcon className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <MagnifyingGlassIcon className="w-5 h-5" />
                            <span className="hidden sm:inline">{t('verify_otp')}</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <button
                        type="button"
                        onClick={resetMobileSearch}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        {t('back_to_search')}
                      </button>
                      <button
                        type="button"
                        onClick={handleSendOTP}
                        disabled={resendTimer > 0 || otpLoading}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        {resendTimer > 0
                          ? `${t('otp_resend_in')} ${resendTimer}s`
                          : t('otp_resend')}
                      </button>
                    </div>
                  </form>
                )}

                {/* Mobile Error */}
                {mobileError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2"
                  >
                    <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{mobileError}</p>
                  </motion.div>
                )}
              </div>
            )}

            {/* Empty state for mobile tab */}
            {!otpSent && !mobileComplaints && !mobileError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <DevicePhoneMobileIcon className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {t('tab_mobile_number')}
                </h3>
                <p className="text-gray-500 text-sm max-w-xs mx-auto">
                  {t('mobile_tracking_instruction')}
                </p>
              </motion.div>
            )}
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
