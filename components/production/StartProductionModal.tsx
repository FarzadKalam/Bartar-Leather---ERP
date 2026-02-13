import React from 'react';
import { Button, InputNumber, Modal, Select, Table } from 'antd';
import { CheckOutlined, RightOutlined } from '@ant-design/icons';
import QrScanPopover from '../QrScanPopover';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export type StartMaterialPiece = {
  key: string;
  name: string;
  length: number;
  width: number;
  quantity: number;
  totalQuantity: number;
  mainUnit: string;
  perItemUsage: number;
  totalUsage: number;
  deliveredQty: number;
};

export type StartMaterialGroup = {
  key: string;
  categoryLabel: string;
  selectedProductId: string | null;
  selectedProductName: string;
  selectedProductCode: string;
  sourceShelfId: string | null;
  productionShelfId: string | null;
  pieces: StartMaterialPiece[];
  totalPerItemUsage: number;
  totalUsage: number;
  totalDeliveredQty: number;
  collapsed: boolean;
  isConfirmed: boolean;
};

interface StartProductionModalProps {
  open: boolean;
  loading: boolean;
  materials: StartMaterialGroup[];
  sourceShelfOptionsByProduct: Record<string, { label: string; value: string }[]>;
  productionShelfOptions: { label: string; value: string }[];
  onCancel: () => void;
  onStart: () => void;
  onToggleGroup: (groupIndex: number, collapsed: boolean) => void;
  onDeliveredChange: (groupIndex: number, pieceIndex: number, value: number | null) => void;
  onSourceShelfChange: (groupIndex: number, shelfId: string | null) => void;
  onSourceShelfScan: (groupIndex: number, shelfId: string) => void;
  onProductionShelfChange: (groupIndex: number, shelfId: string | null) => void;
  onConfirmGroup: (groupIndex: number) => void;
}

const formatQty = (value: number) => toPersianNumber(Math.round((value || 0) * 100) / 100);

