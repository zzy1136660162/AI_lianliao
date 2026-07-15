import { Alert, Button, Empty, Input, Spin } from '@arco-design/web-react';
import { Box, BuildingFour, EngineeringBrand, Search } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type {
  EnterpriseCompanySummary,
  EnterpriseProductSummary,
  EnterpriseProjectSummary,
} from '@/common/enterprise/contracts';
import { displayProjectName } from '@/renderer/pages/enterprise/projects/projectData';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';

import { isDashboardSearchQueryReady, useDashboardSearch } from './dashboardData';
import styles from './dashboard-workbench.module.css';

type SearchGroupKind = 'companies' | 'products' | 'projects';

type SearchOption = {
  id: string;
  kind: SearchGroupKind;
  label: string;
  secondary?: string;
  path: string;
};

export type GlobalSearchProps = {
  client: Pick<EnterpriseClient, 'request'>;
  debounceMs?: number;
};

const companyOption = (company: EnterpriseCompanySummary): SearchOption => ({
  id: `company-${company.companyId}`,
  kind: 'companies',
  label: company.name,
  secondary: company.industry,
  path: `/enterprise/companies/${encodeURIComponent(company.companyId)}`,
});

const productOption = (product: EnterpriseProductSummary): SearchOption => ({
  id: `product-${product.productId}`,
  kind: 'products',
  label: product.name,
  secondary: product.companyName,
  path: `/enterprise/products/${encodeURIComponent(product.productId)}`,
});

const groupIcon = {
  companies: BuildingFour,
  products: Box,
  projects: EngineeringBrand,
} as const;

/** Keyboard-accessible, grouped search over the three verified enterprise catalogs. */
const GlobalSearch: React.FC<GlobalSearchProps> = ({ client, debounceMs = 300 }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const search = useDashboardSearch(client, query, debounceMs);
  const ready = isDashboardSearchQueryReady(query);

  const groups = useMemo(() => {
    const result = search.result;
    if (!result) return [];
    return [
      {
        kind: 'companies' as const,
        errorCode: result.companies.errorCode,
        options: result.companies.items.map(companyOption),
      },
      {
        kind: 'products' as const,
        errorCode: result.products.errorCode,
        options: result.products.items.map(productOption),
      },
      {
        kind: 'projects' as const,
        errorCode: result.projects.errorCode,
        options: result.projects.items.map(
          (project: EnterpriseProjectSummary): SearchOption => ({
            id: `project-${project.hpInfoId}`,
            kind: 'projects',
            label: displayProjectName(project, false, t),
            secondary: [project.province, project.city].filter(Boolean).join(' / ') || undefined,
            path: `/enterprise/projects/${encodeURIComponent(project.hpInfoId)}`,
          })
        ),
      },
    ];
  }, [search.result, t]);

  const options = useMemo(() => groups.flatMap((group) => group.options), [groups]);
  const resultsOpen = open && ready;

  const choose = (option: SearchOption) => {
    setOpen(false);
    setActiveIndex(-1);
    navigate(option.path);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!resultsOpen || !options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => {
        if (current < 0) return direction > 0 ? 0 : options.length - 1;
        return (current + direction + options.length) % options.length;
      });
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(options[activeIndex]);
    }
  };

  const showEmpty =
    search.result !== null &&
    search.result.errorCode === null &&
    groups.every((group) => group.errorCode === null && group.options.length === 0);
  const showsListbox = !search.isLoading && !search.result?.errorCode && !showEmpty;

  return (
    <section className={styles.searchSection} aria-labelledby='enterprise-global-search-title'>
      <div className={styles.sectionIndex} aria-hidden='true'>
        {t('enterprise.dashboard.search.index')}
      </div>
      <div className={styles.searchHeading}>
        <div>
          <span>{t('enterprise.dashboard.search.eyebrow')}</span>
          <h2 id='enterprise-global-search-title'>{t('enterprise.dashboard.search.title')}</h2>
        </div>
        <p>{t('enterprise.dashboard.search.description')}</p>
      </div>
      <div className={styles.searchControl}>
        <Input.Search
          value={query}
          maxLength={100}
          prefix={<Search aria-hidden='true' />}
          placeholder={t('enterprise.dashboard.search.placeholder')}
          aria-label={t('enterprise.dashboard.search.ariaLabel')}
          role='combobox'
          aria-autocomplete='list'
          aria-expanded={resultsOpen}
          aria-controls='enterprise-global-search-results'
          aria-activedescendant={activeIndex >= 0 ? `enterprise-search-${options[activeIndex]?.id}` : undefined}
          onFocus={() => {
            if (ready) setOpen(true);
          }}
          onChange={(value) => {
            setQuery(value);
            setOpen(isDashboardSearchQueryReady(value));
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
        />
        {!ready && query.length > 0 ? <p>{t('enterprise.dashboard.search.minimumHint')}</p> : null}
      </div>

      {resultsOpen ? (
        <div
          id='enterprise-global-search-results'
          className={styles.searchResults}
          role={showsListbox ? 'listbox' : undefined}
          aria-label={t('enterprise.dashboard.search.resultsLabel')}
        >
          {search.isLoading ? (
            <div className={styles.searchStatus} role='status'>
              <Spin dot />
              <span>{t('enterprise.dashboard.search.loading')}</span>
            </div>
          ) : search.result?.errorCode ? (
            <div className={styles.searchTotalError}>
              <Alert type='error' showIcon content={t('enterprise.dashboard.search.totalError')} />
              <Button size='small' type='primary' onClick={search.retry}>
                {t('enterprise.actions.retry')}
              </Button>
            </div>
          ) : showEmpty ? (
            <Empty description={t('enterprise.dashboard.search.empty')} />
          ) : (
            groups.map((group) => {
              const Icon = groupIcon[group.kind];
              return (
                <section
                  key={group.kind}
                  className={styles.searchGroup}
                  role='group'
                  aria-labelledby={`enterprise-search-${group.kind}-title`}
                >
                  <h3 id={`enterprise-search-${group.kind}-title`}>
                    <Icon aria-hidden='true' />
                    {t(`enterprise.dashboard.search.groups.${group.kind}`)}
                  </h3>
                  {group.errorCode ? (
                    <Alert type='warning' showIcon content={t('enterprise.dashboard.search.groupError')} />
                  ) : group.options.length ? (
                    <div className={styles.searchOptions}>
                      {group.options.map((option) => {
                        const optionIndex = options.findIndex((candidate) => candidate.id === option.id);
                        return (
                          <Button
                            key={option.id}
                            id={`enterprise-search-${option.id}`}
                            className={styles.searchOption}
                            type='text'
                            role='option'
                            aria-selected={optionIndex === activeIndex}
                            onMouseEnter={() => setActiveIndex(optionIndex)}
                            onClick={() => choose(option)}
                          >
                            <span>{option.label}</span>
                            {option.secondary ? <small>{option.secondary}</small> : null}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={styles.groupEmpty}>{t('enterprise.dashboard.search.groupEmpty')}</p>
                  )}
                </section>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
};

export default GlobalSearch;
