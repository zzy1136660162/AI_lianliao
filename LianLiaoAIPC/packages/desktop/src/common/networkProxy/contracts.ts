export type ManualHttpProxyConfig = {
  enabled: boolean;
  url: string;
};

export type SaveManualHttpProxyRequest = ManualHttpProxyConfig;

export type ManualHttpProxyFailureReason =
  | 'INVALID_CONFIG'
  | 'URL_REQUIRED'
  | 'UNSUPPORTED_PROTOCOL'
  | 'INVALID_URL'
  | 'HOST_REQUIRED'
  | 'AUTHENTICATION_UNSUPPORTED'
  | 'PATH_UNSUPPORTED'
  | 'QUERY_UNSUPPORTED'
  | 'FRAGMENT_UNSUPPORTED'
  | 'PORT_REQUIRED'
  | 'PORT_OUT_OF_RANGE'
  | 'INVALID_WEBSOCKET_TARGET_URL'
  | 'UNSUPPORTED_WEBSOCKET_TARGET_PROTOCOL';

export type ManualHttpProxyResult =
  | {
      success: true;
      config: ManualHttpProxyConfig;
      restartRequired: true;
    }
  | {
      success: false;
      code: 'INVALID_PROXY_URL';
      reason: ManualHttpProxyFailureReason;
      /**
       * Diagnostic text only. The renderer must map `reason` through i18n and
       * must never display this message directly.
       */
      message: string;
    }
  | {
      success: false;
      code: 'PERSISTENCE_FAILED';
      reason: 'PERSISTENCE_FAILED';
      /**
       * Diagnostic text only. The renderer must use its generic localized
       * persistence error and must never display this message directly.
       */
      message: string;
    };
