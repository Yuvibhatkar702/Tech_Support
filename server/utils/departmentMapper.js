/**
 * Department Mapper Utility
 * Maps complaint categories → department codes for auto-routing.
 *
 * Two modes:
 *  1. getDepartmentByCategory(category)        — sync, hardcoded fallback
 *  2. getDepartmentByCategoryAsync(category)    — async, checks CategoryMapping
 *     collection first then falls back to (1).
 */

const CATEGORY_DEPARTMENT_MAP = {
  // Website/module categories → all route to Support department
  'homepage':           'support',
  'admission_portal':   'support',
  'examination_portal': 'support',
  'student_portal':     'support',
  'faculty_portal':     'support',
  'lms':                'support',
  'payment_gateway':    'support',
  'email_system':       'support',
  'mobile_app':         'support',
  'other':              'support',
};

const DEFAULT_DEPARTMENT = 'support';

/**
 * Synchronous fallback — uses hardcoded map only.
 * @param {string} category
 * @returns {string} department code
 */
function getDepartmentByCategory(category) {
  return CATEGORY_DEPARTMENT_MAP[category] || DEFAULT_DEPARTMENT;
}

/**
 * Async version — checks CategoryMapping collection first,
 * falls back to the hardcoded map if no DB entry is found.
 *
 * Returns { departmentCode, departmentId, departmentName }
 */
async function getDepartmentByCategoryAsync(category) {
  try {
    const CategoryMapping = require('../models/CategoryMapping');
    const mapping = await CategoryMapping.findOne({
      categoryName: category,
      isActive: true,
    }).lean();

    if (mapping) {
      return {
        departmentCode: mapping.departmentCode,
        departmentId:   mapping.departmentId || null,
        departmentName: mapping.departmentName || null,
      };
    }
  } catch (_err) {
    // CategoryMapping collection may not exist yet — fall through
  }

  // Fallback to hardcoded map
  const code = CATEGORY_DEPARTMENT_MAP[category] || DEFAULT_DEPARTMENT;
  return { departmentCode: code, departmentId: null, departmentName: null };
}

module.exports = {
  getDepartmentByCategory,
  getDepartmentByCategoryAsync,
  CATEGORY_DEPARTMENT_MAP,
  DEFAULT_DEPARTMENT,
};
