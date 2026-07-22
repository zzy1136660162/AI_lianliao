import { CheckOne, HeadsetOne, Time, Wifi } from '@icon-park/react';
import { Avatar, Badge, Button, Card, Descriptions, Modal, Tag } from 'antd';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CustomerServiceConnectionState,
  CustomerServiceConversation,
} from '@/common/enterprise/customer-service/contracts';

import styles from './customer-consultation.module.css';

type ServiceProfileCardProps = {
  conversation: CustomerServiceConversation | null;
  connectionState: CustomerServiceConnectionState;
  operationPending: boolean;
  onClose: () => Promise<boolean>;
  onStartNew: () => Promise<void>;
};

const ServiceProfileCard: React.FC<ServiceProfileCardProps> = ({
  conversation,
  connectionState,
  operationPending,
  onClose,
  onStartNew,
}) => {
  const { t } = useTranslation();
  const closed = conversation?.status === 'CLOSED';
  const waiting = conversation?.status === 'WAITING';
  const connected = connectionState === 'CONNECTED';
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const closedAt = conversation?.closedAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(conversation.closedAt)
      )
    : null;

  return (
    <Card className={styles.profileCard} variant='borderless'>
      <div className={styles.profileHeader}>
        <Badge dot color={connected ? '#20b26b' : '#f2a516'} offset={[-4, 42]}>
          <Avatar size={52} icon={<HeadsetOne size={24} />} className={styles.serviceAvatar} />
        </Badge>
        <div>
          <h2>{conversation?.staffName || t('enterprise.consultation.profile.unassigned')}</h2>
          <p>{t('enterprise.consultation.profile.subtitle')}</p>
        </div>
      </div>

      <div className={styles.statusBanner}>
        {closed ? <CheckOne size={16} /> : waiting ? <Time size={16} /> : <Wifi size={16} />}
        <span>
          {t(
            closed
              ? 'enterprise.consultation.status.closed'
              : waiting
                ? 'enterprise.consultation.status.waiting'
                : connected
                  ? 'enterprise.consultation.status.active'
                  : 'enterprise.consultation.status.reconnecting'
          )}
        </span>
      </div>

      <Descriptions className={styles.profileDetails} column={1} size='small' colon={false}>
        <Descriptions.Item label={t('enterprise.consultation.profile.company')}>
          {conversation?.customerCompanyName || t('enterprise.consultation.profile.notProvided')}
        </Descriptions.Item>
        <Descriptions.Item label={t('enterprise.consultation.profile.serviceType')}>
          <Tag color='blue'>{t('enterprise.consultation.profile.realPerson')}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('enterprise.consultation.profile.servicePromise')}>
          {t('enterprise.consultation.profile.promiseText')}
        </Descriptions.Item>
        {closed ? (
          <>
            <Descriptions.Item label={t('enterprise.consultation.closure.closedAt')}>
              {closedAt || t('enterprise.consultation.profile.notProvided')}
            </Descriptions.Item>
            <Descriptions.Item label={t('enterprise.consultation.closure.closedReason')}>
              {conversation.closedReason || t('enterprise.consultation.closure.defaultReason')}
            </Descriptions.Item>
          </>
        ) : null}
      </Descriptions>

      <div className={styles.profileActions}>
        {closed ? (
          <Button type='primary' block loading={operationPending} onClick={() => void onStartNew()}>
            {t('enterprise.consultation.actions.startNew')}
          </Button>
        ) : (
          <Button
            danger
            block
            disabled={!conversation}
            loading={operationPending}
            onClick={() => setCloseConfirmOpen(true)}
          >
            {t('enterprise.consultation.actions.close')}
          </Button>
        )}
      </div>

      <Modal
        open={closeConfirmOpen}
        title={t('enterprise.consultation.closeConfirm.title')}
        okText={t('enterprise.consultation.closeConfirm.confirm')}
        cancelText={t('enterprise.consultation.closeConfirm.cancel')}
        okButtonProps={{ danger: true, loading: operationPending }}
        cancelButtonProps={{ disabled: operationPending }}
        closable={!operationPending}
        mask={{ closable: !operationPending }}
        onCancel={() => setCloseConfirmOpen(false)}
        onOk={async () => {
          if (await onClose()) setCloseConfirmOpen(false);
        }}
      >
        <p>{t('enterprise.consultation.closeConfirm.description')}</p>
      </Modal>
    </Card>
  );
};

export default ServiceProfileCard;
