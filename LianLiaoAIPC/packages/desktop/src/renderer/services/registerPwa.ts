/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@renderer/utils/platform';

const SERVICE_WORKER_URL = './sw.js';
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ELECTRON_USER_AGENT_PATTERN = /\bElectron\/[\d.]+/i;

function isPwaRegistrationSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  // The Electron user agent is available before preload globals. This prevents
  // desktop development on localhost from being mistaken for the browser WebUI,
  // which would install a CacheStorage-backed PWA worker inside Electron.
  const isElectronRuntime = ELECTRON_USER_AGENT_PATTERN.test(navigator.userAgent);
  if (
    isElectronRuntime ||
    typeof window.__isPackaged === 'boolean' ||
    isElectronDesktop() ||
    !('serviceWorker' in navigator)
  ) {
    return false;
  }

  const { protocol, hostname } = window.location;
  const isHttpOrigin = protocol === 'http:' || protocol === 'https:';
  if (!isHttpOrigin) {
    return false;
  }

  return window.isSecureContext || LOCALHOST_HOSTS.has(hostname);
}

export async function registerPwa(): Promise<ServiceWorkerRegistration | undefined> {
  if (!isPwaRegistrationSupported()) {
    return undefined;
  }

  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: './' });
    // Poll for updates on every page load so a fixed SW (e.g. v2 replacing
    // a poisoned v1 cache) reaches users without waiting for the browser's
    // own 24h update heuristic.
    registration.update().catch((): undefined => undefined);
    return registration;
  } catch (error) {
    console.warn('[PWA] Failed to register service worker:', error);
    return undefined;
  }
}

export default registerPwa;
