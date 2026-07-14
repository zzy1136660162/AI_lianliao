import { Alert, Button, Empty, Spin } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

export type EnterprisePageStateKind = 'loading' | 'empty' | 'error';

export type EnterprisePageStateProps = {
  state: EnterprisePageStateKind;
  title: string;
  description?: string;
  onRetry?: () => void;
};

/**
 * Renders the shared non-content states for enterprise pages. Error details are
 * intentionally supplied as safe, translated copy instead of raw exceptions.
 */
const EnterprisePageState: React.FC<EnterprisePageStateProps> = ({ state, title, description, onRetry }) => {
  const { t } = useTranslation();

  if (state === 'loading') {
    return (
      <section className='enterprise-page-state enterprise-page-state--loading' role='status' aria-label={title}>
        <Spin dot />
        <p>{title}</p>
      </section>
    );
  }

  if (state === 'error') {
    return (
      <section className='enterprise-page-state enterprise-page-state--error'>
        <Alert type='error' showIcon title={title} content={description} />
        {onRetry ? (
          <Button type='primary' onClick={onRetry}>
            {t('enterprise.actions.retry')}
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <section className='enterprise-page-state enterprise-page-state--empty'>
      <Empty
        description={
          <div className='enterprise-page-state__copy'>
            <h1>{title}</h1>
            {description ? <p>{description}</p> : null}
          </div>
        }
      />
    </section>
  );
};

export default EnterprisePageState;
