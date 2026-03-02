/**
 * Progress Tracker Utility
 * Maps complaint status → progress percentage for the frontend.
 */

const STATUS_PROGRESS_MAP = {
  'pending':     20,
  'assigned':    40,
  'in_progress': 70,
  'closed':      100,
  'rejected':    100,
  'duplicate':   100,
};

/**
 * Get progress percentage for a given status.
 * @param {string} status
 * @returns {number} 0-100
 */
function getProgressPercentage(status) {
  return STATUS_PROGRESS_MAP[status] || 0;
}

/**
 * Get a human-readable label for a status.
 */
function getStatusLabel(status) {
  const labels = {
    'pending':     'Pending',
    'assigned':    'Assigned',
    'in_progress': 'In Progress',
    'reopened':    'Reopened',
    'closed':      'Closed',
    'rejected':    'Rejected',
    'duplicate':   'Duplicate',
  };
  return labels[status] || status;
}

/**
 * Get the ordered status progression for the workflow timeline.
 */
function getStatusTimeline() {
  return [
    { key: 'pending',     label: 'Pending',     progress: 20 },
    { key: 'assigned',    label: 'Assigned',    progress: 40 },
    { key: 'in_progress', label: 'In Progress', progress: 70 },
    { key: 'closed',      label: 'Closed',      progress: 100 },
  ];
}

module.exports = {
  getProgressPercentage,
  getStatusLabel,
  getStatusTimeline,
  STATUS_PROGRESS_MAP,
};
