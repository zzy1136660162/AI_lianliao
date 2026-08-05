import { Box, BuildingFour, EngineeringBrand, Search } from '@icon-park/react';
import { Alert, AutoComplete, Button, Empty, Input, Spin, type AutoCompleteProps } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import type { UnifiedSearchItem } from '@/common/enterprise/unified-search/contracts';
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

type SearchSelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  option?: SearchOption;
};

export type GlobalSearchProps = {
  client: Pick<EnterpriseClient, 'request'>;
  debounceMs?: number;
};

const itemOption = (item: UnifiedSearchItem, kind: SearchGroupKind): SearchOption => ({
  id: `${item.resourceType}-${item.businessId}`,
  kind,
  label: item.title,
  secondary: item.subtitle ?? ([item.city, item.district, item.industry].filter(Boolean).join(' / ') || undefined),
  path: `/enterprise/${kind}/${encodeURIComponent(item.businessId)}`,
});

const groupIcon = {
  companies: BuildingFour,
  products: Box,
  projects: EngineeringBrand,
} as const;

/** Ant Design autocomplete over the three verified enterprise catalogs. */
const GlobalSearch: React.FC<GlobalSearchProps> = ({ client, debounceMs = 300 }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const activeOptionIndexRef = useRef(-1);
  const dismissedQueryRef = useRef<string | null>(null);
  const inputFocusedRef = useRef(false);
  const search = useDashboardSearch(client, query, debounceMs);
  const ready = isDashboardSearchQueryReady(query);

  const groups = useMemo(() => {
    const result = search.result;
    if (!result) return [];
    return [
      {
        kind: 'companies' as const,
        errorCode: result.companies.errorCode,
        options: result.companies.items.map((item) => itemOption(item, 'companies')),
      },
      {
        kind: 'products' as const,
        errorCode: result.products.errorCode,
        options: result.products.items.map((item) => itemOption(item, 'products')),
      },
      {
        kind: 'projects' as const,
        errorCode: result.projects.errorCode,
        options: result.projects.items.map((item) => itemOption(item, 'projects')),
      },
    ];
  }, [search.result, t]);

  const showEmpty =
    search.result !== null &&
    search.result.errorCode === null &&
    groups.every((group) => group.errorCode === null && group.options.length === 0);
  const businessOptions = useMemo(() => groups.flatMap((group) => group.options), [groups]);

  const autocompleteOptions = useMemo<NonNullable<AutoCompleteProps['options']>>(() => {
    const disabledOption = (value: string, label: React.ReactNode): SearchSelectOption => ({
      value,
      label,
      disabled: true,
    });

    if (search.isLoading) {
      return [
        disabledOption(
          '__loading',
          <div className={styles.searchStatus} role='status'>
            <Spin size='small' />
            <span>{t('enterprise.dashboard.search.loading')}</span>
          </div>
        ),
      ];
    }

    if (search.result?.errorCode) {
      return [
        disabledOption(
          '__error',
          <div className={styles.searchTotalError}>
            <Alert type='error' showIcon title={t('enterprise.dashboard.search.totalError')} />
            <Button
              size='small'
              type='primary'
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                search.retry();
              }}
            >
              {t('enterprise.actions.retry')}
            </Button>
          </div>
        ),
      ];
    }

    if (showEmpty) {
      return [
        disabledOption(
          '__empty',
          <div className={styles.searchEmpty}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('enterprise.dashboard.search.empty')} />
          </div>
        ),
      ];
    }

    return groups.map((group) => {
      const Icon = groupIcon[group.kind];
      const groupOptions: SearchSelectOption[] = group.errorCode
        ? [
            disabledOption(
              `__group-error-${group.kind}`,
              <Alert type='warning' showIcon title={t('enterprise.dashboard.search.groupError')} />
            ),
          ]
        : group.options.length
          ? group.options.map((option) => ({
              value: option.path,
              option,
              label: (
                <div className={styles.searchOption}>
                  <span>{option.label}</span>
                  {option.secondary ? <small>{option.secondary}</small> : null}
                </div>
              ),
            }))
          : [
              disabledOption(
                `__group-empty-${group.kind}`,
                <p className={styles.groupEmpty}>{t('enterprise.dashboard.search.groupEmpty')}</p>
              ),
            ];

      return {
        label: (
          <div className={styles.searchGroupTitle}>
            <Icon aria-hidden='true' />
            <span>{t(`enterprise.dashboard.search.groups.${group.kind}`)}</span>
          </div>
        ),
        options: groupOptions,
      };
    });
  }, [groups, search.isLoading, search.result?.errorCode, search.retry, showEmpty, t]);

  const resultsOpen = open && ready;
  useEffect(() => {
    if (
      inputFocusedRef.current &&
      ready &&
      autocompleteOptions.length > 0 &&
      dismissedQueryRef.current !== search.normalizedQuery
    ) {
      setOpen(true);
    }
  }, [autocompleteOptions, ready, search.normalizedQuery]);
  useEffect(() => {
    activeOptionIndexRef.current = -1;
  }, [businessOptions, search.normalizedQuery]);

  const updateActiveOption = (nextIndex: number) => {
    activeOptionIndexRef.current = nextIndex;
  };

  const choose = (option: SearchOption) => {
    dismissedQueryRef.current = search.normalizedQuery;
    setOpen(false);
    updateActiveOption(-1);
    navigate(option.path);
  };
  const handleSelect: AutoCompleteProps['onSelect'] = (_value, item) => {
    const option = (item as SearchSelectOption).option;
    if (option) choose(option);
  };
  const handleInputKeyDown: AutoCompleteProps['onInputKeyDown'] = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismissedQueryRef.current = search.normalizedQuery;
      setOpen(false);
      updateActiveOption(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!businessOptions.length || search.isLoading || search.result?.errorCode) return;
      event.preventDefault();
      dismissedQueryRef.current = null;
      setOpen(true);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const current = activeOptionIndexRef.current;
      updateActiveOption(
        current < 0
          ? direction > 0
            ? 0
            : businessOptions.length - 1
          : (current + direction + businessOptions.length) % businessOptions.length
      );
      return;
    }
    if (event.key === 'Enter' && activeOptionIndexRef.current >= 0) {
      event.preventDefault();
      const option = businessOptions[activeOptionIndexRef.current];
      if (option) choose(option);
    }
  };

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
      </div>
      <div className={styles.searchControl}>
        <AutoComplete
          value={query}
          options={autocompleteOptions}
          open={resultsOpen}
          filterOption={false}
          virtual={false}
          defaultActiveFirstOption={false}
          classNames={{ popup: { root: styles.searchResults } }}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              if (dismissedQueryRef.current === search.normalizedQuery) return;
              setOpen(ready);
              return;
            }
            // A ready query has one render before the search hook publishes its
            // loading option. Ignore that transitional close so the popup can
            // open as soon as the status row is available.
            if (!ready || autocompleteOptions.length > 0) setOpen(false);
          }}
          onSelect={handleSelect}
          onChange={(value) => {
            dismissedQueryRef.current = null;
            setQuery(value);
            setOpen(isDashboardSearchQueryReady(value));
            updateActiveOption(-1);
          }}
        >
          <Input.Search
            maxLength={100}
            prefix={<Search aria-hidden='true' />}
            allowClear
            placeholder={t('enterprise.dashboard.search.placeholder')}
            aria-label={t('enterprise.dashboard.search.ariaLabel')}
            onKeyDown={handleInputKeyDown}
            onFocus={() => {
              inputFocusedRef.current = true;
              dismissedQueryRef.current = null;
              if (ready) setOpen(true);
            }}
            onBlur={() => {
              inputFocusedRef.current = false;
            }}
            onSearch={(value) => {
              if (!isDashboardSearchQueryReady(value)) return;
              setOpen(false);
              navigate(`/enterprise/search?q=${encodeURIComponent(value.trim())}`);
            }}
          />
        </AutoComplete>
        {!ready && query.length > 0 ? <p>{t('enterprise.dashboard.search.minimumHint')}</p> : null}
      </div>
    </section>
  );
};

export default GlobalSearch;
