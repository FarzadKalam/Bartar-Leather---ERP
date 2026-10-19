import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, InputNumber, Modal, Popover, Select, Table } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CalculatorOutlined, CheckOutlined, CopyOutlined, DeleteOutlined, FileTextOutlined, PlusOutlined, RightOutlined, SaveOutlined, SwapOutlined } from '@ant-design/icons';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persianFa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorianEn from 'react-date-object/locales/gregorian_en';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { HARD_CODED_UNIT_OPTIONS } from '../../utils/unitConversions';
import { calculateUnitQuantity, getUnitQuantityConversion } from '../../utils/unitQuantityConversion';
import { CREATE_NEW_BUNDLE_VALUE, USE_SOURCE_BUNDLE_VALUE, isCreateNewBundleValue } from '../../utils/productionBundles';
import DeliveryProgressBar from './DeliveryProgressBar';
import type { DestinationBundleOption } from '../../utils/destinationBundleOptions';

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
  handoverQty?: number;
};

export type StageHandoverDeliveryRow = {
  key: string;
  pieceKey?: string;
  name?: string;
  length?: number;
  width?: number;
  quantity?: number;
  mainUnit: string;
  subUnit: string;
  mainQuantity: number;
  subQuantity: number;
  deliveredQty: number;
  sourceBundleId?: string | null;
  sourceShelfId?: string | null;
  sourceBundleLabel?: string | null;
  targetBundleId?: string | null;
  targetBundleLabel?: string | null;
  /** توضیح تحویل‌دهنده برای همین ردیف. */
  giverNote?: string;
};

export type StageHandoverGroup = {
  key: string;
  rowIndex: number;
  categoryLabel: string;
  selectedProductId: string | null;
  selectedProductName: string;
  selectedProductCode: string;
  sourceShelfId: string | null;
  sourceBundleId?: string | null;
  targetShelfId: string | null;
  pieces: StageHandoverPiece[];
  orderPieces: StageHandoverPiece[];
  deliveryRows: StageHandoverDeliveryRow[];
  totalSourceQty: number;
  totalOrderQty: number;
  totalHandoverQty: number;
  collapsed: boolean;
  isConfirmed: boolean;
  previousDeliveryRows?: StageHandoverDeliveryRow[];
  previousDeliveredQty?: number;
};

export type StageHandoverConfirm = {
  confirmed: boolean;
  userName?: string | null;
  userId?: string | null;
  at?: string | null;
};

export type StageHandoverTrafficType = 'incoming' | 'outgoing';

export type StageHandoverTaskOption = {
  value: string;
  label: string;
  shelfId?: string | null;
  shelfLabel?: string | null;
};

export type StageHandoverBundleOption = {
  value: string;
  label: string;
  shelfId?: string | null;
  stock?: number;
  disabled?: boolean;
};

interface TaskHandoverModalProps {
  open: boolean;
  loading: boolean;
  locked?: boolean;
  taskName: string;
  sourceStageName: string;
  nextStageName?: string | null;
  giverName: string;
  receiverName: string;
  trafficType: StageHandoverTrafficType;
  trafficTypeEditable: boolean;
  sourceStageValue: string | null; // "__central__" for central warehouse
  destinationStageId: string | null;
  stageOptions: StageHandoverTaskOption[];
  bundleOptionsByProduct?: Record<string, StageHandoverBundleOption[]>;
  destinationBundleOptions?: DestinationBundleOption[];
  /** Legacy shelf props are accepted for callers with persisted/read-only forms;
   * shelf selection is no longer rendered and package rows determine source shelf. */
  sourceShelfId?: string | null;
  centralSourceShelfOptions?: StageHandoverTaskOption[];
  shelfOptions?: StageHandoverTaskOption[];
  targetShelfId?: string | null;
  groups: StageHandoverGroup[];
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  canEditGiverNotes?: boolean;
  onCancel: () => void;
  onSave: () => void;
  onTrafficTypeChange: (nextType: StageHandoverTrafficType) => void;
  onSourceStageChange: (value: string | null) => void;
  onDestinationStageChange: (taskId: string | null) => void;
  onToggleGroup: (groupIndex: number, collapsed: boolean) => void;
  onConfirmGroup: (groupIndex: number) => void;
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
    field: keyof Omit<StageHandoverDeliveryRow, 'key'>,
    value: any
  ) => void;
  onSourceShelfChange?: (shelfId: string | null) => void;
  onTargetShelfChange?: (shelfId: string | null) => void;
  onTargetShelfScan?: (shelfId: string) => void;
  onConfirmGiver: () => void;
  onConfirmReceiver: () => void;
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
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toQty = (value: number) => {
  const rounded = Math.round((value || 0) * 100) / 100;
  return formatGroupedInput(rounded);
};

