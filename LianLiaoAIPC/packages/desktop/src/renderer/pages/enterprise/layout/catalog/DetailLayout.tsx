import { Card } from 'antd';
import React, { type ReactNode } from 'react';

import styles from './catalog-layout.module.css';

export const DetailHeroCard: React.FC<{
  media?: ReactNode;
  children: ReactNode;
  ariaLabelledBy?: string;
}> = ({ media, children, ariaLabelledBy }) => (
  <section className={styles.detailHero} aria-labelledby={ariaLabelledBy}>
    {media ? <div className={styles.detailHeroMedia}>{media}</div> : null}
    <div className={styles.detailHeroContent}>{children}</div>
  </section>
);

export const DetailSectionCard: React.FC<{
  title: ReactNode;
  children: ReactNode;
  className?: string;
}> = ({ title, children, className }) => (
  <Card className={[styles.detailSectionCard, className].filter(Boolean).join(' ')} title={title} variant='outlined'>
    {children}
  </Card>
);

export const DetailColumns: React.FC<{
  children: ReactNode;
  sidebar: ReactNode;
}> = ({ children, sidebar }) => (
  <div className={styles.detailColumns}>
    <main className={styles.detailMain}>{children}</main>
    {sidebar}
  </div>
);

export const StickyDetailSidebar: React.FC<{
  children: ReactNode;
  ariaLabel: string;
}> = ({ children, ariaLabel }) => (
  <aside className={styles.detailSidebar} aria-label={ariaLabel}>
    <div className={styles.detailSidebarInner}>{children}</div>
  </aside>
);
