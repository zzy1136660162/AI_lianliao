import { Button, Pagination, Table, type TableColumnsType } from 'antd';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { EnterprisePage, EnterpriseProjectSummary } from '@/common/enterprise/contracts';

import { displayProjectName } from './projectData';
import styles from './project-workspace.module.css';

export type ProjectTableProps = {
  listTopRef: React.Ref<HTMLDivElement>;
  page: EnterprisePage<EnterpriseProjectSummary>;
  loading: boolean;
  selected: EnterpriseProjectSummary | null;
  onSelect: (project: EnterpriseProjectSummary, trigger: HTMLTableRowElement) => void;
  onViewDetails: (project: EnterpriseProjectSummary) => void;
  onPageChange: (pageNum: number, pageSize: number) => void;
};

const ProjectTable: React.FC<ProjectTableProps> = ({
  listTopRef,
  page,
  loading,
  selected,
  onSelect,
  onViewDetails,
  onPageChange,
}) => {
  const { t } = useTranslation();
  const missing = t('enterprise.projects.missing');
  const columns = useMemo<TableColumnsType<EnterpriseProjectSummary>>(
    () => [
      {
        title: t('enterprise.projects.columns.name'),
        dataIndex: 'projectName',
        width: 240,
        render: (_value, project) => {
          const protectedName = displayProjectName(project, false, t);
          return (
            <div className={styles.projectNameCell}>
              <h2>{protectedName}</h2>
              <span>{project.projectNature || project.investmentType || project.constructionNature || missing}</span>
            </div>
          );
        },
      },
      {
        title: t('enterprise.projects.columns.region'),
        width: 150,
        render: (_value, project) => [project.province, project.city].filter(Boolean).join(' / ') || missing,
      },
      {
        title: t('enterprise.projects.columns.investment'),
        dataIndex: 'totalInvestment',
        width: 130,
        render: (value) => (typeof value === 'number' ? t('enterprise.projects.investmentWan', { value }) : missing),
      },
      {
        title: t('enterprise.projects.columns.procurement'),
        dataIndex: 'procurementSummary',
        width: 280,
        ellipsis: true,
        render: (_value, project) => project.procurementSummary || project.materialMatch || missing,
      },
      {
        title: t('enterprise.projects.columns.publishedAt'),
        dataIndex: 'publishedAt',
        width: 120,
        render: (value) => value || missing,
      },
      {
        title: t('enterprise.projects.columns.actions'),
        width: 120,
        fixed: 'right',
        render: (_value, project) => (
          <Button
            type='text'
            size='small'
            onClick={(event) => {
              event.stopPropagation();
              onViewDetails(project);
            }}
          >
            {t('enterprise.projects.actions.viewDetails')}
          </Button>
        ),
      },
    ],
    [missing, onViewDetails, t]
  );

  return (
    <div ref={listTopRef} className={styles.tablePanel}>
      <Table<EnterpriseProjectSummary>
        rowKey='hpInfoId'
        columns={columns}
        dataSource={page.list}
        pagination={false}
        loading={loading}
        scroll={{ x: 1040 }}
        rowClassName={(project) => (selected?.hpInfoId === project.hpInfoId ? styles.selectedRow : '')}
        onRow={(project) => ({
          tabIndex: 0,
          'aria-label': t('enterprise.projects.rowLabel', { name: displayProjectName(project, false, t) }),
          onClick: (event: React.MouseEvent<HTMLTableRowElement>) => onSelect(project, event.currentTarget),
          onDoubleClick: () => onViewDetails(project),
          onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(project, event.currentTarget);
            }
          },
        })}
      />
      <div className={styles.paginationBar}>
        <span>{t('enterprise.projects.resultCount', { count: page.total })}</span>
        <Pagination
          current={page.pageNum}
          pageSize={page.pageSize}
          total={page.total}
          size='small'
          showQuickJumper
          showSizeChanger
          pageSizeOptions={[10, 20, 50]}
          onChange={onPageChange}
        />
      </div>
    </div>
  );
};

export default ProjectTable;
