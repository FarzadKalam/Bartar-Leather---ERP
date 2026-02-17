import React from 'react';
import { Button, InputNumber, Modal, Select, Table } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persianFa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorianEn from 'react-date-object/locales/gregorian_en';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import QrScanPopover from '../QrScanPopover';

export type StageHandoverPiece = {
  key: string;
  name: string;
  length: number;
  width: number;
  quantity: number;
  totalQuantity: number;
  mainUnit: string;
  subUnit: string;
  subUsage: number;
  sourceQty: number;
  handoverQty: number;
};

export type StageHandoverGroup = {
  key: string;
  rowIndex: number;
  categoryLabel: string;
  selectedProductId: string | null;
  selectedProductName: string;
  selectedProductCode: string;
  sourceShelfId: string | null;
  targetShelfId: string | null;
  pieces: StageHandoverPiece[];
  totalSourceQty: number;
  totalHandoverQty: number;
};

export type StageHandoverConfirm = {
  confirmed: boolean;
  userName?: string | null;
  userId?: string | null;
  at?: string | null;
};

interface TaskHandoverModalProps {
  open: boolean;
  loading: boolean;
  locked?: boolean;
  taskName: string;
  sourceStageName: string;
  giverName: string;
  receiverName: string;
  groups: StageHandoverGroup[];
  shelfOptions: { label: string; value: string }[];
  targetShelfId: string | null;
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  onCancel: () => void;
  onSave: () => void;
  onQtyChange: (groupIndex: number, pieceIndex: number, value: number | null) => void;
  onTargetShelfChange: (shelfId: string | null) => void;
  onTargetShelfScan: (shelfId: string) => void;
  onConfirmGiver: () => void;
  onConfirmReceiver: () => void;
}

const toQty = (value: number) => {
  const rounded = Math.round((value || 0) * 100) / 100;
  return toPersianNumber(rounded);
};

const formatDateTime = (raw: string | null | undefined) => {
  if (!raw) return '-';
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '-';
    return new DateObject({
      date,
      calendar: gregorian,
      locale: gregorianEn,
    })
      .convert(persian, persianFa)
      .format('YYYY/MM/DD HH:mm');
  } catch {
    return '-';
  }
};

