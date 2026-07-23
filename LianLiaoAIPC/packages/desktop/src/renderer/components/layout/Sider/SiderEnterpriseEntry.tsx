/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Tooltip } from '@arco-design/web-react';
import { BuildingFour } from '@icon-park/react';
import classNames from 'classnames';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';

type SiderEnterpriseEntryProps = {
  collapsed: boolean;
  isMobile: boolean;
  siderTooltipProps: SiderTooltipProps;
  onClick: () => void;
};

/** Fixed workspace switcher shown between conversation history and the sidebar footer. */
const SiderEnterpriseEntry: React.FC<SiderEnterpriseEntryProps> = ({
  collapsed,
  isMobile,
  siderTooltipProps,
  onClick,
}) => {
  const { t } = useTranslation();
  const label = t('enterprise.shell.brand');

  return (
    <div className='sider-enterprise-entry shrink-0 pt-8px'>
      <Tooltip {...siderTooltipProps} content={label} position='right'>
        <Button
          className={classNames(
            '!h-34px !w-full !rd-8px !border-0 !bg-transparent !text-t-primary hover:!bg-fill-3 active:!bg-fill-4',
            collapsed ? '!px-0 !justify-center' : '!px-10px !justify-start',
            isMobile && 'sider-action-btn-mobile'
          )}
          type='text'
          htmlType='button'
          aria-label={label}
          icon={
            <BuildingFour
              theme='outline'
              size={collapsed ? 20 : 16}
              fill='currentColor'
              className='block leading-none shrink-0'
              aria-hidden='true'
            />
          }
          onClick={onClick}
        >
          {collapsed ? null : <span className='text-14px font-[500] leading-24px truncate'>{label}</span>}
        </Button>
      </Tooltip>
    </div>
  );
};

export default SiderEnterpriseEntry;
