/**
 * useInstallPrompt
 *
 * Industry-standard PWA install prompt management.
 *
 * Rules (matches what Spotify Web / Twitter / Pinterest do):
 *  - Capture `beforeinstallprompt` and suppress the browser mini-infobar.
 *  - Only show our custom banner after the user's SECOND distinct visit
 *    AND after they've been on the page for ≥30 s in the current session.
 *  - Never show if the app is already running in standalone mode (installed).
 *  - Never show if the `appinstalled` event fired during this or a previous session.
 *  - After the user dismisses "Not now", wait 14 days before offering again.
 *  - After the user clicks Install, never offer again (browser takes over).
 *  - Expose a `triggerInstall()` so a persistent header button can always work.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const LS_VISIT_COUNT   = 'pwa-visit-count';
const LS_DISMISSED_AT  = 'pwa-install-dismissed-at';
const LS_INSTALLED     = 'pwa-installed';

const VISIT_THRESHOLD      = 2;        // show from the 2nd visit onwards
const ENGAGEMENT_SECONDS   = 30;       // must have been on page this long
const DISMISS_COOLDOWN_DAYS = 14;      // days before re-showing after dismiss

function isAlreadyInstalled(): boolean {
  // Running as a standalone PWA
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari standalone
  if ((navigator as any).standalone === true) return true;
  // Persisted flag from a previous `appinstalled` event
  if (localStorage.getItem(LS_INSTALLED) === 'true') return true;
  return false;
}

function isDismissalCoolingDown(): boolean {
  const raw = localStorage.getItem(LS_DISMISSED_AT);
  if (!raw) return false;
  const dismissedAt = new Date(raw).getTime();
  const cooldownMs  = DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - dismissedAt < cooldownMs;
}

function getVisitCount(): number {
  return parseInt(localStorage.getItem(LS_VISIT_COUNT) ?? '0', 10);
}

function bumpVisitCount(): number {
  const next = getVisitCount() + 1;
  localStorage.setItem(LS_VISIT_COUNT, String(next));
  return next;
}

interface UseInstallPromptReturn {
  /** Show the custom banner (all conditions met) */
  showBanner: boolean;
  /** The deferred prompt is ready — triggerInstall() will work */
  canInstall: boolean;
  /** Call when the user clicks the Install button (in banner or header) */
  triggerInstall: () => Promise<void>;
  /** Call when the user clicks "Not now" in the banner */
  dismissBanner: () => void;
}

export function useInstallPrompt(): UseInstallPromptReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner]         = useState(false);
  const [engaged, setEngaged]               = useState(false);   // 30 s timer fired
  const visitCount                          = useRef(0);

  /* ── 1. Capture beforeinstallprompt ── */
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();          // suppress the native mini-infobar
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  /* ── 2. Listen for appinstalled ── */
  useEffect(() => {
    const handler = () => {
      localStorage.setItem(LS_INSTALLED, 'true');
      setShowBanner(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  /* ── 3. Bump visit count on mount (once per page load) ── */
  useEffect(() => {
    if (isAlreadyInstalled()) return;
    visitCount.current = bumpVisitCount();
  }, []);

  /* ── 4. Start 30-second engagement timer ── */
  useEffect(() => {
    if (isAlreadyInstalled()) return;
    const id = setTimeout(() => setEngaged(true), ENGAGEMENT_SECONDS * 1000);
    return () => clearTimeout(id);
  }, []);

  /* ── 5. Decide whether to show banner ── */
  useEffect(() => {
    if (!deferredPrompt)   return;   // browser hasn't offered install yet
    if (!engaged)          return;   // user hasn't been here long enough
    if (isAlreadyInstalled())   return;
    if (isDismissalCoolingDown()) return;
    if (visitCount.current < VISIT_THRESHOLD) return;

    setShowBanner(true);
  }, [deferredPrompt, engaged]);

  /* ── 6. Trigger native install dialog ── */
  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    setShowBanner(false);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem(LS_INSTALLED, 'true');
    } else {
      // Treated the same as dismiss — user saw the prompt and said no
      localStorage.setItem(LS_DISMISSED_AT, new Date().toISOString());
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  /* ── 7. Dismiss without installing ── */
  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem(LS_DISMISSED_AT, new Date().toISOString());
  }, []);

  return {
    showBanner,
    canInstall: !!deferredPrompt,
    triggerInstall,
    dismissBanner,
  };
}
