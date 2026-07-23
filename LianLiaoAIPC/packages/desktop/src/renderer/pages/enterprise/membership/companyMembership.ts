import flagshipStoreIcon from './assets/flagship-store.png';
import fiveStarMemberIcon from './assets/five-star-member.png';
import fourStarMemberIcon from './assets/four-star-member.png';
import ordinaryMemberIcon from './assets/ordinary-member.png';
import verifiedIcon from './assets/sm.png';
import vipMemberIcon from './assets/vip-member.png';

export type CompanyMembershipKind = 'verified' | 'ordinary' | 'vip' | 'star' | 'flagship' | 'unknown';

export type CompanyMembershipPresentation = {
  kind: CompanyMembershipKind;
  labelKey: string;
  labelValues?: { level: number };
  iconSrc: string | null;
};

const presentation = (
  kind: CompanyMembershipKind,
  labelKey: string,
  iconSrc: string | null,
  labelValues?: { level: number }
): CompanyMembershipPresentation => ({ kind, labelKey, iconSrc, ...(labelValues ? { labelValues } : {}) });

/**
 * Mirrors the active H5 `comLevel` image rules. H5 references no image assets
 * for some numeric levels, so those values deliberately fall back to text
 * instead of producing a broken image in the packaged desktop application.
 */
export const resolveCompanyMembership = (level: number | undefined): CompanyMembershipPresentation => {
  if (typeof level !== 'number' || !Number.isFinite(level)) {
    return presentation('unknown', 'enterprise.companies.memberLevel.unknown', null);
  }
  if (level === 1) return presentation('verified', 'enterprise.companies.memberLevel.verified', verifiedIcon);
  if (level === 1.1) return presentation('ordinary', 'enterprise.companies.memberLevel.ordinary', ordinaryMemberIcon);
  if (level >= 1.2 && level <= 3) {
    return presentation('vip', 'enterprise.companies.memberLevel.vip', vipMemberIcon);
  }
  if (level === 4) return presentation('star', 'enterprise.companies.memberLevel.fourStar', fourStarMemberIcon);
  if (level === 5) return presentation('star', 'enterprise.companies.memberLevel.fiveStar', fiveStarMemberIcon);
  if (level === 6) {
    return presentation('flagship', 'enterprise.companies.memberLevel.flagship', flagshipStoreIcon);
  }
  return presentation('unknown', 'enterprise.companies.memberLevel.fallback', null, { level });
};
