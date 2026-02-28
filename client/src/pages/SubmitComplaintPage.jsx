/**
 * SubmitComplaintPage.jsx  (UPDATED — AI auto-classification)
 * GrievancePortal/client/src/pages/SubmitComplaintPage.jsx
 *
 * KEY CHANGES vs original:
 *  1. Step 2 no longer shows <CategorySelector> — the category is predicted
 *     by the AI model on the backend after the image is uploaded.
 *  2. A new "AI Predicting…" badge is displayed while the form is processing.
 *  3. The success screen shows which category was predicted and the source
 *     ('ai_predicted' or 'user_provided').
 *  4. An optional "Override Category" expansion panel lets power-users
 *     manually override the AI prediction if needed.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CameraCapture from '../components/CameraCapture';
import LocationCapture from '../components/LocationCapture';
import CategorySelector from '../components/CategorySelector';
import DuplicateWarningModal from '../components/DuplicateWarningModal';
import { LanguageSelectorCompact } from '../components/LanguageSelector';
import { useComplaintStore, useToastStore } from '../store';
import { complaintApi } from '../services/api';

export default function SubmitComplaintPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { addToast } = useToastStore();

  const {
    step, setStep,
    image, setImage,
    imageBlob,
    location, setLocation,
    address, setAddress,
    category, setCategory,
    description, setDescription,
    phoneNumber, setPhoneNumber,
    name, setName,
    duplicates, setDuplicates,
    showDuplicateWarning, closeDuplicateWarning,
    isSubmitting, setIsSubmitting,
    submissionResult, setSubmissionResult,
    reset,
  } = useComplaintStore();

  const [formattedAddress, setFormattedAddress] = useState('');
  // Whether the user wants to override the AI category
  const [showCategoryOverride, setShowCategoryOverride] = useState(false);
  // The category returned by the server after submission
  const [predictedCategory, setPredictedCategory] = useState(null);
  const [categorySource, setCategorySource]         = useState(null);
  // Voice-to-text
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
        setDescription((prev) => (prev + ' ' + transcript).trim());
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, [setDescription]);

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

  // ── Step 1: Capture Photo ────────────────────────────────────────────────
  const handleImageCapture = (imageData, blob) => {
    setImage(imageData, blob);
    setStep(2);
  };

  // ── Step 2: Location and Details ────────────────────────────────────────
  const handleLocationCapture = (loc) => setLocation(loc);

  const handleAddressCapture = (addr, formatted) => {
    setAddress(addr);
    setFormattedAddress(formatted);
  };

  const handleNext = async () => {
    if (!phoneNumber) {
      addToast(t('error_validation'), 'error');
      return;
    }

    // If the user manually picked a category, run duplicate check now.
    // Otherwise we skip the duplicate check here (it runs on the server after
    // AI classification during the actual submission).
    if (location && category) {
      try {
        const result = await complaintApi.checkDuplicates(
          location.latitude,
          location.longitude,
          category
        );
        if (result.isDuplicate && result.duplicates?.length > 0) {
          setDuplicates(result.duplicates);
          return;
        }
      } catch (error) {
        console.error('Duplicate check failed:', error);
      }
    }

    setStep(3);
  };

  // ── Step 3: Preview and Submit ───────────────────────────────────────────
  const handleSubmit = async (confirmNotDuplicate = false) => {
    setIsSubmitting(true);
    closeDuplicateWarning();

    try {
      const formData = new FormData();
      formData.append('phoneNumber', phoneNumber);
      formData.append('name', name);
      // Only send category if the user explicitly chose an override
      if (category) formData.append('category', category);
      formData.append('description', description);
      formData.append('latitude', location.latitude);
      formData.append('longitude', location.longitude);
      formData.append('accuracy', location.accuracy);
      formData.append('gpsTimestamp', location.timestamp.toISOString());
      formData.append('preferredLanguage', i18n.language);
      formData.append('confirmNotDuplicate', confirmNotDuplicate);
      if (sessionId) formData.append('sessionId', sessionId);

      if (imageBlob) {
        formData.append('image', imageBlob, 'complaint.jpg');
      }

      const result = await complaintApi.create(formData);

      if (result.success) {
        setSubmissionResult(result.data);
        setPredictedCategory(result.data.category);
        setCategorySource(result.data.categorySource);
        setStep(4);
        addToast(t('success_message'), 'success');
      } else if (result.isDuplicate) {
        setDuplicates(result.duplicates);
      } else {
        addToast(result.message || t('error_generic'), 'error');
      }
    } catch (error) {
      console.error('Submission error:', error);
      if (error.response?.data?.isDuplicate) {
        setDuplicates(error.response.data.duplicates);
      } else {
        addToast(error.response?.data?.message || t('error_generic'), 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDuplicate = () => {
    closeDuplicateWarning();
    if (step === 2) {
      setStep(3);
    } else {
      handleSubmit(true);
    }
  };

  const handleNewComplaint = () => {
    reset();
    setPredictedCategory(null);
    setCategorySource(null);
    navigate('/submit');
  };

  // ── Progress steps ───────────────────────────────────────────────────────
  const steps = [
    { num: 1, label: t('submit_step_capture') },
    { num: 2, label: t('submit_step_details') },
    { num: 3, label: t('submit_step_preview') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step > 1 && step < 4 && (
              <button
                onClick={() => setStep(step - 1)}
                className="p-2 -ml-2 text-gray-600 hover:text-gray-900"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h1 className="font-semibold text-gray-900">{t('submit_title')}</h1>
          </div>
          <LanguageSelectorCompact />
        </div>

        {/* Progress indicator */}
        {step < 4 && (
          <div className="max-w-2xl mx-auto px-4 pb-3">
            <div className="flex items-center gap-2">
              {steps.map((s, index) => (
                <div key={s.num} className="flex items-center flex-1">
                  <div
                    className={`
                      flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                      ${step >= s.num
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-200 text-gray-500'}
                    `}
                  >
                    {step > s.num ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      s.num
                    )}
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 rounded ${step > s.num ? 'bg-primary-600' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">

        {/* ── Step 1: Camera ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="animate-fadeIn">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('camera_title')}</h2>
            <CameraCapture
              onCapture={handleImageCapture}
              onError={(error) => addToast(error, 'error')}
            />
          </div>
        )}

        {/* ── Step 2: Details (NO CategorySelector) ──────────────────────── */}
        {step === 2 && (
          <div className="animate-fadeIn space-y-6">
            {/* Image preview */}
            {image && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <img src={image} alt="Captured" className="w-full h-48 object-cover" />
              </div>
            )}

            {/* AI badge — tells the user the category will be auto-detected */}
            <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
              <span className="text-2xl">🤖</span>
              <div>
                <p className="text-sm font-semibold text-indigo-800">AI Auto-Classification</p>
                <p className="text-xs text-indigo-600">
                  Our AI model will automatically detect the complaint category from your photo.
                  No need to select one manually!
                </p>
              </div>
            </div>

            {/* Optional manual override */}
            <div>
              <button
                type="button"
                onClick={() => setShowCategoryOverride(v => !v)}
                className="text-sm text-gray-500 underline hover:text-gray-700"
              >
                {showCategoryOverride ? '▲ Hide category override' : '▼ Override AI category (optional)'}
              </button>
              {showCategoryOverride && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-2">
                    Leave unselected to let the AI decide.
                  </p>
                  <CategorySelector
                    value={category}
                    onChange={setCategory}
                  />
                  {category && (
                    <button
                      type="button"
                      onClick={() => setCategory(null)}
                      className="mt-2 text-xs text-red-500 hover:text-red-700"
                    >
                      ✕ Clear override
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Location */}
            <LocationCapture
              onLocationCapture={handleLocationCapture}
              onAddressCapture={handleAddressCapture}
              onError={(error) => addToast(error, 'error')}
            />

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('field_phone')} <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t('field_phone_placeholder')}
                className="w-full"
              />
            </div>

            {/* Name (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('field_name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('field_name_placeholder')}
                className="w-full"
              />
            </div>

            {/* Description (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('field_description')}
              </label>
              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('field_description_placeholder')}
                  rows={3}
                  className="w-full resize-none pr-12"
                />
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

            {/* Next button — only phone required now */}
            <button
              onClick={handleNext}
              disabled={!location || !phoneNumber}
              className="btn-primary w-full py-3"
            >
              {t('next')}
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Step 3: Preview ────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="animate-fadeIn space-y-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('submit_step_preview')}</h2>

            <div className="card space-y-4">
              {image && (
                <img src={image} alt="Complaint" className="w-full h-48 object-cover rounded-lg" />
              )}

              <div className="space-y-3">
                {/* Category — show override if set, else show AI badge */}
                {category ? (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getCategoryIcon(category)}</span>
                    <span className="font-medium text-gray-900">{t(`category_${category}`)}</span>
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      Manual override
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🤖</span>
                    <span className="font-medium text-indigo-700">AI will classify after submission</span>
                  </div>
                )}

                <div className="flex items-start gap-2 text-sm">
                  <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-gray-700">{formattedAddress || 'Location captured'}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="text-gray-700">{phoneNumber}</span>
                </div>

                {description && (
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">{description}</p>
                )}
              </div>
            </div>

            <button
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              className="btn-primary w-full py-3"
            >
              {isSubmitting ? (
                <>
                  <div className="spinner w-5 h-5 mr-2" />
                  Submitting &amp; classifying…
                </>
              ) : (
                <>
                  {t('submit')}
                  <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}

        {/* ── Step 4: Success ────────────────────────────────────────────── */}
        {step === 4 && submissionResult && (
          <div className="animate-fadeIn text-center py-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('success_title')}</h2>
            <p className="text-gray-600 mb-6">{t('success_message')}</p>

            {/* Complaint ID */}
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 mb-4">
              <p className="text-sm text-primary-600 mb-1">{t('success_complaint_id')}</p>
              <p className="text-2xl font-bold text-primary-700">{submissionResult.complaintId}</p>
            </div>

            {/* AI predicted category */}
            {predictedCategory && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6 text-left">
                <p className="text-xs text-indigo-500 mb-1 font-semibold uppercase tracking-wide">
                  {categorySource === 'ai_predicted' ? '🤖 AI Predicted Category' : '✋ Category (Manual)'}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getCategoryIcon(predictedCategory)}</span>
                  <span className="font-semibold text-indigo-800">
                    {predictedCategory.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-gray-600 mb-8">
              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <span>{t('success_whatsapp')}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to={`/track?id=${submissionResult.complaintId}`}
                className="btn-primary flex-1 py-3"
              >
                {t('success_track')}
              </Link>
              <button
                onClick={handleNewComplaint}
                className="btn-secondary flex-1 py-3"
              >
                {t('success_new')}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Duplicate Warning Modal */}
      <DuplicateWarningModal
        isOpen={showDuplicateWarning}
        duplicates={duplicates}
        onConfirm={handleConfirmDuplicate}
        onCancel={closeDuplicateWarning}
        isLoading={isSubmitting}
      />
    </div>
  );
}

function getCategoryIcon(categoryId) {
  const icons = {
    road_damage:          '🛣️',
    street_light:         '💡',
    water_supply:         '💧',
    sewage:               '🚿',
    garbage:              '🗑️',
    encroachment:         '🚧',
    noise_pollution:      '🔊',
    illegal_construction: '🏗️',
    traffic:              '🚗',
    other:                '📝',
  };
  return icons[categoryId] || '📝';
}
