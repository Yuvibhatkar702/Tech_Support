import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

export default function QRCodeScanner({ onScan, onClose, onError }) {
  const { t } = useTranslation();
  const scannerRef = useRef(null);
  const [isScanning, setIsScanning] = useState(true);
  const [error, setError] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [cameraFacing, setCameraFacing] = useState('environment'); // 'environment' | 'user'
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isScanning) return;
    let isCancelled = false;

    const startScanner = async () => {
      try {
        const html5QrCode = new Html5Qrcode('qr-scanner');
        scannerRef.current = html5QrCode;

        const onScanSuccess = (decodedText) => {
          if (isCancelled) return;
          setIsScanning(false);

          let complaintId;
          try {
            const url = new URL(decodedText);
            complaintId = url.pathname.split('/').pop();
          } catch {
            complaintId = decodedText;
          }

          if (complaintId && complaintId.trim()) {
            onScan(complaintId.trim().toUpperCase());
          }
        };

        const onScanFailure = () => {
          // ignore continuous scan failures
        };

        await html5QrCode.start(
          { facingMode: cameraFacing },
          {
            fps: 30,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          onScanSuccess,
          onScanFailure
        );
      } catch (err) {
        console.error('Scanner error:', err);
        if (!isCancelled) {
          setError(err.message || t('error_camera_access'));
          setIsScanning(false);
          onError?.(err);
        }
      }
    };

    startScanner();

    return () => {
      isCancelled = true;
      const current = scannerRef.current;
      if (current) {
        const state = current.getState?.();
        // Only stop if scanner is actively running or paused (state 2 = SCANNING, state 3 = PAUSED)
        if (state === 2 || state === 3) {
          current
            .stop()
            .then(() => current.clear())
            .catch((err) => console.warn('Scanner cleanup error:', err));
        } else {
          try { current.clear(); } catch (_) { /* ignore */ }
        }
      }
    };
  }, [isScanning, cameraFacing, onScan, onError, t]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    setIsScanning(false);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const html5qrcode = new Html5Qrcode('qr-upload-preview');

      const decodedText = await html5qrcode.scanFile(file);

      // Extract complaint ID from URL or direct text
      let complaintId;
      try {
        const url = new URL(decodedText);
        complaintId = url.pathname.split('/').pop();
      } catch {
        complaintId = decodedText;
      }

      if (complaintId && complaintId.trim()) {
        onScan(complaintId.trim().toUpperCase());
      }

      await html5qrcode.clear();
    } catch (err) {
      console.error('File scan error:', err);
      setError(t('qr.upload_failed'));
      setIsScanning(true);
      setUploadFile(null);
      onError?.(err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('qr.scan_code', 'Scan QR Code')}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => {
                  setUploadFile(null);
                  setIsScanning(true);
                  setCameraFacing('environment');
                }}
                className={`px-2 py-1 ${
                  cameraFacing === 'environment'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700'
                }`}
              >
                {t('qr.back_camera', 'Back')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadFile(null);
                  setIsScanning(true);
                  setCameraFacing('user');
                }}
                className={`px-2 py-1 border-l border-gray-200 ${
                  cameraFacing === 'user'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-700'
                }`}
              >
                {t('qr.front_camera', 'Front')}
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {error && !isScanning ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setIsScanning(true);
                }}
                className="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
              >
                {t('try_again', 'Try Again')}
              </button>
            </div>
          ) : (
            <>
              {/* Scanner */}
              {isScanning && !uploadFile && (
                <div className="rounded-lg overflow-hidden bg-gray-900">
                  <div id="qr-scanner" className="w-full" style={{ minHeight: '300px' }} />
                  <p className="text-center text-sm text-gray-400 py-3">
                    {t('qr.point_camera', 'Point your camera at the QR code')}
                  </p>
                </div>
              )}

              {/* Upload Preview */}
              {uploadFile && !isScanning && (
                <div className="rounded-lg overflow-hidden bg-gray-900">
                  <div id="qr-upload-preview" style={{ minHeight: '300px' }} />
                </div>
              )}

              {/* Tabs/Options */}
              <div className="flex gap-2 pt-2">
                {isScanning && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {t('qr.upload_image', 'Upload Image')}
                  </button>
                )}
                {uploadFile && (
                  <button
                    onClick={() => {
                      setUploadFile(null);
                      setIsScanning(true);
                    }}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                  >
                    {t('back', 'Back')}
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />

              <p className="text-sm text-gray-500 text-center">
                {t('qr.instruction', 'Scan a QR code or upload an image containing one')}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-700 font-medium hover:bg-gray-200 transition-colors"
          >
            {t('cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
