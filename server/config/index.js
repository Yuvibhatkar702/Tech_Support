require('dotenv').config();

module.exports = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  
  // Database
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/grievance_portal',
  
  // JWT
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('JWT_SECRET env var is REQUIRED in production'); })()
    : 'dev-only-secret-not-for-production'),
  jwtExpiresIn: '12h',
  
  // WhatsApp Cloud API
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  },
  
  // Geocoding
  geocoding: {
    apiUrl: process.env.GEOCODING_API_URL || 'https://nominatim.openstreetmap.org/reverse',
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  },
  
  // Duplicate Detection
  duplicateDetection: {
    radiusMeters: parseInt(process.env.DUPLICATE_RADIUS_METERS) || 100,
    timeWindowHours: parseInt(process.env.DUPLICATE_TIME_WINDOW_HOURS) || 24,
  },
  
  // Image Settings
  image: {
    maxSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB) || 5,
    compressedQuality: parseInt(process.env.COMPRESSED_IMAGE_QUALITY) || 80,
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },
  
  // CORS
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  
  // SMS / WhatsApp (Twilio)
  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
  },
  
  // Uploads
  uploadDir: process.env.UPLOAD_DIR || './uploads',
};
