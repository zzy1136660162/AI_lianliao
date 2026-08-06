import { Button, Input, Message, Upload } from '@arco-design/web-react';
import { Picture, Send } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { CustomerServiceConversation } from '@/common/enterprise/customer-service/contracts';

import { isCustomerServiceConversationReadOnly } from './customerServiceReducer';
import styles from './customer-service-workbench.module.css';

type MessageComposerProps = {
  conversation: CustomerServiceConversation | null;
  currentStaffUserId: string;
  value: string;
  onChange: (value: string) => void;
  onSendText: (text: string) => Promise<boolean>;
  onSendImage: (file: File) => Promise<boolean>;
  imageUploading: boolean;
};

/** Provides keyboard-first text replies and renderer-safe image upload through the injected client. */
const MessageComposer: React.FC<MessageComposerProps> = ({
  conversation,
  currentStaffUserId,
  value,
  onChange,
  onSendText,
  onSendImage,
  imageUploading,
}) => {
  const { t } = useTranslation();
  const readOnly = !conversation || isCustomerServiceConversationReadOnly(conversation, currentStaffUserId);

  const handleSend = async () => {
    const content = value.trim();
    if (!content || readOnly) return;
    const sent = await onSendText(content);
    if (sent) {
      onChange('');
    } else {
      Message.error(t('enterprise.customerService.errors.send'));
    }
  };

  const readOnlyMessage =
    conversation?.status === 'CLOSED'
      ? t('enterprise.customerService.composer.closed')
      : t('enterprise.customerService.composer.transferred');

  return (
    <section className={styles.composer} aria-label={t('enterprise.customerService.accessibility.composer')}>
      {readOnly && conversation ? <p className={styles.composerNotice}>{readOnlyMessage}</p> : null}
      <Input.TextArea
        value={value}
        disabled={readOnly}
        placeholder={t('enterprise.customerService.composer.placeholder')}
        rows={3}
        maxLength={2_000}
        showWordLimit
        style={{
          paddingBlockEnd: 26,
          paddingInlineEnd: 72,
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
        wrapperStyle={{ position: 'relative' }}
        onChange={onChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void handleSend();
          }
        }}
      />
      <div className={styles.composerActions}>
        <Upload
          accept='.png,.jpg,.jpeg,.gif,.webp'
          disabled={readOnly || imageUploading}
          showUploadList={false}
          customRequest={({ file, onSuccess, onError }) => {
            void onSendImage(file).then((sent) => {
              if (sent) {
                onSuccess();
              } else {
                onError();
                Message.error(t('enterprise.customerService.errors.upload'));
              }
            });
          }}
        >
          <Button
            type='text'
            disabled={readOnly}
            loading={imageUploading}
            icon={imageUploading ? undefined : <Picture size={17} />}
          >
            {t('enterprise.customerService.composer.image')}
          </Button>
        </Upload>
        <span className={styles.composerHint}>{t('enterprise.customerService.composer.hint')}</span>
        <Button
          type='primary'
          disabled={readOnly || !value.trim()}
          icon={<Send size={16} />}
          onClick={() => void handleSend()}
        >
          {t('enterprise.customerService.composer.send')}
        </Button>
      </div>
    </section>
  );
};

export default MessageComposer;