const StartProductionModal: React.FC<StartProductionModalProps> = ({
  open,
  loading,
  materials,
  sourceShelfOptionsByProduct,
  productionShelfOptions,
  onCancel,
  onStart,
  onToggleGroup,
  onDeliveredChange,
  onSourceShelfChange,
  onSourceShelfScan,
  onProductionShelfChange,
  onConfirmGroup,
}) => {
  return (
    <Modal
      title="شروع تولید"
      width="min(860px, calc(100vw - 24px))"
      open={open}
      onOk={onStart}
      onCancel={onCancel}
      okText="شروع تولید"
      cancelText="انصراف"
      confirmLoading={loading}
      destroyOnClose
    >
      <div className="space-y-4">
        <div className="text-sm text-gray-700">
          لطفا مقادیر مواد اولیه تحویل شده به خط تولید را وارد کنید.
        </div>

        {materials.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-400">
            موردی ثبت نشده است.
          </div>
        ) : (
          materials.map((group, groupIndex) => {
            const sourceShelfOptions = group.selectedProductId
              ? (sourceShelfOptionsByProduct[group.selectedProductId] || [])
              : [];
            return (
              <div key={group.key} className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-[#8b5e3c] px-3 py-2 text-white flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs">دسته‌بندی: {group.categoryLabel}</div>
                  <div className="text-xs truncate">
                    محصول انتخاب‌شده: {group.selectedProductName || '-'}
                    {group.selectedProductCode ? ` (${group.selectedProductCode})` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {group.isConfirmed && (
                    <span className="text-[11px] bg-white/20 rounded px-2 py-0.5">ثبت شده</span>
                  )}
                  <Button
                    type="text"
                    size="small"
                    className="!text-white hover:!text-white/90"
                    icon={<RightOutlined className={`transition-transform ${group.collapsed ? '' : 'rotate-90'}`} />}
                    onClick={() => onToggleGroup(groupIndex, !group.collapsed)}
                  />
                </div>
              </div>

              {!group.collapsed && (
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
                        width: 180,
                        render: (value: string) => <span className="font-medium">{value}</span>,
                      },
                      {
                        title: 'طول',
                        dataIndex: 'length',
                        key: 'length',
                        width: 80,
                        render: (value: number) => formatQty(value),
                      },
                      {
                        title: 'عرض',
                        dataIndex: 'width',
                        key: 'width',
                        width: 80,
                        render: (value: number) => formatQty(value),
                      },
                      {
                        title: 'تعداد در هر تولید',
                        dataIndex: 'quantity',
                        key: 'quantity',
                        width: 110,
                        render: (value: number) => formatQty(value),
                      },
                      {
                        title: 'تعداد کل',
                        dataIndex: 'totalQuantity',
                        key: 'totalQuantity',
                        width: 90,
                        render: (value: number) => formatQty(value),
                      },
                      {
                        title: 'واحد اصلی',
                        dataIndex: 'mainUnit',
                        key: 'mainUnit',
                        width: 90,
                        render: (value: string) => value || '-',
                      },
                      {
                        title: 'مقدار هر تولید',
                        dataIndex: 'perItemUsage',
                        key: 'perItemUsage',
                        width: 110,
                        render: (value: number) => formatQty(value),
                      },
                      {
                        title: 'مقدار کل',
                        dataIndex: 'totalUsage',
                        key: 'totalUsage',
                        width: 100,
                        render: (value: number) => formatQty(value),
                      },
                      {
                        title: 'مقدار تحویل شده',
                        dataIndex: 'deliveredQty',
                        key: 'deliveredQty',
                        width: 180,
                        render: (value: number, _record: StartMaterialPiece, pieceIndex: number) => (
                          <InputNumber
                            size="large"
                            min={0}
                            value={value}
                            onChange={(nextValue) => onDeliveredChange(groupIndex, pieceIndex, nextValue)}
                            className="w-full persian-number"
                            style={{ minWidth: 140 }}
                          />
                        ),
                      },
                    ]}
                  />

                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                    <div className="text-xs text-gray-600 flex flex-col sm:flex-row gap-4">
                      <span>جمع مصرف هر تولید: <span className="font-medium">{formatQty(group.totalPerItemUsage)}</span></span>
                      <span>جمع مصرف کل: <span className="font-medium">{formatQty(group.totalUsage)}</span></span>
                      <span>جمع مقدار تحویل شده: <span className="font-medium">{formatQty(group.totalDeliveredQty)}</span></span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="text-xs text-gray-500">انتخاب قفسه برداشت</div>
                        <div className="flex items-center gap-2">
                          <Select
                            placeholder="انتخاب قفسه برداشت"
                            value={group.sourceShelfId}
                            onChange={(val) => onSourceShelfChange(groupIndex, val || null)}
                            options={sourceShelfOptions}
                            showSearch
                            optionFilterProp="label"
                            className="w-full"
                            getPopupContainer={() => document.body}
                          />
                          <QrScanPopover
                            label=""
                            buttonProps={{ type: 'default', shape: 'circle' }}
                            onScan={({ moduleId, recordId }) => {
                              if (moduleId === 'shelves' && recordId) onSourceShelfScan(groupIndex, recordId);
                            }}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs text-gray-500">انتخاب قفسه تولید</div>
                        <div className="flex items-center gap-2">
                          <Select
                            placeholder="انتخاب قفسه تولید"
                            value={group.productionShelfId}
                            onChange={(val) => onProductionShelfChange(groupIndex, val || null)}
                            options={productionShelfOptions}
                            showSearch
                            optionFilterProp="label"
                            className="w-full"
                            getPopupContainer={() => document.body}
                          />
                          <QrScanPopover
                            label=""
                            buttonProps={{ type: 'default', shape: 'circle' }}
                            onScan={({ moduleId, recordId }) => {
                              if (moduleId === 'shelves' && recordId) onProductionShelfChange(groupIndex, recordId);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Button
                      size="small"
                      type={group.isConfirmed ? 'default' : 'primary'}
                      icon={<CheckOutlined />}
                      onClick={() => onConfirmGroup(groupIndex)}
                    >
                      ثبت
                    </Button>
                  </div>
                </div>
              )}
            </div>
            );
          })
        )}
      </div>
    </Modal>
  );
};

export default StartProductionModal;
