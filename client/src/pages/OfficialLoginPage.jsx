import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOfficialStore, useAuthStore, useToastStore } from '../store';
import { officialApi } from '../services/api';

export default function OfficialLoginPage() {
  const navigate = useNavigate();
  const { login: officialLogin } = useOfficialStore();
  const { login: adminLogin } = useAuthStore();
  const { addToast } = useToastStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      addToast('Please enter email and password', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const result = await officialApi.login(email, password);
      if (result.success) {
        const { official, token } = result.data;
        officialLogin(official, token);

        // Also set in the admin auth store so existing auth middleware works
        adminLogin(official, token);

        // ── Stamp session-activity clocks for the timeout guard ────
        const now = Date.now().toString();
        if (['super_admin', 'admin'].includes(official.role)) {
          localStorage.setItem('adminSession', now);
        }
        if (['officer', 'department_head'].includes(official.role)) {
          localStorage.setItem('officerSession', now);
        }

        addToast(`Welcome, ${official.name}`, 'success');

        // Role-based redirect
        switch (official.role) {
          case 'super_admin':
          case 'admin':
            navigate('/admin/dashboard');
            break;
          case 'department_head':
            navigate('/department');
            break;
          case 'officer':
            navigate('/officer');
            break;
          default:
            navigate('/officer');
        }
      }
    } catch (error) {
      console.error('Official login error:', error);
      addToast(error.response?.data?.message || 'Login failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Staff Portal</h1>
          <p className="text-blue-300 mt-2">Technical Support Ticket Management System</p>
        </div>

        {/* Login Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                placeholder="official@municipality.gov"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-blue-200 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/50 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-semibold rounded-xl transition shadow-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Role badges */}
          <div className="mt-6 pt-5 border-t border-white/10">
            <p className="text-xs text-blue-300 text-center mb-3">Authorized for</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['Admin', 'Support', 'Developer'].map((role) => (
                <span key={role} className="px-3 py-1 text-xs bg-blue-500/20 text-blue-200 rounded-full border border-blue-400/30">
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer links */}
        <div className="text-center mt-6 space-y-2">
          <Link to="/" className="text-blue-300 hover:text-white text-sm transition">
            ← Back to Support Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
