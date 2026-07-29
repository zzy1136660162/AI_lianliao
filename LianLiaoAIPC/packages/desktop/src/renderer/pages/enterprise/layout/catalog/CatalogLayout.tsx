import { CloseSmall } from '@icon-park/react';
import { Button, Pagination } from 'antd';
import React, { type ReactNode, type Ref } from 'react';

import styles from './catalog-layout.module.css';

export type EnterpriseCatalogShellProps = {
  className?: string;
  titleId: string;
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  filters: ReactNode;
  children: ReactNode;
};

/**
 * Shared catalog frame keeps enterprise and product pages visually aligned
 * while leaving business-specific filters and results in their own modules.
 */
export const EnterpriseCatalogShell: React.FC<EnterpriseCatalogShellProps> = ({
  className,
  titleId,
  eyebrow,
  title,
  description,
  filters,
  children,
}) => (
  <section className={[styles.page, className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
    <header className={styles.pageHeader}>
      <div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </div>
      <div className={styles.headerRule} aria-hidden='true' />
    </header>
    {filters}
    <div className={styles.content}>{children}</div>
  </section>
);

export const CatalogFilterCard: React.FC<{
  className?: string;
  children: ReactNode;
}> = ({ className, children }) => (
  <div className={[styles.filterCard, className].filter(Boolean).join(' ')}>{children}</div>
);

export type CatalogPaginationProps = {
  current: number;
  pageSize: number;
  total: number;
  resultLabel: ReactNode;
  onChange: (page: number, pageSize: number) => void;
};

export const CatalogPagination: React.FC<CatalogPaginationProps> = ({
  current,
  pageSize,
  total,
  resultLabel,
  onChange,
}) => (
  <div className={styles.paginationBar}>
    <span>{resultLabel}</span>
    <Pagination
      current={current}
      pageSize={pageSize}
      total={total}
      size='small'
      showQuickJumper
      showSizeChanger
      pageSizeOptions={[10, 20, 50]}
      onChange={onChange}
    />
  </div>
);

export type CatalogQuickViewPanelProps = {
  ariaLabel: string;
  closeAriaLabel: string;
  title: ReactNode;
  eyebrow: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  panelRef?: Ref<HTMLElement>;
  tabIndex?: number;
};

export const CatalogQuickViewPanel: React.FC<CatalogQuickViewPanelProps> = ({
  ariaLabel,
  closeAriaLabel,
  title,
  eyebrow,
  badge,
  children,
  footer,
  onClose,
  panelRef,
  tabIndex,
}) => (
  <aside ref={panelRef} className={styles.quickView} role='complementary' aria-label={ariaLabel} tabIndex={tabIndex}>
    <Button
      className={styles.quickViewClose}
      type='text'
      size='small'
      icon={<CloseSmall />}
      aria-label={closeAriaLabel}
      onClick={onClose}
    />
    <div className={styles.quickViewHeading}>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      {badge}
    </div>
    <div className={styles.quickViewContent}>{children}</div>
    {footer ? <div className={styles.quickViewFooter}>{footer}</div> : null}
  </aside>
);
