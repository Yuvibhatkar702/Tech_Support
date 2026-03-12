import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore, useOfficialStore } from './store';
import Toast from './components/Toast';
import useSessionManager from './hooks/useSessionManager';

// Pages - Enhanced versions
import HomePage from './pages/HomePage';
import EnhancedSubmitComplaintPage from './pages/EnhancedSubmitComplaintPage';
import EnhancedTrackComplaintPage from './pages/EnhancedTrackComplaintPage';
import EnhancedAdminDashboardPage from './pages/EnhancedAdminDashboardPage';
import ComplaintDetailPage from './pages/ComplaintDetailPage';

// New Feature Pages
import CitizenPortalPage from './pages/CitizenPortalPage';

// Official / Role-based Pages
import OfficialLoginPage from './pages/OfficialLoginPage';
import DepartmentDashboardPage from './pages/DepartmentDashboardPage';
import OfficerDashboardPage from './pages/OfficerDashboardPage';

// ─── Hydration helpers ──────────────────────────────────────────────
// Uses zustand persist's built-in API: persist.hasHydrated() + persist.onFinishHydration()
function useStoreHydrated(store) {
  const [hydrated, setHydrated] = useState(store.persist.hasHydrated());
  useEffect(() => {
    const unsub = store.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [store]);
  return hydrated;
}

function HydrationSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  );
}

// Protected Route Component (admin) — waits for hydration before deciding
function ProtectedRoute({ children }) {
  const hydrated = useStoreHydrated(useAuthStore);
  const { isAuthenticated } = useAuthStore();

  if (!hydrated) return <HydrationSpinner />;
  if (!isAuthenticated) return <Navigate to="/official-login" replace />;

  return children;
}

// Protected Route for officials (support or developer) — waits for hydration
function OfficialProtectedRoute({ children, allowedRoles }) {
  const hydrated = useStoreHydrated(useOfficialStore);
  const { isAuthenticated, official } = useOfficialStore();

  if (!hydrated) return <HydrationSpinner />;
  if (!isAuthenticated || (allowedRoles && !allowedRoles.includes(official?.role))) {
    return <Navigate to="/official-login" replace />;
  }

  return children;
}

// ─── Session Guard: runs inside BrowserRouter to use useNavigate ────
function SessionGuard() {
  // Admin session (super_admin / admin)
  const adminLogout = useAuthStore((s) => s.logout);
  const adminRole = useAuthStore((s) => s.admin?.role);
  const getAdminToken = useCallback(() => useAuthStore.getState().token, []);

  const isAdmin = ['super_admin', 'admin'].includes(adminRole);

  useSessionManager({
    getToken: getAdminToken,
    logout: () => {
      adminLogout();
      localStorage.removeItem('adminSession');
    },
    storageKey: 'adminSession',
    loginPath: '/official-login',
    enabled: isAdmin,
  });

  // Official session (support / developer)
  const officialLogout = useOfficialStore((s) => s.logout);
  const officialRole = useOfficialStore((s) => s.official?.role);
  const getOfficialToken = useCallback(() => useOfficialStore.getState().token, []);

  const isOfficer = ['developer', 'support'].includes(officialRole);

  useSessionManager({
    getToken: getOfficialToken,
    logout: () => {
      officialLogout();
      localStorage.removeItem('officerSession');
    },
    storageKey: 'officerSession',
    loginPath: '/official-login',
    enabled: isOfficer,
  });

  return null; // render nothing — pure side-effect component
}

// Register Service Worker for PWA
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch (_) {
        // Service worker registration failed — non-critical
      }
    });
  }
}

function App() {
  useEffect(() => {
    // Register service worker on mount
    registerServiceWorker();
  }, []);

  return (
    <BrowserRouter>
      {/* Session timeout guard – purely side-effect, renders nothing */}
      <SessionGuard />
      {/* Global Components */}
      <Toast />
      
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/submit" element={<EnhancedSubmitComplaintPage />} />
        <Route path="/submit/:sessionId" element={<EnhancedSubmitComplaintPage />} />
        <Route path="/track" element={<EnhancedTrackComplaintPage />} />
        <Route path="/track/:complaintId" element={<EnhancedTrackComplaintPage />} />
        
        {/* New Feature Routes */}
        <Route path="/citizen" element={<CitizenPortalPage />} />
        
        {/* Official Login (unified for admin, dept head, officer) */}
        <Route path="/official-login" element={<OfficialLoginPage />} />
        <Route path="/admin/login" element={<Navigate to="/official-login" replace />} />
        
        {/* Admin Routes */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute>
              <EnhancedAdminDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/complaints/:id"
          element={
            <ProtectedRoute>
              <ComplaintDetailPage />
            </ProtectedRoute>
          }
        />
        
        {/* Support Dashboard */}
        <Route
          path="/department"
          element={
            <OfficialProtectedRoute allowedRoles={['support']}>
              <DepartmentDashboardPage />
            </OfficialProtectedRoute>
          }
        />
        
        {/* Developer Dashboard */}
        <Route
          path="/officer"
          element={
            <OfficialProtectedRoute allowedRoles={['developer', 'support']}>
              <OfficerDashboardPage />
            </OfficialProtectedRoute>
          }
        />
        
        {/* Redirect admin root to dashboard */}
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        
        {/* 404 Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
