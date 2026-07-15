import type { EnterpriseApiClientOptions } from './enterpriseApiClient';

const DEVELOPMENT_ENTERPRISE_API_BASE_URL = 'http://127.0.0.1:12580/';
const PRODUCTION_ENTERPRISE_API_BASE_URL = 'https://cloud.lslnii.com/';

/** Resolves the only enterprise API origin allowed for the current Electron runtime. */
export const resolveEnterpriseApiClientOptions = (isPackaged: boolean): EnterpriseApiClientOptions =>
  isPackaged
    ? {
        baseUrl: PRODUCTION_ENTERPRISE_API_BASE_URL,
        environment: 'production',
      }
    : {
        baseUrl: DEVELOPMENT_ENTERPRISE_API_BASE_URL,
        environment: 'development',
      };
