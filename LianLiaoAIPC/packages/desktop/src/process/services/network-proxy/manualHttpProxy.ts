import type { ManualHttpProxyConfig, ManualHttpProxyFailureReason } from '@/common/networkProxy/contracts';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { isIP } from 'node:net';

/**
 * Loopback destinations that must remain direct for AICore and its child
 * processes. Keep the 127/8 CIDR in addition to the common 127.0.0.1 literal:
 * local services are allowed to bind any address in the IPv4 loopback block.
 */
export const LOOPBACK_NO_PROXY = 'localhost,127.0.0.1,127.0.0.0/8,::1';

const SUPPORTED_PROXY_PROTOCOLS = new Set(['http:', 'https:']);
const WEBSOCKET_PROTOCOLS = new Set(['ws:', 'wss:']);

export class ManualHttpProxyValidationError extends Error {
  constructor(
    readonly reason: ManualHttpProxyFailureReason,
    message: string
  ) {
    super(message);
    this.name = 'ManualHttpProxyValidationError';
  }
}

function validationError(reason: ManualHttpProxyFailureReason, message: string): ManualHttpProxyValidationError {
  return new ManualHttpProxyValidationError(reason, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseManualHttpProxyConfig(input: unknown): ManualHttpProxyConfig {
  if (!isPlainObject(input) || typeof input.enabled !== 'boolean' || typeof input.url !== 'string') {
    throw validationError('INVALID_CONFIG', 'Proxy configuration must contain a boolean enabled flag and string URL.');
  }

  return {
    enabled: input.enabled,
    url: input.url,
  };
}

function extractRawPath(rawUrl: string, protocolPrefixLength: number): string {
  const authorityAndSuffix = rawUrl.slice(protocolPrefixLength);
  const pathStart = authorityAndSuffix.indexOf('/');
  if (pathStart === -1) {
    return '';
  }

  return authorityAndSuffix.slice(pathStart).split(/[?#]/, 1)[0];
}

function extractExplicitPort(rawUrl: string, protocolPrefixLength: number): string {
  const authority = rawUrl.slice(protocolPrefixLength).split(/[/?#]/, 1)[0];
  const portMatch = authority.startsWith('[')
    ? authority.match(/^\[[^\]]+\]:(\d+)$/)
    : authority.match(/^[^:]+:(\d+)$/);

  if (!portMatch) {
    throw validationError('PORT_REQUIRED', 'Proxy URL must include an explicit port.');
  }

  const portNumber = Number(portMatch[1]);
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65_535) {
    throw validationError('PORT_OUT_OF_RANGE', 'Proxy URL port must be between 1 and 65535.');
  }

  return String(portNumber);
}

/**
 * Validates and canonicalizes the manually configured HTTP(S) proxy.
 *
 * Authentication, PAC URLs, SOCKS proxies, and proxy-specific paths are not
 * supported by the first version of this boundary.
 */
export function normalizeManualHttpProxyConfig(input: unknown): ManualHttpProxyConfig {
  const config = parseManualHttpProxyConfig(input);
  const rawUrl = config.url.trim();
  if (rawUrl === '') {
    if (config.enabled) {
      throw validationError('URL_REQUIRED', 'An enabled proxy requires a URL.');
    }
    return { enabled: false, url: '' };
  }

  const protocolPrefix = rawUrl.match(/^https?:\/\//i);
  if (!protocolPrefix) {
    throw validationError('UNSUPPORTED_PROTOCOL', 'Proxy URL must use the HTTP or HTTPS protocol.');
  }
  const rawPath = extractRawPath(rawUrl, protocolPrefix[0].length);
  if (rawPath !== '' && rawPath !== '/') {
    throw validationError('PATH_UNSUPPORTED', 'Proxy URL must not include a path.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw validationError('INVALID_URL', 'Proxy URL is invalid.');
  }

  if (!SUPPORTED_PROXY_PROTOCOLS.has(parsedUrl.protocol)) {
    throw validationError('UNSUPPORTED_PROTOCOL', 'Proxy URL must use the HTTP or HTTPS protocol.');
  }
  if (parsedUrl.hostname === '') {
    throw validationError('HOST_REQUIRED', 'Proxy URL must include a host.');
  }
  if (parsedUrl.username !== '' || parsedUrl.password !== '') {
    throw validationError('AUTHENTICATION_UNSUPPORTED', 'Authenticated proxy URLs are not supported.');
  }
  if (parsedUrl.pathname !== '/') {
    throw validationError('PATH_UNSUPPORTED', 'Proxy URL must not include a path.');
  }
  if (rawUrl.includes('?')) {
    throw validationError('QUERY_UNSUPPORTED', 'Proxy URL must not include a query string.');
  }
  if (rawUrl.includes('#')) {
    throw validationError('FRAGMENT_UNSUPPORTED', 'Proxy URL must not include a fragment.');
  }

  const port = extractExplicitPort(rawUrl, protocolPrefix[0].length);
  return {
    enabled: config.enabled,
    url: `${parsedUrl.protocol}//${parsedUrl.hostname}:${port}`,
  };
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isIpv4MappedLoopback(hostname: string): boolean {
  const mappedAddress = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!mappedAddress) {
    return false;
  }

  const highWord = Number.parseInt(mappedAddress[1], 16);
  return highWord >> 8 === 127;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  if (normalizedHostname.replace(/\.+$/, '') === 'localhost') {
    return true;
  }

  const ipVersion = isIP(normalizedHostname);
  if (ipVersion === 4) {
    return normalizedHostname.split('.', 1)[0] === '127';
  }
  if (ipVersion === 6) {
    return normalizedHostname === '::1' || isIpv4MappedLoopback(normalizedHostname);
  }

  return false;
}

function parseWebSocketTargetUrl(targetUrl: string): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    throw validationError('INVALID_WEBSOCKET_TARGET_URL', 'WebSocket target URL is invalid.');
  }

  if (!WEBSOCKET_PROTOCOLS.has(parsedUrl.protocol)) {
    throw validationError(
      'UNSUPPORTED_WEBSOCKET_TARGET_PROTOCOL',
      'WebSocket target URL must use the WS or WSS protocol.'
    );
  }

  return parsedUrl;
}

/** Returns whether a WebSocket target resolves to a supported loopback host. */
export function isLoopbackWebSocketUrl(targetUrl: string): boolean {
  try {
    return isLoopbackHostname(parseWebSocketTargetUrl(targetUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * Creates a proxy agent only for non-loopback WebSocket traffic.
 *
 * The proxy value is deliberately not logged at this boundary.
 */
export function createWebSocketProxyAgent(
  targetUrl: string,
  config: ManualHttpProxyConfig
): HttpsProxyAgent<string> | undefined {
  if (!config.enabled) {
    return undefined;
  }

  const parsedTargetUrl = parseWebSocketTargetUrl(targetUrl);
  if (isLoopbackHostname(parsedTargetUrl.hostname)) {
    return undefined;
  }

  const normalizedConfig = normalizeManualHttpProxyConfig(config);
  return new HttpsProxyAgent(normalizedConfig.url);
}

/** Builds an isolated child-process environment with manual proxy overrides. */
export function buildProxyEnvironment(
  baseline: Readonly<NodeJS.ProcessEnv>,
  config: ManualHttpProxyConfig
): NodeJS.ProcessEnv {
  const environment = { ...baseline };
  if (!config.enabled) {
    return environment;
  }

  const { url } = normalizeManualHttpProxyConfig(config);
  return {
    ...environment,
    HTTP_PROXY: url,
    HTTPS_PROXY: url,
    ALL_PROXY: url,
    http_proxy: url,
    https_proxy: url,
    all_proxy: url,
    NO_PROXY: LOOPBACK_NO_PROXY,
    no_proxy: LOOPBACK_NO_PROXY,
  };
}
