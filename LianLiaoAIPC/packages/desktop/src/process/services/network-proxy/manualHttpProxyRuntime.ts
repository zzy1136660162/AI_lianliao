import type { ManualHttpProxyConfig } from '@/common/networkProxy/contracts';
import {
  buildProxyEnvironment,
  createWebSocketProxyAgent,
  normalizeManualHttpProxyConfig,
} from '@process/services/network-proxy/manualHttpProxy';

const MANAGED_PROXY_ENVIRONMENT_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'NO_PROXY',
  'no_proxy',
] as const;
const MANAGED_PROXY_ENVIRONMENT_KEY_NAMES = new Set(MANAGED_PROXY_ENVIRONMENT_KEYS.map((key) => key.toLowerCase()));
const WINDOWS_CANONICAL_PROXY_ENVIRONMENT_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'] as const;
const SESSION_PROXY_BYPASS_RULES = '<local>;localhost;127.0.0.1;127.0.0.0/8;[::1]';
const STARTUP_ENVIRONMENT: Readonly<NodeJS.ProcessEnv> = Object.freeze({ ...process.env });
const DISABLED_PROXY_CONFIG: ManualHttpProxyConfig = Object.freeze({
  enabled: false,
  url: '',
});
const INVALID_CONFIG_WARNING = '[AionUi] Manual HTTP proxy configuration is invalid; proxy disabled.';
const SESSION_PROXY_WARNING = '[AionUi] Failed to apply manual HTTP proxy to the Electron session.';

type SessionProxyConfiguration =
  | {
      mode: 'fixed_servers';
      proxyRules: string;
      proxyBypassRules: string;
    }
  | {
      mode: 'system';
    };

export type ManualHttpProxySession = {
  setProxy(configuration: SessionProxyConfiguration): Promise<void>;
  closeAllConnections(): Promise<void>;
};

let activeConfig: ManualHttpProxyConfig = {
  enabled: false,
  url: '',
};

/**
 * Applies a validated manual proxy to the process environment.
 *
 * Only proxy variables are changed. Disabling the feature restores their
 * values from the immutable environment captured when this module loaded.
 */
export function configureManualHttpProxy(config: unknown): void {
  const normalizedConfig = normalizeManualHttpProxyConfig(config);
  const configuredEnvironment = buildProxyEnvironment(STARTUP_ENVIRONMENT, normalizedConfig);

  activeConfig = { ...normalizedConfig };
  if (process.platform === 'win32') {
    for (const key of Object.keys(process.env)) {
      if (MANAGED_PROXY_ENVIRONMENT_KEY_NAMES.has(key.toLowerCase())) {
        delete process.env[key];
      }
    }

    if (normalizedConfig.enabled) {
      for (const key of WINDOWS_CANONICAL_PROXY_ENVIRONMENT_KEYS) {
        process.env[key] = configuredEnvironment[key];
      }
    } else {
      for (const [key, value] of Object.entries(STARTUP_ENVIRONMENT)) {
        if (MANAGED_PROXY_ENVIRONMENT_KEY_NAMES.has(key.toLowerCase()) && value !== undefined) {
          process.env[key] = value;
        }
      }
    }
    return;
  }

  for (const key of MANAGED_PROXY_ENVIRONMENT_KEYS) {
    const value = configuredEnvironment[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/** Returns a copy of the currently active manual proxy configuration. */
export function getActiveManualHttpProxyConfig(): ManualHttpProxyConfig {
  return { ...activeConfig };
}

/** Creates a proxy agent for the target using the active manual proxy. */
export function getActiveWebSocketProxyAgent(targetUrl: string) {
  return createWebSocketProxyAgent(targetUrl, activeConfig);
}

/**
 * Applies the active manual proxy to an Electron-compatible session.
 *
 * Existing connections are closed only after Electron accepts the new proxy
 * settings, preventing traffic from continuing on stale connections.
 */
export async function applyManualHttpProxyToSession(sessionLike: ManualHttpProxySession): Promise<void> {
  if (activeConfig.enabled) {
    await sessionLike.setProxy({
      mode: 'fixed_servers',
      proxyRules: activeConfig.url,
      proxyBypassRules: SESSION_PROXY_BYPASS_RULES,
    });
  } else {
    await sessionLike.setProxy({ mode: 'system' });
  }

  await sessionLike.closeAllConnections();
}

function warnWithoutBlocking(warn: (message: string) => void, message: string): void {
  try {
    warn(message);
  } catch {
    // Diagnostics must never turn an optional proxy into a startup blocker.
  }
}

/**
 * Initializes process and Electron-session proxy state without blocking startup.
 *
 * Invalid persisted values fall back to a disabled proxy. A session failure
 * leaves the validated process proxy active so child processes can still use it.
 */
export async function initializeManualHttpProxyForStartup(
  storedConfig: unknown,
  sessionLike: ManualHttpProxySession,
  warn: (message: string) => void
): Promise<void> {
  try {
    configureManualHttpProxy(storedConfig ?? DISABLED_PROXY_CONFIG);
  } catch {
    warnWithoutBlocking(warn, INVALID_CONFIG_WARNING);
    configureManualHttpProxy(DISABLED_PROXY_CONFIG);
  }

  try {
    await applyManualHttpProxyToSession(sessionLike);
  } catch {
    warnWithoutBlocking(warn, SESSION_PROXY_WARNING);
  }
}
