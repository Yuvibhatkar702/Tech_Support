import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import StatusBadge from '../components/StatusBadge';
import { LanguageSelectorCompact } from '../components/LanguageSelector';
import QRCodeScanner from '../components/QRCodeScanner';
import { complaintApi } from '../services/api';

export default function TrackComplaintPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const initialId = searchParams.get('id') || '';

  const [complaintId, setComplaintId] = useState(initialId);
  const [complaint, setComplaint] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  const handleTrack = async (e) => {
    e?.preventDefault();
    
    if (!complaintId.trim()) return;

    setIsLoading(true);
    setError(null);
    setComplaint(null);

    try {
      const result = await complaintApi.getStatus(complaintId.trim().toUpperCase());
      if (result.success) {
        setComplaint(result.data);
      } else {
        setError(t('track_not_found'));
      }
    } catch (err) {
      console.error('Track error:', err);
      if (err.response?.status === 404) {
        setError(t('track_not_found'));
      } else {
        setError(err.response?.data?.message || t('error_generic'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQRScan = (scannedId) => {
    setComplaintId(scannedId);
    setShowScanner(false);
    // Auto-track after setting the ID
    setTimeout(() => {
      const event = new Event('submit', { bubbles: true });
      document.querySelector('form')?.dispatchEvent(event);
    }, 0);
  };

  // Auto-track if ID is in URL
  useEffect(() => {
    if (initialId) {
      handleTrack();
    }
  }, [initialId]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="p-2 -ml-2 text-gray-600 hover:text-gray-900">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="font-semibold text-gray-900">{t('track_title')}</h1>
          </div>
          <LanguageSelectorCompact />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Search form */}
        <form onSubmit={handleTrack} className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('track_enter_id')}
          </label>
          <div className="flex gap-3 mb-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={complaintId}
                onChange={(e) => setComplaintId(e.target.value.toUpperCase())}
                placeholder={t('track_placeholder')}
                className="w-full pl-10 font-mono text-lg"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !complaintId.trim()}
              className="btn-primary px-6"
            >
              {isLoading ? (
                <div className="spinner w-5 h-5" />
              ) : (
                t('track_button')
              )}
            </button>
          </div>
          
          {/* QR Scanner Button */}
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors border border-gray-300"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 11h2V9H3v2zm0-4h2V5h2V3H3v4zm4 12h2v-2H7v2zM3 15h2v-2H3v2zm0 4h4v-2H5v-2H3v4zm16 0h2v-4h-2v2h-2v2h4zm0-4h2v-2h-2v2zm0-8h2V3h-4v2h2v4zm-4 12h2v-2h-2v2zM11 21h2v-2h-2v2zm0-4h2v-2h-2v2zM3 3v4h2V5h2V3H3zm16 0v2h2V3h-2zm-8 0v2h2V3h-2zm0 4h2V5h-2v2zm0 4h2V9h-2v2zm0 4h2v-2h-2v2zm0 4h2v-2h-2v2zm-4-4h2v-2H7v2zm0-4h2V9H7v2zm0-4h2V5H7v2zm10 8h2v-4h-2v4zm-2-4v4h2v-4h-2z"/>
            </svg>
            {t('qr.scan_code', 'Scan QR Code to Track')}
          </button>
        </form>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 animate-fadeIn">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Complaint details */}
        {complaint && (
          <div className="animate-fadeIn space-y-4">
            {/* Main card */}
            <div className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">{t('success_complaint_id')}</p>
                  <p className="text-xl font-bold text-gray-900">{complaint.complaintId}</p>
                </div>
                <StatusBadge status={complaint.status} size="lg" />
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{getCategoryIcon(complaint.category)}</span>
                  <span className="font-medium text-gray-900">{t(`category_${complaint.category}`)}</span>
                </div>

                {complaint.address && (
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-gray-700">{complaint.address}</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-600">
                    Filed on {new Date(complaint.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {/* Resolution details */}
              {complaint.resolution && complaint.status === 'closed' && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm font-medium text-green-800 mb-1">Resolution</p>
                  <p className="text-sm text-green-700">{complaint.resolution.description}</p>
                  {complaint.resolution.resolvedAt && (
                    <p className="text-xs text-green-600 mt-2">
                      Closed on {new Date(complaint.resolution.resolvedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Status timeline */}
            {complaint.statusHistory && complaint.statusHistory.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">{t('track_history')}</h3>
                <div className="space-y-4">
                  {complaint.statusHistory.map((history, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${
                          index === complaint.statusHistory.length - 1 
                            ? 'bg-primary-600' 
                            : 'bg-gray-300'
                        }`} />
                        {index < complaint.statusHistory.length - 1 && (
                          <div className="w-0.5 h-full bg-gray-200 my-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge status={history.status} size="sm" />
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(history.changedAt).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        {history.remarks && (
                          <p className="text-sm text-gray-600 mt-1">{history.remarks}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* File new complaint button */}
        <div className="mt-8 text-center">
          <Link to="/submit" className="btn-outline">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            File a New Complaint
          </Link>
        </div>
      </main>

      {/* QR Scanner Modal */}
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

function getCategoryIcon(categoryId) {
  const icons = {
    road_damage: '🛣️',
    street_light: '💡',
    water_supply: '💧',
    sewage: '🚿',
    garbage: '🗑️',
    encroachment: '🚧',
    noise_pollution: '🔊',
    illegal_construction: '🏗️',
    traffic: '🚗',
    other: '📝',
  };
  return icons[categoryId] || '📝';
}
