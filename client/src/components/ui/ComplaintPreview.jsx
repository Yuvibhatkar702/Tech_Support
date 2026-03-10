import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { 
  CalendarIcon, 
  TagIcon,
  PencilSquareIcon,
  CameraIcon,
  CheckCircleIcon,
  GlobeAltIcon,
  ExclamationTriangleIcon,
  FlagIcon,
  DocumentTextIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline';

const CATEGORY_META = {
  "Homepage":                  { icon: '🏠', label: 'Homepage' },
  "Admission Portal":         { icon: '🎓', label: 'Admission Portal' },
  "Examination Portal":       { icon: '📝', label: 'Examination Portal' },
  "Student Portal":           { icon: '👨‍🎓', label: 'Student Portal' },
  "Faculty Portal":           { icon: '👨‍🏫', label: 'Faculty Portal' },
  "LMS":                      { icon: '📚', label: 'Learning Management System' },
  "Payment Gateway":          { icon: '💳', label: 'Payment Gateway' },
  "Email System":             { icon: '📧', label: 'Email System' },
  "Mobile App":               { icon: '📱', label: 'Mobile App' },
  "Other":                    { icon: '🔧', label: 'Other' },
};

const ISSUE_TYPE_LABELS = {
  bug: 'Bug',
  error: 'Error',
  page_not_loading: 'Page Not Loading',
  login_issue: 'Login Issue',
  performance: 'Performance Issue',
  ui_ux: 'UI/UX Issue',
  data_issue: 'Data Issue',
  other: 'Other',
};

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'bg-green-100 text-green-700' },
  medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-700' },
  high: { label: 'High', color: 'bg-red-100 text-red-700' },
};

export default function ComplaintPreview({
  image,
  category,
  description,
  timestamp,
  websiteName,
  issueType,
  priority,
  additionalFiles,
  onEdit,
  readOnly = false,
  className = '',
}) {
  const { t } = useTranslation();
  
  const catMeta = CATEGORY_META[category] || { icon: '🔧', label: category };
  const issueLabel = ISSUE_TYPE_LABELS[issueType] || issueType;
  const priorityCfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl shadow-lg overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-5 py-4 text-white">
        <div className="flex items-center gap-2">
          <CheckCircleIcon className="w-5 h-5" />
          <h3 className="font-semibold">{t('ticket_preview', 'Ticket Preview')}</h3>
        </div>
        <p className="text-primary-100 text-sm mt-1">{t('review_before_submit', 'Review before submitting')}</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Screenshot */}
        {image && (
          <div className="relative">
            <div className="aspect-video rounded-xl overflow-hidden bg-gray-100">
              <img src={image} alt="Screenshot" className="w-full h-full object-cover" />
            </div>
            {!readOnly && onEdit && (
              <button
                onClick={() => onEdit(1)}
                className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white transition"
              >
                <CameraIcon className="w-5 h-5" />
              </button>
            )}
            {timestamp && (
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                {new Date(timestamp).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Website Name */}
        {websiteName && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <GlobeAltIcon className="w-5 h-5 text-primary-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('website_name', 'Website Name')}</p>
              <p className="font-medium text-gray-900 text-sm">{websiteName}</p>
            </div>
          </div>
        )}

        {/* Category (Page/Module) */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-xl">
              {catMeta.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('page_module', 'Page / Module')}</p>
              <p className="font-medium text-gray-900 text-sm">{catMeta.label}</p>
            </div>
          </div>
          {!readOnly && onEdit && (
            <button onClick={() => onEdit(1)} className="p-1.5 hover:bg-gray-200 rounded-lg transition">
              <PencilSquareIcon className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>

        {/* Issue Type & Priority row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <ExclamationTriangleIcon className="w-4 h-4 text-primary-600" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('issue_type', 'Issue Type')}</p>
            </div>
            <p className="font-medium text-gray-900 text-sm">{issueLabel}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <FlagIcon className="w-4 h-4 text-primary-600" />
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('priority', 'Priority')}</p>
            </div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${priorityCfg.color}`}>
              {priorityCfg.label}
            </span>
          </div>
        </div>

        {/* Description */}
        {(description || !readOnly) && (
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-gray-700">
                <DocumentTextIcon className="w-5 h-5 text-primary-600" />
                <span className="font-medium text-sm">{t('description', 'Description')}</span>
              </div>
              {!readOnly && onEdit && (
                <button onClick={() => onEdit(1)} className="p-1.5 hover:bg-gray-200 rounded-lg transition">
                  <PencilSquareIcon className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
            {description ? (
              <p className="text-sm text-gray-600">{description}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">{t('no_description', 'No description provided')}</p>
            )}
          </div>
        )}

        {/* Additional Files */}
        {additionalFiles && additionalFiles.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <PaperClipIcon className="w-5 h-5 text-primary-600" />
              <span className="font-medium text-sm text-gray-700">
                {t('additional_files', 'Additional Files')} ({additionalFiles.length})
              </span>
            </div>
            <ul className="space-y-1">
              {additionalFiles.map((file, i) => (
                <li key={i} className="text-xs text-gray-500 truncate">📎 {file.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Compact preview card
export function CompactComplaintPreview({ image, category, websiteName, className = '' }) {
  const { t } = useTranslation();
  const catMeta = CATEGORY_META[category] || { icon: '🔧', label: category };

  return (
    <div className={`flex items-center gap-3 p-3 bg-gray-50 rounded-xl ${className}`}>
      {image && (
        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
          <img src={image} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span>{catMeta.icon}</span>
          <span className="font-medium text-gray-900 text-sm">{catMeta.label}</span>
        </div>
        {websiteName && (
          <p className="text-xs text-gray-500 truncate mt-1">{websiteName}</p>
        )}
      </div>
    </div>
  );
}