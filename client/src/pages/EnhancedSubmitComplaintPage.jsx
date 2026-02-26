import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CloudArrowUpIcon,
  SparklesIcon,
  PhotoIcon,
  CameraIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';

// Components
import Stepper from '../components/ui/Stepper';
import {
  ConnectivityProvider,
  StatusIndicators,
  OfflineBanner,
  useConnectivity,
} from '../components/ui/ConnectivityIndicators';
import ConsentBanner from '../components/ui/ConsentBanner';
import ErrorScreen from '../components/ui/ErrorScreens';
import ComplaintPreview from '../components/ui/ComplaintPreview';
import ComplaintSuccess from '../components/ui/ComplaintSuccess';
import CameraCapture from '../components/CameraCapture';
import LocationCapture from '../components/LocationCapture';
import DuplicateWarningModal from '../components/DuplicateWarningModal';
import LanguageSelector from '../components/LanguageSelector';

// Services & Utils
import { complaintApi } from '../services/api';
import { compressDataUrl } from '../utils/imageCompression';
import {
  saveDraftComplaint,
  getDraftComplaint,
  clearDraftComplaint,
} from '../utils/offlineStorage';
import { useToastStore, useSettingsStore } from '../store';

// ─── AI Classification helper ─────────────────────────────────────────────────
const AI_CLASSIFY_URL = `${import.meta.env.VITE_API_URL || '/api'}/complaints/classify`;

// Confidence threshold - predictions below this are treated as "Other"
const CONFIDENCE_THRESHOLD = 0.40; // 40% - anything below is too uncertain

async function callClassifyAPI(imageBlob) {
  const formData = new FormData();
  formData.append('image', imageBlob, 'complaint-image.jpg');
  const res = await fetch(AI_CLASSIFY_URL, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'AI classification failed');
  }
  const data = await res.json();
  const confMap = { high: 0.9, medium: 0.65, low: 0.35, none: 0 };
  const confidence = confMap[data.confidence] ?? 0.9;
  
  // If confidence is below threshold, override to "Other"
  const predicted_category = confidence < CONFIDENCE_THRESHOLD 
    ? 'Other' 
    : (data.category || 'Other');
  
  return {
    predicted_category,
    confidence,
    raw_label: data.raw_label,
    original_category: data.category, // Keep original for debugging
  };
}

