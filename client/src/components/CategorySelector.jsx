import { useTranslation } from 'react-i18next';

const categories = [
  { id: 'homepage', icon: '🏠', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'admission_portal', icon: '🎓', color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'examination_portal', icon: '📝', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'student_portal', icon: '👨‍🎓', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'faculty_portal', icon: '👨‍🏫', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { id: 'lms', icon: '📚', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { id: 'payment_gateway', icon: '💳', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { id: 'email_system', icon: '📧', color: 'bg-pink-100 text-pink-700 border-pink-200' },
  { id: 'mobile_app', icon: '📱', color: 'bg-red-100 text-red-700 border-red-200' },
  { id: 'other', icon: '🔧', color: 'bg-gray-100 text-gray-700 border-gray-200' },
];

export default function CategorySelector({ selected, onSelect, value, onChange }) {
  const { t } = useTranslation();

  // Support both prop naming conventions
  const currentValue = selected ?? value;
  const handleChange = onSelect ?? onChange;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {categories.map((category) => {
          const isSelected = currentValue === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => handleChange(category.id)}
              className={`
                flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200
                ${isSelected 
                  ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200' 
                  : `border-gray-200 hover:border-gray-300 ${category.color}`
                }
              `}
            >
              <span className="text-2xl">{category.icon}</span>
              <span className={`text-sm font-medium ${isSelected ? 'text-primary-700' : ''}`}>
                {t(`category_${category.id}`)}
              </span>
              {isSelected && (
                <svg className="w-5 h-5 text-primary-600 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Get category info by id
export function getCategoryInfo(categoryId) {
  return categories.find(c => c.id === categoryId) || categories[categories.length - 1];
}

// Export categories for use in filters
export { categories };
