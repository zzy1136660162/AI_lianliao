/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CdnGenericProvider } from './cdnGenericProvider';
import type { CdnGenericProviderConfiguration } from './cdnGenericProvider';

/**
 * Legacy electron-updater feed retained only for source compatibility.
 * Production navigation no longer initializes this channel; keeping the
 * fallback on a Chain Liaoning-owned host prevents accidental upstream access.
 */
export const CDN_UPDATE_BASE_URL = 'https://cloud.lslnii.com/cloud-beiruan-ai/desktop_lianliao';

export type CdnFeedOptions = CdnGenericProviderConfiguration & {
  updateProvider: typeof CdnGenericProvider;
};

export function buildCdnFeedOptions(): CdnFeedOptions {
  return {
    provider: 'custom',
    url: CDN_UPDATE_BASE_URL,
    updateProvider: CdnGenericProvider,
  };
}