// ─── Category metadata ────────────────────────────────────────────────────────
const CATEGORY_META = {
  "Damaged Road Issue":        { icon: '🛣️', color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Damaged Road Issue' },
  "Fallen Tree":               { icon: '🌳', color: 'bg-green-100 text-green-700 border-green-200', label: 'Fallen Tree' },
  "Garbage and Trash Issue":   { icon: '🗑️', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Garbage and Trash Issue' },
  "Illegal Drawing on Walls":  { icon: '🎨', color: 'bg-pink-100 text-pink-700 border-pink-200', label: 'Illegal Drawing on Walls' },
  "Street Light Issue":        { icon: '💡', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Street Light Issue' },
  "Other":                     { icon: '📋', color: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Other' },
};

// Fallback for unknown categories returned by AI
const DEFAULT_CATEGORY_META = { icon: '📋', color: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Other' };

// Helper to get category info with fallback
function getCategoryMeta(category) {
  return CATEGORY_META[category] || DEFAULT_CATEGORY_META;
}

// Categories available for manual selection (excludes "Other")
const ALL_CATEGORIES = Object.keys(CATEGORY_META).filter(cat => cat !== 'Other');

// ─── Pencil mini-icon (avoids extra heroicons import) ─────────────────────────
function PencilIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Photo Upload
// ─────────────────────────────────────────────────────────────────────────────
function PhotoUploadStep({ image, onCapture, onFileUpload, onRetake }) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState(null); // null | 'camera'
  const [cameraError, setCameraError] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    onFileUpload(url, file);
  };

  // ── Photo already chosen — preview
  if (image) {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            {t('step1_ready', 'Photo Ready')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('step1_ready_hint', "Looks good? Hit 'Analyse with AI' to continue.")}
          </p>
        </div>

        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100">
          <img src={image} alt="Issue photo" className="w-full h-full object-cover" />
          <div className="absolute bottom-3 right-3 px-3 py-1.5 bg-green-500 text-white rounded-full text-xs flex items-center gap-1">
            <CheckIcon className="w-3 h-3" />
            Photo ready
          </div>
        </div>

        <button
          onClick={onRetake}
          className="w-full py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-2 text-sm"
        >
          <CameraIcon className="w-4 h-4" />
          {t('retake_change', 'Retake / Change Photo')}
        </button>
      </div>
    );
  }

  // ── Camera mode
  if (mode === 'camera') {
    if (cameraError) {
      return (
        <ErrorScreen
          type="camera_denied"
          onRetry={() => setCameraError(null)}
          onCancel={() => setMode(null)}
        />
      );
    }
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => { setMode(null); setCameraError(null); }}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeftIcon className="w-4 h-4 text-gray-600" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            {t('take_photo', 'Take a Photo')}
          </h2>
        </div>
        <CameraCapture
          onCapture={(dataUrl, blob) => onCapture(dataUrl, blob)}
          onError={(err) => setCameraError(err)}
        />
      </div>
    );
  }

  // ── Choose mode
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          {t('step1_title', 'Upload Issue Photo')}
        </h2>
        <p className="text-sm text-gray-500">
          {t('step1_subtitle', 'Take a photo or upload from your gallery')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Camera tile */}
        <button
          onClick={() => setMode('camera')}
          className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50 hover:bg-primary-100 transition"
        >
          <div className="w-14 h-14 bg-primary-600 rounded-full flex items-center justify-center">
            <CameraIcon className="w-7 h-7 text-white" />
          </div>
          <span className="font-medium text-primary-700 text-sm">
            {t('use_camera', 'Use Camera')}
          </span>
          <span className="text-xs text-primary-500 text-center">
            {t('use_camera_desc', 'Take a live photo')}
          </span>
        </button>

        {/* Upload tile */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition"
        >
          <div className="w-14 h-14 bg-gray-600 rounded-full flex items-center justify-center">
            <PhotoIcon className="w-7 h-7 text-white" />
          </div>
          <span className="font-medium text-gray-700 text-sm">
            {t('upload_photo', 'Upload Photo')}
          </span>
          <span className="text-xs text-gray-500 text-center">
            {t('upload_photo_desc', 'Choose from gallery')}
          </span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <p className="text-center text-xs text-gray-400">
        {t('photo_tip', '💡 Clear photos help AI identify the issue faster')}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — AI Classification
// ─────────────────────────────────────────────────────────────────────────────
function AIClassificationStep({ image, isClassifying, aiResult, aiError, onRetry, onOverride, isOtherCategory, isCategoryManuallySet }) {
  const { t } = useTranslation();
  const [showOverride, setShowOverride] = useState(false);

  // ── Loading
  if (isClassifying) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            {t('ai_analyzing', 'Analysing Photo...')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('ai_analyzing_desc', 'Our AI model is identifying the type of municipal issue')}
          </p>
        </div>

        {/* Thumbnail with scanning overlay */}
        {image && (
          <div className="relative mx-auto w-44 h-44 rounded-2xl overflow-hidden shadow-lg">
            <img src={image} alt="Analysing" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-primary-900/50 flex items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                  <SparklesIcon className="w-8 h-8 text-white animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-white/60 animate-ping" />
              </div>
            </div>
            {/* Horizontal scan line animation */}
            <div className="absolute inset-x-0 h-0.5 bg-primary-400/80 animate-bounce" style={{ top: '40%' }} />
          </div>
        )}

        {/* Progress */}
        <div className="space-y-2">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full"
              style={{ width: '70%', transition: 'width 0.5s ease' }}
            />
          </div>
        </div>

        {/* Micro-steps */}
        <div className="space-y-2.5">
          {[
            { label: t('ai_step_1', 'Preprocessing image'), done: true },
            { label: t('ai_step_2', 'Running CNN classifier'), done: false, active: true },
            { label: t('ai_step_3', 'Computing confidence score'), done: false },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                ${s.done ? 'bg-green-500' : s.active ? 'bg-primary-500 animate-pulse' : 'bg-gray-200'}`}>
                {s.done
                  ? <CheckIcon className="w-3 h-3 text-white" />
                  : <span className="text-[10px] text-white font-bold">{i + 1}</span>}
              </div>
              <span className={s.active ? 'text-primary-700 font-medium' : s.done ? 'text-gray-500' : 'text-gray-300'}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state
  if (aiError && !aiResult) {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            {t('ai_failed_title', 'Could Not Classify')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('ai_failed_desc', 'Try again or select the category manually.')}
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{aiError}</p>
        </div>

        <button
          onClick={onRetry}
          className="w-full py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-medium"
        >
          {t('retry_analysis', 'Retry AI Analysis')}
        </button>

        <button
          onClick={() => setShowOverride(true)}
          className="w-full py-3 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition text-sm"
        >
          {t('select_manually', 'Select Category Manually')}
        </button>

        {showOverride && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            {ALL_CATEGORIES.map(cat => {
              const m = getCategoryMeta(cat);
              return (
                <button
                  key={cat}
                  onClick={() => onOverride(cat)}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition border-gray-200 hover:border-primary-400 ${m.color}`}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Success state
  if (aiResult) {
    const pct = Math.round(aiResult.confidence * 100);
    const meta = getCategoryMeta(aiResult.predicted_category);
    const confColor = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-400';

    return (
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">
            {t('ai_done_title', 'Issue Identified!')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('ai_done_desc', 'AI has classified your complaint. Review below.')}
          </p>
        </div>

        {/* Result card */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-br from-primary-50 to-indigo-50 border border-primary-200 rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <SparklesIcon className="w-5 h-5 text-primary-600" />
            <span className="text-sm font-semibold text-primary-800">
              {t('ai_prediction', 'AI Prediction')}
            </span>
            <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full text-white ${confColor}`}>
              {pct}% {t('confidence', 'confidence')}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl border-2 ${meta.color}`}>
              {meta.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">
                {t('detected_category', 'Detected Category')}
              </p>
              <p className="text-xl font-bold text-gray-900">
                {meta.label}
              </p>
              {aiResult.original_category && aiResult.original_category !== aiResult.predicted_category && (
                <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3 h-3" />
                  {t('low_confidence_downgrade', 'Low confidence - auto-classified as Other')}
                </p>
              )}
              {aiResult.raw_label && aiResult.raw_label !== 'unknown' && !aiResult.original_category && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('raw_label', 'Raw label')}: {aiResult.raw_label}
                </p>
              )}
            </div>
          </div>

          {/* Confidence bar */}
          <div className="mt-4">
            <div className="h-2 bg-white/70 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${confColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{t('low', 'Low')}</span>
              <span>{t('high', 'High')}</span>
            </div>
          </div>
        </motion.div>

        {/* Photo thumbnail */}
        {image && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
              <img src={image} alt="Issue" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">{t('your_photo', 'Your Photo')}</p>
              <p className="text-xs text-gray-400">{t('used_for_ai', 'Used for AI classification')}</p>
            </div>
          </div>
        )}

        {/* Warning when AI predicts "Other" and not manually changed */}
        {isOtherCategory && !isCategoryManuallySet && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-amber-900 mb-1">
                  {t('other_category_warning_title', 'Cannot Submit - Photo Unrecognized')}
                </h3>
                <p className="text-sm text-amber-800 mb-3">
                  {t('other_category_warning_message', 
                    'The AI model could not identify a specific municipal issue in this photo. Complaints in the "Other" category cannot be submitted as they cannot be routed to the appropriate department. Please upload a clearer photo showing the specific issue, or manually select the correct category if this is a valid municipal complaint.'
                  )}
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => window.history.back()}
                    className="flex-1 py-2 px-4 bg-white border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition text-sm font-medium"
                  >
                    {t('go_back_upload_new', '← Go Back & Upload New Photo')}
                  </button>
                  <button
                    onClick={() => setShowOverride(true)}
                    className="flex-1 py-2 px-4 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm font-medium"
                  >
                    {t('select_category_manually', 'Select Correct Category')}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Success message when manually changed from "Other" */}
        {isOtherCategory && isCategoryManuallySet && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-green-50 border border-green-200 rounded-xl p-4"
          >
            <div className="flex items-center gap-2">
              <CheckIcon className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-800 font-medium">
                {t('category_manually_updated', 'Category manually selected. You can now continue with your submission.')}
              </p>
            </div>
          </motion.div>
        )}

        {/* Manual override */}
        <div>
          <button
            onClick={() => setShowOverride(v => !v)}
            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700"
          >
            <PencilIcon />
            {t('wrong_category', 'Wrong category? Change it')}
          </button>

          <AnimatePresence>
            {showOverride && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {ALL_CATEGORIES.map(cat => {
                    const m = getCategoryMeta(cat);
                    const isActive = cat === aiResult.predicted_category;
                    return (
                      <button
                        key={cat}
                        onClick={() => { onOverride(cat); setShowOverride(false); }}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition
                          ${isActive
                            ? 'border-primary-500 bg-primary-50 text-primary-700'
                            : `border-gray-200 hover:border-primary-300 ${m.color}`}`}
                      >
                        <span>{m.icon}</span>
                        <span>{m.label}</span>
                        {isActive && <CheckIcon className="w-4 h-4 ml-auto text-primary-600" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Location & Additional Details
// ─────────────────────────────────────────────────────────────────────────────
function LocationDetailsStep({ location, description, onLocationUpdate, onDescriptionChange }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          {t('step3_title', 'Location & Details')}
        </h2>
        <p className="text-sm text-gray-500">
          {t('step3_subtitle', 'Confirm your location and add any extra information')}
        </p>
      </div>

      {/* Location */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MapPinIcon className="w-5 h-5 text-primary-600" />
          <span className="font-medium text-gray-800 text-sm">
            {t('your_location', 'Your Location')}
          </span>
        </div>
        <LocationCapture
          onLocationCapture={(loc) => onLocationUpdate(loc)}
          onAddressCapture={(_addr, formatted) =>
            onLocationUpdate(prev => ({ ...(prev || {}), address: formatted }))
          }
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('additional_details', 'Additional Details')}
          <span className="text-gray-400 font-normal ml-1">({t('optional', 'optional')})</span>
        </label>
        <textarea
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t(
            'description_placeholder',
            'Describe the issue in more detail… (e.g. size, duration, severity)'
          )}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-sm"
        />
        <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/500</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Preview & Submit
// ─────────────────────────────────────────────────────────────────────────────
function PreviewStep({ data, onEdit }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          {t('step4_title', 'Review Your Complaint')}
        </h2>
        <p className="text-sm text-gray-500">
          {t('step4_subtitle', 'Everything look right? Submit when ready.')}
        </p>
      </div>

      <ComplaintPreview
        image={data.image}
        location={data.location}
        category={data.category}
        aiConfidence={data.aiConfidence}
        description={data.description}
        timestamp={data.timestamp}
        onEditImage={() => onEdit(0)}
        onEditLocation={() => onEdit(2)}
        onEditDescription={() => onEdit(2)}
        showAICategory={true}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — SubmitComplaintContent
// ─────────────────────────────────────────────────────────────────────────────
function SubmitComplaintContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { addToast } = useToastStore();
  const { language } = useSettingsStore();
  const { isOnline } = useConnectivity();
  const autoSaveTimer = useRef(null);

  // ── UI state
  const [showConsent, setShowConsent] = useState(true);
  const [currentStep, setCurrentStep] = useState(0); // 0-3
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [submittedComplaintId, setSubmittedComplaintId] = useState(null);
  const [confirmNotDuplicate, setConfirmNotDuplicate] = useState(false);

  // ── Form data
  const [image, setImage] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);
  const [location, setLocation] = useState(null);
  const [description, setDescription] = useState('');

  // ── AI state
  const [isClassifying, setIsClassifying] = useState(false);
  const [aiCategory, setAiCategory] = useState('');
  const [aiConfidence, setAiConfidence] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [isCategoryManuallySet, setIsCategoryManuallySet] = useState(false); // Track manual override

  // 4-step config
  const steps = [
    { id: 'photo',   label: t('step_photo',   'Photo'),       description: t('upload', 'Upload') },
    { id: 'ai',      label: t('step_ai',      'AI Analysis'), description: t('auto_classify', 'Auto-classify') },
    { id: 'details', label: t('step_details', 'Details'),     description: t('location_info', 'Location & Info') },
    { id: 'preview', label: t('step_preview', 'Preview'),     description: t('review_submit', 'Review & Submit') },
  ];

  // ── Load draft
  useEffect(() => {
    (async () => {
      const draft = await getDraftComplaint();
      if (draft?.savedAt) {
        const hrs = (Date.now() - new Date(draft.savedAt).getTime()) / 3_600_000;
        if (hrs < 24) {
          if (draft.image)             setImage(draft.image);
          if (draft.category)          setAiCategory(draft.category);
          if (draft.description)       setDescription(draft.description);
          if (draft.aiConfidence != null) setAiConfidence(draft.aiConfidence);
          if (draft.location)          setLocation(draft.location);
          addToast(t('draft_restored', 'Draft restored'), 'info');
        }
      }
    })();
  }, []);

  // ── Auto-save
  useEffect(() => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (image || location || aiCategory || description) {
        await saveDraftComplaint({
          image, location, category: aiCategory, description,
          aiConfidence, timestamp: new Date().toISOString(),
        });
      }
    }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [image, location, aiCategory, description, aiConfidence]);

  // ── Validation
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0: return !!image;
      case 1: {
        // Block if AI predicted "Other" and user hasn't manually changed it
        if (aiCategory === 'Other' && !isCategoryManuallySet) {
          return false;
        }
        return !!aiCategory;
      }
      case 2: return !!(location?.latitude && location?.longitude);
      case 3: return true;
      default: return false;
    }
  }, [currentStep, image, aiCategory, location, isCategoryManuallySet]);

  // ── AI runner
  const runClassification = useCallback(async () => {
    if (!imageBlob) return;
    setIsClassifying(true);
    setAiError(null);
    setIsCategoryManuallySet(false); // Reset manual flag when AI runs
    try {
      const result = await callClassifyAPI(imageBlob);
      setAiCategory(result.predicted_category);
      setAiConfidence(result.confidence);
    } catch (err) {
      console.error('AI error:', err);
      setAiError(err.message || t('ai_classification_failed', 'Classification failed'));
      // Still set a fallback so user can override
      setAiCategory('Other');
      setAiConfidence(0);
    } finally {
      setIsClassifying(false);
    }
  }, [imageBlob, t]);

  // ── Navigation
  const goNext = async () => {
    if (currentStep === 0) {
      // Trigger AI immediately when moving from photo step
      setCurrentStep(1);
      await runClassification();
      return;
    }
    if (currentStep === 2) {
      await checkDuplicates();
      return;
    }
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const goBack = () => {
    if (currentStep === 1) {
      setAiCategory('');
      setAiConfidence(null);
      setAiError(null);
      setIsCategoryManuallySet(false);
    }
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const goToStep = (step) => {
    if (step >= currentStep) return;
    if (step < 1) { 
      setAiCategory(''); 
      setAiConfidence(null); 
      setAiError(null);
      setIsCategoryManuallySet(false);
    }
    setCurrentStep(step);
  };

  // ── Duplicate check
  const checkDuplicates = async () => {
    if (!location?.latitude || !location?.longitude || !aiCategory) {
      setCurrentStep(3);
      return;
    }
    try {
      const result = await complaintApi.checkDuplicates(
        location.latitude, location.longitude, aiCategory
      );
      if (result.isDuplicate && result.duplicates?.length > 0) {
        setDuplicates(result.duplicates);
        setShowDuplicateModal(true);
      } else {
        setCurrentStep(3);
      }
    } catch {
      setCurrentStep(3);
    }
  };

  // ── Submit
  const handleSubmit = async (skipDuplicateCheck = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitProgress(10);

    try {
      setSubmitProgress(30);
      const compressed = await compressDataUrl(image, { maxSizeMB: 0.5, maxWidthOrHeight: 1920 });

      setSubmitProgress(50);
      const blob = await fetch(compressed.dataUrl).then(r => r.blob());
      const formData = new FormData();
      formData.append('image', blob, 'complaint-image.jpg');
      formData.append('category', aiCategory);
      formData.append('description', description || '');
      formData.append('latitude', location.latitude.toString());
      formData.append('longitude', location.longitude.toString());
      formData.append('address', location.address || '');
      formData.append('preferredLanguage', language);
      if (aiConfidence != null) formData.append('aiConfidence', aiConfidence.toString());
      if (skipDuplicateCheck || confirmNotDuplicate) formData.append('confirmNotDuplicate', 'true');
      if (sessionId) formData.append('sessionId', sessionId);

      setSubmitProgress(70);
      const result = await complaintApi.create(formData);
      setSubmitProgress(90);

      if (result.success) {
        await clearDraftComplaint();
        setSubmittedComplaintId(result.data.complaintId);
        setSubmitProgress(100);
        addToast(t('complaint_submitted_toast', 'Complaint submitted!'), 'success');
      } else if (result.isDuplicate) {
        setDuplicates(result.duplicates || []);
        setShowDuplicateModal(true);
        setSubmitProgress(0);
      } else {
        throw new Error(result.message || 'Submission failed');
      }
    } catch (err) {
      console.error('Submit error:', err);
      const msg = !isOnline
        ? t('saved_for_later', 'Saved for later')
        : (err.message || t('submission_failed', 'Submission failed'));
      addToast(msg, !isOnline ? 'warning' : 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Image handlers
  const handleCapture = (dataUrl, blob) => { setImage(dataUrl); setImageBlob(blob); };
  const handleFileUpload = (dataUrl, file) => { setImage(dataUrl); setImageBlob(file); };
  const handleRetake = () => { setImage(null); setImageBlob(null); };

  // ── Location update helper
  const handleLocationUpdate = (loc) => setLocation(prev => ({ ...(prev || {}), ...loc }));

  // ── Success screen
  if (submittedComplaintId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <ComplaintSuccess
          complaintId={submittedComplaintId}
          trackingUrl={`${window.location.origin}/track/${submittedComplaintId}`}
          estimatedTime={t('estimated_3_5_days', '3–5 working days')}
          onTrackStatus={() => navigate(`/track/${submittedComplaintId}`)}
          onNewComplaint={() => {
            setSubmittedComplaintId(null);
            setImage(null); setImageBlob(null); setLocation(null);
            setAiCategory(''); setAiConfidence(null); setAiError(null);
            setDescription(''); setCurrentStep(0);
          }}
        />
      </div>
    );
  }

  // ── Consent screen
  if (showConsent) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-8">
        <ConsentBanner
          onAccept={() => setShowConsent(false)}
          onDecline={() => navigate('/')}
          requiredPermissions={['camera', 'location', 'data']}
        />
      </div>
    );
  }

  // ── Main layout
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <OfflineBanner />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentStep > 0 && !isClassifying ? (
              <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
              </button>
            ) : (
              <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg transition">
                <XMarkIcon className="w-5 h-5 text-gray-600" />
              </Link>
            )}
            <h1 className="font-semibold text-gray-900">{t('new_complaint', 'New Complaint')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <StatusIndicators showGPS={currentStep === 2} />
            <LanguageSelector compact />
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="bg-white border-b border-gray-100 px-4 py-2">
        <div className="max-w-lg mx-auto">
          <Stepper steps={steps} currentStep={currentStep} onStepClick={goToStep} />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 py-6">
        <div className="max-w-lg mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep === 0 && (
                <PhotoUploadStep
                  image={image}
                  onCapture={handleCapture}
                  onFileUpload={handleFileUpload}
                  onRetake={handleRetake}
                />
              )}
              {currentStep === 1 && (
                <AIClassificationStep
                  image={image}
                  isClassifying={isClassifying}
                  aiResult={aiCategory ? { predicted_category: aiCategory, confidence: aiConfidence, raw_label: null } : null}
                  aiError={aiError}
                  onRetry={runClassification}
                  onOverride={(cat) => { 
                    setAiCategory(cat); 
                    setAiError(null);
                    setIsCategoryManuallySet(true); // Mark as manually set
                  }}
                  isOtherCategory={aiCategory === 'Other'}
                  isCategoryManuallySet={isCategoryManuallySet}
                />
              )}
              {currentStep === 2 && (
                <LocationDetailsStep
                  location={location}
                  description={description}
                  onLocationUpdate={handleLocationUpdate}
                  onDescriptionChange={setDescription}
                />
              )}
              {currentStep === 3 && (
                <PreviewStep
                  data={{
                    image, location, category: aiCategory,
                    aiConfidence, description,
                    timestamp: new Date().toISOString(),
                  }}
                  onEdit={goToStep}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Footer actions */}
      <footer className="bg-white border-t border-gray-200 px-4 py-4 safe-area-bottom">
        <div className="max-w-lg mx-auto space-y-2">

          {/* Step 0: Analyse with AI */}
          {currentStep === 0 && (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className={`w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition
                ${canProceed()
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
            >
              <SparklesIcon className="w-5 h-5" />
              {t('analyse_with_ai', 'Analyse with AI')}
            </button>
          )}

          {/* Step 1: Continue after AI - Only if not "Other" or manually changed */}
          {currentStep === 1 && !isClassifying && aiCategory && (
            <button
              onClick={() => setCurrentStep(2)}
              disabled={!canProceed()}
              className={`w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition
                ${canProceed()
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
            >
              {t('continue', 'Continue')}
              <ArrowRightIcon className="w-5 h-5" />
            </button>
          )}

          {/* Step 2: Continue to preview */}
          {currentStep === 2 && (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className={`w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition
                ${canProceed()
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
            >
              {t('continue', 'Continue')}
              <ArrowRightIcon className="w-5 h-5" />
            </button>
          )}

          {/* Step 3: Submit */}
          {currentStep === 3 && (
            <button
              onClick={() => handleSubmit()}
              disabled={isSubmitting || !isOnline}
              className={`w-full py-4 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition
                ${isSubmitting ? 'bg-primary-400 cursor-wait' : 'bg-primary-600 hover:bg-primary-700'}`}
            >
              {isSubmitting ? (
                <>
                  <CloudArrowUpIcon className="w-5 h-5 animate-pulse" />
                  {t('submitting', 'Submitting...')} ({submitProgress}%)
                </>
              ) : (
                <>
                  <CheckIcon className="w-5 h-5" />
                  {t('submit_complaint', 'Submit Complaint')}
                </>
              )}
            </button>
          )}

          {!isOnline && (
            <p className="text-center text-xs text-amber-600 flex items-center justify-center gap-1">
              <ExclamationTriangleIcon className="w-4 h-4" />
              {t('offline_submit_warning', 'Offline — will submit when reconnected')}
            </p>
          )}
        </div>
      </footer>

      <DuplicateWarningModal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        duplicates={duplicates}
        onProceed={() => {
          setShowDuplicateModal(false);
          setConfirmNotDuplicate(true);
          handleSubmit(true);
        }}
      />
    </div>
  );
}

// Wrapped export
export default function EnhancedSubmitComplaintPage() {
  return (
    <ConnectivityProvider>
      <SubmitComplaintContent />
    </ConnectivityProvider>
  );
}