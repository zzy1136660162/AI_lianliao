export type EnterpriseSessionClearedListener = () => void;

export type EnterpriseSessionEvents = {
  subscribeCleared: (listener: EnterpriseSessionClearedListener) => () => void;
  emitCleared: () => void;
};

/** Creates an isolated session event boundary for tests or a secondary application instance. */
export const createEnterpriseSessionEvents = (): EnterpriseSessionEvents => {
  const listeners = new Set<EnterpriseSessionClearedListener>();
  return {
    subscribeCleared: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emitCleared: () => {
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          // Enterprise logout must succeed even if a dependent cleanup listener fails.
        }
      }
    },
  };
};

/** Process-wide signal emitted only after persisted enterprise session clearing succeeds. */
export const enterpriseSessionEvents = createEnterpriseSessionEvents();
