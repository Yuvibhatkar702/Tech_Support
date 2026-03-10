import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

export default function ConsentBanner({ onAccept, onDecline }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [consents, setConsents] = useState({
    camera: false,
    location: false,
    data: false,
  });

  const allChecked = consents.camera && consents.location && consents.data;

  const handleToggle = (key) => {
    setConsents(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAcceptAll = () => {
    setConsents({ camera: true, location: true, data: true });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🔒</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {t('consent.title', 'Your Privacy Matters')}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {t('consent.subtitle', 'We need your permission to proceed')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4">
          {/* Summary */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm text-blue-800">
              {t('consent.summary', 'To submit a ticket, we need access to your camera for screenshots and your location to help identify the issue. Your data is securely stored and only used for ticket resolution.')}
            </p>
          </div>

          {/* Consent Items */}
          <div className="space-y-3">
            {/* Camera */}
            <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition">
              <input
                type="checkbox"
                checked={consents.camera}
                onChange={() => handleToggle('camera')}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📸</span>
                  <span className="font-medium text-gray-900">
                    {t('consent.camera_title', 'Camera Access')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {t('consent.camera_desc', 'To capture photo evidence of the issue')}
                </p>
              </div>
            </label>

            {/* Location */}
            <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition">
              <input
                type="checkbox"
                checked={consents.location}
                onChange={() => handleToggle('location')}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📍</span>
                  <span className="font-medium text-gray-900">
                    {t('consent.location_title', 'Location Access')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {t('consent.location_desc', 'To automatically detect and tag the ticket location')}
                </p>
              </div>
            </label>

            {/* Data Usage */}
            <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition">
              <input
                type="checkbox"
                checked={consents.data}
                onChange={() => handleToggle('data')}
                className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📊</span>
                  <span className="font-medium text-gray-900">
                    {t('consent.data_title', 'Data Processing')}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {t('consent.data_desc', 'To store and process your ticket for resolution')}
                </p>
              </div>
            </label>
          </div>

          {/* Expandable Details */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
          >
            <span>{t('consent.learn_more', 'Learn more about how we use your data')}</span>
            <motion.svg
              animate={{ rotate: expanded ? 180 : 0 }}
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </motion.svg>
          </button>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">
                      {t('consent.storage_title', 'Data Storage')}
                    </h4>
                    <p>{t('consent.storage_desc', 'Your ticket data is stored securely in encrypted databases. Screenshots are compressed to save storage.')}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">
                      {t('consent.sharing_title', 'Data Sharing')}
                    </h4>
                    <p>{t('consent.sharing_desc', 'Your data is shared only with relevant support teams responsible for resolving your ticket.')}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">
                      {t('consent.retention_title', 'Data Retention')}
                    </h4>
                    <p>{t('consent.retention_desc', 'Ticket data is retained for 5 years as per records policy. You can request deletion after case closure.')}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">
                      {t('consent.rights_title', 'Your Rights')}
                    </h4>
                    <p>{t('consent.rights_desc', 'You have the right to access, correct, or request deletion of your data. Contact support for assistance.')}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 sm:p-6 space-y-3">
          <button
            onClick={handleAcceptAll}
            className="text-sm text-primary-600 hover:text-primary-700 mb-2"
          >
            {t('consent.accept_all', 'Accept All')}
          </button>
          
          <button
            onClick={() => onAccept(consents)}
            disabled={!allChecked}
            className={`w-full py-3.5 rounded-xl font-semibold transition ${
              allChecked
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {t('consent.continue', 'Continue')}
          </button>
          
          <button
            onClick={onDecline}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            {t('consent.decline', 'Cancel and go back')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
