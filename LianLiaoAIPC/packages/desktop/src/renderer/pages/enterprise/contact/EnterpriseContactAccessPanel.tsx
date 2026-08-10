import { Copy } from '@icon-park/react';
import { Alert, Button, Space } from 'antd';
import React, { useState } from 'react';

import { ENTERPRISE_CERTIFICATION_URL, ENTERPRISE_REGISTRATION_URL } from '@/common/enterprise/constants';
import type { EnterpriseContactResourceType } from '@/common/enterprise/contact-access/contracts';
import { maskEnterpriseContactName, maskEnterprisePhone } from '@/common/enterprise/phonePrivacy';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import {
  getCurrentEnterprisePagePath,
  recordEnterpriseBehavior,
} from '@/renderer/services/enterprise/enterpriseBehaviorLog';
import { openExternalUrl } from '@/renderer/utils/platform';

import { copyEnterprisePhone } from './contactActions';
import MembershipUpgradeModal from './MembershipUpgradeModal';
import styles from './contact-access.module.css';

export type EnterpriseContactAccessPanelProps = {
  client: Pick<EnterpriseClient, 'request'>;
  resourceType: EnterpriseContactResourceType;
  resourceId: string;
  resourceTitle?: string;
  toCompanyId?: string;
  toCompanyName?: string;
  contactName?: string;
  contactNameLabel?: string;
  maskedPhone?: string;
};

/**
 * Shared enterprise/product/project phone permission boundary.
 *
 * The component never derives a telephone number from page data. It asks the
 * main process to run the H5 membership rule and receives the full number only
 * after the cloud service explicitly allows access.
 */
const EnterpriseContactAccessPanel: React.FC<EnterpriseContactAccessPanelProps> = ({
  client,
  resourceType,
  resourceId,
  resourceTitle,
  toCompanyId,
  toCompanyName,
  contactName,
  contactNameLabel = '联系人',
  maskedPhone,
}) => {
  const [phone, setPhone] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [noticeType, setNoticeType] = useState<'success' | 'warning' | 'error'>('warning');
  const [membershipOpen, setMembershipOpen] = useState(false);
  const protectedPhone = maskedPhone
    ? maskedPhone.includes('*')
      ? maskedPhone
      : maskEnterprisePhone(maskedPhone)
    : undefined;
  const protectedContactName = maskEnterpriseContactName(contactName);

  const acquire = async () => {
    setLoading(true);
    setNotice(undefined);
    try {
      const response = await client.request({
        operation: 'contact.acquire',
        payload: { resourceType, resourceId },
      });
      if (response.operation !== 'contact.acquire') throw new Error('ENTERPRISE_OPERATION_MISMATCH');
      const access = response.data;
      void recordEnterpriseBehavior(
        {
          eventType: 'CONTACT_ACQUIRE',
          moduleName: `链辽AI桌面端-${resourceType === 'COMPANY' ? '企业码' : resourceType === 'PRODUCT' ? '重点产品' : '在建项目'}`,
          title: `获取${resourceTitle || resourceId}联系方式`,
          pagePath: getCurrentEnterprisePagePath(),
          targetId: resourceId,
          ...(toCompanyId ? { toCompanyId } : {}),
          ...(toCompanyName ? { toCompanyName } : {}),
          params: {
            resourceType,
            allowed: access.allowed,
            action: access.action,
          },
        },
        client
      );
      if (access.allowed && access.phone) {
        setPhone(access.phone);
        setNoticeType('success');
        setNotice('联系方式已获取。');
        return;
      }

      setNoticeType('warning');
      setNotice(access.message || '当前账号暂时无法获取该联系方式。');
      switch (access.action) {
        case 'UPGRADE':
          setMembershipOpen(true);
          break;
        case 'REGISTER':
          await openExternalUrl(ENTERPRISE_REGISTRATION_URL);
          break;
        case 'CERTIFY':
          await openExternalUrl(ENTERPRISE_CERTIFICATION_URL);
          break;
        case 'NONE':
        case 'RETRY':
          break;
      }
    } catch {
      void recordEnterpriseBehavior(
        {
          eventType: 'CONTACT_ACQUIRE',
          moduleName: `链辽AI桌面端-${resourceType === 'COMPANY' ? '企业码' : resourceType === 'PRODUCT' ? '重点产品' : '在建项目'}`,
          title: `获取${resourceTitle || resourceId}联系方式`,
          pagePath: getCurrentEnterprisePagePath(),
          targetId: resourceId,
          params: { resourceType, outcome: 'FAILED' },
        },
        client
      );
      setNoticeType('error');
      setNotice('联系方式服务暂不可用，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  const copyPhone = async () => {
    if (!phone) return;
    try {
      await copyEnterprisePhone(phone);
      setNoticeType('success');
      setNotice('电话号码已复制。');
    } catch {
      setNoticeType('error');
      setNotice('复制失败，请手动记录电话号码。');
    }
  };

  return (
    <div className={styles.panel}>
      {contactName ? (
        <div className={styles.phoneRow}>
          <span className={styles.phoneLabel}>{contactNameLabel}</span>
          <strong>{phone ? contactName : protectedContactName}</strong>
        </div>
      ) : null}
      <div className={styles.phoneRow}>
        <span className={styles.phoneLabel}>联系电话</span>
        <strong>{phone || protectedPhone || '验证会员权限后可查看'}</strong>
      </div>
      <Space wrap>
        {!phone ? (
          <Button type='primary' loading={loading} onClick={() => void acquire()}>
            获取联系方式
          </Button>
        ) : (
          <>
            <Button icon={<Copy />} onClick={() => void copyPhone()}>
              复制电话
            </Button>
          </>
        )}
      </Space>
      {notice ? <Alert className={styles.notice} showIcon type={noticeType} title={notice} /> : null}
      <MembershipUpgradeModal
        open={membershipOpen}
        message={notice}
        onClose={() => setMembershipOpen(false)}
        onRefreshed={async () => {
          setMembershipOpen(false);
          await acquire();
        }}
      />
    </div>
  );
};

export default EnterpriseContactAccessPanel;
