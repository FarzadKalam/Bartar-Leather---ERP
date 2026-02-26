import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, InputNumber, Modal, Select, Table } from 'antd';
import { CopyOutlined, DeleteOutlined, PlusOutlined, RightOutlined, SaveOutlined, SwapOutlined } from '@ant-design/icons';
import QrScanPopover from '../QrScanPopover';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { HARD_CODED_UNIT_OPTIONS } from '../../utils/unitConversions';

export type StartMaterialPiece = {
  key: string;
  name: string;
  length: number;
  width: number;
  quantity: number;
  totalQuantity: number;
  mainUnit: string;
  subUnit: string;
  subUsage: number;
  perItemUsage: number;
  totalUsage: number;
};

export type StartMaterialDeliveryRow = {
  key: string;
  pieceKey?: string;
  name: string;
  length: number;
  width: number;
  quantity: number;
  mainUnit: string;
  subUnit: string;
  deliveredQty: number;
};

export type StartMaterialOrderRequirement = {
  orderId: string;
  orderName: string;
  orderCode: string;
  rowIndex?: number;
  rowKey?: string;
  pieces: StartMaterialPiece[];
  totalPerItemUsage: number;
  totalUsage: number;
};

export type StartMaterialGroup = {
  key: string;
  rowIndex: number;
  categoryLabel: string;
  selectedProductId: string | null;
  selectedProductName: string;
  selectedProductCode: string;
  sourceShelfId: string | null;
  productionShelfId: string | null;
  pieces: StartMaterialPiece[];
  deliveryRows: StartMaterialDeliveryRow[];
  totalPerItemUsage: number;
  totalUsage: number;
  totalDeliveredQty: number;
  collapsed: boolean;
  isConfirmed: boolean;
  orderRequirements?: StartMaterialOrderRequirement[];
  targetStageTaskId?: string | null;
  previousDeliveryRows?: StartMaterialDeliveryRow[];
  previousDeliveredQty?: number;
};

interface StartProductionModalProps {
  open: boolean;
  loading: boolean;
  materials: StartMaterialGroup[];
  inline?: boolean;
  orderName?: string;
  sourceShelfOptionsByProduct: Record<string, { label: string; value: string; stock?: number }[]>;
  productionShelfOptions: { label: string; value: string }[];
  productionStageOptions?: { label: string; value: string; orderId?: string; shelfId?: string | null }[];
  productionTargetType?: 'shelf' | 'stage';
  hideSourceShelfSelector?: boolean;
  readonlyUnitFields?: boolean;
  onCancel: () => void;
  onStart: () => void;
  onToggleGroup: (groupIndex: number, collapsed: boolean) => void;
  onDeliveryRowAdd: (groupIndex: number) => void;
  onDeliveryRowsDelete: (groupIndex: number, rowKeys: string[]) => void;
  onDeliveryRowsTransfer: (
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => void;
  onDeliveryRowFieldChange: (
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StartMaterialDeliveryRow, 'key'>,
    value: any
  ) => void;
  onSourceShelfChange: (groupIndex: number, shelfId: string | null) => void;
  onSourceShelfScan: (groupIndex: number, shelfId: string) => void;
  onProductionShelfChange: (groupIndex: number, shelfId: string | null) => void;
  onProductionStageChange?: (groupIndex: number, stageTaskId: string | null) => void;
  onConfirmGroup: (groupIndex: number) => void;
}

const toEnglishDigits = (value: any) =>
  String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const normalizeNumberInput = (value: any) =>
  toEnglishDigits(value).replace(/,/g, '').replace(/\u066C/g, '').trim();

const addCommas = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatGroupedInput = (value: any) => {
  const raw = normalizeNumberInput(value);
  if (!raw) return '';
  const sign = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/-/g, '');
  const [intPartRaw, decimalPart] = unsigned.split('.');
  const intPart = (intPartRaw || '0').replace(/^0+(?=\d)/, '');
  const grouped = addCommas(intPart || '0');
  const withDecimal = decimalPart !== undefined ? `${grouped}.${decimalPart}` : grouped;
  return toPersianNumber(`${sign}${withDecimal}`);
};

