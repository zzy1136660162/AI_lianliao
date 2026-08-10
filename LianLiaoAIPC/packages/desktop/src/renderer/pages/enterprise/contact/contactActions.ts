import { openExternalUrl } from '@/renderer/utils/platform';
import { enterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { copyText } from '@/renderer/utils/ui/clipboard';

/**
 * Converts a human-readable telephone number into a safe `tel:` URL.
 *
 * Only one telephone number is accepted. Masked numbers, control characters,
 * URL schemes and extension text are rejected before anything reaches
 * Electron's external-shell bridge.
 */
export const buildTelephoneUrl = (phone: string): string | null => {
  const candidate = phone.trim();
  if (!candidate || candidate.length > 64 || /[\p{C}*,，、;/\\:]/u.test(candidate)) return null;
  if (!/^\+?[\d\s()-]+$/u.test(candidate)) return null;

  const normalized = candidate.replace(/[\s()-]/gu, '');
  if (!/^\+?\d{5,20}$/u.test(normalized)) return null;
  return `tel:${normalized}`;
};

export type EnterprisePhoneClipboardWriter = (phone: string) => Promise<void>;

/** Uses the narrow main-process writer in packaged builds while retaining browser copy during development. */
export const copyEnterprisePhone = async (
  phone: string,
  copyInMainProcess: EnterprisePhoneClipboardWriter | undefined = enterpriseClient.copyPhone
): Promise<void> => {
  if (typeof window !== 'undefined' && window.__isPackaged === true) {
    if (!copyInMainProcess) throw new Error('ENTERPRISE_CLIPBOARD_UNAVAILABLE');
    await copyInMainProcess(phone);
    return;
  }
  await copyText(phone);
};

/** Opens the operating system dial handler only for a validated single number. */
export const dialEnterprisePhone = async (phone: string): Promise<boolean> => {
  const url = buildTelephoneUrl(phone);
  if (!url) return false;
  await openExternalUrl(url);
  return true;
};
