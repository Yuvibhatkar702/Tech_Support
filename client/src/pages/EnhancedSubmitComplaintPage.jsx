import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { collegeApi } from '../services/api';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  CloudArrowUpIcon,
  PhotoIcon,
  CameraIcon,
  PaperClipIcon,
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

// ─── Category metadata (Website/Module categories) ───────────────────────────
const CATEGORY_META = {
  "Homepage":                  { icon: '🏠', color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Homepage' },
  "Admission Portal":         { icon: '🎓', color: 'bg-green-100 text-green-700 border-green-200', label: 'Admission Portal' },
  "Examination Portal":       { icon: '📝', color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Examination Portal' },
  "Student Portal":           { icon: '👨‍🎓', color: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Student Portal' },
  "Faculty Portal":           { icon: '👨‍🏫', color: 'bg-teal-100 text-teal-700 border-teal-200', label: 'Faculty Portal' },
  "LMS":                      { icon: '📚', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', label: 'Learning Management System' },
  "Payment Gateway":          { icon: '💳', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Payment Gateway' },
  "Email System":             { icon: '📧', color: 'bg-pink-100 text-pink-700 border-pink-200', label: 'Email System' },
  "Mobile App":               { icon: '📱', color: 'bg-red-100 text-red-700 border-red-200', label: 'Mobile App' },
  "Other":                    { icon: '🔧', color: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Other' },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META);

const ISSUE_TYPES = [
  { value: 'bug', label: 'Bug' },
  { value: 'error', label: 'Error' },
  { value: 'page_not_loading', label: 'Page Not Loading' },
  { value: 'login_issue', label: 'Login Issue' },
  { value: 'performance', label: 'Performance Issue' },
  { value: 'ui_ux', label: 'UI/UX Issue' },
  { value: 'data_issue', label: 'Data Issue' },
  { value: 'other', label: 'Other' },
];

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Issue Details (merged form)
// ─────────────────────────────────────────────────────────────────────────────
function IssueDetailsStep({
  collegeName,
  collegeCity,
  websiteName, onWebsiteNameChange,
  selectedCategory, onCategorySelect,
  issueType, onIssueTypeChange,
  description, onDescriptionChange,
  facultyName, onFacultyNameChange,
  facultyNumber, onFacultyNumberChange,
  images, onCapture, onFileUpload, onRemoveImage,
  additionalFiles, onAdditionalFilesChange,
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const additionalFilesRef = useRef(null);
  const [cameraMode, setCameraMode] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [touched, setTouched] = useState({});
  const touch = (field) => setTouched(prev => ({ ...prev, [field]: true }));

  // Field validations
  const errors = {
    websiteName: !websiteName.trim() ? 'Application name is required' : null,
    facultyName: !facultyName.trim() ? 'Faculty name is required' : facultyName.trim().length < 2 ? 'Name must be at least 2 characters' : null,
    facultyNumber: !facultyNumber.trim() ? 'Faculty number is required' : !/^[0-9]{10}$/.test(facultyNumber.trim()) ? 'Enter a valid 10-digit phone number' : null,
    selectedCategory: !selectedCategory ? 'Please select a page/module' : null,
    issueType: !issueType ? 'Please select an issue type' : null,
    description: !description.trim() ? 'Description is required' : description.trim().length < 10 ? 'Description must be at least 10 characters' : null,
  };
  const fieldError = (field) => touched[field] && errors[field];
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Voice input
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
        onDescriptionChange((prev) => (prev + ' ' + transcript).trim());
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    return () => { if (recognitionRef.current) recognitionRef.current.abort(); };
  }, [onDescriptionChange]);

  const toggleVoice = () => {
    if (!recognitionRef.current) return;
    if (isListening) { recognitionRef.current.stop(); setIsListening(false); }
    else { recognitionRef.current.start(); setIsListening(true); }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      onFileUpload(url, file);
    });
    e.target.value = '';
  };

  const handleAdditionalFiles = (e) => {
    const files = Array.from(e.target.files || []);
    onAdditionalFilesChange(files);
  };

  // Camera mode
  if (cameraMode) {
    if (cameraError) {
      return (
        <ErrorScreen
          type="camera_denied"
          onRetry={() => setCameraError(null)}
          onCancel={() => setCameraMode(false)}
        />
      );
    }
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => { setCameraMode(false); setCameraError(null); }}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition">
            <ArrowLeftIcon className="w-4 h-4 text-gray-600" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">{t('take_photo', 'Take a Screenshot')}</h2>
        </div>
        <CameraCapture
          onCapture={(dataUrl, blob) => { onCapture(dataUrl, blob); setCameraMode(false); }}
          onError={(err) => setCameraError(err)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          {t('issue_details', 'Issue Details')}
        </h2>
        <p className="text-sm text-gray-500">
          {t('issue_details_desc', 'Fill in the details about your support issue')}
        </p>
      </div>

      {/* College Info (auto-filled from code) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('college_name', 'College Name')}
          </label>
          <input
            type="text"
            value={collegeName || ''}
            readOnly
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-700"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('city', 'City')}
          </label>
          <input
            type="text"
            value={collegeCity || ''}
            readOnly
            className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-sm text-gray-700"
          />
        </div>
      </div>

      {/* Application Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('application_name', 'Application Name')} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={websiteName}
          onChange={e => onWebsiteNameChange(e.target.value)}
          onBlur={() => touch('websiteName')}
          placeholder={t('application_name_placeholder', 'e.g. ABC University Portal')}
          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm ${fieldError('websiteName') ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
        />
        {fieldError('websiteName') && <p className="text-xs text-red-500 mt-1">{errors.websiteName}</p>}
      </div>

      {/* Faculty Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('faculty_name', 'Faculty Name')} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={facultyName}
          onChange={e => onFacultyNameChange(e.target.value)}
          onBlur={() => touch('facultyName')}
          placeholder={t('faculty_name_placeholder', 'e.g. John Smith')}
          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm ${fieldError('facultyName') ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
        />
        {fieldError('facultyName') && <p className="text-xs text-red-500 mt-1">{errors.facultyName}</p>}
      </div>

      {/* Faculty Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('faculty_number', 'Faculty Number')} <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          value={facultyNumber}
          onChange={e => onFacultyNumberChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onBlur={() => touch('facultyNumber')}
          placeholder={t('faculty_number_placeholder', 'e.g. 9876543210')}
          maxLength={10}
          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm ${fieldError('facultyNumber') ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
        />
        {fieldError('facultyNumber') && <p className="text-xs text-red-500 mt-1">{errors.facultyNumber}</p>}
      </div>

      {/* Page / Module (Category) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('page_module', 'Page / Module')} <span className="text-red-500">*</span>
        </label>
        <select
          value={selectedCategory}
          onChange={e => onCategorySelect(e.target.value)}
          onBlur={() => touch('selectedCategory')}
          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm bg-white ${fieldError('selectedCategory') ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
        >
          <option value="">{t('select_module_placeholder', '-- Select Page/Module --')}</option>
          {ALL_CATEGORIES.map(cat => {
            const m = CATEGORY_META[cat];
            return <option key={cat} value={cat}>{m.icon} {m.label}</option>;
          })}
        </select>
        {fieldError('selectedCategory') && <p className="text-xs text-red-500 mt-1">{errors.selectedCategory}</p>}
      </div>

      {/* Issue Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('issue_type', 'Issue Type')} <span className="text-red-500">*</span>
        </label>
        <select
          value={issueType}
          onChange={e => onIssueTypeChange(e.target.value)}
          onBlur={() => touch('issueType')}
          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm bg-white ${fieldError('issueType') ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
        >
          <option value="">{t('select_issue_type', '-- Select Issue Type --')}</option>
          {ISSUE_TYPES.map(it => (
            <option key={it.value} value={it.value}>{it.label}</option>
          ))}
        </select>
        {fieldError('issueType') && <p className="text-xs text-red-500 mt-1">{errors.issueType}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('description', 'Description')} <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <textarea
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            onBlur={() => touch('description')}
            rows={4}
            placeholder={t('description_placeholder', 'Describe the issue in detail… (steps to reproduce, error messages, etc.)')}
            className={`w-full px-4 py-3 pr-12 border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-sm ${fieldError('description') ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
          />
          <button
            type="button"
            onClick={toggleVoice}
            className={`absolute right-3 top-3 p-2 rounded-full transition-colors ${
              isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            title={isListening ? 'Stop recording' : 'Start voice input'}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {isListening && <span className="text-red-500">🎤 Listening...</span>}
          {!isListening && fieldError('description') && <span className="text-red-500">{errors.description}</span>}
        </p>
      </div>

      {/* Screenshot Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('screenshots', 'Screenshots')}
          <span className="text-gray-400 font-normal ml-1">({t('optional', 'optional')})</span>
        </label>

        {/* Existing images grid */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {images.map((img, idx) => (
              <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 group">
                <img src={img.dataUrl} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveImage(idx)}
                  className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add more images */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setCameraMode(true)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-primary-300 bg-primary-50 hover:bg-primary-100 transition"
          >
            <CameraIcon className="w-8 h-8 text-primary-600" />
            <span className="text-xs font-medium text-primary-700">{t('use_camera', 'Camera')}</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition"
          >
            <PhotoIcon className="w-8 h-8 text-gray-600" />
            <span className="text-xs font-medium text-gray-700">{t('upload_file', 'Upload')}</span>
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
      </div>

      {/* Additional Files */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('additional_files', 'Additional Files')}
          <span className="text-gray-400 font-normal ml-1">({t('optional', 'optional')})</span>
        </label>
        <button
          type="button"
          onClick={() => additionalFilesRef.current?.click()}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition flex items-center justify-center gap-2 text-sm"
        >
          <PaperClipIcon className="w-5 h-5" />
          {t('attach_files', 'Attach files (PDF, DOC, images)')}
        </button>
        <input
          ref={additionalFilesRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={handleAdditionalFiles}
        />
        {additionalFiles.length > 0 && (
          <div className="mt-2 space-y-1">
            {additionalFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600">
                <PaperClipIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Preview & Submit
// ─────────────────────────────────────────────────────────────────────────────
function PreviewStep({ data, onEdit }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          {t('step_preview_title', 'Review Your Ticket')}
        </h2>
        <p className="text-sm text-gray-500">
          {t('step_preview_subtitle', 'Everything look right? Submit your support ticket.')}
        </p>
      </div>

      <ComplaintPreview
        images={data.images}
        category={data.category}
        description={data.description}
        timestamp={data.timestamp}
        websiteName={data.websiteName}
        issueType={data.issueType}
        collegeName={data.collegeName}
        collegeCity={data.collegeCity}
        facultyName={data.facultyName}
        facultyNumber={data.facultyNumber}
        additionalFiles={data.additionalFiles}
        onEdit={onEdit}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 0 — College Verification
// ─────────────────────────────────────────────────────────────────────────────


function CollegeVerifyStep({ collegeCode, setCollegeCode, onVerified }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collegeData, setCollegeData] = useState(null);

  const handleNext = async () => {
    if (!collegeCode.trim()) {
      setError('Please enter a college code');
      return;
    }

    setError('');
    setLoading(true);
    setCollegeData(null);

    try {
      const res = await collegeApi.getPublicByCode(collegeCode.trim().toUpperCase());
      if (res.success && res.data) {
        setCollegeData(res.data);
        onVerified({
          code: collegeCode.trim().toUpperCase(),
          name: res.data.name,
          city: res.data.city,
        });
      } else {
        setError(res.message || 'College not found for this code');
      }
    } catch (err) {
      setError('College not found for this code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🏫</span>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          {t('verify_college', 'Enter College Code')}
        </h2>
        <p className="text-sm text-gray-500">
          {t('verify_college_desc', 'Enter your college code to continue')}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t('college_code', 'College Code')}
          </label>
          <input
            type="tel"
            value={collegeCode}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 10);
              setCollegeCode(val);
              setCollegeData(null);
              setError('');
            }}
            placeholder="e.g. 1234567890"
            maxLength={10}
            inputMode="numeric"
            pattern="[0-9]{10}"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
          />
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        {/* College Details Card */}
        {collegeData && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-lg">✓</span>
              <span className="font-medium text-green-800">College Found</span>
            </div>
            <div className="pl-6 space-y-1">
              <p className="text-gray-900 font-semibold text-lg">{collegeData.name}</p>
              <p className="text-gray-600">{collegeData.city}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleNext}
          disabled={loading || !collegeCode.trim()}
          className="w-full py-4 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
        >
          {loading ? t('verifying', 'Verifying...') : t('next', 'Next')}
          <ArrowRightIcon className="w-5 h-5" />
        </button>
      </div>
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
  const [searchParams] = useSearchParams();
  const { addToast } = useToastStore();
  const { language } = useSettingsStore();
  const { isOnline } = useConnectivity();
  const autoSaveTimer = useRef(null);

  // ── UI state
  const [showConsent, setShowConsent] = useState(true);
  const [currentStep, setCurrentStep] = useState(0); // 0-2
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [submittedComplaintId, setSubmittedComplaintId] = useState(null);
  const [estimatedResolution, setEstimatedResolution] = useState(null);
  const [confirmNotDuplicate, setConfirmNotDuplicate] = useState(false);

  // ── Phone verification state (pre-fill from ?phone= query param)
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);

  // ── College verification state
  const [collegeCode, setCollegeCode] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [collegeCity, setCollegeCity] = useState('');
  const [collegeVerified, setCollegeVerified] = useState(false);

  const handleCollegeCodeChange = (val) => {
    setCollegeCode(val);
    setCollegeVerified(false);
    setCollegeName('');
    setCollegeCity('');
  };

  // Pre-fill college code from URL ?college=XXX
  useEffect(() => {
    const c = searchParams.get('college');
    if (c && !collegeCode) {
      setCollegeCode(c);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form data
  const [images, setImages] = useState([]);  // Array of { dataUrl, blob }
  const [description, setDescription] = useState('');
  const [websiteName, setWebsiteName] = useState('');
  const [issueType, setIssueType] = useState('');
  const [facultyName, setFacultyName] = useState('');
  const [facultyNumber, setFacultyNumber] = useState('');
  // Priority is now set by admin only — not user
  const [additionalFiles, setAdditionalFiles] = useState([]);

  // ── Category state
  const [selectedCategory, setSelectedCategory] = useState('');

  // 3-step config
  const steps = [
    { id: 'verify',  label: t('step_verify',  'Verify'),  description: t('college_verify', 'College') },
    { id: 'details', label: t('step_details', 'Details'), description: t('issue_info', 'Issue Info') },
    { id: 'preview', label: t('step_preview', 'Preview'), description: t('review_submit', 'Review & Submit') },
  ];

  // ── Load draft
  useEffect(() => {
    (async () => {
      const draft = await getDraftComplaint();
      if (draft?.savedAt) {
        const hrs = (Date.now() - new Date(draft.savedAt).getTime()) / 3_600_000;
        if (hrs < 24) {
          if (draft.images)            setImages(draft.images);
          else if (draft.image)         setImages([{ dataUrl: draft.image, blob: null }]);
          if (draft.category)          setSelectedCategory(draft.category);
          if (draft.description)       setDescription(draft.description);
          if (draft.websiteName)       setWebsiteName(draft.websiteName);
          if (draft.issueType)         setIssueType(draft.issueType);
          // priority is admin-only, skip draft restore
          addToast(t('draft_restored', 'Draft restored'), 'info');
        }
      }
    })();
  }, []);

  // ── Auto-save
  useEffect(() => {
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (images.length || selectedCategory || description || websiteName) {
        await saveDraftComplaint({
          images: images.map(i => ({ dataUrl: i.dataUrl })),
          category: selectedCategory, description,
          websiteName, issueType,
          timestamp: new Date().toISOString(),
        });
      }
    }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [images, selectedCategory, description, websiteName, issueType]);

  // ── Validation
  const canProceed = () => {
    if (currentStep === 0) return collegeVerified;
    if (currentStep === 1) return websiteName.trim() && facultyName.trim() && /^[0-9]{10}$/.test(facultyNumber.trim()) && selectedCategory && issueType && description.trim().length >= 10;
    return true;
  };

  const goNext = () => {
    if (canProceed()) setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  };

  // Auto-fill faculty info only for the current college, clear when college changes
  useEffect(() => {
    setFacultyName('');
    setFacultyNumber('');
    if (collegeVerified && collegeCode) {
      (async () => {
        const res = await collegeApi.getLastFacultyForCollege(collegeCode);
        if (res.success && res.data && res.data.facultyName && res.data.facultyNumber) {
          setFacultyName(res.data.facultyName);
          setFacultyNumber(res.data.facultyNumber);
        }
      })();
    }
  }, [collegeVerified, collegeCode]);

  const goBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const goToStep = (step) => {
    if (step >= currentStep) return;
    setCurrentStep(step);
  };

  // ── Submit
  const handleSubmit = async (skipDuplicateCheck = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitProgress(10);

    try {
      setSubmitProgress(30);
      const formData = new FormData();

      // Compress and append screenshot images if present
      for (let i = 0; i < images.length; i++) {
        const compressed = await compressDataUrl(images[i].dataUrl, { maxSizeMB: 0.5, maxWidthOrHeight: 1920 });
        const blob = await fetch(compressed.dataUrl).then(r => r.blob());
        formData.append('image', blob, `screenshot-${i + 1}.jpg`);
      }

      setSubmitProgress(50);
      formData.append('category', selectedCategory);
      formData.append('description', description || '');
      formData.append('collegeCode', collegeCode);
      formData.append('collegeName', collegeName);
      formData.append('collegeCity', collegeCity);
      formData.append('websiteName', websiteName);
      formData.append('issueType', issueType);
      formData.append('name', facultyName);
      formData.append('phoneNumber', facultyNumber);
      formData.append('facultyName', facultyName);
      formData.append('facultyNumber', facultyNumber);
      formData.append('preferredLanguage', language);
      if (skipDuplicateCheck || confirmNotDuplicate) formData.append('confirmNotDuplicate', 'true');
      if (sessionId) formData.append('sessionId', sessionId);

      // Append additional files
      for (const file of additionalFiles) {
        formData.append('additionalFiles', file);
      }

      setSubmitProgress(70);
      const result = await complaintApi.create(formData);
      setSubmitProgress(90);

      if (result.success) {
        await clearDraftComplaint();
        setSubmittedComplaintId(result.data.complaintId);
        setEstimatedResolution(result.data.estimatedResolution);
        setSubmitProgress(100);
        addToast(t('ticket_submitted_toast', 'Support ticket submitted!'), 'success');
      } else if (result.isDuplicate) {
        setDuplicates(result.duplicates || []);
        setShowDuplicateModal(true);
        setSubmitProgress(0);
        setCurrentStep(2);
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

  // ── Image handlers (multiple)
  const handleCapture = (dataUrl, blob) => { setImages(prev => [...prev, { dataUrl, blob }]); };
  const handleFileUpload = (dataUrl, file) => { setImages(prev => [...prev, { dataUrl, blob: file }]); };
  const handleRemoveImage = (index) => { setImages(prev => prev.filter((_, i) => i !== index)); };

  // ── Success screen
  if (submittedComplaintId) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <ComplaintSuccess
          complaintId={submittedComplaintId}
          trackingUrl={`${window.location.origin}/track/${submittedComplaintId}`}
          estimatedTime={estimatedResolution || t('estimated_3_5_days', '3–5 working days')}
          onTrackStatus={() => navigate(`/track/${submittedComplaintId}`)}
          onNewComplaint={() => {
            setSubmittedComplaintId(null);
            setImages([]);
            setSelectedCategory(''); setWebsiteName('');
            setIssueType('');
            setDescription(''); setAdditionalFiles([]);
            setCurrentStep(1);
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
          requiredPermissions={['camera', 'data']}
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
            {currentStep > 0 ? (
              <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeftIcon className="w-5 h-5 text-gray-600" />
              </button>
            ) : (
              <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg transition">
                <XMarkIcon className="w-5 h-5 text-gray-600" />
              </Link>
            )}
            <h1 className="font-semibold text-gray-900">{t('new_ticket', 'New Support Ticket')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <StatusIndicators />
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
                <CollegeVerifyStep
                  collegeCode={collegeCode}
                  setCollegeCode={handleCollegeCodeChange}
                  onVerified={(college) => {
                    setCollegeCode(college.code);
                    setCollegeName(college.name);
                    setCollegeCity(college.city);
                    setCollegeVerified(true);
                    setCurrentStep(1);
                  }}
                />
              )}
              {currentStep === 1 && (
                <IssueDetailsStep
                  collegeName={collegeName}
                  collegeCity={collegeCity}
                  websiteName={websiteName}
                  onWebsiteNameChange={setWebsiteName}
                  selectedCategory={selectedCategory}
                  onCategorySelect={setSelectedCategory}
                  issueType={issueType}
                  onIssueTypeChange={setIssueType}
                  description={description}
                  onDescriptionChange={setDescription}
                  facultyName={facultyName}
                  onFacultyNameChange={setFacultyName}
                  facultyNumber={facultyNumber}
                  onFacultyNumberChange={setFacultyNumber}
                  images={images}
                  onCapture={handleCapture}
                  onFileUpload={handleFileUpload}
                  onRemoveImage={handleRemoveImage}
                  additionalFiles={additionalFiles}
                  onAdditionalFilesChange={setAdditionalFiles}
                />
              )}
              {currentStep === 2 && (
                <PreviewStep
                  data={{
                    images, category: selectedCategory,
                    description, websiteName, issueType,
                    collegeCode, collegeName, collegeCity,
                    facultyName, facultyNumber,
                    additionalFiles,
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

          {/* Step 0: Phone verify — handled entirely by the component */}

          {/* Step 1: Next after filling issue details */}
          {currentStep === 1 && (
            <button
              onClick={goNext}
              disabled={!canProceed()}
              className={`w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 transition
                ${canProceed()
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
            >
              {t('preview_ticket', 'Preview Ticket')}
              <ArrowRightIcon className="w-5 h-5" />
            </button>
          )}

          {/* Step 2: Submit */}
          {currentStep === 2 && (
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
                  {t('submit_ticket', 'Submit Ticket')}
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

// ...existing code...

// Wrapped export
export default function EnhancedSubmitComplaintPage() {
  return (
    <ConnectivityProvider>
      <SubmitComplaintContent />
    </ConnectivityProvider>
  );
}