/**
 * Estimated Resolution Time Utility
 * Maps complaint categories to their expected resolution timeframes.
 */

const RESOLUTION_TIME_MAP = {
  'Homepage':                  '24h',
  'Admission Portal':          '24h',
  'Examination Portal':        '24h',
  'Student Portal':            '24h',
  'Faculty Portal':            '24h',
  'LMS':                       '24h',
  'Payment Gateway':           '24h',
  'Email System':              '24h',
  'Mobile App':                '24h',
  'Other':                     '24h',
};

const DEFAULT_RESOLUTION_TIME = '24h';

/**
 * Resolution days mapping (for countdown timer).
 * Maps category to the number of calendar days for resolution.
 */
const RESOLUTION_DAYS_MAP = {
  'Homepage':                  1,
  'Admission Portal':          1,
  'Examination Portal':        1,
  'Student Portal':            1,
  'Faculty Portal':            1,
  'LMS':                       1,
  'Payment Gateway':           1,
  'Email System':              1,
  'Mobile App':                1,
  'Other':                     1,
};

const DEFAULT_RESOLUTION_DAYS = 1;

/**
 * Get estimated resolution time string for a complaint category.
 * @param {string} category - The complaint category
 * @returns {string} Estimated resolution time string
 */
function getEstimatedResolution(category) {
  return RESOLUTION_TIME_MAP[category] || DEFAULT_RESOLUTION_TIME;
}

/**
 * Get resolution days (number) for a complaint category.
 * @param {string} category - The complaint category
 * @returns {number} Number of days for resolution
 */
function getResolutionDays(category) {
  return RESOLUTION_DAYS_MAP[category] || DEFAULT_RESOLUTION_DAYS;
}

/**
 * Calculate the expected resolution date from a creation date and category.
 * @param {Date} createdAt - The complaint creation date
 * @param {string} category - The complaint category
 * @returns {{ resolutionDays: number, expectedResolveAt: Date }}
 */
function calculateExpectedResolution(createdAt, category) {
  const days = getResolutionDays(category);
  const expectedResolveAt = new Date(createdAt);
  expectedResolveAt.setDate(expectedResolveAt.getDate() + days);
  return { resolutionDays: days, expectedResolveAt };
}

/**
 * Calculate remaining time until expected resolution.
 * @param {Date} expectedResolveAt - The expected resolution date
 * @returns {{ remainingDays: number, remainingHours: number, isOverdue: boolean }}
 */
function calculateRemainingTime(expectedResolveAt) {
  const now = new Date();
  const diff = new Date(expectedResolveAt).getTime() - now.getTime();
  const isOverdue = diff <= 0;

  if (isOverdue) {
    return { remainingDays: 0, remainingHours: 0, isOverdue: true };
  }

  const remainingDays = Math.floor(diff / (1000 * 60 * 60 * 24));
  const remainingHours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return { remainingDays, remainingHours, isOverdue: false };
}

module.exports = {
  getEstimatedResolution,
  getResolutionDays,
  calculateExpectedResolution,
  calculateRemainingTime,
  RESOLUTION_TIME_MAP,
  RESOLUTION_DAYS_MAP,
  DEFAULT_RESOLUTION_TIME,
  DEFAULT_RESOLUTION_DAYS,
};
