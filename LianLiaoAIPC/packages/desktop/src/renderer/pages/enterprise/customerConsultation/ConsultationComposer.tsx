import { Picture, Send } from '@icon-park/react';
import { Button, Input, Upload } from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CustomerServiceConversation } from '@/common/enterprise/customer-service/contracts';

import styles from './customer-consultation.module.css';

type ConsultationComposerProps = {
  conversation: CustomerServiceConversation | null;
  imageUploading: boolean;
  onSendText: (text: string) => Promise<boolean>;
  onSendImage: (file: File) => Promise<boolean>;
};

/** Keyboard-first customer composer with a renderer-safe binary upload path. */
const ConsultationComposer: React.FC<ConsultationComposerProps> = ({
  conversation,
  imageUploading,
  onSendText,
  onSendImage,
}) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [sendFailed, setSendFailed] = useState(false);
  const disabled = !conversation || conversation.status === 'CLOSED';

  useEffect(() => {
    // A closed transcript and a newly-created conversation must never share a
    // draft that belonged to the previous consultation.
    setValue('');
    setSendFailed(false);
  }, [conversation?.conversationId, conversation?.status]);

  const send = async (): Promise<void> => {
    const text = value.trim();
    if (!text || disabled) return;
    const sent = await onSendText(text);
    setSendFailed(!sent);
    if (sent) setValue('');
  };

  return (
    <section className={styles.composer} aria-label={t('enterprise.consultation.accessibility.composer')}>
      {disabled && conversation ? (
        <p className={styles.composerNotice}>{t('enterprise.consultation.composer.closed')}</p>
      ) : null}
      {sendFailed ? <p className={styles.composerError}>{t('enterprise.consultation.errors.send')}</p> : null}
      <Input.TextArea
        value={value}
        disabled={disabled}
        placeholder={t('enterprise.consultation.composer.placeholder')}
        autoSize={{ minRows: 2, maxRows: 4 }}
        maxLength={2_000}
        showCount
        styles={{
          root: { position: 'relative' },
          textarea: {
            paddingBlockEnd: 26,
            paddingInlineEnd: 72,
            userSelect: 'text',
            WebkitUserSelect: 'text',
          },
          count: {
            position: 'absolute',
            zIndex: 1,
            bottom: 6,
            insetInlineEnd: 10,
            paddingLeft: 8,
            borderRadius: 4,
            background: 'var(--enterprise-surface)',
            fontSize: 12,
            lineHeight: '18px',
            pointerEvents: 'none',
          },
        }}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className={styles.composerActions}>
        <Upload
          accept='image/gif,image/jpeg,image/png,image/webp'
          disabled={disabled || imageUploading}
          showUploadList={false}
          beforeUpload={(file) => {
            void onSendImage(file);
            return Upload.LIST_IGNORE;
          }}
        >
          <Button type='text' disabled={disabled} loading={imageUploading} icon={<Picture size={17} />}>
            {t('enterprise.consultation.composer.image')}
          </Button>
        </Upload>
        <span>{t('enterprise.consultation.composer.hint')}</span>
        <Button
          type='primary'
          disabled={disabled || !value.trim()}
          icon={<Send size={16} />}
          onClick={() => void send()}
        >
          {t('enterprise.consultation.composer.send')}
        </Button>
      </div>
    </section>
  );
};

export default ConsultationComposer;
