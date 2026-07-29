export const MEMBERSHIP_UPGRADE_BASE_URL =
  'https://sjbang.lslnii.com/jjgc/foreground/increment_service/increment_service.html?paytype=3';

/**
 * Builds the fixed membership payment page URL used by the QR code.
 * Every invariant is rechecked before the URL is exposed to the renderer.
 */
export const buildMembershipUpgradeUrl = (timestamp = Date.now()): string => {
  const url = new URL(MEMBERSHIP_UPGRADE_BASE_URL);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'sjbang.lslnii.com' ||
    url.pathname !== '/jjgc/foreground/increment_service/increment_service.html' ||
    url.searchParams.get('paytype') !== '3'
  ) {
    throw new Error('INVALID_MEMBERSHIP_UPGRADE_URL');
  }
  url.searchParams.set('version', String(timestamp));
  return url.toString();
};
