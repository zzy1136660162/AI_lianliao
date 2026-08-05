import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPwa } from '../../../packages/desktop/src/renderer/services/registerPwa';

const originalUserAgent = navigator.userAgent;
const originalServiceWorker = navigator.serviceWorker;

function setUserAgent(userAgent: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

function setServiceWorker(serviceWorker: Pick<ServiceWorkerContainer, 'register'>): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker,
  });
}

beforeEach(() => {
  Reflect.deleteProperty(window, 'electronAPI');
  Reflect.deleteProperty(window, '__isPackaged');
});

afterEach(() => {
  Reflect.deleteProperty(window, 'electronAPI');
  Reflect.deleteProperty(window, '__isPackaged');
  setUserAgent(originalUserAgent);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: originalServiceWorker,
  });
  vi.restoreAllMocks();
});

describe('registerPwa', () => {
  it('does not register a web service worker inside Electron before preload globals are available', async () => {
    const register = vi.fn();
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Electron/37.10.3 Safari/537.36');
    setServiceWorker({ register });

    const registration = await registerPwa();

    expect(registration).toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });

  it('registers the service worker for the localhost browser WebUI', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const expectedRegistration = { update } as unknown as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(expectedRegistration);
    setUserAgent('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36');
    setServiceWorker({ register });

    const registration = await registerPwa();

    expect(registration).toBe(expectedRegistration);
    expect(register).toHaveBeenCalledWith('./sw.js', { scope: './' });
  });

  it('keeps the WebUI available when service worker registration fails', async () => {
    const register = vi.fn().mockRejectedValue(new Error('cache storage unavailable'));
    setUserAgent('Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36');
    setServiceWorker({ register });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(registerPwa()).resolves.toBeUndefined();
  });
});
