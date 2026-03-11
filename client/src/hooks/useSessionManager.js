import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const SESSION_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours
const CHECK_INTERVAL = 5 * 60 * 1000;          // check every 5 minutes
const ACTIVITY_EVENTS = ['mousemove', 'click', 'keydown', 'scroll', 'touchstart'];

/**
 * Production-grade session manager hook with sliding timeout.
 *
 * @param {Object} options
 * @param {Function} options.getToken       – returns current token (or null)
 * @param {Function} options.logout         – clears the store / token
 * @param {string}   options.storageKey     – unique localStorage key, e.g. 'adminSession'
 * @param {string}   options.loginPath      – redirect path on timeout
 * @param {boolean}  [options.enabled=true] – set false to disable (e.g. on public pages)
 */
export default function useSessionManager({
  getToken,
  logout,
  storageKey,
  loginPath,
  enabled = true,
}) {
  const navigate = useNavigate();
  const intervalRef = useRef(null);

  // ── Touch: update the "lastActive" timestamp ─────────────────────
  const touch = useCallback(() => {
    if (!enabled || !getToken()) return;
    localStorage.setItem(storageKey, Date.now().toString());
  }, [enabled, getToken, storageKey]);

  // ── Check: has the session timed out? ─────────────────────────────
  const check = useCallback(() => {
    if (!enabled) return;

    const token = getToken();
    if (!token) return; // not logged in — nothing to guard

    const lastActive = parseInt(localStorage.getItem(storageKey) || '0', 10);
    const elapsed = Date.now() - lastActive;

    if (lastActive === 0) {
      // First time or cleared — set it now
      localStorage.setItem(storageKey, Date.now().toString());
      return;
    }

    if (elapsed > SESSION_TIMEOUT) {
      // ── Timeout: auto-logout ────────────────────────────────────
      localStorage.removeItem(storageKey);
      logout();
      navigate(loginPath, { replace: true });
    }
  }, [enabled, getToken, logout, storageKey, loginPath, navigate]);

  // ── On mount: restore session / validate expiration ───────────────
  useEffect(() => {
    if (!enabled) return;

    const token = getToken();
    if (!token) return;

    // If there's a saved lastActive but it's stale, logout immediately
    const lastActive = parseInt(localStorage.getItem(storageKey) || '0', 10);
    if (lastActive > 0 && Date.now() - lastActive > SESSION_TIMEOUT) {
      localStorage.removeItem(storageKey);
      logout();
      navigate(loginPath, { replace: true });
      return;
    }

    // Touch to start the clock
    touch();
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Activity listeners ────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handler = () => touch();

    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handler));
    };
  }, [enabled, touch]);

  // ── Interval: check timeout every 30s ─────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(check, CHECK_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [enabled, check]);

  // ── Expose touch so API calls can also count as activity ──────────
  return { touch };
}
