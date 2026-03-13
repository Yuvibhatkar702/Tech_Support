function normalizeUploadPath(inputPath) {
  if (!inputPath) return '';

  const normalized = String(inputPath).replace(/\\/g, '/');
  const marker = '/uploads/';
  const idx = normalized.lastIndexOf(marker);

  if (idx >= 0) {
    return `uploads/${normalized.slice(idx + marker.length)}`;
  }

  if (normalized.startsWith('uploads/')) {
    return normalized;
  }

  const bareIdx = normalized.lastIndexOf('uploads/');
  if (bareIdx >= 0) {
    return normalized.slice(bareIdx);
  }

  return normalized;
}

module.exports = {
  normalizeUploadPath,
};
