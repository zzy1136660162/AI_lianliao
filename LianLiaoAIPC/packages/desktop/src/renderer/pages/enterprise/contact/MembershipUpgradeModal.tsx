import { Button, Modal, Space } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import React, { useMemo, useState } from 'react';

import { buildMembershipUpgradeUrl } from '@/common/enterprise/demand-contact/constants';
import { useOptionalEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';

import styles from './contact-access.module.css';

export type MembershipUpgradeModalProps = {
  open: boolean;
  message?: string;
  onClose: () => void;
  /** Invoked after the trusted login context has been refreshed. */
  onRefreshed?: () => Promise<void> | void;
};

/**
 * Shared desktop membership upgrade flow.
 *
 * The QR points at the existing mobile payment page. Refreshing does not trust
 * renderer state: it reloads the signed-in enterprise context through the main
 * process before asking the owning page to query its protected resource again.
 */
const MembershipUpgradeModal: React.FC<MembershipUpgradeModalProps> = ({ open, message, onClose, onRefreshed }) => {
  const enterpriseAuth = useOptionalEnterpriseAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const membershipUrl = useMemo(() => buildMembershipUpgradeUrl(), []);

  const refreshMembership = async () => {
    setRefreshing(true);
    setRefreshMessage('');
    try {
      if (enterpriseAuth) await enterpriseAuth.refreshUserContext();
      await onRefreshed?.();
      setRefreshMessage('会员权限已刷新，请重新解锁联系方式。');
    } catch {
      setRefreshMessage('暂时无法刷新会员权限，请稍后重试。');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Modal open={open} title='扫码升级企业会员' footer={null} destroyOnHidden onCancel={onClose}>
      <div className={styles.qrDialog}>
        <QRCodeSVG value={membershipUrl} size={220} level='M' />
        <p>{message || '请使用当前登录账号绑定的微信扫码，在手机端完成会员升级。'}</p>
        <p className={styles.secondaryText}>支付完成后可在本页面刷新会员权限，无需重新登录。</p>
        {refreshMessage ? <p role='status'>{refreshMessage}</p> : null}
        <Space wrap>
          <Button type='primary' loading={refreshing} onClick={() => void refreshMembership()}>
            我已完成支付，刷新会员权限
          </Button>
          <Button onClick={onClose}>稍后处理</Button>
        </Space>
      </div>
    </Modal>
  );
};

export default MembershipUpgradeModal;
