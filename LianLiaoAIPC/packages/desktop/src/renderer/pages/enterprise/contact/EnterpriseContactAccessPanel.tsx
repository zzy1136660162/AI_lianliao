import { Copy, PhoneTelephone } from '@icon-park/react';
import { Alert, Button, Space } from 'antd';
import React, { useState } from 'react';

import { ENTERPRISE_REGISTRATION_URL } from '@/common/enterprise/constants';
import type { EnterpriseContactResourceType } from '@/common/enterprise/contact-access/contracts';
import { maskEnterprisePhone } from '@/common/enterprise/phonePrivacy';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import { openExternalUrl } from '@/renderer/utils/platform';

import { copyEnterprisePhone, dialEnterprisePhone } from './contactActions';
import MembershipUpgradeModal from './MembershipUpgradeModal';
import styles from './contact-access.module.css';

export type EnterpriseContactAccessPanelProps = {
  client: Pick<EnterpriseClient, 'request'>;
  resourceType: EnterpriseContactResourceType;
  resourceId: string;
  maskedPhone?: string;
};

const MEMBERSHIP_ERROR_TYPES = new Set([5, 6, 7, 8, 9]);
const REGISTRATION_ERROR_TYPES = new Set([1, 2]);

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
      if (access.allowed && access.phone) {
        setPhone(access.phone);
        setNoticeType('success');
        setNotice('联系方式已获取。');
        return;
      }

      setNoticeType('warning');
      setNotice(access.message || '当前账号暂时无法获取该联系方式。');
      if (MEMBERSHIP_ERROR_TYPES.has(access.errType)) {
        setMembershipOpen(true);
        return;
      }
      if (REGISTRATION_ERROR_TYPES.has(access.errType)) {
        await openExternalUrl(access.actionUrl || ENTERPRISE_REGISTRATION_URL);
      } else if (access.actionUrl) {
        await openExternalUrl(access.actionUrl);
      }
    } catch {
      setNoticeType('error');
      setNotice('联系方式权限校验失败，请稍后重试。');
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

  const dialPhone = async () => {
    if (!phone) return;
    try {
      const opened = await dialEnterprisePhone(phone);
      setNoticeType(opened ? 'success' : 'warning');
      setNotice(opened ? '已调用系统拨号应用。' : '该号码格式不支持直接拨打，请先复制号码。');
    } catch {
      setNoticeType('error');
      setNotice('系统拨号应用暂时无法打开，请先复制号码。');
    }
  };

  return (
    <div className={styles.panel}>
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
            <Button type='primary' icon={<PhoneTelephone />} onClick={() => void dialPhone()}>
              拨打电话
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
