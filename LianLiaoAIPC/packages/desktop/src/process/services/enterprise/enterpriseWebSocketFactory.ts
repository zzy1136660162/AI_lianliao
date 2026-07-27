import WebSocket from 'ws';

import { getActiveWebSocketProxyAgent } from '@process/services/network-proxy/manualHttpProxyRuntime';

/** Creates an enterprise WebSocket using the active manual proxy when applicable. */
export function createEnterpriseWebSocket(url: string): WebSocket {
  const agent = getActiveWebSocketProxyAgent(url);
  return agent ? new WebSocket(url, { agent }) : new WebSocket(url);
}
