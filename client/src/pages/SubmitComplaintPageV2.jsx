import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import Webcam from 'react-webcam';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useToastStore, useSettingsStore } from '../store';
import { complaintApi } from '../services/api';
import { compressDataUrl } from '../utils/imageCompression';
import { getCurrentLocation, formatCoordinates } from '../utils/geolocation';
import { saveDraftComplaint, getDraftComplaint, clearDraftComplaint, saveOfflineComplaint } from '../utils/offlineStorage';

import ProgressStepper from '../components/ProgressStepper';
import ConsentBanner from '../components/ConsentBanner';
import NetworkStatus, { NetworkIndicator } from '../components/NetworkStatus';
import { GPSAccuracyIndicator, CameraReadinessIndicator, ValidationChecklist } from '../components/StatusIndicators';
import ErrorScreen from '../components/ErrorScreen';
import { UploadProgress } from '../components/ImageCompressionUI';
import DuplicateWarningModal from '../components/DuplicateWarningModal';
import ComplaintQRCode from '../components/ComplaintQRCode';
import CategorySelector from '../components/CategorySelector';
import { LanguageSelectorCompact } from '../components/LanguageSelector';
import { Spinner } from '../components/Skeletons';

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });
  return position ? <Marker position={position} /> : null;
}

export default function SubmitComplaintPageV2() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { addToast } = useToastStore();
  const { language } = useSettingsStore();
  const webcamRef = useRef(null);

  const [step, setStep] = useState('consent');
  const [completedSteps, setCompletedSteps] = useState([]);
  const [hasConsent, setHasConsent] = useState(false);

  // Camera
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [capturedImage, setCapturedImage] = useState(null);
  const [compressedImage, setCompressedImage] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Location
  const [location, setLocation] = useState(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [address, setAddress] = useState(null);
  const [mapPosition, setMapPosition] = useState(null);
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);

  // Form
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Duplicates
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [submittedComplaint, setSubmittedComplaint] = useState(null);

  // Network
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const loadDraft = async () => {
      const draft = await getDraftComplaint();
      if (draft) {
        if (draft.capturedImage) setCapturedImage(draft.capturedImage);
        if (draft.location) setLocation(draft.location);
        if (draft.address) setAddress(draft.address);
        if (draft.category) setCategory(draft.category);
        if (draft.description) setDescription(draft.description);
        addToast(t('draft.restored', 'Your draft has been restored'), 'info');
      }
    };
    loadDraft();
  }, []);

  useEffect(() => {
    if (capturedImage || location || category || description) {
      saveDraftComplaint({ capturedImage, location, address, category, description });
    }
  }, [capturedImage, location, address, category, description]);

  // Initialize speech recognition for voice-to-text
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
        setDescription((prev) => (prev + ' ' + transcript).trim());
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

  const handleConsent = () => {
    setHasConsent(true);
    setStep('capture');
    setCompletedSteps(prev => [...prev, 'consent']);
  };

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    setCameraPermission(true);
    setCameraError(null);
  }, []);

  const handleCameraError = useCallback((error) => {
    setCameraReady(false);
    setCameraPermission(false);
    setCameraError(error.name === 'NotAllowedError' ? 'permission' : 'unavailable');
  }, []);

  const capturePhoto = useCallback(async () => {
    if (!webcamRef.current) return;
    try {
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) return;

      setCapturedImage(imageSrc);
      setIsCompressing(true);

      const compressed = await compressDataUrl(imageSrc, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
      });

      setCompressedImage({
        dataUrl: compressed.dataUrl,
        preview: compressed.dataUrl,
        size: compressed.size,
      });

      setIsCompressing(false);
      setCompletedSteps(prev => [...prev, 'capture']);
      setStep('location');
    } catch (error) {
      setIsCompressing(false);
      addToast(t('camera.error', 'Error processing image'), 'error');
    }
  }, [t, addToast]);

  const detectLocation = useCallback(async () => {
    setGpsLoading(true);
    setLocationError(null);

    try {
      const pos = await getCurrentLocation({ enableHighAccuracy: true, timeout: 15000 });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      
      setLocation(coords);
      setGpsAccuracy(pos.coords.accuracy);
      setMapPosition([coords.latitude, coords.longitude]);

      setIsGeocodingAddress(true);
      try {
        const geoResult = await complaintApi.reverseGeocode(coords.latitude, coords.longitude);
        if (geoResult.success) setAddress(geoResult.data);
      } catch {}
      setIsGeocodingAddress(false);
      setCompletedSteps(prev => [...prev, 'location']);
    } catch (error) {
      setLocationError(error.code === 1 ? 'permission' : 'unavailable');
    } finally {
      setGpsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 'location' && !location) detectLocation();
  }, [step, location, detectLocation]);

  const handleMapPositionChange = async (newPosition) => {
    setMapPosition(newPosition);
    setLocation({ latitude: newPosition[0], longitude: newPosition[1] });
    
    setIsGeocodingAddress(true);
    try {
      const geoResult = await complaintApi.reverseGeocode(newPosition[0], newPosition[1]);
      if (geoResult.success) setAddress(geoResult.data);
    } catch {}
    setIsGeocodingAddress(false);
  };

  const checkDuplicates = useCallback(async () => {
    if (!location || !category) return;
    setIsCheckingDuplicates(true);
    try {
      const result = await complaintApi.checkDuplicates(location.latitude, location.longitude, category);
      if (result.success && result.data.duplicates?.length > 0) {
        setDuplicates(result.data.duplicates);
        setShowDuplicateWarning(true);
      } else {
        submitComplaint();
      }
    } catch {
      submitComplaint();
    } finally {
      setIsCheckingDuplicates(false);
    }
  }, [location, category]);

  const submitComplaint = async () => {
    setIsSubmitting(true);
    setUploadStatus('compressing');
    setUploadProgress(10);

    try {
      const formData = new FormData();
      
      if (compressedImage?.dataUrl) {
        const response = await fetch(compressedImage.dataUrl);
        const blob = await response.blob();
        formData.append('image', blob, 'complaint.jpg');
      }

      setUploadProgress(30);
      setUploadStatus('uploading');

      formData.append('category', category);
      formData.append('description', description);
      formData.append('latitude', location.latitude);
      formData.append('longitude', location.longitude);
      formData.append('preferredLanguage', language);

      if (address) {
        formData.append('address', address.formatted || address.display_name || '');
        if (address.city) formData.append('city', address.city);
        if (address.state) formData.append('state', address.state);
      }

      setUploadProgress(50);

      if (!online) {
        const saved = await saveOfflineComplaint({
          image: compressedImage?.dataUrl,
          category, description, location, address, language,
        });
        setSubmittedComplaint({ complaintId: saved.offlineId, offline: true });
        setUploadStatus('complete');
        setUploadProgress(100);
        setStep('success');
        await clearDraftComplaint();
        return;
      }

      setUploadProgress(70);
      setUploadStatus('processing');

      const result = await complaintApi.create(formData);

      setUploadProgress(100);
      setUploadStatus('complete');

      if (result.success) {
        setSubmittedComplaint(result.data);
        setStep('success');
        await clearDraftComplaint();
        addToast(t('submit.success', 'Complaint submitted!'), 'success');
      }
    } catch (error) {
      setUploadStatus('error');
      addToast(t('submit.error', 'Failed to submit'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStepperStep = () => {
    if (['consent', 'capture'].includes(step)) return 'capture';
    if (step === 'location') return 'location';
    if (['details', 'review'].includes(step)) return 'details';
    return 'submit';
  };

  const canSubmit = compressedImage && location && category;

  return (
    <div className="min-h-screen bg-gray-50">
      <NetworkStatus />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-lg">🏛️</span>
              </div>
              <span className="font-bold text-gray-900 hidden sm:block">{t('app_name')}</span>
            </Link>
            <div className="flex items-center gap-3">
              <NetworkIndicator />
              <LanguageSelectorCompact />
            </div>
          </div>
        </div>
      </header>

      {hasConsent && step !== 'success' && (
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="max-w-2xl mx-auto">
            <ProgressStepper currentStep={getStepperStep()} completedSteps={completedSteps} />
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {step === 'consent' && (
            <ConsentBanner onAccept={handleConsent} onDecline={() => navigate('/')} />
          )}

          {step === 'capture' && (
            <motion.div key="capture" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('capture.title', 'Capture Photo')}</h1>
                <p className="text-gray-600">{t('capture.subtitle', 'Take a photo of the issue')}</p>
              </div>

              <div className="flex justify-center mb-4">
                <CameraReadinessIndicator isReady={cameraReady} hasPermission={cameraPermission} error={cameraError} />
              </div>

              {cameraError === 'permission' ? (
                <ErrorScreen type="camera_permission" onRetry={() => window.location.reload()} onBack={() => navigate('/')} />
              ) : (
                <div className="relative">
                  <div className="aspect-[4/3] bg-black rounded-2xl overflow-hidden">
                    <Webcam
                      ref={webcamRef}
                      audio={false}
                      screenshotFormat="image/jpeg"
                      screenshotQuality={0.9}
                      videoConstraints={{ facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }}
                      onUserMedia={handleCameraReady}
                      onUserMediaError={handleCameraError}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-4 left-4 w-12 h-12 border-l-4 border-t-4 border-white/60 rounded-tl-lg" />
                      <div className="absolute top-4 right-4 w-12 h-12 border-r-4 border-t-4 border-white/60 rounded-tr-lg" />
                      <div className="absolute bottom-4 left-4 w-12 h-12 border-l-4 border-b-4 border-white/60 rounded-bl-lg" />
                      <div className="absolute bottom-4 right-4 w-12 h-12 border-r-4 border-b-4 border-white/60 rounded-br-lg" />
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-6 mt-4">
                    <button onClick={() => setFacingMode(f => f === 'user' ? 'environment' : 'user')} className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                    <button onClick={capturePhoto} disabled={!cameraReady || isCompressing} className="w-20 h-20 bg-primary-600 rounded-full flex items-center justify-center text-white hover:bg-primary-700 disabled:opacity-50 shadow-lg">
                      {isCompressing ? <Spinner color="white" size="lg" /> : <div className="w-14 h-14 bg-white rounded-full" />}
                    </button>
                    <div className="w-12 h-12" />
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-6">
                <h3 className="font-semibold text-blue-900 flex items-center gap-2 mb-2">
                  <span>💡</span> {t('capture.tips_title', 'Tips')}
                </h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• {t('capture.tip_1', 'Ensure good lighting')}</li>
                  <li>• {t('capture.tip_2', 'Capture the entire issue')}</li>
                  <li>• {t('capture.tip_3', 'Include surroundings')}</li>
                </ul>
              </div>
            </motion.div>
          )}

          {step === 'location' && (
            <motion.div key="location" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('location.title', 'Confirm Location')}</h1>
                <p className="text-gray-600">{t('location.subtitle', 'Verify the issue location')}</p>
              </div>

              <div className="flex justify-center mb-4">
                <GPSAccuracyIndicator accuracy={gpsAccuracy} isLoading={gpsLoading} />
              </div>

              {locationError ? (
                <ErrorScreen type={locationError === 'permission' ? 'location_permission' : 'location_unavailable'} onRetry={detectLocation} onBack={() => setStep('capture')} />
              ) : mapPosition ? (
                <>
                  <div className="h-64 rounded-2xl overflow-hidden border border-gray-200">
                    <MapContainer center={mapPosition} zoom={16} style={{ height: '100%', width: '100%' }}>
                      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <LocationMarker position={mapPosition} setPosition={handleMapPositionChange} />
                    </MapContainer>
                  </div>
                  <p className="text-sm text-gray-500 text-center">{t('location.tap_to_adjust', 'Tap map to adjust')}</p>

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-xl">📍</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 mb-1">{t('location.detected_address', 'Address')}</p>
                        {isGeocodingAddress ? (
                          <div className="h-5 bg-gray-200 rounded animate-pulse w-3/4" />
                        ) : (
                          <p className="font-medium text-gray-900">
                            {address?.formatted || address?.display_name || formatCoordinates(location?.latitude, location?.longitude)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <button onClick={() => { setCompletedSteps(prev => [...prev, 'location']); setStep('details'); }} disabled={!location} className="btn-primary w-full py-4 text-lg">
                    {t('location.continue', 'Continue')}
                    <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="text-center py-12">
                  <Spinner size="xl" />
                  <p className="mt-4 text-gray-600">{t('location.detecting', 'Detecting location...')}</p>
                </div>
              )}
            </motion.div>
          )}

          {step === 'details' && (
            <motion.div key="details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('details.title', 'Complaint Details')}</h1>
                <p className="text-gray-600">{t('details.subtitle', 'Select category and add details')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">{t('form.category', 'Category')} *</label>
                <CategorySelector value={category} onChange={setCategory} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('form.description', 'Description')} ({t('form.optional', 'optional')})</label>
                <div className="relative">
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={t('form.description_placeholder', 'Additional details...')} className="w-full rounded-xl border-gray-300 pr-12" />
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={`absolute right-3 top-2 p-2 rounded-full transition-colors ${
                      isListening
                        ? 'bg-red-100 text-red-600 animate-pulse'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title={isListening ? 'Stop recording' : 'Start voice input'}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                </div>
                {isListening && <p className="text-xs text-red-500 mt-1">🎤 Listening...</p>}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('location')} className="btn-secondary flex-1 py-3">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  {t('nav.back', 'Back')}
                </button>
                <button onClick={() => { if (category) { setCompletedSteps(prev => [...prev, 'details']); setStep('review'); } }} disabled={!category} className="btn-primary flex-1 py-3">
                  {t('nav.review', 'Review')}
                  <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </div>
            </motion.div>
          )}

          {step === 'review' && (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('review.title', 'Review Complaint')}</h1>
                <p className="text-gray-600">{t('review.subtitle', 'Verify before submitting')}</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {compressedImage && (
                  <div className="relative">
                    <img src={compressedImage.preview} alt="Captured" className="w-full aspect-video object-cover" />
                    <button onClick={() => { setCapturedImage(null); setCompressedImage(null); setStep('capture'); }} className="absolute top-3 right-3 bg-white/90 px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      {t('review.retake', 'Retake')}
                    </button>
                  </div>
                )}

                <div className="p-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center"><span className="text-xl">📋</span></div>
                    <div>
                      <p className="text-sm text-gray-500">{t('form.category', 'Category')}</p>
                      <p className="font-medium text-gray-900">{t(`categories.${category}`)}</p>
                    </div>
                    <button onClick={() => setStep('details')} className="ml-auto text-sm text-primary-600">{t('review.edit', 'Edit')}</button>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center"><span className="text-xl">📍</span></div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500">{t('form.location', 'Location')}</p>
                      <p className="font-medium text-gray-900">{address?.formatted || address?.display_name || formatCoordinates(location?.latitude, location?.longitude)}</p>
                    </div>
                    <button onClick={() => setStep('location')} className="text-sm text-primary-600">{t('review.edit', 'Edit')}</button>
                  </div>

                  {description && (
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center"><span className="text-xl">📝</span></div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-500">{t('form.description', 'Description')}</p>
                        <p className="text-gray-900">{description}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center"><span className="text-xl">🕐</span></div>
                    <div>
                      <p className="text-sm text-gray-500">{t('form.timestamp', 'Timestamp')}</p>
                      <p className="font-medium text-gray-900">{new Date().toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>

              <ValidationChecklist items={[
                { valid: !!compressedImage, label: 'Photo captured', labelKey: 'validation.photo' },
                { valid: !!location, label: 'Location detected', labelKey: 'validation.location' },
                { valid: gpsAccuracy && gpsAccuracy <= 100, label: 'Good GPS accuracy', labelKey: 'validation.gps_accuracy' },
                { valid: !!category, label: 'Category selected', labelKey: 'validation.category' },
              ]} />

              {!online && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-xl">⚠️</span>
                  <div>
                    <p className="font-medium text-yellow-800">{t('offline.warning_title', 'You are offline')}</p>
                    <p className="text-sm text-yellow-700 mt-1">{t('offline.warning_message', 'Complaint will be saved and submitted when online.')}</p>
                  </div>
                </div>
              )}

              {isSubmitting && <UploadProgress progress={uploadProgress} status={uploadStatus} />}

              <div className="flex gap-3">
                <button onClick={() => setStep('details')} disabled={isSubmitting} className="btn-secondary flex-1 py-3">
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  {t('nav.back', 'Back')}
                </button>
                <button onClick={checkDuplicates} disabled={!canSubmit || isSubmitting || isCheckingDuplicates} className="btn-primary flex-1 py-3">
                  {isSubmitting ? (<><Spinner color="white" size="sm" /><span className="ml-2">{t('submit.submitting', 'Submitting...')}</span></>) 
                  : isCheckingDuplicates ? (<><Spinner color="white" size="sm" /><span className="ml-2">{t('submit.checking', 'Checking...')}</span></>)
                  : (<><span>{t('submit.button', 'Submit')}</span><svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></>)}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'success' && submittedComplaint && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.5 }} className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </motion.div>

              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {submittedComplaint.offline ? t('success.offline_title', 'Saved for Later') : t('success.title', 'Complaint Submitted!')}
              </h1>
              <p className="text-gray-600 mb-6">
                {submittedComplaint.offline ? t('success.offline_message', 'Will submit when online.') : t('success.message', 'Track with the ID below.')}
              </p>

              <div className="bg-primary-50 border border-primary-200 rounded-2xl p-6 mb-6">
                <p className="text-sm text-primary-600 mb-2">{t('success.complaint_id', 'Complaint ID')}</p>
                <p className="text-3xl font-mono font-bold text-primary-700">{submittedComplaint.complaint?.complaintId || submittedComplaint.complaintId}</p>
              </div>

              {!submittedComplaint.offline && (
                <div className="flex justify-center mb-6">
                  <ComplaintQRCode complaintId={submittedComplaint.complaint?.complaintId || submittedComplaint.complaintId} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-left">
                  <span className="text-2xl mb-2 block">📱</span>
                  <h3 className="font-medium text-gray-900">{t('success.whatsapp_title', 'WhatsApp Updates')}</h3>
                  <p className="text-sm text-gray-600">{t('success.whatsapp_desc', 'Status updates via WhatsApp')}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4 text-left">
                  <span className="text-2xl mb-2 block">🔔</span>
                  <h3 className="font-medium text-gray-900">{t('success.track_title', 'Track Online')}</h3>
                  <p className="text-sm text-gray-600">{t('success.track_desc', 'Use complaint ID to track')}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link to={`/track/${submittedComplaint.complaint?.complaintId || submittedComplaint.complaintId}`} className="btn-primary flex-1 py-3 justify-center">
                  {t('success.track_button', 'Track Status')}
                </Link>
                <Link to="/" className="btn-secondary flex-1 py-3 justify-center">
                  {t('success.home_button', 'Go Home')}
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <DuplicateWarningModal isOpen={showDuplicateWarning} onClose={() => setShowDuplicateWarning(false)} duplicates={duplicates} onProceed={() => { setShowDuplicateWarning(false); submitComplaint(); }} />
    </div>
  );
}
