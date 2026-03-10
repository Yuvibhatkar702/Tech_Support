import { useTranslation } from 'react-i18next';
import { getCategoryInfo } from './CategorySelector';

export default function DuplicateWarningModal({
  isOpen,
  duplicates,
  onConfirm,
  onCancel,
  onProceed,
  onClose,
  isLoading,
}) {
  const { t } = useTranslation();

  // Support both prop naming conventions
  const handleConfirm = onConfirm || onProceed;
  const handleCancel = onCancel || onClose;

  if (!isOpen) return null;

  const closestDuplicate = duplicates?.[0];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg animate-slideUp">
          {/* Header */}
          <div className="bg-yellow-50 px-6 py-4 border-b border-yellow-100">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-yellow-800">
                  {t('duplicate_title')}
                </h3>
                <p className="text-sm text-yellow-600">
                  {t('duplicate_message')}
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {/* Similar complaints list */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {duplicates?.map((dup, index) => {
                const category = getCategoryInfo(dup.category);
                return (
                  <div 
                    key={dup.complaintId}
                    className={`p-3 rounded-lg border ${index === 0 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{category.icon}</span>
                        <span className="font-medium text-gray-800">{dup.complaintId}</span>
                      </div>
                      <span className={`badge badge-${dup.status.replace('_', '-')}`}>
                        {t(`status_${dup.status}`)}
                      </span>
                    </div>
                    
                    <div className="mt-2 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <span>{t('duplicate_distance')}: <strong>{dup.distance}m</strong></span>
                      </div>
                      {dup.address && (
                        <p className="mt-1 text-gray-500 text-xs truncate">{dup.address}</p>
                      )}
                    </div>
                    
                    <p className="mt-2 text-xs text-gray-400">
                      Filed on {new Date(dup.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Message */}
            <p className="mt-4 text-sm text-gray-600">
              Are you sure this is a new issue? If it's the same problem, the existing ticket is already being addressed.
            </p>
          </div>

          {/* Actions */}
          <div className="bg-gray-50 px-6 py-4 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <button
              onClick={handleCancel}
              className="btn-secondary w-full sm:w-auto"
              disabled={isLoading}
            >
              {t('duplicate_cancel')}
            </button>
            <button
              onClick={handleConfirm}
              className="btn-primary w-full sm:w-auto"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="spinner w-5 h-5 mr-2" />
                  Submitting...
                </>
              ) : (
                t('duplicate_confirm')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
