import React, { useState } from 'react';
import { Alert, App, Button, Modal, Space, Switch } from 'antd';
import { supabase } from '../../supabaseClient';

interface ProductSiteSyncModalProps {
  open: boolean;
  onClose: () => void;
  productId?: string | null;
  isParent?: boolean;
  currentAutoSync?: boolean;
  onSynced?: () => void;
  onAutoSyncChange?: (enabled: boolean) => Promise<void> | void;
}

const ProductSiteSyncModal: React.FC<ProductSiteSyncModalProps> = ({
  open,
  onClose,
  productId,
  isParent = false,
  currentAutoSync = false,
  onSynced,
  onAutoSyncChange,
}) => {
  const { message } = App.useApp();
  const [syncing, setSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(currentAutoSync);

  const handleSync = async (mode: 'upsert' | 'sync_children') => {
    if (!productId) return;
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('woocommerce-sync-product', {
        body: { productId, mode },
      });
      if (error) throw error;
      message.success('همگام‌سازی با سایت انجام شد.');
      await onSynced?.();
      onClose();
    } catch (error: any) {
      message.error(error?.message || 'همگام‌سازی با سایت ناموفق بود.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Modal
      open={open}
      title="همگام‌سازی با WooCommerce"
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <div className="space-y-4">
        <Alert
          type="info"
          showIcon
          message={isParent ? 'محصول مادر به‌همراه متغیرها به سایت ارسال می‌شود.' : 'همین محصول به سایت ارسال می‌شود.'}
        />

        <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <div className="font-medium text-gray-700">همگام‌سازی خودکار</div>
            <div className="text-xs text-gray-500">در صورت فعال بودن، runner زمان‌بندی‌شده این محصول را نیز sync می‌کند.</div>
          </div>
          <Switch
            checked={autoSync}
            onChange={async (checked) => {
              setAutoSync(checked);
              await onAutoSyncChange?.(checked);
            }}
          />
        </div>

        <Space wrap>
          <Button type="primary" loading={syncing} onClick={() => handleSync(isParent ? 'sync_children' : 'upsert')}>
            {isParent ? 'همگام‌سازی محصول و متغیرها' : 'همگام‌سازی محصول'}
          </Button>
          {isParent && (
            <Button loading={syncing} onClick={() => handleSync('upsert')}>
              فقط همگام‌سازی مادر
            </Button>
          )}
        </Space>
      </div>
    </Modal>
  );
};

export default ProductSiteSyncModal;