const calcDeliveredQty = (row?: Partial<StageHandoverDeliveryRow> | null) => {
  if ((row as any)?.mainQuantity !== undefined && (row as any)?.mainQuantity !== null) {
    return Math.max(0, parseNumberInput((row as any).mainQuantity));
  }
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
  nextStageName = null,
  giverName,
  receiverName,
  trafficType,
  trafficTypeEditable,
  sourceStageValue,
  destinationStageId,
  stageOptions,
  bundleOptionsByProduct = {},
  destinationBundleOptions = [],
  targetShelfId = null,
  groups,
  giverConfirmation,
  receiverConfirmation,
  canEditGiverNotes = false,
  onCancel,
  onSave,
  onTrafficTypeChange,
  onSourceStageChange,
  onDestinationStageChange,
  onToggleGroup,
  onConfirmGroup,
  onDeliveryRowAdd,
  onDeliveryRowsDelete,
  onDeliveryRowsTransfer,
  onDeliveryRowFieldChange,
  onConfirmGiver,
  onConfirmReceiver,
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
      groups.forEach((group) => {
        const allowed = new Set((group.deliveryRows || []).map((row) => String(row.key)));
        const current = prev[group.key] || [];
        const filtered = current.filter((key) => allowed.has(String(key)));
        if (filtered.length > 0) next[group.key] = filtered;
      });
      return next;
    });
  }, [groups]);

  const selectedDestinationStage = stageOptions.find((option) => String(option.value) === String(destinationStageId || ''));
  const sameStageShelf = Boolean(targetShelfId && selectedDestinationStage?.shelfId && String(targetShelfId) === String(selectedDestinationStage.shelfId));
  const resolveShelfLabel = (shelfId: string | null | undefined) => {
    if (!shelfId) return 'تعیین نشده';
    const option = stageOptions.find((item) => String(item.shelfId || '') === String(shelfId));
    return option?.shelfLabel || String(shelfId);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stageOptionMap = useMemo(() => {
    const map = new Map<string, StageHandoverTaskOption>();
    (stageOptions || []).forEach((option) => {
      map.set(String(option.value), option);
    });
    return map;
  }, [stageOptions]);

  const destinationStageOption = useMemo(() => {
    if (!destinationStageId) return null;
    return stageOptionMap.get(String(destinationStageId)) || null;
  }, [destinationStageId, stageOptionMap]);

  const transferTargets = useMemo(
    () => groups.map((group, index) => ({
      value: index,
      label: `${group.selectedProductName || '-'}${group.selectedProductCode ? ` (${group.selectedProductCode})` : ''}`,
    })),
    [groups]
  );

  const giverNotes = useMemo(() => Array.from(new Set(
    groups.flatMap((group) => (group.deliveryRows || [])
      .map((row) => String(row?.giverNote || '').trim())
      .filter(Boolean))
  )), [groups]);

  const getSelectedRowKeys = (groupKey: string) => selectedRowKeysByGroup[groupKey] || [];

  const setSelectedRowKeys = (groupKey: string, rowKeys: string[]) => {
    setSelectedRowKeysByGroup((prev) => ({ ...prev, [groupKey]: rowKeys }));
  };

  const openTransferDialog = (sourceGroupIndex: number, rowKeys: string[], mode: 'copy' | 'move') => {
    if (!rowKeys.length || locked) return;
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
    const sourceGroup = groups[transferDialog.sourceGroupIndex];
    if (sourceGroup) {
      setSelectedRowKeys(sourceGroup.key, []);
    }
    setTransferDialog(null);
    setTransferTargetGroupIndex(null);
  };

  const handleDeliveryRowKeyDown = (e: React.KeyboardEvent<HTMLElement>, groupIndex: number) => {
    if (locked) return;
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
      const key = groups[groupIndex]?.key;
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

  return (
    <Modal
      title="فرم تحویل کالا"
      width="min(1440px, calc(100vw - 16px))"
      open={open}
      onCancel={onCancel}
      confirmLoading={loading}
      destroyOnHidden
      styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}
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
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onTrafficTypeChange('incoming')}
                disabled={!trafficTypeEditable || locked}
                className={`rounded-xl border-2 p-3 text-right transition-all ${trafficType === 'incoming' ? 'border-green-500 bg-green-50 shadow-sm' : 'border-gray-200 bg-white hover:border-green-300'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700">
                    <ArrowDownOutlined className="text-xl" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-gray-800">ورود به مرحله</span>
                    <span className="block text-xs text-gray-500">{taskName}</span>
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onTrafficTypeChange('outgoing')}
                disabled={!trafficTypeEditable || locked}
                className={`rounded-xl border-2 p-3 text-right transition-all ${trafficType === 'outgoing' ? 'border-red-500 bg-red-50 shadow-sm' : 'border-gray-200 bg-white hover:border-red-300'} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-700">
                    <ArrowUpOutlined className="text-xl" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-gray-800">خروج از مرحله</span>
                    <span className="block text-xs text-gray-500">{taskName}</span>
                  </span>
                </div>
              </button>
            </div>

            {trafficType === 'incoming' ? (
              <>
                <div>
                  <div className="text-xs text-gray-500 mb-1">ورود از مرحله</div>
                  <Select
                    value={sourceStageValue || '__central__'}
                    onChange={(value) => onSourceStageChange(value || null)}
                    disabled={!trafficTypeEditable || locked}
                    options={[
                      { value: '__central__', label: 'انبار مرکزی' },
                      ...(stageOptions || []).map((option) => ({ value: option.value, label: option.label })),
                    ]}
                    className="w-full"
                    getPopupContainer={() => document.body}
                    showSearch
                    optionFilterProp="label"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-xs text-gray-500 mb-1">تحویل به مرحله</div>
                  <Select
                    value={destinationStageId}
                    onChange={(value) => onDestinationStageChange(value || null)}
                    disabled={!trafficTypeEditable || locked}
                    options={(stageOptions || []).map((option) => ({ value: option.value, label: option.label }))}
                    className="w-full"
                    getPopupContainer={() => document.body}
                    showSearch
                    optionFilterProp="label"
                    placeholder="انتخاب مرحله مقصد"
                  />
                  <div className="mt-1 text-xs text-gray-600">قفسه مقصد: <span className="font-semibold text-gray-800">{selectedDestinationStage?.shelfLabel || selectedDestinationStage?.shelfId || 'قفسه تعیین نشده'}</span></div>
                  {sameStageShelf ? <Alert className="mt-2" type="warning" showIcon message="قفسه مبدأ و مقصد یکسان است؛ مرحله مقصد دیگری انتخاب کنید." /> : null}
                </div>
              </>
            )}
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
            موردی برای تحویل ثبت نشده است.
          </div>
        ) : (
          groups.map((group, groupIndex) => {
            const selectedRowKeys = getSelectedRowKeys(group.key);
            const bundleOptions = group.selectedProductId
              ? (bundleOptionsByProduct[String(group.selectedProductId)] || [])
              : [];
            const consumptionUnitLabel = getUnitSummaryLabel((group.pieces || []).map((piece) => piece.mainUnit));
            const previousDeliveryRows = Array.isArray(group.previousDeliveryRows) ? group.previousDeliveryRows : [];
            const previousDeliveredQty = Math.max(
              0,
              parseNumberInput(group.previousDeliveredQty ?? previousDeliveryRows.reduce((sum, row) => sum + calcDeliveredQty(row), 0))
            );
            const currentDeliveredQty = Math.max(0, parseNumberInput(group.totalHandoverQty));
            const totalDeliveredWithHistory = previousDeliveredQty + currentDeliveredQty;
            const currentSubQuantity = (group.deliveryRows || []).reduce(
              (sum, row) => sum + Math.max(0, parseNumberInput(row?.subQuantity)),
              0
            );
            const previousSubQuantity = previousDeliveryRows.reduce(
              (sum, row) => sum + Math.max(0, parseNumberInput(row?.subQuantity)),
              0
            );
            const totalSubQuantity = previousSubQuantity + currentSubQuantity;
            const requiredSubQuantity = (group.pieces || []).reduce(
              (sum, piece) => sum + Math.max(0, parseNumberInput((piece as any)?.subUsage ?? (piece as any)?.sub_usage)),
              0
            );
            const subUnitLabel = getUnitSummaryLabel([
              ...(group.deliveryRows || []).map((row) => row.subUnit),
              ...previousDeliveryRows.map((row) => row.subUnit),
              ...(group.pieces || []).map((piece) => piece.subUnit),
            ]);
            const deliveryUnitLabel = getUnitSummaryLabel([
              ...(group.deliveryRows || []).map((row) => row.mainUnit),
              ...previousDeliveryRows.map((row) => row.mainUnit),
            ]) || consumptionUnitLabel;
            const headerToneClass = 'bg-[#1f4534] text-white shadow-sm border-b border-[#17372a]';
            const headerButtonClass = '!text-white hover:!text-white/90';
            const containerClass = 'rounded-xl border border-gray-200 bg-white';
            const headerMetaClass = 'text-white/90';

            return (
              <div key={group.key} className={containerClass}>
                <div className={`sticky top-0 z-30 px-3 py-2 flex items-center justify-between gap-2 ${headerToneClass}`}>
                  <div className="min-w-0">
                    <div className="text-xs">دسته‌بندی: {group.categoryLabel || '-'}</div>
                    <div className="text-base sm:text-lg leading-6 font-bold truncate">
                      محصول: {group.selectedProductName || '-'}
                      {group.selectedProductCode ? ` (${group.selectedProductCode})` : ''}
                    </div>
                    <div className={`text-[11px] mt-0.5 ${headerMetaClass}`}>
                      مورد نیاز کل: <span className="font-semibold">{toQty(group.totalSourceQty || 0)}</span>
                      {consumptionUnitLabel ? <span className="font-semibold mr-1">{consumptionUnitLabel}</span> : null}
                      <span className="mx-1">|</span>
                      تحویل شده کل: <span className="font-semibold">{toQty(totalDeliveredWithHistory)}</span>
                      {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                      {subUnitLabel ? (
                        <>
                          <span className="mx-1">/</span>
                          <span className="font-semibold">{toQty(totalSubQuantity)}</span>
                          <span className="font-semibold mr-1">{subUnitLabel}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/90">
                      <span>قفسه مبدأ: <strong>{resolveShelfLabel(group.sourceShelfId)}</strong></span>
                      <span>قفسه مقصد: <strong>{resolveShelfLabel(group.targetShelfId || targetShelfId)}</strong></span>
                      {group.sourceShelfId && group.targetShelfId && String(group.sourceShelfId) === String(group.targetShelfId) ? (
                        <span className="font-bold text-amber-200">هشدار: قفسه مبدأ و مقصد یکسان است</span>
                      ) : null}
                    </div>
                    <DeliveryProgressBar
                      delivered={totalDeliveredWithHistory}
                      required={Math.max(0, parseNumberInput(group.totalSourceQty))}
                      className="max-w-md text-white/90"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="text"
                      size="small"
                      className={headerButtonClass}
                      icon={<SaveOutlined />}
                      onClick={() => onConfirmGroup(groupIndex)}
                      disabled={locked}
                    />
                    {group.isConfirmed && (
                      <span className="text-[11px] bg-white/20 rounded px-2 py-0.5">ثبت شده</span>
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
                    <div className="mt-3 rounded-lg border border-[#c9b29a] bg-[#f7f1ea] p-3 space-y-3">
                      <div className="text-xs font-medium text-[#17372a]">
                        {trafficType === 'incoming'
                          ? `از مرحله "${sourceStageName}" به مرحله "${taskName}" چه مقدار تحویل می‌دهید؟`
                          : `از مرحله "${taskName}" به مرحله "${destinationStageOption?.label || nextStageName || 'مرحله مقصد'}" چه مقدار تحویل می‌دهید؟`}
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
                                render: (value: number) => toQty(value),
                              },
                              {
                                title: 'عرض',
                                dataIndex: 'width',
                                key: 'width',
                                width: 90,
                                render: (value: number) => toQty(value),
                              },
                              {
                                title: 'تعداد',
                                dataIndex: 'quantity',
                                key: 'quantity',
                                width: 90,
                                render: (value: number) => toQty(value),
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
                                render: (_value: number, record: StageHandoverDeliveryRow) => (
                                  <span className="font-semibold text-[#17372a]">{toQty(calcDeliveredQty(record))}</span>
                                ),
                              },
                            ]}
                          />
                          <div className="mt-2 text-[11px] text-blue-900">
                            جمع مقادیر تحویل شده قبلی: <span className="font-semibold">{toQty(previousDeliveredQty)}</span>
                            {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                          </div>
                        </div>
                      ) : null}

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button type="dashed" icon={<PlusOutlined />} onClick={() => onDeliveryRowAdd(groupIndex)} disabled={locked}>
                          افزودن ردیف تحویل
                        </Button>
                        <Button
                          icon={<DeleteOutlined />}
                          danger
                          disabled={locked || selectedRowKeys.length === 0}
                          onClick={() => onDeliveryRowsDelete(groupIndex, selectedRowKeys)}
                        >
                          حذف
                        </Button>
                        <Button
                          icon={<CopyOutlined />}
                          disabled={locked || selectedRowKeys.length === 0}
                          onClick={() => openTransferDialog(groupIndex, selectedRowKeys, 'copy')}
                        >
                          کپی
                        </Button>
                        <Button
                          icon={<SwapOutlined />}
                          disabled={locked || selectedRowKeys.length === 0}
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
                        className="task-handover-delivery-table"
                        tableLayout="fixed"
                        scroll={{ x: true }}
                        rowSelection={{
                          selectedRowKeys,
                          columnWidth: isMobile ? 40 : 34,
                          onChange: (keys) => setSelectedRowKeys(group.key, keys.map((k) => String(k))),
                        }}
                        columns={[
                          {
                            title: 'بسته برداشت',
                            dataIndex: 'sourceBundleId',
                            key: 'sourceBundleId',
                            width: isMobile ? 220 : 180,
                            render: (value: string | null | undefined, record: StageHandoverDeliveryRow) => {
                              const sourceOption = bundleOptions.find((option) => String(option.value) === String(value || ''));
                              const sourceLabel = record.sourceBundleLabel || sourceOption?.label || (value ? String(value) : '—');
                              if (locked) {
                                return <span className="block rounded-md border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm font-semibold text-gray-800">{sourceLabel}</span>;
                              }
                              return (
                                <Select
                                  value={value || undefined}
                                  placeholder="انتخاب بسته"
                                  options={value && !bundleOptions.some((option) => String(option.value) === String(value))
                                    ? [{ label: sourceLabel, value }, ...bundleOptions]
                                    : bundleOptions}
                                  showSearch
                                  optionFilterProp="label"
                                  className="w-full"
                                  getPopupContainer={() => document.body}
                                  onChange={(bundleId) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'sourceBundleId', bundleId || null)}
                                  disabled={locked}
                                />
                              );
                            },
                          },
                          {
                            title: 'بسته تحویل مقصد',
                            dataIndex: 'targetBundleId',
                            key: 'targetBundleId',
                            width: isMobile ? 260 : 220,
                            render: (value: string | null | undefined, record: StageHandoverDeliveryRow) => {
                              const selectValue = value && String(value) === String(record.sourceBundleId || '')
                                ? USE_SOURCE_BUNDLE_VALUE
                                : (value || CREATE_NEW_BUNDLE_VALUE);
                              const sourceBundleOption = bundleOptions.find((option) => String(option.value) === String(record.sourceBundleId || ''));
                              const isPartialSourceBundle = Number(sourceBundleOption?.stock || 0) > calcDeliveredQty(record) + 0.000001;
                              const destinationOptions = [
                                { label: 'ساخت بسته جدید', value: CREATE_NEW_BUNDLE_VALUE },
                                {
                                  label: isPartialSourceBundle ? 'همان بسته محصول مبدأ (فقط در انتقال کامل بسته)' : 'همان بسته محصول مبدأ',
                                  value: USE_SOURCE_BUNDLE_VALUE,
                                  disabled: !record.sourceBundleId || isPartialSourceBundle,
                                },
                                ...destinationBundleOptions
                                  .filter((option) => String(option.value) !== String(record.sourceBundleId || ''))
                                  .map((option) => ({
                                    ...option,
                                    disabled: Boolean(option.disabled || (option.stock && option.stock > 0 && targetShelfId && option.shelfId && String(option.shelfId) !== String(targetShelfId))),
                                  })),
                              ];
                              if (value && String(value) !== String(record.sourceBundleId || '')
                                && !destinationOptions.some((option) => String(option.value) === String(value))) {
                                destinationOptions.push({ label: record.targetBundleLabel || String(value), value } as any);
                              }
                              const sourceLabel = record.sourceBundleLabel || sourceBundleOption?.label || (record.sourceBundleId ? String(record.sourceBundleId) : '—');
                              const selectedTargetOption = destinationOptions.find((option) => String(option.value) === String(value || ''));
                              const targetLabel = record.targetBundleLabel
                                || (String(value || '') === String(record.sourceBundleId || '') ? sourceLabel : selectedTargetOption?.label)
                                || (isCreateNewBundleValue(value) ? 'بسته جدید' : (value ? String(value) : '—'));
                              if (locked) {
                                return <span className="block rounded-md border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm font-semibold text-gray-800">{targetLabel}</span>;
                              }
                              return (
                                <Select
                                  value={selectValue}
                                  placeholder="انتخاب بسته مقصد"
                                  options={destinationOptions}
                                  showSearch
                                  optionFilterProp="label"
                                  className="w-full"
                                  getPopupContainer={() => document.body}
                                  onChange={(bundleId) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'targetBundleId', bundleId)}
                                  disabled={locked}
                                />
                              );
                            },
                          },
                          {
                            title: 'نام قطعه',
                            dataIndex: 'name',
                            key: 'name',
                            width: isMobile ? 180 : 140,
                            render: (value: string, record: StageHandoverDeliveryRow) => (
                              <Input value={value} onChange={(event) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'name', event.target.value)} disabled={locked} />
                            ),
                          },
                          {
                            title: 'طول', dataIndex: 'length', key: 'length', width: isMobile ? 120 : 90,
                            render: (value: number, record: StageHandoverDeliveryRow) => <InputNumber value={value} className="w-full persian-number" stringMode formatter={(v) => formatGroupedInput(v)} parser={(v) => parseNumberInput(v)} onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'length', nextValue)} disabled={locked} />,
                          },
                          {
                            title: 'عرض', dataIndex: 'width', key: 'width', width: isMobile ? 120 : 90,
                            render: (value: number, record: StageHandoverDeliveryRow) => <InputNumber value={value} className="w-full persian-number" stringMode formatter={(v) => formatGroupedInput(v)} parser={(v) => parseNumberInput(v)} onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'width', nextValue)} disabled={locked} />,
                          },
                          {
                            title: 'تعداد', dataIndex: 'quantity', key: 'quantity', width: isMobile ? 120 : 90,
                            render: (value: number, record: StageHandoverDeliveryRow) => <InputNumber value={value} className="w-full persian-number" stringMode formatter={(v) => formatGroupedInput(v)} parser={(v) => parseNumberInput(v)} onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'quantity', nextValue)} disabled={locked} />,
                          },
                          {
                            title: 'واحد اصلی',
                            dataIndex: 'mainUnit',
                            key: 'mainUnit',
                            width: isMobile ? 190 : 110,
                            render: (value: string, record: StageHandoverDeliveryRow) => (
                              <Select
                                value={value || null}
                                options={HARD_CODED_UNIT_OPTIONS as any}
                                onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'mainUnit', nextValue)}
                                className="w-full"
                                getPopupContainer={() => document.body}
                                onKeyDown={(e) => handleDeliveryRowKeyDown(e, groupIndex)}
                                disabled={locked}
                              />
                            ),
                          },
                          {
                            title: 'مقدار واحد اصلی',
                            dataIndex: 'mainQuantity',
                            key: 'mainQuantity',
                            width: isMobile ? 240 : 250,
                            render: (value: number, record: StageHandoverDeliveryRow) => (
                              <div className="flex gap-1"><InputNumber value={value} className="w-full persian-number" stringMode
                                formatter={(v) => formatGroupedInput(v)} parser={(v) => parseNumberInput(v)}
                                onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'mainQuantity', nextValue)}
                                onKeyDown={(e) => handleDeliveryNumericKeyDown(e, groupIndex)} disabled={locked} />
                                <Button type="text" size="small" title="محاسبه مقدار واحد فرعی" icon={<CalculatorOutlined />} disabled={locked} onClick={() => {
                                  const conversion = getUnitQuantityConversion('mainQuantity', { availableKeys: ['mainQuantity', 'subQuantity'] });
                                  if (!conversion) return;
                                  try {
                                    onDeliveryRowFieldChange(groupIndex, String(record.key), 'subQuantity', calculateUnitQuantity({ mainQuantity: record.mainQuantity, subQuantity: record.subQuantity, main_unit: record.mainUnit, sub_unit: record.subUnit, widthMm: record.width || group.pieces?.[0]?.width }, conversion));
                                  } catch { /* اعتبارسنجی تبدیل در ورود دستی واحدها انجام می‌شود. */ }
                                }} /></div>
                            ),
                          },
                          {
                            title: 'واحد فرعی',
                            dataIndex: 'subUnit',
                            key: 'subUnit',
                            width: isMobile ? 190 : 110,
                            render: (value: string, record: StageHandoverDeliveryRow) => (
                              <Select
                                value={value || null}
                                options={HARD_CODED_UNIT_OPTIONS as any}
                                onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'subUnit', nextValue)}
                                className="w-full"
                                getPopupContainer={() => document.body}
                                onKeyDown={(e) => handleDeliveryRowKeyDown(e, groupIndex)}
                                disabled={locked}
                              />
                            ),
                          },
                          {
                            title: 'مقدار واحد فرعی',
                            dataIndex: 'subQuantity',
                            key: 'subQuantity',
                            width: isMobile ? 240 : 250,
                            render: (value: number, record: StageHandoverDeliveryRow) => (
                              <div className="flex gap-1">
                                <InputNumber value={value} className="w-full persian-number" stringMode formatter={(v) => formatGroupedInput(v)} parser={(v) => parseNumberInput(v)} onChange={(nextValue) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'subQuantity', nextValue)} onKeyDown={(e) => handleDeliveryNumericKeyDown(e, groupIndex)} disabled={locked} />
                                <Button type="text" size="small" title="محاسبه مقدار واحد اصلی" icon={<CalculatorOutlined />} disabled={locked} onClick={() => {
                                  const conversion = getUnitQuantityConversion('subQuantity', { availableKeys: ['mainQuantity', 'subQuantity'] });
                                  if (!conversion) return;
                                  try {
                                    onDeliveryRowFieldChange(groupIndex, String(record.key), 'mainQuantity', calculateUnitQuantity({ mainQuantity: record.mainQuantity, subQuantity: record.subQuantity, main_unit: record.mainUnit, sub_unit: record.subUnit, widthMm: record.width || group.pieces?.[0]?.width }, conversion));
                                  } catch { /* اعتبارسنجی تبدیل در ورود دستی واحدها انجام می‌شود. */ }
                                }} />
                              </div>
                            ),
                          },
                          {
                            title: '',
                            key: 'actions',
                            width: isMobile ? 96 : 78,
                            render: (_value: any, record: StageHandoverDeliveryRow) => (
                              <div className="flex items-center gap-0.5 task-handover-row-actions">
                                <Popover
                                  title="توضیحات تحویل‌دهنده"
                                  trigger="click"
                                  content={(
                                    <Input.TextArea
                                      value={record.giverNote || ''}
                                      placeholder="توضیحات این ردیف (اختیاری)"
                                      autoSize={{ minRows: 3, maxRows: 6 }}
                                      className="w-64"
                                      readOnly={!canEditGiverNotes || locked}
                                      onChange={(event) => onDeliveryRowFieldChange(groupIndex, String(record.key), 'giverNote', event.target.value)}
                                    />
                                  )}
                                >
                                  <Button
                                    type="text"
                                    size="small"
                                    className={`!w-6 !h-6 !p-0 ${record.giverNote ? '!text-leather-700' : ''}`}
                                    title={canEditGiverNotes && !locked ? 'ویرایش توضیحات تحویل‌دهنده' : 'مشاهده توضیحات تحویل‌دهنده'}
                                    icon={<FileTextOutlined />}
                                  />
                                </Popover>
                                <Button
                                  type="text"
                                  size="small"
                                  className="!w-6 !h-6 !p-0"
                                  icon={<CopyOutlined />}
                                  onClick={() => onDeliveryRowsTransfer(groupIndex, [String(record.key)], groupIndex, 'copy')}
                                  disabled={locked}
                                />
                                <Button
                                  type="text"
                                  size="small"
                                  className="!w-6 !h-6 !p-0"
                                  icon={<SwapOutlined />}
                                  onClick={() => openTransferDialog(groupIndex, [String(record.key)], 'move')}
                                  disabled={locked}
                                />
                                <Button
                                  type="text"
                                  size="small"
                                  className="!w-6 !h-6 !p-0"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => onDeliveryRowsDelete(groupIndex, [String(record.key)])}
                                  disabled={locked}
                                />
                              </div>
                            ),
                          },
                        ]}
                      />
                      {(() => {
                        const diff = totalDeliveredWithHistory - Math.max(0, parseNumberInput(group.totalSourceQty));
                        const subDiff = totalSubQuantity - requiredSubQuantity;
                        const diffClass =
                          diff > 0 ? 'text-green-700 font-semibold' : diff < 0 ? 'text-red-700 font-semibold' : 'text-gray-700 font-medium';
                        return (
                          <div className="text-xs flex flex-col sm:flex-row gap-4 text-gray-700">
                            <span>
                              جمع مقدار تحویل جدید: <span className="font-semibold">{toQty(currentDeliveredQty)}</span>
                              {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                            </span>
                            <span>
                              جمع مقادیر تحویل شده قبلی: <span className="font-semibold">{toQty(previousDeliveredQty)}</span>
                              {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                            </span>
                            <span>
                              تحویل شده کل: <span className="font-semibold">{toQty(totalDeliveredWithHistory)}</span>
                              {deliveryUnitLabel ? <span className="font-semibold mr-1">{deliveryUnitLabel}</span> : null}
                            </span>
                            <span className={diffClass}>
                              اختلاف مقدار تحویل شده با مقدار دریافتی: {toQty(diff)}
                              {deliveryUnitLabel ? <span className="mr-1">{deliveryUnitLabel}</span> : null}
                            </span>
                            {subUnitLabel ? (
                              <span className={subDiff > 0 ? 'text-green-700 font-semibold' : subDiff < 0 ? 'text-red-700 font-semibold' : 'text-gray-700 font-medium'}>
                                اختلاف مقدار تحویل شده با مقدار دریافتی (واحد فرعی): {toQty(subDiff)}
                                <span className="mr-1">{subUnitLabel}</span>
                              </span>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <div className="text-xs text-gray-700">
            تحویل‌دهنده: <span className="font-medium">{giverName || '-'}</span>
          </div>
          {giverNotes.length > 0 ? (
            <div className="rounded-md border border-amber-100 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
              <span className="font-medium">توضیحات تحویل‌دهنده:</span>{' '}
              {giverNotes.join(' — ')}
            </div>
          ) : null}
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
      <style>{`
        .task-handover-row-actions .ant-btn .anticon {
          font-size: 12px;
        }
        @media (max-width: 768px) {
          .task-handover-delivery-table .ant-table-cell {
            padding: 10px 8px !important;
          }
          .task-handover-delivery-table .ant-input,
          .task-handover-delivery-table .ant-input-number,
          .task-handover-delivery-table .ant-select,
          .task-handover-delivery-table .ant-select-selector {
            min-height: 42px !important;
            font-size: 15px !important;
            min-width: 120px !important;
          }
          .task-handover-delivery-table .ant-input-number,
          .task-handover-delivery-table .ant-input-number-input {
            font-size: 15px !important;
            height: 40px !important;
          }
        }
      `}</style>
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
    </Modal>
  );
};

export default TaskHandoverModal;
