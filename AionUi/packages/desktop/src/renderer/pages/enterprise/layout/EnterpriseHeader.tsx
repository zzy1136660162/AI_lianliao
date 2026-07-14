import { Left, Right } from '@icon-park/react';
import { Button } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

type EnterpriseHeaderProps = {
  assistantOpen: boolean;
  onToggleAssistant: () => void;
};

const routeTitleKey = (pathname: string): string => {
  if (pathname.startsWith('/enterprise/companies/')) return 'enterprise.routes.companyDetail.title';
  if (pathname.startsWith('/enterprise/companies')) return 'enterprise.routes.companies.title';
  if (pathname.startsWith('/enterprise/products/')) return 'enterprise.routes.productDetail.title';
  if (pathname.startsWith('/enterprise/products')) return 'enterprise.routes.products.title';
  if (pathname.startsWith('/enterprise/projects/')) return 'enterprise.routes.projectDetail.title';
  if (pathname.startsWith('/enterprise/projects')) return 'enterprise.routes.projects.title';
  if (pathname.startsWith('/enterprise/favorites')) return 'enterprise.routes.favorites.title';
  if (pathname.startsWith('/enterprise/leads')) return 'enterprise.routes.leads.title';
  return 'enterprise.routes.dashboard.title';
};

/** Desktop title bar for the enterprise route namespace. */
const EnterpriseHeader: React.FC<EnterpriseHeaderProps> = ({ assistantOpen, onToggleAssistant }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const assistantAction = assistantOpen
    ? t('enterprise.assistant.actions.hide')
    : t('enterprise.assistant.actions.show');

  return (
    <header className='enterprise-header'>
      <div className='enterprise-header__context'>
        <span className='enterprise-header__eyebrow'>{t('enterprise.shell.eyebrow')}</span>
        <span className='enterprise-header__route'>{t(routeTitleKey(location.pathname))}</span>
      </div>
      <Button
        className='enterprise-header__assistant-toggle'
        type='text'
        htmlType='button'
        aria-label={assistantAction}
        aria-expanded={assistantOpen}
        aria-controls='enterprise-assistant-panel'
        onClick={onToggleAssistant}
      >
        {assistantOpen ? <Right size={16} /> : <Left size={16} />}
        <span>{assistantAction}</span>
      </Button>
    </header>
  );
};

export default EnterpriseHeader;