const TaskHandoverModal: React.FC<TaskHandoverModalProps> = ({
  open,
  loading,
  locked = false,
  taskName,
  sourceStageName,
  giverName,
  receiverName,
  groups,
  shelfOptions,
  targetShelfId,
  giverConfirmation,
  receiverConfirmation,
  onCancel,
  onSave,
  onQtyChange,
  onTargetShelfChange,
  onTargetShelfScan,
  onConfirmGiver,
  onConfirmReceiver,
}) => {
  return (
    <Modal
      title="فرم تحویل کالا"
      width="min(980px, calc(100vw - 24px))"
      open={open}
      onCancel={onCancel}
      confirmLoading={loading}
      destroyOnClose
      footer={[
        <Button key="cancel" onClick={onCancel}>
          انصراف
        </Button>,
        <Button key="save" type="primary" loading={loading} onClick={onSave}>
          ثبت فرم
        </Button>,
      ]}
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-700">
          مقادیر تحویل از مرحله "{sourceStageName}" به مرحله "{taskName}" را ثبت کنید.
        </div>

        {groups.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
            موردی برای تحویل ثبت نشده است.
          </div>
        ) : (
          groups.map((group, groupIndex) => (
            <div key={group.key} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-[#8b5e3c] px-3 py-2 text-white text-xs">
                <div>دسته‌بندی: {group.categoryLabel || '-'}</div>
                <div className="truncate">
                  محصول: {group.selectedProductName || '-'}
                  {group.selectedProductCode ? ` (${group.selectedProductCode})` : ''}
                </div>
              </div>
              <div className="p-3">
                <Table
                  size="small"
                  pagination={false}
                  dataSource={group.pieces}
                  rowKey="key"
                  scroll={{ x: true }}
                  columns={[
                    {
                      title: 'نام قطعه',
                      dataIndex: 'name',
                      key: 'name',
                      width: 170,
                      render: (value: string) => <span className="font-medium">{value || '-'}</span>,
                    },
                    {
                      title: 'طول',
                      dataIndex: 'length',
                      key: 'length',
                      width: 70,
                      render: (value: number) => toQty(value),
                    },
                    {
                      title: 'عرض',
                      dataIndex: 'width',
                      key: 'width',
                      width: 70,
                      render: (value: number) => toQty(value),
                    },
                    {
                      title: 'تعداد در یک تولید',
                      dataIndex: 'quantity',
                      key: 'quantity',
                      width: 100,
                      render: (value: number) => toQty(value),
                    },
                    {
                      title: 'تعداد کل',
                      dataIndex: 'totalQuantity',
                      key: 'totalQuantity',
                      width: 90,
                      render: (value: number) => toQty(value),
                    },
                    {
                      title: 'واحد اصلی',
                      dataIndex: 'mainUnit',
                      key: 'mainUnit',
                      width: 90,
                      render: (value: string) => value || '-',
                    },
                    {
                      title: 'واحد فرعی',
                      dataIndex: 'subUnit',
                      key: 'subUnit',
                      width: 90,
                      render: (value: string) => value || '-',
                    },
                    {
                      title: 'مقدار واحد فرعی',
                      dataIndex: 'subUsage',
                      key: 'subUsage',
                      width: 120,
                      render: (value: number) => toQty(value),
                    },
                    {
                      title: 'مقدار دریافتی',
                      dataIndex: 'sourceQty',
                      key: 'sourceQty',
                      width: 120,
                      render: (value: number) => toQty(value),
                    },
                    {
                      title: `مقدار تحویل شده به ${taskName}`,
                      dataIndex: 'handoverQty',
                      key: 'handoverQty',
                      width: 180,
                      render: (value: number, _record: StageHandoverPiece, pieceIndex: number) => (
                        <InputNumber
                          min={0}
                          value={value}
                          onChange={(nextValue) => onQtyChange(groupIndex, pieceIndex, nextValue)}
                          className="w-full persian-number"
                          style={{ minWidth: 140 }}
                          controls={false}
                          disabled={locked}
                        />
                      ),
                    },
                  ]}
                />
                <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-4">
                  <span>
                    جمع دریافتی: <span className="font-medium">{toQty(group.totalSourceQty)}</span>
                  </span>
                  <span>
                    جمع تحویل شده: <span className="font-medium">{toQty(group.totalHandoverQty)}</span>
                  </span>
                </div>
              </div>
            </div>
          ))
        )}

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <div className="text-xs text-gray-500">
            قفسه مرحله <span className="font-black text-[#8b5e3c]">"{taskName}"</span>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={targetShelfId}
              onChange={(value) => onTargetShelfChange(value || null)}
              options={shelfOptions}
              showSearch
              optionFilterProp="label"
              placeholder="انتخاب قفسه مرحله"
              className="w-full"
              getPopupContainer={() => document.body}
              disabled={locked}
            />
            <QrScanPopover
              label=""
              buttonProps={{ type: 'default', shape: 'circle', disabled: locked }}
              onScan={({ moduleId, recordId }) => {
                if (moduleId === 'shelves' && recordId) onTargetShelfScan(recordId);
              }}
            />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <div className="text-xs text-gray-700">
            تحویل‌دهنده: <span className="font-medium">{giverName || '-'}</span>
          </div>
          <div className="text-xs text-gray-700">
            تحویل‌گیرنده: <span className="font-medium">{receiverName || '-'}</span>
          </div>
          <div className="flex flex-col md:flex-row gap-2">
            {giverConfirmation.confirmed ? (
              <div className="text-xs rounded border border-green-200 bg-green-50 text-green-700 px-3 py-2">
                {giverConfirmation.userName || 'کاربر'} مقادیر فوق را در {toPersianNumber(formatDateTime(giverConfirmation.at || null))} تحویل داده است.
              </div>
            ) : (
              <Button icon={<CheckOutlined />} onClick={onConfirmGiver} loading={loading}>
                مقادیر فوق را تحویل دادم
              </Button>
            )}
            {receiverConfirmation.confirmed ? (
              <div className="text-xs rounded border border-blue-200 bg-blue-50 text-blue-700 px-3 py-2">
                {receiverConfirmation.userName || 'کاربر'} مقادیر فوق را در {toPersianNumber(formatDateTime(receiverConfirmation.at || null))} تحویل گرفته است.
              </div>
            ) : (
              <Button type="primary" icon={<CheckOutlined />} onClick={onConfirmReceiver} loading={loading}>
                مقادیر فوق را تحویل گرفتم
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TaskHandoverModal;

