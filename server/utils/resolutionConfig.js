/**
 * Resolution Configuration Utility
 * SLA resolution days + human-readable strings per category.
 * Supersedes the old resolutionTime.js (which is kept for backward compat).
 */

const RESOLUTION_CONFIG = {
  'Homepage':                 { days: 1, label: '24h' },
  'Admission Portal':         { days: 1, label: '24h' },
  'Examination Portal':       { days: 1, label: '24h' },
  'Student Portal':           { days: 1, label: '24h' },
  'Faculty Portal':           { days: 1, label: '24h' },
  'LMS':                      { days: 1, label: '24h' },
  'Payment Gateway':          { days: 1, label: '24h' },
  'Email System':             { days: 1, label: '24h' },
  'Mobile App':               { days: 1, label: '24h' },
  'Other':                    { days: 1, label: '24h' },
};

const DEFAULT_RESOLUTION = { days: 1, label: '24h' };

/**
 * Get full resolution config for a category.
 */
function getResolutionConfig(category) {
  return RESOLUTION_CONFIG[category] || DEFAULT_RESOLUTION;
}

/**
 * Get resolution days (integer) for a category.
 */
function getResolutionDays(category) {
  return (RESOLUTION_CONFIG[category] || DEFAULT_RESOLUTION).days;
}

/**
 * Get human-readable resolution label.
 */
function getEstimatedResolution(category) {
  return (RESOLUTION_CONFIG[category] || DEFAULT_RESOLUTION).label;
}

/**
 * Calculate expected resolution date from creation date.
 */
function calculateExpectedResolution(createdAt, category) {
  const days = getResolutionDays(category);
  const expectedResolveAt = new Date(createdAt);
  expectedResolveAt.setDate(expectedResolveAt.getDate() + days);
  return { resolutionDays: days, expectedResolveAt };
}

/**
 * Calculate remaining time until expected resolution.
 */
function calculateRemainingTime(expectedResolveAt) {
  if (!expectedResolveAt) return { remainingDays: 0, remainingHours: 0, isOverdue: false };
  const now = new Date();
  const target = new Date(expectedResolveAt);
  const diffMs = target - now;
  const isOverdue = diffMs < 0;
  const absDiff = Math.abs(diffMs);
  const remainingDays = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const remainingHours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return { remainingDays, remainingHours, isOverdue, expectedResolveAt: target };
}

module.exports = {
  getResolutionConfig,
  getResolutionDays,
  getEstimatedResolution,
  calculateExpectedResolution,
  calculateRemainingTime,
  RESOLUTION_CONFIG,
};
