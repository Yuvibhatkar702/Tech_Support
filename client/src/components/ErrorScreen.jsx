import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

const errorTypes = {
  camera_permission: {
    icon: '📸',
    title: 'camera_permission_title',
    message: 'camera_permission_message',
    instructions: [
      'Open your browser settings',
      'Find "Site Settings" or "Permissions"',
      'Allow camera access for this site',
      'Refresh the page and try again',
    ],
  },
  location_permission: {
    icon: '📍',
    title: 'location_permission_title',
    message: 'location_permission_message',
    instructions: [
      'Open your browser settings',
      'Find "Location" in permissions',
      'Allow location access for this site',
      'Refresh the page and try again',
    ],
  },
  location_unavailable: {
    icon: '🛰️',
    title: 'location_unavailable_title',
    message: 'location_unavailable_message',
    instructions: [
      'Make sure GPS is enabled on your device',
      'Move to an area with better signal',
      'Try going outdoors or near a window',
      'Restart your device if the issue persists',
    ],
  },
  network_error: {
    icon: '🌐',
    title: 'network_error_title',
    message: 'network_error_message',
    instructions: [
      'Check your internet connection',
      'Try switching between WiFi and mobile data',
      'Wait a moment and try again',
      'Your ticket will be saved for offline submission',
    ],
  },
  upload_error: {
    icon: '⬆️',
    title: 'upload_error_title',
    message: 'upload_error_message',
    instructions: [
      'Check your internet connection',
      'Make sure the image is not too large',
      'Try capturing a new photo',
      'Contact support if the issue persists',
    ],
  },
  generic: {
    icon: '⚠️',
    title: 'generic_error_title',
    message: 'generic_error_message',
    instructions: [
      'Refresh the page and try again',
      'Check your internet connection',
      'Clear browser cache and cookies',
      'Contact support if the issue persists',
    ],
  },
};

export default function ErrorScreen({ type = 'generic', onRetry, onBack, customMessage }) {
  const { t } = useTranslation();
  const error = errorTypes[type] || errorTypes.generic;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6"
      >
        <span className="text-5xl">{error.icon}</span>
      </motion.div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        {t(`errors.${error.title}`, error.title.replace(/_/g, ' '))}
      </h2>

      <p className="text-gray-600 mb-6 max-w-md">
        {customMessage || t(`errors.${error.message}`, error.message.replace(/_/g, ' '))}
      </p>

      {/* Instructions */}
      <div className="bg-gray-50 rounded-xl p-5 mb-6 text-left w-full max-w-md">
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span>💡</span>
          {t('errors.how_to_fix', 'How to fix this')}
        </h3>
        <ol className="space-y-2">
          {error.instructions.map((instruction, index) => (
            <motion.li
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-start gap-3 text-sm text-gray-700"
            >
              <span className="w-6 h-6 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium">
                {index + 1}
              </span>
              <span>{t(`errors.instructions.${type}.${index}`, instruction)}</span>
            </motion.li>
          ))}
        </ol>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn-primary flex-1 py-3"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('errors.try_again', 'Try Again')}
          </button>
        )}
        {onBack && (
          <button
            onClick={onBack}
            className="btn-secondary flex-1 py-3"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t('errors.go_back', 'Go Back')}
          </button>
        )}
      </div>

      {/* Help Link */}
      <p className="mt-6 text-sm text-gray-500">
        {t('errors.still_stuck', 'Still stuck?')}{' '}
        <a href="#" className="text-primary-600 hover:underline">
          {t('errors.contact_support', 'Contact Support')}
        </a>
      </p>
    </motion.div>
  );
}

// Inline error message component
export function InlineError({ message, onRetry }) {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-red-50 border border-red-100 rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm text-red-700">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 text-sm font-medium text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('errors.retry', 'Retry')}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
