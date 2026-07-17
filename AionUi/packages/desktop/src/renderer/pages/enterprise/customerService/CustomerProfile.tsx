import { Button, Empty, Input, Message, Modal, Spin, Tag } from '@arco-design/web-react';
import { CloseOne, Phone, Search, Transfer, User } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CustomerServiceConversation,
  CustomerServiceStaffCandidate,
} from '@/common/enterprise/customer-service/contracts';

import { isCustomerServiceConversationReadOnly } from './customerServiceReducer';
import styles from './customer-service-workbench.module.css';

type CustomerProfileProps = {
  conversation: CustomerServiceConversation | null;
  currentStaffUserId: string;
  operationPending: boolean;
  onLoadCandidates: (keyword?: string) => Promise<CustomerServiceStaffCandidate[]>;
  onTransfer: (targetStaffUserId: string, reason?: string) => Promise<boolean>;
  onClose: (reason?: string) => Promise<boolean>;
};

type ProfileFieldProps = {
  label: string;
  value: string | null | undefined;
  fallback: string;
};

const ProfileField: React.FC<ProfileFieldProps> = ({ label, value, fallback }) => (
  <div className={styles.profileField}>
    <dt>{label}</dt>
    <dd>{value || fallback}</dd>
  </div>
);

/** Shows customer context and guarded lifecycle operations without displaying internal IDs or OpenID. */
const CustomerProfile: React.FC<CustomerProfileProps> = ({
  conversation,
  currentStaffUserId,
  operationPending,
  onLoadCandidates,
  onTransfer,
  onClose,
}) => {
  const { t } = useTranslation();
  const [transferVisible, setTransferVisible] = useState(false);
  const [closeVisible, setCloseVisible] = useState(false);
  const [candidateKeyword, setCandidateKeyword] = useState('');
  const [candidates, setCandidates] = useState<CustomerServiceStaffCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [transferReason, setTransferReason] = useState('');
  const [closeReason, setCloseReason] = useState('');

  const fetchCandidates = useCallback(async () => {
    setCandidateLoading(true);
    try {
      const items = await onLoadCandidates(candidateKeyword);
      setCandidates(items);
    } catch {
      setCandidates([]);
      Message.error(t('enterprise.customerService.errors.candidates'));
    } finally {
      setCandidateLoading(false);
    }
  }, [candidateKeyword, onLoadCandidates, t]);

  useEffect(() => {
    if (transferVisible) void fetchCandidates();
  }, [fetchCandidates, transferVisible]);

  useEffect(() => {
    setTransferVisible(false);
    setCloseVisible(false);
    setSelectedCandidateId(null);
    setTransferReason('');
    setCloseReason('');
  }, [conversation?.conversationId]);

  const handleTransfer = async () => {
    if (!selectedCandidateId) return;
    const succeeded = await onTransfer(selectedCandidateId, transferReason);
    if (succeeded) {
      Message.success(t('enterprise.customerService.transfer.success'));
      setTransferVisible(false);
      setSelectedCandidateId(null);
      setTransferReason('');
    } else {
      Message.error(t('enterprise.customerService.errors.transfer'));
    }
  };

  const handleClose = async () => {
    const succeeded = await onClose(closeReason);
    if (succeeded) {
      Message.success(t('enterprise.customerService.close.success'));
      setCloseVisible(false);
      setCloseReason('');
    } else {
      Message.error(t('enterprise.customerService.errors.close'));
    }
  };

  const unavailable = t('enterprise.customerService.profile.unavailable');
  const readOnly = conversation ? isCustomerServiceConversationReadOnly(conversation, currentStaffUserId) : true;

  return (
    <>
      <aside
        data-testid='customer-service-profile-scroll'
        className={styles.profileScroll}
        style={{ overflowY: 'auto' }}
        aria-label={t('enterprise.customerService.accessibility.profile')}
      >
        {!conversation ? (
          <Empty description={t('enterprise.customerService.profile.empty')} />
        ) : (
          <div className={styles.profileContent}>
            <div className={styles.profileHero}>
              <span className={styles.profileAvatar} aria-hidden='true'>
                <User size={24} />
              </span>
              <div>
                <span className={styles.eyebrow}>{t('enterprise.customerService.profile.currentCustomer')}</span>
                <h2>{conversation.customerName || t('enterprise.customerService.profile.unknownCustomer')}</h2>
                <Tag color={conversation.status === 'ACTIVE' ? 'green' : 'gray'}>
                  {t(`enterprise.customerService.status.${conversation.status.toLocaleLowerCase()}`)}
                </Tag>
              </div>
            </div>

            <section className={styles.profileSection}>
              <h3>{t('enterprise.customerService.profile.customer')}</h3>
              <dl>
                <ProfileField
                  label={t('enterprise.customerService.profile.phone')}
                  value={conversation.customerTel}
                  fallback={unavailable}
                />
                <ProfileField
                  label={t('enterprise.customerService.profile.source')}
                  value={conversation.allocationSource}
                  fallback={unavailable}
                />
              </dl>
              {conversation.customerTel ? (
                <div className={styles.profilePhone}>
                  <Phone size={15} />
                  <span>{conversation.customerTel}</span>
                </div>
              ) : null}
            </section>

            <section className={styles.profileSection}>
              <h3>{t('enterprise.customerService.profile.company')}</h3>
              <dl>
                <ProfileField
                  label={t('enterprise.customerService.profile.companyName')}
                  value={conversation.customerCompanyName}
                  fallback={t('enterprise.customerService.profile.companyUnavailable')}
                />
                <ProfileField
                  label={t('enterprise.customerService.profile.assignedStaff')}
                  value={conversation.staffName}
                  fallback={unavailable}
                />
              </dl>
            </section>

            {conversation.closedReason ? (
              <section className={styles.profileSection}>
                <h3>{t('enterprise.customerService.profile.closedReason')}</h3>
                <p className={styles.profileReason}>{conversation.closedReason}</p>
              </section>
            ) : null}

            <div className={styles.profileActions}>
              <Button long disabled={readOnly} icon={<Transfer size={16} />} onClick={() => setTransferVisible(true)}>
                {t('enterprise.customerService.actions.transfer')}
              </Button>
              <Button
                long
                status='danger'
                disabled={readOnly}
                icon={<CloseOne size={16} />}
                onClick={() => setCloseVisible(true)}
              >
                {t('enterprise.customerService.actions.close')}
              </Button>
            </div>
          </div>
        )}
      </aside>

      <Modal
        visible={transferVisible}
        title={t('enterprise.customerService.transfer.title')}
        okText={t('enterprise.customerService.transfer.confirm')}
        cancelText={t('enterprise.customerService.actions.cancel')}
        confirmLoading={operationPending}
        okButtonProps={{ disabled: !selectedCandidateId }}
        onCancel={() => setTransferVisible(false)}
        onOk={handleTransfer}
      >
        <div className={styles.transferBody}>
          <div className={styles.transferSearch}>
            <Input
              value={candidateKeyword}
              allowClear
              prefix={<Search size={15} />}
              placeholder={t('enterprise.customerService.transfer.searchPlaceholder')}
              onChange={setCandidateKeyword}
              onPressEnter={() => void fetchCandidates()}
            />
            <Button onClick={() => void fetchCandidates()}>{t('enterprise.customerService.actions.search')}</Button>
          </div>
          <div className={styles.candidateList}>
            {candidateLoading ? (
              <Spin />
            ) : candidates.length === 0 ? (
              <Empty description={t('enterprise.customerService.transfer.empty')} />
            ) : (
              candidates.map((candidate) => (
                <Button
                  key={candidate.userId}
                  long
                  type={selectedCandidateId === candidate.userId ? 'primary' : 'outline'}
                  className={styles.candidateItem}
                  onClick={() => setSelectedCandidateId(candidate.userId)}
                >
                  <span>
                    <strong>{candidate.userName || t('enterprise.customerService.profile.staffFallback')}</strong>
                    <small>{candidate.companyName || unavailable}</small>
                  </span>
                  <span>
                    <Tag color={candidate.online ? 'green' : 'gray'}>
                      {candidate.online
                        ? t('enterprise.customerService.profile.online')
                        : t('enterprise.customerService.profile.offline')}
                    </Tag>
                    <small>
                      {t('enterprise.customerService.transfer.activeCount', {
                        count: candidate.activeConversationCount,
                      })}
                    </small>
                  </span>
                </Button>
              ))
            )}
          </div>
          <Input.TextArea
            value={transferReason}
            maxLength={500}
            showWordLimit
            placeholder={t('enterprise.customerService.transfer.reasonPlaceholder')}
            onChange={setTransferReason}
          />
        </div>
      </Modal>

      <Modal
        visible={closeVisible}
        title={t('enterprise.customerService.close.title')}
        okText={t('enterprise.customerService.close.confirm')}
        cancelText={t('enterprise.customerService.actions.cancel')}
        confirmLoading={operationPending}
        onCancel={() => setCloseVisible(false)}
        onOk={handleClose}
      >
        <p>{t('enterprise.customerService.close.description')}</p>
        <Input.TextArea
          value={closeReason}
          maxLength={500}
          showWordLimit
          placeholder={t('enterprise.customerService.close.reasonPlaceholder')}
          onChange={setCloseReason}
        />
      </Modal>
    </>
  );
};

export default CustomerProfile;
