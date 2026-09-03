/**
 * Service worker registration and the install prompt.
 *
 * Registration is deliberately quiet: an update installs in the background and
 * takes effect the next time the app is opened. A shopkeeper mid-sale must
 * never see a "new version available, reload?" dialog steal the screen.
 */

import { registerSW } from 'virtual:pwa-register';

let updateReady = false;

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // Picked up on the next cold launch. See waitingUpdate().
      updateReady = true;
    },
    onRegisterError(error: unknown) {
      console.warn('[pwa] service worker registration failed', error);
    },
  });
}

export function waitingUpdate(): boolean {
  return updateReady;
}

/** The deferred Android install prompt, captured for the Settings screen. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    listeners.forEach((listener) => listener(true));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((listener) => listener(false));
  });
}

export function installAvailable(): boolean {
  return deferredPrompt !== null;
}

export function onInstallAvailabilityChange(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((listener) => listener(false));
  return outcome === 'accepted';
}

/** iOS Safari has no install prompt: the user must use the Share sheet. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  return iOS && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && Boolean((navigator as { standalone?: boolean }).standalone))
  );
}
