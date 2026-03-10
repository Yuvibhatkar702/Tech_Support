import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

export default function ComplaintQRCode({ complaintId, size = 150, showDownload = true }) {
  const { t } = useTranslation();
  const trackingUrl = `${window.location.origin}/track/${complaintId}`;

  const downloadQR = () => {
    const svg = document.getElementById(`qr-${complaintId}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      const link = document.createElement('a');
      link.download = `ticket-${complaintId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-xl border border-gray-200 p-4 inline-block"
    >
      <div className="flex flex-col items-center">
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
          <QRCodeSVG
            id={`qr-${complaintId}`}
            value={trackingUrl}
            size={size}
            level="H"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#1f2937"
          />
        </div>
        
        <p className="mt-3 text-sm text-gray-600 text-center">
          {t('qr.scan_to_track', 'Scan to track your ticket')}
        </p>
        
        <p className="font-mono text-lg font-bold text-primary-600 mt-1">
          {complaintId}
        </p>

        {showDownload && (
          <button
            onClick={downloadQR}
            className="mt-3 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('qr.download', 'Download QR Code')}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// Compact QR display
export function CompactQR({ complaintId, size = 80 }) {
  const trackingUrl = `${window.location.origin}/track/${complaintId}`;

  return (
    <div className="inline-block bg-white p-2 rounded-lg shadow-sm">
      <QRCodeSVG
        value={trackingUrl}
        size={size}
        level="M"
        bgColor="#ffffff"
        fgColor="#1f2937"
      />
    </div>
  );
}
