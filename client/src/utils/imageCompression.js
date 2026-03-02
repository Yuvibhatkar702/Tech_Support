import imageCompression from 'browser-image-compression';

/**
 * Compress an image file before upload
 * @param {File} file - The image file to compress
 * @param {Object} options - Compression options
 * @returns {Promise<{file: File, blob: Blob, dataUrl: string}>}
 */
export async function compressImage(file, options = {}) {
  const defaultOptions = {
    maxSizeMB: 1, // Maximum size in MB
    maxWidthOrHeight: 1920, // Maximum dimension
    useWebWorker: true, // Use web worker for better performance
    fileType: 'image/jpeg', // Output format
    initialQuality: 0.8, // Initial quality
  };

  const compressionOptions = { ...defaultOptions, ...options };

  try {
    // Compress the image
    const compressedFile = await imageCompression(file, compressionOptions);
    
    // Create blob URL for preview
    const dataUrl = await imageCompression.getDataUrlFromFile(compressedFile);
    
    // Create blob for upload
    const blob = new Blob([compressedFile], { type: compressedFile.type });

    return {
      file: compressedFile,
      blob,
      dataUrl,
      originalSize: file.size,
      compressedSize: compressedFile.size,
    };
  } catch (error) {
    console.error('Image compression failed:', error);
    throw new Error('Failed to compress image');
  }
}

/**
 * Compress image from data URL (e.g., from webcam capture)
 * @param {string} dataUrl - The data URL of the image
 * @param {Object} options - Compression options
 * @returns {Promise<{file: File, blob: Blob, dataUrl: string}>}
 */
export async function compressDataUrl(dataUrl, options = {}) {
  // Convert data URL to blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  
  // Create a file from the blob
  const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
  
  return compressImage(file, options);
}

/**
 * Validate image file
 * @param {File} file - The file to validate
 * @param {Object} limits - Validation limits
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateImage(file, limits = {}) {
  const defaultLimits = {
    maxSizeMB: 10, // Maximum file size in MB
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  };

  const { maxSizeMB, allowedTypes } = { ...defaultLimits, ...limits };

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
    };
  }

  // Check file size
  const fileSizeMB = file.size / 1024 / 1024;
  if (fileSizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Get image dimensions
 * @param {string} src - Image source (URL or data URL)
 * @returns {Promise<{width: number, height: number}>}
 */
export function getImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Convert file to base64 data URL
 * @param {File} file - The file to convert
 * @returns {Promise<string>}
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
