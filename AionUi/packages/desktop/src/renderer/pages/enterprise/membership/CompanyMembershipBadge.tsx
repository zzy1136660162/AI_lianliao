import React from 'react';
import { useTranslation } from 'react-i18next';

import { resolveCompanyMembership } from './companyMembership';
import styles from './company-membership.module.css';

export type CompanyMembershipBadgeProps = {
  level?: number;
  compact?: boolean;
  className?: string;
};

/**
 * Renders the single membership presentation used by every enterprise page.
 * Unknown levels stay visible as text so backend additions cannot create a
 * missing-image indicator or hide the source value from operators.
 */
const CompanyMembershipBadge: React.FC<CompanyMembershipBadgeProps> = ({
  level,
  compact = false,
  className,
}) => {
  const { t } = useTranslation();
  const membership = resolveCompanyMembership(level);
  const label = t(membership.labelKey, membership.labelValues);
  const badgeClassName = [styles.badge, compact ? styles.compact : '', className ?? ''].filter(Boolean).join(' ');

  return (
    <span className={badgeClassName} data-membership-kind={membership.kind}>
      {membership.iconSrc ? (
        <img className={styles.image} src={membership.iconSrc} alt={label} title={label} />
      ) : (
        <span className={styles.fallback}>{label}</span>
      )}
    </span>
  );
};

export default CompanyMembershipBadge;
