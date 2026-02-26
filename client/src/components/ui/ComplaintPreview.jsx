import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  MapPinIcon, 
  CalendarIcon, 
  TagIcon,
  PencilSquareIcon,
  CameraIcon,
  CheckCircleIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

// Fix Leaflet icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function MapUpdater({ center }) {
  const map = useMap();
  map.setView(center, 16);
  return null;
}

export default function ComplaintPreview({
  image,
  location,
  category,
  aiConfidence,
  description,
  timestamp,
  onEditImage,
  onEditLocation,
  onEditCategory,
  onEditDescription,
  showAICategory = false,
  readOnly = false,
  className = '',
}) {
  const { t } = useTranslation();
  
  const mapCenter = useMemo(() => {
    if (location?.latitude && location?.longitude) {
      return [location.latitude, location.longitude];
    }
    return [20.5937, 78.9629]; // Default India center
  }, [location]);

  const categoryIcons = {
    // New categories
    "Damaged Road Issue": '🛣️',
    "Fallen Trees": '🌳',
    "Garbage and Trash Issue": '🗑️',
    "Illegal Drawing on Walls": '🎨',
    "Street Light Issue": '💡',
    "Other": '📋',
    // Legacy categories (for backward compatibility with old data)
    DamagedRoads: '🛣️',
    ElectricityIssues: '💡',
    GarbageAndSanitation: '🗑️',
    roads: '🛣️',
    water: '💧',
    electricity: '⚡',
    sanitation: '🧹',
    public_safety: '🚨',
    environment: '🌳',
    transportation: '🚌',
    healthcare: '🏥',
    education: '📚',
    other: '📋',
  };

  const categoryLabels = {
    "Damaged Road Issue": 'Damaged Road Issue',
    "Fallen Trees": 'Fallen Trees',
    "Garbage and Trash Issue": 'Garbage and Trash Issue',
    "Illegal Drawing on Walls": 'Illegal Drawing on Walls',
    "Street Light Issue": 'Street Light Issue',
    "Other": 'Other',
    // Legacy
    DamagedRoads: 'Damaged Roads',
    ElectricityIssues: 'Electricity Issues',
    GarbageAndSanitation: 'Garbage & Sanitation',
  };

  const getCategoryLabel = (cat) => {
    return categoryLabels[cat] || t(`categories.${cat}`, cat.replace(/_/g, ' '));
  };

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
          <h3 className="font-semibold">{t('complaint_preview')}</h3>
        </div>
        <p className="text-primary-100 text-sm mt-1">{t('review_before_submit')}</p>
      </div>

      <div className="p-5 space-y-5">
        {/* Image Section */}
        {image && (
          <div className="relative">
            <div className="aspect-video rounded-xl overflow-hidden bg-gray-100">
              <img
                src={image}
                alt={t('captured_image')}
                className="w-full h-full object-cover"
              />
            </div>
            {!readOnly && onEditImage && (
              <button
                onClick={onEditImage}
                className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-lg text-white transition"
                title={t('retake_photo')}
              >
                <CameraIcon className="w-5 h-5" />
              </button>
            )}
            {/* Image timestamp overlay */}
            {timestamp && (
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                {new Date(timestamp).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Location Section */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-gray-700">
              <MapPinIcon className="w-5 h-5 text-primary-600" />
              <span className="font-medium text-sm">{t('location')}</span>
            </div>
            {!readOnly && onEditLocation && (
              <button
                onClick={onEditLocation}
                className="p-1.5 hover:bg-gray-200 rounded-lg transition"
                title={t('edit_location')}
              >
                <PencilSquareIcon className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>

          {/* Address */}
          {location?.address && (
            <p className="text-sm text-gray-600 mb-3">{location.address}</p>
          )}

          {/* Map */}
          {location?.latitude && location?.longitude && (
            <div className="h-32 rounded-lg overflow-hidden">
              <MapContainer
                center={mapCenter}
                zoom={16}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                dragging={false}
                scrollWheelZoom={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OSM'
                />
                <Marker position={mapCenter} />
                <MapUpdater center={mapCenter} />
              </MapContainer>
            </div>
          )}

          {/* Coordinates */}
          {location?.latitude && location?.longitude && (
            <p className="text-xs text-gray-400 mt-2 font-mono">
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              {location.accuracy && ` (±${Math.round(location.accuracy)}m)`}
            </p>
          )}
        </div>

        {/* Category Section */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-xl">
              {categoryIcons[category] || '📋'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{t('category')}</p>
                {showAICategory && aiConfidence !== null && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs rounded-full">
                    <SparklesIcon className="w-3 h-3" />
                    AI
                  </span>
                )}
              </div>
              <p className="font-medium text-gray-900">{getCategoryLabel(category)}</p>
              {showAICategory && aiConfidence !== null && (
                <p className="text-xs text-primary-600 mt-0.5">
                  {Math.round(aiConfidence * 100)}% {t('confidence')}
                </p>
              )}
            </div>
          </div>
          {!readOnly && onEditCategory && (
            <button
              onClick={onEditCategory}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition"
              title={t('change_category')}
            >
              <PencilSquareIcon className="w-4 h-4 text-gray-500" />
            </button>
          )}
        </div>

        {/* Description Section */}
        {(description || !readOnly) && (
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-gray-700">
                <TagIcon className="w-5 h-5 text-primary-600" />
                <span className="font-medium text-sm">{t('description')}</span>
              </div>
              {!readOnly && onEditDescription && (
                <button
                  onClick={onEditDescription}
                  className="p-1.5 hover:bg-gray-200 rounded-lg transition"
                  title={t('edit_description')}
                >
                  <PencilSquareIcon className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
            {description ? (
              <p className="text-sm text-gray-600">{description}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">{t('no_description')}</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Compact preview card
export function CompactComplaintPreview({ image, category, address, className = '' }) {
  const { t } = useTranslation();
  
  const categoryIcons = {
    // New categories
    "Damaged Road Issue": '🛣️',
    "Fallen Trees": '🌳',
    "Garbage and Trash Issue": '🗑️',
    "Illegal Drawing on Walls": '🎨',
    "Street Light Issue": '💡',
    "Other": '📋',
    // Legacy categories
    DamagedRoads: '🛣️',
    ElectricityIssues: '💡',
    GarbageAndSanitation: '🗑️',
    roads: '🛣️', 
    water: '💧', 
    electricity: '⚡', 
    sanitation: '🧹',
    public_safety: '🚨', 
    environment: '🌳', 
    transportation: '🚌',
    healthcare: '🏥', 
    education: '📚', 
    other: '📋',
  };

  const categoryLabels = {
    "Damaged Road Issue": 'Damaged Road Issue',
    "Fallen Trees": 'Fallen Trees',
    "Garbage and Trash Issue": 'Garbage and Trash Issue',
    "Illegal Drawing on Walls": 'Illegal Drawing on Walls',
    "Street Light Issue": 'Street Light Issue',
    "Other": 'Other',
    // Legacy
    DamagedRoads: 'Damaged Roads',
    ElectricityIssues: 'Electricity Issues',
    GarbageAndSanitation: 'Garbage & Sanitation',
  };

  const getCategoryLabel = (cat) => {
    return categoryLabels[cat] || t(`categories.${cat}`, cat.replace(/_/g, ' '));
  };

  return (
    <div className={`flex items-center gap-3 p-3 bg-gray-50 rounded-xl ${className}`}>
      {image && (
        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
          <img src={image} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span>{categoryIcons[category] || '📋'}</span>
          <span className="font-medium text-gray-900 text-sm">
            {getCategoryLabel(category)}
          </span>
        </div>
        {address && (
          <p className="text-xs text-gray-500 truncate mt-1">{address}</p>
        )}
      </div>
    </div>
  );
}