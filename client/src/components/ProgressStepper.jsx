import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

const steps = [
  { id: 'capture', icon: '📸', key: 'capture_image' },
  { id: 'location', icon: '📍', key: 'detect_location' },
  { id: 'details', icon: '📝', key: 'review_details' },
  { id: 'submit', icon: '✅', key: 'submit' },
];

export default function ProgressStepper({ currentStep, completedSteps = [] }) {
  const { t } = useTranslation();
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between relative">
        {/* Progress Line Background */}
        <div className="absolute top-5 left-0 right-0 h-1 bg-gray-200 mx-8" />
        
        {/* Progress Line Active */}
        <motion.div
          className="absolute top-5 left-0 h-1 bg-primary-500 mx-8"
          initial={{ width: '0%' }}
          animate={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />

        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id) || index < currentIndex;
          const isCurrent = step.id === currentStep;
          const isPending = index > currentIndex;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ 
                  scale: isCurrent ? 1.1 : 1,
                  backgroundColor: isCompleted ? '#10b981' : isCurrent ? '#3b82f6' : '#e5e7eb',
                }}
                transition={{ duration: 0.3 }}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-md ${
                  isCompleted || isCurrent ? 'text-white' : 'text-gray-400'
                }`}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{step.icon}</span>
                )}
              </motion.div>
              
              <motion.span
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-2 text-xs font-medium text-center max-w-[80px] ${
                  isCurrent ? 'text-primary-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                {t(`stepper.${step.key}`, step.key.replace('_', ' '))}
              </motion.span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Vertical Timeline Stepper for Status History
export function TimelineStepper({ history, currentStatus }) {
  const { t } = useTranslation();

  const statusOrder = ['pending', 'assigned', 'in_progress', 'closed', 'rejected'];
  const statusColors = {
    pending: 'bg-yellow-500',
    assigned: 'bg-blue-400',
    in_progress: 'bg-blue-500',
    closed: 'bg-green-500',
    rejected: 'bg-red-500',
  };

  return (
    <div className="relative">
      {history.map((entry, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex gap-4 pb-6 last:pb-0"
        >
          {/* Timeline Line */}
          <div className="flex flex-col items-center">
            <div className={`w-4 h-4 rounded-full ${statusColors[entry.status] || 'bg-gray-400'} ring-4 ring-white shadow`} />
            {index < history.length - 1 && (
              <div className="w-0.5 h-full bg-gray-200 mt-1" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 -mt-1">
            <div className="flex items-center justify-between mb-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                entry.status === 'closed' ? 'bg-green-100 text-green-700' :
                entry.status === 'rejected' ? 'bg-red-100 text-red-700' :
                entry.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {t(`status.${entry.status}`, entry.status)}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(entry.changedAt).toLocaleString()}
              </span>
            </div>
            {entry.changedBy && (
              <p className="text-sm text-gray-600">
                {t('timeline.by', 'By')}: {entry.changedBy.name || 'System'}
              </p>
            )}
            {entry.notes && (
              <p className="text-sm text-gray-700 mt-1 bg-gray-50 p-2 rounded">
                {entry.notes}
              </p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