const parseNumberInput = (value: any) => {
  const normalized = normalizeNumberInput(value);
  if (!normalized) return 0;
  const sanitized = normalized.replace(/[^0-9.\-]/g, '');
  if (!sanitized || sanitized === '-' || sanitized === '.' || sanitized === '-.') return 0;
  const parsed = parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatQty = (value: number) => {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return formatGroupedInput(rounded);
};

const calcDeliveredQty = (row?: Partial<StartMaterialDeliveryRow> | null) => {
  const length = parseNumberInput((row as any)?.length);
  const width = parseNumberInput((row as any)?.width);
  const quantity = parseNumberInput((row as any)?.quantity);
  return Math.max(0, length * width * quantity);
};

const getUnitSummaryLabel = (units: Array<string | null | undefined>) => {
  const unique = Array.from(
    new Set(
      units
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
  if (!unique.length) return '';
  if (unique.length === 1) return unique[0];
  return 'واحدهای مختلف';
};

const StartProductionModal: React.FC<StartProductionModalProps> = ({
  open,
  loading,
  materials,
  inline = false,
  orderName,
  sourceShelfOptionsByProduct,
  productionShelfOptions,
  productionStageOptions = [],
  productionTargetType = 'shelf',
  hideSourceShelfSelector = false,
  readonlyUnitFields = false,
  onCancel,
  onStart,
  onToggleGroup,
  onDeliveryRowAdd,
  onDeliveryRowsDelete,
  onDeliveryRowsTransfer,
  onDeliveryRowFieldChange,
  onSourceShelfChange,
  onSourceShelfScan,
  onProductionShelfChange,
  onProductionStageChange,
  onConfirmGroup,
}) => {
  const [selectedRowKeysByGroup, setSelectedRowKeysByGroup] = useState<Record<string, string[]>>({});
  const [transferDialog, setTransferDialog] = useState<{
    sourceGroupIndex: number;
    rowKeys: string[];
    mode: 'copy' | 'move';
  } | null>(null);
  const [transferTargetGroupIndex, setTransferTargetGroupIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    setSelectedRowKeysByGroup((prev) => {
      const next: Record<string, string[]> = {};
      materials.forEach((group) => {
        const allowed = new Set((group.deliveryRows || []).map((row) => String(row.key)));
        const current = prev[group.key] || [];
        const filtered = current.filter((key) => allowed.has(String(key)));
        if (filtered.length > 0) next[group.key] = filtered;
      });
      return next;
    });
  }, [materials]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const transferTargets = useMemo(
    () => materials.map((group, index) => ({
      value: index,
      label: `${group.selectedProductName || '-'}${group.selectedProductCode ? ` (${group.selectedProductCode})` : ''}`,
    })),
    [materials]
  );

  const getSelectedRowKeys = (groupKey: string) => selectedRowKeysByGroup[groupKey] || [];

  const setSelectedRowKeys = (groupKey: string, rowKeys: string[]) => {
    setSelectedRowKeysByGroup((prev) => ({ ...prev, [groupKey]: rowKeys }));
  };

  const openTransferDialog = (sourceGroupIndex: number, rowKeys: string[], mode: 'copy' | 'move') => {
    if (!rowKeys.length) return;
    setTransferDialog({ sourceGroupIndex, rowKeys, mode });
    setTransferTargetGroupIndex(sourceGroupIndex);
  };

  const confirmTransferRows = () => {
    if (!transferDialog) return;
    if (transferTargetGroupIndex === null || transferTargetGroupIndex < 0) return;
    onDeliveryRowsTransfer(
      transferDialog.sourceGroupIndex,
      transferDialog.rowKeys,
      transferTargetGroupIndex,
      transferDialog.mode
    );
    const sourceGroup = materials[transferDialog.sourceGroupIndex];
    if (sourceGroup) {
      setSelectedRowKeys(sourceGroup.key, []);
    }
    setTransferDialog(null);
    setTransferTargetGroupIndex(null);
  };

  const handleDeliveryRowKeyDown = (e: React.KeyboardEvent<HTMLElement>, groupIndex: number) => {
    const isSaveShortcut = e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey;
    if (isSaveShortcut) {
      e.preventDefault();
      e.stopPropagation();
      onConfirmGroup(groupIndex);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      const key = materials[groupIndex]?.key;
      if (key) setSelectedRowKeys(key, []);
      onToggleGroup(groupIndex, true);
    }
  };

  const handleDeliveryNumericKeyDown = (e: React.KeyboardEvent<HTMLElement>, groupIndex: number) => {
    if (!(e.ctrlKey || e.metaKey || e.altKey)) {
      const allowedKeys = new Set([
        'Backspace',
        'Delete',
        'Tab',
        'Enter',
        'Escape',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Home',
        'End',
        '.',
        ',',
        '-',
      ]);
      const key = e.key;
      const isDigit = /^[0-9]$/.test(key) || /^[۰-۹]$/.test(key) || /^[٠-٩]$/.test(key);
      if (!isDigit && !allowedKeys.has(key)) {
        e.preventDefault();
      }
    }
    handleDeliveryRowKeyDown(e, groupIndex);
  };

  const bodyContent = (
    <>
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
            const selectedRowKeys = getSelectedRowKeys(group.key);
            const consumptionUnitLabel = getUnitSummaryLabel((group.pieces || []).map((piece) => piece.mainUnit));
            const deliveryUnitLabel = getUnitSummaryLabel((group.deliveryRows || []).map((row) => row.mainUnit)) || consumptionUnitLabel;
            const hasDeliveryRows = Array.isArray(group.deliveryRows) && group.deliveryRows.length > 0;
            const previousDeliveryRows = Array.isArray(group.previousDeliveryRows) ? group.previousDeliveryRows : [];
            const previousDeliveredQty = Math.max(
              0,
              parseNumberInput(group.previousDeliveredQty ?? previousDeliveryRows.reduce((sum, row) => sum + calcDeliveredQty(row), 0))
            );
            const totalDeliveredWithHistory = previousDeliveredQty + Math.max(0, parseNumberInput(group.totalDeliveredQty));

            const headerToneClass = hasDeliveryRows
              ? 'bg-[#8b5e3c] text-white shadow-sm'
              : 'bg-white text-[#6f4a2d] border-b border-dashed border-[#b8895a]';
            const headerButtonClass = hasDeliveryRows
              ? '!text-white hover:!text-white/90'
              : '!text-[#6f4a2d] hover:!text-[#8b5e3c]';
            const containerClass = hasDeliveryRows
              ? 'rounded-xl border border-gray-200'
              : 'rounded-xl border-2 border-dashed border-[#b8895a] bg-white';
            const headerMetaClass = hasDeliveryRows ? 'text-white/90' : 'text-[#8b5e3c]';

            return (
              <div key={group.key} className={containerClass}>
                <div className={`sticky top-0 z-30 px-3 py-2 flex items-center justify-between gap-2 ${headerToneClass}`}>
                  <div className="min-w-0">
                    <div className="text-xs">دسته‌بندی: {group.categoryLabel}</div>
                    <div className="text-xs truncate">
                      محصول انتخاب‌شده: {group.selectedProductName || '-'}
                      {group.selectedProductCode ? ` (${group.selectedProductCode})` : ''}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${headerMetaClass}`}>
                      مورد نیاز کل: <span className="font-semibold">{formatQty(group.totalUsage || 0)}</span>
                      {consumptionUnitLabel ? <span className="font-semibold mr-1">{consumptionUnitLabel}</span> : null}
                      <span className="mx-1">|</span>
                      تحویل شده کل: <span className="font-semibold">{formatQty(totalDeliveredWithHistory)}</span>
                      {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="text"
                      size="small"
                      className={headerButtonClass}
                      icon={<SaveOutlined />}
                      onClick={() => onConfirmGroup(groupIndex)}
                    />
                    {group.isConfirmed && (
                      <span className={`text-[11px] rounded px-2 py-0.5 ${hasDeliveryRows ? 'bg-white/20' : 'bg-[#f7efe7]'}`}>ثبت شده</span>
                    )}
                    <Button
                      type="text"
                      size="small"
                      className={headerButtonClass}
                      icon={<RightOutlined className={`transition-transform ${group.collapsed ? '' : 'rotate-90'}`} />}
                      onClick={() => onToggleGroup(groupIndex, !group.collapsed)}
                    />
                  </div>
                </div>

                {!group.collapsed && (
                  <div className="p-3">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      <div className="space-y-3">
                    <div className="text-xs font-semibold text-[#6f4a2d]">قطعات سفارش تولید:</div>
                    {Array.isArray(group.orderRequirements) && group.orderRequirements.length > 0 && (
                      <div className="mb-4 space-y-3">
                        {group.orderRequirements.map((requirement, reqIndex) => {
                          const reqUnitLabel = getUnitSummaryLabel((requirement.pieces || []).map((piece) => piece.mainUnit));
                          return (
                            <div key={`${group.key}_req_${reqIndex}`} className="rounded-lg border border-[#d8c8b8] bg-[#fcf7f1] p-2">
                              <div className="text-xs font-medium text-[#6f4a2d] mb-2">
                                قطعات مواد اولیه برای سفارش تولید "{requirement.orderName || '-'}{requirement.orderCode ? ` (${requirement.orderCode})` : ''}"
                              </div>
                              <Table
                                size="small"
                                pagination={false}
                                dataSource={requirement.pieces || []}
                                rowKey="key"
                                scroll={{ x: true }}
                                columns={[
                                  {
                                    title: 'نام قطعه',
                                    dataIndex: 'name',
                                    key: 'name',
                                    width: 170,
                                    render: (value: string) => <span className="font-medium">{value}</span>,
                                  },
                                  {
                                    title: 'طول',
                                    dataIndex: 'length',
                                    key: 'length',
                                    width: 90,
                                    render: (value: number) => formatQty(value),
                                  },
                                  {
                                    title: 'عرض',
                                    dataIndex: 'width',
                                    key: 'width',
                                    width: 90,
                                    render: (value: number) => formatQty(value),
                                  },
                                  {
                                    title: 'تعداد در هر تولید',
                                    dataIndex: 'quantity',
                                    key: 'quantity',
                                    width: 120,
                                    render: (value: number) => formatQty(value),
                                  },
                                  {
                                    title: 'تعداد کل',
                                    dataIndex: 'totalQuantity',
                                    key: 'totalQuantity',
                                    width: 100,
                                    render: (value: number) => formatQty(value),
                                  },
                                  {
                                    title: 'واحد اصلی',
                                    dataIndex: 'mainUnit',
                                    key: 'mainUnit',
                                    width: 100,
                                    render: (value: string) => value || '-',
                                  },
                                  {
                                    title: 'واحد فرعی',
                                    dataIndex: 'subUnit',
                                    key: 'subUnit',
                                    width: 100,
                                    render: (value: string) => value || '-',
                                  },
                                  {
                                    title: 'مقدار واحد فرعی',
                                    dataIndex: 'subUsage',
                                    key: 'subUsage',
                                    width: 130,
                                    render: (value: number) => formatQty(value),
                                  },
                                  {
                                    title: 'مقدار هر تولید',
                                    dataIndex: 'perItemUsage',
                                    key: 'perItemUsage',
                                    width: 130,
                                    render: (value: number) => formatQty(value),
                                  },
                                  {
                                    title: 'مقدار کل',
                                    dataIndex: 'totalUsage',
                                    key: 'totalUsage',
                                    width: 120,
                                    render: (value: number) => formatQty(value),
                                  },
                                ]}
                              />
                              <div className="mt-2 text-xs text-gray-600 flex flex-col sm:flex-row gap-4">
                                <span>
                                  جمع مصرف هر تولید: <span className="font-medium">{formatQty(requirement.totalPerItemUsage || 0)}</span>
                                  {reqUnitLabel ? <span className="font-medium mr-1">{reqUnitLabel}</span> : null}
                                </span>
                                <span>
                                  جمع مصرف کل: <span className="font-medium">{formatQty(requirement.totalUsage || 0)}</span>
                                  {reqUnitLabel ? <span className="font-medium mr-1">{reqUnitLabel}</span> : null}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {Array.isArray(group.orderRequirements) && group.orderRequirements.length > 1 ? (
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
                            width: 90,
                            render: (value: number) => formatQty(value),
                          },
                          {
                            title: 'عرض',
                            dataIndex: 'width',
                            key: 'width',
                            width: 90,
                            render: (value: number) => formatQty(value),
                          },
                          {
                            title: 'تعداد در هر تولید',
                            dataIndex: 'quantity',
                            key: 'quantity',
                            width: 120,
                            render: (value: number) => formatQty(value),
                          },
                          {
                            title: 'تعداد کل',
                            dataIndex: 'totalQuantity',
                            key: 'totalQuantity',
                            width: 100,
                            render: (value: number) => formatQty(value),
                          },
                          {
                            title: 'واحد اصلی',
                            dataIndex: 'mainUnit',
                            key: 'mainUnit',
                            width: 100,
                            render: (value: string) => value || '-',
                          },
                          {
                            title: 'واحد فرعی',
                            dataIndex: 'subUnit',
                            key: 'subUnit',
                            width: 100,
                            render: (value: string) => value || '-',
                          },
                          {
                            title: 'مقدار واحد فرعی',
                            dataIndex: 'subUsage',
                            key: 'subUsage',
                            width: 130,
                            render: (value: number) => formatQty(value),
                          },
                          {
                            title: 'مقدار هر تولید',
                            dataIndex: 'perItemUsage',
                            key: 'perItemUsage',
                            width: 130,
                            render: (value: number) => formatQty(value),
                          },
                          {
                            title: 'مقدار کل',
                            dataIndex: 'totalUsage',
                            key: 'totalUsage',
                            width: 120,
                            render: (value: number) => formatQty(value),
                          },
                        ]}
                      />
                    ) : null}
                      </div>

                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                      <div className="text-xs font-semibold text-[#6f4a2d]">قطعات تحویل شده</div>
                      <div className="text-xs text-gray-600 flex flex-col sm:flex-row gap-4">
                        <span>
                          جمع مصرف مورد نیاز هر تولید: <span className="font-medium">{formatQty(group.totalPerItemUsage)}</span>
                          {consumptionUnitLabel ? <span className="font-medium mr-1">{consumptionUnitLabel}</span> : null}
                        </span>
                        <span className="text-[#8b5e3c] font-semibold">
                          جمع مصرف مورد نیاز کل: <span className="font-bold">{formatQty(group.totalUsage)}</span>
                          {consumptionUnitLabel ? <span className="font-bold mr-1">{consumptionUnitLabel}</span> : null}
                        </span>
                      </div>

                      <div className={`rounded-lg p-3 space-y-3 ${hasDeliveryRows ? 'border border-[#c9b29a] bg-[#f7f1ea]' : 'border border-dashed border-[#b8895a] bg-white'}`}>
                        <div className="text-xs font-medium text-[#6f4a2d]">
                          از محصول "{group.selectedProductName || '-'}" برای سفارش تولید "{orderName || '-'}" چه مقدار تحویل می دهید؟
                        </div>

                        {previousDeliveryRows.length > 0 ? (
                          <div className="rounded-lg border border-blue-100 bg-blue-50 p-2">
                            <div className="text-[11px] text-blue-800 mb-1">
                              مقادیر تحویل‌شده قبلی (غیرقابل تغییر)
                            </div>
                            <Table
                              size="small"
                              pagination={false}
                              dataSource={previousDeliveryRows}
                              rowKey="key"
                              scroll={{ x: true }}
                              columns={[
                                {
                                  title: 'نام قطعه',
                                  dataIndex: 'name',
                                  key: 'name',
                                  width: 180,
                                  render: (value: string) => <span className="font-medium">{value || '-'}</span>,
                                },
                                {
                                  title: 'طول',
                                  dataIndex: 'length',
                                  key: 'length',
                                  width: 90,
                                  render: (value: number) => formatQty(value),
                                },
                                {
                                  title: 'عرض',
                                  dataIndex: 'width',
                                  key: 'width',
                                  width: 90,
                                  render: (value: number) => formatQty(value),
                                },
                                {
                                  title: 'تعداد',
                                  dataIndex: 'quantity',
                                  key: 'quantity',
                                  width: 90,
                                  render: (value: number) => formatQty(value),
                                },
                                {
                                  title: 'واحد اصلی',
                                  dataIndex: 'mainUnit',
                                  key: 'mainUnit',
                                  width: 110,
                                  render: (value: string) => <span className="text-gray-700">{value || '-'}</span>,
                                },
                                {
                                  title: 'واحد فرعی',
                                  dataIndex: 'subUnit',
                                  key: 'subUnit',
                                  width: 110,
                                  render: (value: string) => <span className="text-gray-700">{value || '-'}</span>,
                                },
                                {
                                  title: 'مقدار تحویل شده',
                                  dataIndex: 'deliveredQty',
                                  key: 'deliveredQty',
                                  width: 140,
                                  render: (_value: number, record: StartMaterialDeliveryRow) => (
                                    <span className="font-semibold text-[#6f4a2d]">{formatQty(calcDeliveredQty(record))}</span>
                                  ),
                                },
                              ]}
                            />
                            <div className="mt-2 text-[11px] text-blue-900">
                              جمع مقادیر تحویل شده قبلی: <span className="font-semibold">{formatQty(previousDeliveredQty)}</span>
                              {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2 flex-wrap">
                          <Button type="dashed" icon={<PlusOutlined />} onClick={() => onDeliveryRowAdd(groupIndex)}>
                            افزودن ردیف تحویل
                          </Button>
                          <Button
                            icon={<DeleteOutlined />}
                            danger
                            disabled={selectedRowKeys.length === 0}
                            onClick={() => onDeliveryRowsDelete(groupIndex, selectedRowKeys)}
                          >
                            حذف
                          </Button>
                          <Button
                            icon={<CopyOutlined />}
                            disabled={selectedRowKeys.length === 0}
                            onClick={() => openTransferDialog(groupIndex, selectedRowKeys, 'copy')}
                          >
                            کپی
                          </Button>
                          <Button
                            icon={<SwapOutlined />}
                            disabled={selectedRowKeys.length === 0}
                            onClick={() => openTransferDialog(groupIndex, selectedRowKeys, 'move')}
                          >
                            جابجایی
                          </Button>
                        </div>

                        <Table
                          size={isMobile ? 'middle' : 'small'}
                          pagination={false}
                          dataSource={group.deliveryRows || []}
                          rowKey="key"
                          className="start-production-delivery-table"
                          scroll={{ x: true }}
                          rowSelection={{
                            selectedRowKeys,
                            columnWidth: isMobile ? 40 : 34,
                            onChange: (keys) => setSelectedRowKeys(group.key, keys.map((k) => String(k))),
                          }}
                          columns={[
                            {
                              title: 'نام قطعه',
                              dataIndex: 'name',
                              key: 'name',
                              width: isMobile ? 280 : 180,
                              render: (value: string, record: StartMaterialDeliveryRow) => (
                                <Input
                                  value={value}
                                  onChange={(e) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'name', e.target.value)}
                                  onKeyDown={(e) => handleDeliveryRowKeyDown(e, groupIndex)}
                                />
                              ),
                            },
                            {
                              title: 'طول',
                              dataIndex: 'length',
                              key: 'length',
                              width: isMobile ? 180 : 130,
                              render: (value: number, record: StartMaterialDeliveryRow) => (
                                <InputNumber
                                  value={value}
                                  onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'length', nextValue)}
                                  className="w-full persian-number"
                                  stringMode
                                  formatter={(v) => formatGroupedInput(v)}
                                  parser={(v) => parseNumberInput(v)}
                                  onKeyDown={(e) => handleDeliveryNumericKeyDown(e, groupIndex)}
                                />
                              ),
                            },
                            {
                              title: 'عرض',
                              dataIndex: 'width',
                              key: 'width',
                              width: isMobile ? 180 : 130,
                              render: (value: number, record: StartMaterialDeliveryRow) => (
                                <InputNumber
                                  value={value}
                                  onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'width', nextValue)}
                                  className="w-full persian-number"
                                  stringMode
                                  formatter={(v) => formatGroupedInput(v)}
                                  parser={(v) => parseNumberInput(v)}
                                  onKeyDown={(e) => handleDeliveryNumericKeyDown(e, groupIndex)}
                                />
                              ),
                            },
                            {
                              title: 'تعداد',
                              dataIndex: 'quantity',
                              key: 'quantity',
                              width: isMobile ? 180 : 130,
                              render: (value: number, record: StartMaterialDeliveryRow) => (
                                <InputNumber
                                  value={value}
                                  onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'quantity', nextValue)}
                                  className="w-full persian-number"
                                  stringMode
                                  formatter={(v) => formatGroupedInput(v)}
                                  parser={(v) => parseNumberInput(v)}
                                  onKeyDown={(e) => handleDeliveryNumericKeyDown(e, groupIndex)}
                                />
                              ),
                            },
                            {
                              title: 'واحد اصلی',
                              dataIndex: 'mainUnit',
                              key: 'mainUnit',
                              width: isMobile ? 190 : 110,
                              render: (value: string, record: StartMaterialDeliveryRow) => (
                                readonlyUnitFields ? (
                                  <span className="font-semibold text-[#6f4a2d]">{value || '-'}</span>
                                ) : (
                                  <Select
                                    value={value || null}
                                    options={HARD_CODED_UNIT_OPTIONS as any}
                                    onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'mainUnit', nextValue)}
                                    className="w-full"
                                    getPopupContainer={() => document.body}
                                  />
                                )
                              ),
                            },
                            {
                              title: 'واحد فرعی',
                              dataIndex: 'subUnit',
                              key: 'subUnit',
                              width: isMobile ? 190 : 110,
                              render: (value: string, record: StartMaterialDeliveryRow) => (
                                readonlyUnitFields ? (
                                  <span className="font-semibold text-[#6f4a2d]">{value || '-'}</span>
                                ) : (
                                  <Select
                                    value={value || null}
                                    options={HARD_CODED_UNIT_OPTIONS as any}
                                    onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'subUnit', nextValue)}
                                    className="w-full"
                                    getPopupContainer={() => document.body}
                                  />
                                )
                              ),
                            },
                            {
                              title: 'مقدار تحویل شده',
                              dataIndex: 'deliveredQty',
                              key: 'deliveredQty',
                              width: isMobile ? 230 : 170,
                              render: (_value: number, record: StartMaterialDeliveryRow) => (
                                <span className="font-semibold text-[#6f4a2d]">
                                  {formatQty(calcDeliveredQty(record))}
                                </span>
                              ),
                            },
                            {
                              title: '',
                              key: 'actions',
                              width: isMobile ? 96 : 78,
                              render: (_value: any, record: StartMaterialDeliveryRow) => (
                                <div className="flex items-center gap-0.5 start-production-row-actions">
                                  <Button
                                    type="text"
                                    size="small"
                                    className="!w-6 !h-6 !p-0"
                                    icon={<CopyOutlined />}
                                    onClick={() => onDeliveryRowsTransfer(groupIndex, [String(record.key)], groupIndex, 'copy')}
                                  />
                                  <Button
                                    type="text"
                                    size="small"
                                    className="!w-6 !h-6 !p-0"
                                    icon={<SwapOutlined />}
                                    onClick={() => openTransferDialog(groupIndex, [String(record.key)], 'move')}
                                  />
                                  <Button
                                    type="text"
                                    size="small"
                                    className="!w-6 !h-6 !p-0"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => onDeliveryRowsDelete(groupIndex, [String(record.key)])}
                                  />
                                </div>
                              ),
                            },
                          ]}
                        />

                        {(() => {
                          const currentDeliveredQty = Math.max(0, parseNumberInput(group.totalDeliveredQty));
                          const diff = totalDeliveredWithHistory - Math.max(0, parseNumberInput(group.totalUsage));
                          const diffClass =
                            diff > 0 ? 'text-green-700 font-semibold' : diff < 0 ? 'text-red-700 font-semibold' : 'text-gray-700 font-medium';
                          return (
                            <div className="text-xs flex flex-col sm:flex-row gap-4 text-gray-700">
                              <span>
                                جمع مقدار تحویل جدید: <span className="font-semibold">{formatQty(currentDeliveredQty)}</span>
                                {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                              </span>
                              <span>
                                جمع مقادیر تحویل شده قبلی: <span className="font-semibold">{formatQty(previousDeliveredQty)}</span>
                                {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                              </span>
                              <span>
                                تحویل شده کل: <span className="font-semibold">{formatQty(totalDeliveredWithHistory)}</span>
                                {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                              </span>
                              <span className={diffClass}>
                                اختلاف مقدار تحویل شده با مقدار مورد نیاز: {formatQty(diff)}
                                {deliveryUnitLabel ? <span className="mr-1">{deliveryUnitLabel}</span> : null}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      <div className={`grid grid-cols-1 ${hideSourceShelfSelector ? 'md:grid-cols-1' : 'md:grid-cols-2'} gap-3`}>
                        {!hideSourceShelfSelector ? (
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
                                onKeyDown={(e) => handleDeliveryRowKeyDown(e, groupIndex)}
                              />
                              <QrScanPopover
                                label=""
                                buttonProps={{ type: 'default', shape: 'circle' }}
                                onScan={({ moduleId, recordId }) => {
                                  if (moduleId === 'shelves' && recordId) onSourceShelfScan(groupIndex, recordId);
                                }}
                              />
                            </div>
                            {(() => {
                              const selected = sourceShelfOptions.find((item) => String(item.value) === String(group.sourceShelfId || ''));
                              if (!selected || selected.stock === undefined) return null;
                              return (
                                <div className="text-[11px] text-gray-500">
                                  موجودی قفسه انتخاب‌شده: {formatQty(selected.stock)}
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <div className="text-xs text-gray-500">
                            {productionTargetType === 'stage' ? 'انتخاب مرحله تولید مقصد' : 'انتخاب قفسه تولید'}
                          </div>
                          {productionTargetType === 'stage' ? (
                            <Select
                              placeholder="انتخاب مرحله تولید"
                              value={group.targetStageTaskId || undefined}
                              onChange={(val) => onProductionStageChange?.(groupIndex, val || null)}
                              options={productionStageOptions}
                              showSearch
                              optionFilterProp="label"
                              className="w-full"
                              getPopupContainer={() => document.body}
                              onKeyDown={(e) => handleDeliveryRowKeyDown(e, groupIndex)}
                            />
                          ) : (
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
                                onKeyDown={(e) => handleDeliveryRowKeyDown(e, groupIndex)}
                              />
                              <QrScanPopover
                                label=""
                                buttonProps={{ type: 'default', shape: 'circle' }}
                                onScan={({ moduleId, recordId }) => {
                                  if (moduleId === 'shelves' && recordId) onProductionShelfChange(groupIndex, recordId);
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <style>{`
        .start-production-delivery-table .ant-input,
        .start-production-delivery-table .ant-input-number,
        .start-production-delivery-table .ant-select,
        .start-production-delivery-table .ant-select-selector {
          min-height: 36px !important;
          font-size: 13px !important;
        }
        .start-production-delivery-table .ant-input-number-input {
          height: 34px !important;
        }
        .start-production-row-actions .ant-btn .anticon {
          font-size: 12px;
        }
        @media (max-width: 768px) {
          .start-production-delivery-table .ant-table-cell {
            padding: 10px 8px !important;
          }
          .start-production-delivery-table .ant-input,
          .start-production-delivery-table .ant-input-number,
          .start-production-delivery-table .ant-select,
          .start-production-delivery-table .ant-select-selector {
            min-height: 42px !important;
            font-size: 15px !important;
            min-width: 120px !important;
          }
          .start-production-delivery-table .ant-input-number-input {
            height: 40px !important;
          }
          .start-production-delivery-table .ant-btn {
            min-height: 36px;
          }
        }
      `}</style>
    </>
  );

  const transferModalNode = (
    <Modal
      title={transferDialog?.mode === 'copy' ? 'کپی ردیف های تحویل' : 'جابجایی ردیف های تحویل'}
      open={!!transferDialog}
      onCancel={() => {
        setTransferDialog(null);
        setTransferTargetGroupIndex(null);
      }}
      onOk={confirmTransferRows}
      okText={transferDialog?.mode === 'copy' ? 'کپی' : 'جابجایی'}
      cancelText="انصراف"
      okButtonProps={{ disabled: transferTargetGroupIndex === null }}
      destroyOnHidden
    >
      <div className="space-y-2">
        <div className="text-xs text-gray-600">محصول مقصد را انتخاب کنید:</div>
        <Select
          className="w-full"
          value={transferTargetGroupIndex}
          onChange={(val) => setTransferTargetGroupIndex(val)}
          options={transferTargets}
          getPopupContainer={() => document.body}
        />
      </div>
    </Modal>
  );

  if (inline) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          {bodyContent}
        </div>
        {transferModalNode}
      </div>
    );
  }

  return (
    <>
      <Modal
        title="شروع تولید"
        width="min(980px, calc(100vw - 24px))"
        open={open}
        onOk={onStart}
        onCancel={onCancel}
        okText="شروع تولید"
        cancelText="انصراف"
        confirmLoading={loading}
        destroyOnHidden
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      >
        {bodyContent}
      </Modal>
      {transferModalNode}
    </>
  );
};

export default StartProductionModal;
