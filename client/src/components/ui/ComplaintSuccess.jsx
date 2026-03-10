import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircleIcon, 
  DocumentDuplicateIcon,
  ShareIcon,
  ArrowDownTrayIcon,
  HomeIcon
} from '@heroicons/react/24/outline';

export default function ComplaintSuccess({ 
  complaintId, 
  trackingUrl,
  estimatedTime,
  onNewComplaint,
  onShare
}) {
  const { t } = useTranslation();
  const qrRef = useRef(null);
  const navigate = useNavigate();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(complaintId);
      // Show toast notification
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const shareComplaint = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Ticket Submitted',
          text: `Ticket ID: ${complaintId}`,
          url: trackingUrl,
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      }
    } else if (onShare) {
      onShare();
    }
  };

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = 'white';
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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto"
    >
      {/* Success Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1, stiffness: 200 }}
          className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <CheckCircleIcon className="w-10 h-10 text-green-600" />
          </motion.div>
        </motion.div>
        
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-2xl font-bold text-gray-900 mb-2"
        >
          Ticket Submitted!
        </motion.h1>
        
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-gray-600"
        >
          Your ticket has been registered successfully.
        </motion.p>
      </div>

      {/* Complaint ID Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-br from-primary-600 to-primary-700 rounded-2xl p-6 text-white mb-6"
      >
        <p className="text-primary-100 text-sm mb-2">Your Ticket ID</p>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold font-mono tracking-wider">
            {complaintId}
          </span>
          <button
            onClick={copyToClipboard}
            className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition"
            title="Copy to clipboard"
          >
            <DocumentDuplicateIcon className="w-5 h-5" />
          </button>
        </div>
        
        {estimatedTime && (
          <div className="mt-4 pt-4 border-t border-white/20">
            <p className="text-primary-100 text-xs">Estimated Resolution</p>
            <p className="font-medium">{estimatedTime}</p>
          </div>
        )}
      </motion.div>

      {/* QR Code Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-2xl p-6 shadow-lg mb-6"
      >
        <h3 className="font-semibold text-gray-900 mb-4 text-center">
          Quick Tracking QR Code
        </h3>
        
        <div ref={qrRef} className="flex justify-center mb-4">
          <div className="p-4 bg-white rounded-xl border-2 border-gray-100">
            <QRCodeSVG
              value={trackingUrl || `${window.location.origin}/track/${complaintId}`}
              size={160}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#1e40af"
            />
          </div>
        </div>

        <p className="text-sm text-gray-500 text-center mb-4">
          Scan this QR code anytime to check status
        </p>

        <div className="flex gap-2">
          <button
            onClick={downloadQR}
            className="flex-1 py-2 px-3 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-2"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Save QR
          </button>
          <button
            onClick={shareComplaint}
            className="flex-1 py-2 px-3 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition flex items-center justify-center gap-2"
          >
            <ShareIcon className="w-4 h-4" />
            Share
          </button>
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="space-y-3"
      >
        <button
          onClick={onNewComplaint}
          className="w-full py-3 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition"
        >
          Submit Another Ticket
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full py-3 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition"
        >
          <HomeIcon className="w-5 h-5" />
          Go to Home
        </button>
      </motion.div>
    </motion.div>
  );
}
