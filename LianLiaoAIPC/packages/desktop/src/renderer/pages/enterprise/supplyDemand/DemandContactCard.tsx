import { Button, Card, Descriptions, Modal, Result, Space, Spin } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ENTERPRISE_REGISTRATION_URL } from '@/common/enterprise/constants';
import type { DemandContactAccess } from '@/common/enterprise/demand-contact/contracts';
import { buildMembershipUpgradeUrl } from '@/common/enterprise/demand-contact/constants';
import { useOptionalEnterpriseAuth } from '@/renderer/hooks/context/EnterpriseAuthContext';
import type { EnterpriseClient } from '@/renderer/services/enterprise/enterpriseClient';
import {
  getCurrentEnterprisePagePath,
  recordEnterpriseBehavior,
} from '@/renderer/services/enterprise/enterpriseBehaviorLog';

import { acquireDemandContact, loadDemandContactStatus } from './demandContactData';
import styles from './supply-demand.module.css';

type DemandContactCardProps = {
  client: Pick<EnterpriseClient, 'request'>;
  typeId: number;
  demandId: string;
  demandTitle?: string;
};

const hiddenContactRows = ['发布企业', '联系人', '联系电话', '详细地址'] as const;

const DemandContactCard: React.FC<DemandContactCardProps> = ({ client, typeId, demandId, demandTitle }) => {
  const enterpriseAuth = useOptionalEnterpriseAuth();
  const [access, setAccess] = useState<DemandContactAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [acquiring, setAcquiring] = useState(false);
  const [failed, setFailed] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [refreshingMembership, setRefreshingMembership] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const refreshCooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setAccess(await loadDemandContactStatus(client, typeId, demandId));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [client, demandId, typeId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(
    () => () => {
      if (refreshCooldownTimer.current) clearTimeout(refreshCooldownTimer.current);
    },
    []
  );

  const acquire = async () => {
    setAcquiring(true);
    setFailed(false);
    try {
      const next = await acquireDemandContact(client, typeId, demandId);
      setAccess(next);
      void recordEnterpriseBehavior(
        {
          eventType: 'CONTACT_ACQUIRE',
          moduleName: '链辽AI桌面端-供需对接',
          title: `获取${demandTitle || demandId}联系方式`,
          pagePath: getCurrentEnterprisePagePath(),
          targetId: demandId,
          ...(next.contact?.companyName ? { toCompanyName: next.contact.companyName } : {}),
          params: {
            typeId,
            state: next.state,
            canAcquire: next.canAcquire,
            ...(typeof next.remainingQuota === 'number' ? { remainingQuota: next.remainingQuota } : {}),
          },
        },
        client
      );
    } catch {
      void recordEnterpriseBehavior(
        {
          eventType: 'CONTACT_ACQUIRE',
          moduleName: '链辽AI桌面端-供需对接',
          title: `获取${demandTitle || demandId}联系方式`,
          pagePath: getCurrentEnterprisePagePath(),
          targetId: demandId,
          params: { typeId, outcome: 'FAILED' },
        },
        client
      );
      setFailed(true);
    } finally {
      setAcquiring(false);
    }
  };

  const refreshMembership = async () => {
    if (refreshCooldown) return;
    setRefreshCooldown(true);
    setRefreshingMembership(true);
    try {
      if (!enterpriseAuth) throw new Error('ENTERPRISE_AUTH_CONTEXT_MISSING');
      await enterpriseAuth.refreshUserContext();
      const next = await loadDemandContactStatus(client, typeId, demandId);
      setAccess(next);
      if (next.state === 'MEMBER_AVAILABLE' || next.state === 'OWNER' || next.state === 'UNLOCKED') {
        setMembershipOpen(false);
      }
    } catch {
      setFailed(true);
    } finally {
      setRefreshingMembership(false);
      if (refreshCooldownTimer.current) clearTimeout(refreshCooldownTimer.current);
      refreshCooldownTimer.current = setTimeout(() => {
        setRefreshCooldown(false);
        refreshCooldownTimer.current = null;
      }, 2000);
    }
  };

  const contact = access?.contact;
  const showContact = access?.state === 'OWNER' || access?.state === 'UNLOCKED';
  const membershipUrl = useMemo(() => buildMembershipUpgradeUrl(), []);

  return (
    <>
      <Card className={styles.contactCard} title='联系方式'>
        {loading ? (
          <div className={styles.contactState}>
            <Spin />
            <span>正在核验会员权限…</span>
          </div>
        ) : failed ? (
          <Result
            status='warning'
            title='联系方式服务暂不可用'
            subTitle='请稍后重试，公开需求信息仍可正常查看。'
            extra={<Button onClick={() => void refreshStatus()}>重新加载</Button>}
          />
        ) : showContact && contact ? (
          <Descriptions column={1} size='small'>
            <Descriptions.Item label='发布企业'>{contact.companyName || '暂未提供'}</Descriptions.Item>
            <Descriptions.Item label='联系人'>{contact.contactPerson || '暂未提供'}</Descriptions.Item>
            <Descriptions.Item label='联系电话'>{contact.contactPhone || '暂未提供'}</Descriptions.Item>
            <Descriptions.Item label='详细地址'>{contact.address || '暂未提供'}</Descriptions.Item>
          </Descriptions>
        ) : (
          <>
            <div className={styles.lockedContact} aria-hidden='true'>
              {hiddenContactRows.map((label) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>会员可查看完整信息</strong>
                </div>
              ))}
            </div>
            <div className={styles.contactActions}>
              {access?.state === 'MEMBER_AVAILABLE' ? (
                <Button type='primary' loading={acquiring} onClick={() => void acquire()}>
                  使用会员权益获取联系方式
                </Button>
              ) : null}
              {access?.state === 'PAYMENT_REQUIRED' || access?.state === 'QUOTA_EXHAUSTED' ? (
                <Button type='primary' onClick={() => setMembershipOpen(true)}>
                  扫码升级会员
                </Button>
              ) : null}
              {access?.state === 'REGISTRATION_REQUIRED' ? (
                <Button type='primary' onClick={() => setRegistrationOpen(true)}>
                  扫码完成企业注册
                </Button>
              ) : null}
              {access?.state === 'DEMAND_CLOSED' ? <span>该需求已结束，暂不支持获取联系方式。</span> : null}
              {access?.state === 'UNAVAILABLE' ? <span>该需求不存在或暂不可查看。</span> : null}
              {/*  {typeof access?.remainingQuota === 'number' ? (
                <span className={styles.quotaHint}>当前剩余获取次数：{access.remainingQuota}</span>
              ) : null}*/}
            </div>
          </>
        )}
      </Card>

      <Modal
        open={membershipOpen}
        title='扫码升级企业会员'
        footer={null}
        destroyOnHidden
        onCancel={() => setMembershipOpen(false)}
      >
        <div className={styles.qrDialog}>
          <QRCodeSVG value={membershipUrl} size={220} level='M' />
          <p>请使用当前登录账号绑定的微信扫码，在手机端完成会员升级。</p>
          <Space>
            <Button
              type='primary'
              loading={refreshingMembership}
              disabled={refreshCooldown}
              onClick={() => void refreshMembership()}
            >
              我已完成支付，刷新会员权限
            </Button>
            <Button onClick={() => setMembershipOpen(false)}>稍后处理</Button>
          </Space>
        </div>
      </Modal>

      <Modal
        open={registrationOpen}
        title='扫码完成企业注册'
        footer={null}
        destroyOnHidden
        onCancel={() => setRegistrationOpen(false)}
      >
        <div className={styles.qrDialog}>
          <QRCodeSVG value={ENTERPRISE_REGISTRATION_URL} size={220} level='M' />
          <p>请使用当前微信扫码，在手机端补全企业账号资料后返回桌面端刷新。</p>
          <Button
            type='primary'
            loading={refreshingMembership}
            disabled={refreshCooldown}
            onClick={() => void refreshMembership()}
          >
            我已完成注册，刷新账号
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default DemandContactCard;
