import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Empty, Modal, Table, Tabs, Tag } from 'antd';
import { DownOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persianFa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorianEn from 'react-date-object/locales/gregorian_en';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

export type StageHandoverPieceDetail = {
  key: string;
  name: string;
  length: number;
  width: number;
  quantity: number;
  mainUnit?: string;
  subUnit?: string;
  mainQty: number;
  subQty: number;
};

export type StageHandoverSummaryRow = {
  productId: string;
  productName: string;
  productCode?: string;
  unit?: string;
  subUnit?: string;
  orderId?: string | null;
  orderTitle?: string | null;
  sourceQty: number;
  sourceSubQty?: number;
  orderQty: number;
  orderSubQty?: number;
  deliveredQty: number;
  deliveredSubQty?: number;
  orderPieces?: StageHandoverPieceDetail[];
};

export type StageHandoverFormListRow = {
  id: string;
  ownerTaskId: string;
  direction: 'incoming' | 'outgoing';
  title: string;
  giverName?: string | null;
  giverStage?: string | null;
  receiverName?: string | null;
  receiverStage?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  giverConfirmed?: boolean;
  receiverConfirmed?: boolean;
  totalsByProduct?: Record<string, number>;
  totalsSubByProduct?: Record<string, number>;
  piecesByProduct?: Record<string, StageHandoverPieceDetail[]>;
};

export type StageHandoverInventoryRow = {
  productId: string;
  productName: string;
  productCode?: string;
  unit?: string;
  subUnit?: string;
  mainQty: number;
  subQty: number;
};

type SummaryTab = {
  key: string;
  label: React.ReactNode;
  tone: 'incoming' | 'outgoing' | 'neutral' | 'inventory';
  qtyByProduct: Record<string, number>;
  subQtyByProduct: Record<string, number>;
  piecesByProduct: Record<string, StageHandoverPieceDetail[]>;
};

interface TaskHandoverFormsModalProps {
  open: boolean;
  loading?: boolean;
  taskName: string;
  orderTitle?: string | null;
  sourceStageName: string;
  nextStageName?: string | null;
  summaries: StageHandoverSummaryRow[];
  forms: StageHandoverFormListRow[];
  currentStageName?: string | null;
  currentStageInventory?: StageHandoverInventoryRow[];
  selectedFormId: string | null;
  onSelectForm: (formId: string) => void;
  onCreateForm: () => void;
  onOpenForm: (formId: string, ownerTaskId: string) => void;
  onClose: () => void;
}

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toQty = (value: number) => {
  const rounded = Math.round((toNumber(value) || 0) * 1000) / 1000;
  return toPersianNumber(rounded.toLocaleString('en-US'));
};

const formatDateTime = (raw: string | null | undefined) => {
  if (!raw) return '-';
  try {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '-';
    const formatted = new DateObject({
      date,
      calendar: gregorian,
      locale: gregorianEn,
    })
      .convert(persian, persianFa)
      .format('YYYY/MM/DD HH:mm');
    return formatted ? toPersianNumber(formatted) : '-';
  } catch {
    return '-';
  }
};

const getSignedClass = (value: number) => {
  const num = toNumber(value);
  if (num > 0) return 'text-green-700 font-semibold';
  if (num < 0) return 'text-red-700 font-semibold';
  return 'text-gray-700 font-semibold';
};

const TaskHandoverFormsModal: React.FC<TaskHandoverFormsModalProps> = ({
  open,
  loading = false,
  taskName,
  orderTitle,
  summaries,
  forms,
  currentStageName = null,
  currentStageInventory = [],
  selectedFormId,
  onSelectForm,
  onCreateForm,
  onOpenForm,
  onClose,
}) => {
  const summaryTabs = useMemo<SummaryTab[]>(() => {
    const grouped = new Map<string, SummaryTab>();

    (forms || []).forEach((form) => {
      const isIncoming = form.direction === 'incoming';
      const stageLabel = isIncoming
        ? String(form.giverStage || 'مرحله قبلی')
        : String(form.receiverStage || 'مرحله بعدی');
      const key = `${form.direction}:${stageLabel}`;
      const existing = grouped.get(key);
      if (existing) {
        Object.entries(form.totalsByProduct || {}).forEach(([productId, qty]) => {
          existing.qtyByProduct[productId] = (existing.qtyByProduct[productId] || 0) + toNumber(qty);
        });
        Object.entries(form.totalsSubByProduct || {}).forEach(([productId, qty]) => {
          existing.subQtyByProduct[productId] = (existing.subQtyByProduct[productId] || 0) + toNumber(qty);
        });
        Object.entries(form.piecesByProduct || {}).forEach(([productId, pieces]) => {
          existing.piecesByProduct[productId] = [...(existing.piecesByProduct[productId] || []), ...(pieces || [])];
        });
        return;
      }

      const nextTab: SummaryTab = {
        key,
        tone: isIncoming ? 'incoming' : 'outgoing',
        label: (
          <span className={isIncoming ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
            {isIncoming ? `مقادیر دریافت شده از "${stageLabel}"` : `مقادیر تحویل شده به "${stageLabel}"`}
          </span>
        ),
        qtyByProduct: {},
        subQtyByProduct: {},
        piecesByProduct: {},
      };
      Object.entries(form.totalsByProduct || {}).forEach(([productId, qty]) => {
        nextTab.qtyByProduct[productId] = (nextTab.qtyByProduct[productId] || 0) + toNumber(qty);
      });
      Object.entries(form.totalsSubByProduct || {}).forEach(([productId, qty]) => {
        nextTab.subQtyByProduct[productId] = (nextTab.subQtyByProduct[productId] || 0) + toNumber(qty);
      });
      Object.entries(form.piecesByProduct || {}).forEach(([productId, pieces]) => {
        nextTab.piecesByProduct[productId] = (pieces || []).map((piece, index) => ({
          ...piece,
          key: String(piece?.key || `${productId}_${index}`),
        }));
      });
      grouped.set(key, nextTab);
    });

    const orderPiecesByProduct: Record<string, StageHandoverPieceDetail[]> = {};
    (summaries || []).forEach((row) => {
      const productId = String(row?.productId || '');
      if (!productId) return;
      orderPiecesByProduct[productId] = (row.orderPieces || []).map((piece, index) => ({
        ...piece,
        key: String(piece?.key || `${productId}_order_${index}`),
      }));
    });

    const dynamicTabs = Array.from(grouped.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    const inventoryMainByProduct: Record<string, number> = {};
    const inventorySubByProduct: Record<string, number> = {};
    (Array.isArray(currentStageInventory) ? currentStageInventory : []).forEach((row) => {
      const productId = String(row?.productId || '').trim();
      if (!productId) return;
      inventoryMainByProduct[productId] = toNumber(row?.mainQty);
      inventorySubByProduct[productId] = toNumber(row?.subQty);
    });

    const tabs: SummaryTab[] = [
      ...dynamicTabs,
      {
        key: 'order',
        tone: 'neutral',
        label: <span className="text-gray-700 font-semibold">مقادیر ثبت شده در سفارش تولید</span>,
        qtyByProduct: Object.fromEntries((summaries || []).map((row) => [String(row.productId), toNumber(row.orderQty)])),
        subQtyByProduct: Object.fromEntries((summaries || []).map((row) => [String(row.productId), toNumber(row.orderSubQty)])),
        piecesByProduct: orderPiecesByProduct,
      },
    ];
    tabs.push({
      key: 'stage_inventory',
      tone: 'inventory',
      label: <span className="text-blue-700 font-semibold">موجودی فعلی مرحله "{currentStageName || taskName}"</span>,
      qtyByProduct: inventoryMainByProduct,
      subQtyByProduct: inventorySubByProduct,
      piecesByProduct: {},
    });
    return tabs;
  }, [currentStageInventory, currentStageName, forms, summaries, taskName]);

  const [tabKey, setTabKey] = useState<string>(summaryTabs[0]?.key || 'order');
  useEffect(() => {
    if (!summaryTabs.some((tab) => tab.key === tabKey)) {
      setTabKey(summaryTabs[0]?.key || 'order');
    }
  }, [summaryTabs, tabKey]);

  const activeTab = useMemo(
    () => summaryTabs.find((tab) => tab.key === tabKey) || summaryTabs[0] || null,
    [summaryTabs, tabKey]
  );

  const summaryRows = useMemo(() => {
    const mainMap = activeTab?.qtyByProduct || {};
    const subMap = activeTab?.subQtyByProduct || {};
    const pieceMap = activeTab?.piecesByProduct || {};
    const byProduct = new Map<string, any>();

    (summaries || []).forEach((row) => {
      const productId = String(row?.productId || '').trim();
      if (!productId) return;
      byProduct.set(productId, row);
    });

    (Array.isArray(currentStageInventory) ? currentStageInventory : []).forEach((row) => {
      const productId = String(row?.productId || '').trim();
      if (!productId || byProduct.has(productId)) return;
      byProduct.set(productId, {
        productId,
        productName: String(row?.productName || '-'),
        productCode: String(row?.productCode || ''),
        unit: String(row?.unit || ''),
        subUnit: String(row?.subUnit || ''),
        sourceQty: 0,
        sourceSubQty: 0,
        orderQty: 0,
        orderSubQty: 0,
        deliveredQty: 0,
        deliveredSubQty: 0,
        orderPieces: [],
      });
    });

    return Array.from(byProduct.values()).map((row: any) => {
      const productId = String(row?.productId || '');
      const orderMain = toNumber(row?.orderQty);
      const orderSub = toNumber(row?.orderSubQty);
      const sourceMain = toNumber(row?.sourceQty);
      const sourceSub = toNumber(row?.sourceSubQty);
      const deliveredMain = toNumber(row?.deliveredQty);
      const deliveredSub = toNumber(row?.deliveredSubQty);
      const tabMain = activeTab?.tone === 'neutral'
        ? orderMain
        : toNumber(mainMap[productId]);
      const tabSub = activeTab?.tone === 'neutral'
        ? orderSub
        : toNumber(subMap[productId]);
      return {
        ...row,
        tabMain,
        tabSub,
        diffWithOrderMain: tabMain - orderMain,
        diffWithOrderSub: tabSub - orderSub,
        diffReceivedMain: sourceMain - orderMain,
        diffReceivedSub: sourceSub - orderSub,
        diffDeliveredMain: deliveredMain - orderMain,
        diffDeliveredSub: deliveredSub - orderSub,
        pieceDetails: pieceMap[productId] || [],
      };
    });
  }, [activeTab, currentStageInventory, summaries]);

  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  useEffect(() => {
    setExpandedRowKeys([]);
  }, [tabKey]);

  const toggleRowExpand = useCallback((productId: string) => {
    setExpandedRowKeys((prev) =>
      prev.includes(productId) ? prev.filter((key) => key !== productId) : [...prev, productId]
    );
  }, []);

  const summaryColumns = useMemo(() => {
    const productColumn = {
      title: 'محصول',
      dataIndex: 'productName',
      key: 'productName',
      width: 300,
      render: (value: string, record: any) => (
        <div className="flex flex-col">
          <span className="font-medium">{value || '-'}</span>
          <span className="text-[11px] text-gray-500">{record?.productCode || '-'}</span>
          {Array.isArray(record?.pieceDetails) && record.pieceDetails.length > 0 ? (
            <button
              type="button"
              className="mt-1 text-[11px] text-[#8b5e3c] flex items-center gap-1 w-fit"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleRowExpand(String(record?.productId || ''));
              }}
            >
              {expandedRowKeys.includes(String(record?.productId || '')) ? <DownOutlined /> : <RightOutlined />}
              نمایش قطعات
            </button>
          ) : null}
        </div>
      ),
    };

    if (activeTab?.tone === 'inventory') {
      return [
        productColumn,
        {
          title: `موجودی فعلی (واحد اصلی)`,
          key: 'stageMain',
          width: 220,
          render: (_: any, row: any) => (
            <span className="font-semibold text-blue-700">{toQty(row.tabMain)} {row.unit || ''}</span>
          ),
        },
        {
          title: `موجودی فعلی (واحد فرعی)`,
          key: 'stageSub',
          width: 220,
          render: (_: any, row: any) => (
            <span className="font-semibold text-blue-700">{toQty(row.tabSub)} {row.subUnit || ''}</span>
          ),
        },
        {
          title: 'اختلاف با سفارش تولید',
          key: 'inventoryDiffOrder',
          width: 250,
          render: (_: any, row: any) => (
            <div className="text-xs space-y-1">
              <div className={getSignedClass(row.diffWithOrderMain)}>
                واحد اصلی: {toQty(row.diffWithOrderMain)} {row.unit || ''}
              </div>
              <div className={getSignedClass(row.diffWithOrderSub)}>
                واحد فرعی: {toQty(row.diffWithOrderSub)} {row.subUnit || ''}
              </div>
            </div>
          ),
        },
      ];
    }

    if (activeTab?.tone === 'neutral') {
      return [
        productColumn,
        {
          title: 'مقدار سفارش تولید',
          key: 'orderAmounts',
          width: 220,
          render: (_: any, row: any) => (
            <div className="text-xs space-y-1">
              <div>
                <span className="text-gray-500">واحد اصلی:</span>{' '}
                <span className="font-semibold">{toQty(row.orderQty)} {row.unit || ''}</span>
              </div>
              <div>
                <span className="text-gray-500">واحد فرعی:</span>{' '}
                <span className="font-semibold">{toQty(row.orderSubQty)} {row.subUnit || ''}</span>
              </div>
            </div>
          ),
        },
        {
          title: `اختلاف مقدار دریافت شده به "${taskName}"`,
          key: 'diffReceived',
          width: 260,
          render: (_: any, row: any) => (
            <div className="text-xs space-y-1">
              <div className={getSignedClass(row.diffReceivedMain)}>
                واحد اصلی: {toQty(row.diffReceivedMain)} {row.unit || ''}
              </div>
              <div className={getSignedClass(row.diffReceivedSub)}>
                واحد فرعی: {toQty(row.diffReceivedSub)} {row.subUnit || ''}
              </div>
            </div>
          ),
        },
        {
          title: `اختلاف مقدار تحویل شده از "${taskName}"`,
          key: 'diffDelivered',
          width: 260,
          render: (_: any, row: any) => (
            <div className="text-xs space-y-1">
              <div className={getSignedClass(row.diffDeliveredMain)}>
                واحد اصلی: {toQty(row.diffDeliveredMain)} {row.unit || ''}
              </div>
              <div className={getSignedClass(row.diffDeliveredSub)}>
                واحد فرعی: {toQty(row.diffDeliveredSub)} {row.subUnit || ''}
              </div>
            </div>
          ),
        },
      ];
    }

    const toneTitle =
      activeTab?.tone === 'incoming'
        ? 'مقدار دریافت شده'
        : 'مقدار تحویل شده';
    return [
      productColumn,
      {
        title: `${toneTitle} (واحد اصلی)`,
        key: 'tabMain',
        width: 210,
        render: (_: any, row: any) => (
          <span className="font-semibold">{toQty(row.tabMain)} {row.unit || ''}</span>
        ),
      },
      {
        title: `${toneTitle} (واحد فرعی)`,
        key: 'tabSub',
        width: 210,
        render: (_: any, row: any) => (
          <span className="font-semibold">{toQty(row.tabSub)} {row.subUnit || ''}</span>
        ),
      },
      {
        title: 'اختلاف با سفارش تولید',
        key: 'diffOrder',
        width: 230,
        render: (_: any, row: any) => (
          <div className="text-xs space-y-1">
            <div className={getSignedClass(row.diffWithOrderMain)}>
              واحد اصلی: {toQty(row.diffWithOrderMain)} {row.unit || ''}
            </div>
            <div className={getSignedClass(row.diffWithOrderSub)}>
              واحد فرعی: {toQty(row.diffWithOrderSub)} {row.subUnit || ''}
            </div>
          </div>
        ),
      },
    ];
  }, [activeTab?.tone, expandedRowKeys, taskName, toggleRowExpand]);

  const pieceColumns = useMemo(
    () => [
      {
        title: 'نام قطعه',
        dataIndex: 'name',
        key: 'name',
        width: 220,
        render: (value: string) => value || '-',
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
        title: 'مقدار واحد اصلی',
        key: 'mainAmount',
        width: 180,
        render: (_: any, row: StageHandoverPieceDetail) => (
          <span className="font-semibold">{toQty(row.mainQty)} {row.mainUnit || ''}</span>
        ),
      },
      {
        title: 'مقدار واحد فرعی',
        key: 'subAmount',
        width: 180,
        render: (_: any, row: StageHandoverPieceDetail) => (
          <span className="font-semibold">{toQty(row.subQty)} {row.subUnit || ''}</span>
        ),
      },
    ],
    []
  );

  const totalsFooter = useMemo(() => {
    const mainByUnit: Record<string, number> = {};
    const subByUnit: Record<string, number> = {};
    summaryRows.forEach((row: any) => {
      const mainUnit = String(row?.unit || '').trim() || 'بدون واحد';
      const subUnit = String(row?.subUnit || '').trim() || 'بدون واحد';
      const mainQty = activeTab?.tone === 'neutral' ? toNumber(row.orderQty) : toNumber(row.tabMain);
      const subQty = activeTab?.tone === 'neutral' ? toNumber(row.orderSubQty) : toNumber(row.tabSub);
      mainByUnit[mainUnit] = (mainByUnit[mainUnit] || 0) + mainQty;
      subByUnit[subUnit] = (subByUnit[subUnit] || 0) + subQty;
    });
    return { mainByUnit, subByUnit };
  }, [activeTab?.tone, summaryRows]);

  return (
    <Modal
      title="فرم‌های تحویل کالا"
      open={open}
      onCancel={onClose}
      width="min(1120px, calc(100vw - 24px))"
      footer={null}
      destroyOnHidden
      styles={{ body: { maxHeight: '74vh', overflowY: 'auto' } }}
      centered
    >
      <div className="space-y-4 font-['Vazirmatn']" dir="rtl">
        <div className="rounded-2xl border border-[#c9b29a] bg-[#f7f1ea] p-4">
          <div className="text-lg font-black text-[#6f4a2d]">
            مدیریت تحویل‌های مرحله "{taskName}"
          </div>
        </div>

        {orderTitle ? (
          <div className="text-xs text-gray-600">
            نام سفارش تولید: <span className="font-semibold text-gray-800">{orderTitle}</span>
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <Tabs
            size="small"
            activeKey={tabKey}
            onChange={setTabKey}
            items={summaryTabs.map((tab) => ({ key: tab.key, label: tab.label }))}
          />
          <Table
            size="small"
            pagination={false}
            rowKey={(row: any) => String(row?.productId || 'product')}
            dataSource={summaryRows}
            scroll={{ x: true }}
            columns={summaryColumns as any}
            expandable={{
              expandIcon: () => null,
              expandedRowKeys,
              onExpand: (expanded, record: any) => {
                const key = String(record?.productId || '');
                setExpandedRowKeys((prev) =>
                  expanded ? [...new Set([...prev, key])] : prev.filter((item) => item !== key)
                );
              },
              rowExpandable: (record: any) => Array.isArray(record?.pieceDetails) && record.pieceDetails.length > 0,
              expandedRowRender: (record: any) => (
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(piece: StageHandoverPieceDetail) => String(piece?.key || `${record?.productId || 'product'}_piece`)}
                  columns={pieceColumns as any}
                  dataSource={record?.pieceDetails || []}
                  scroll={{ x: true }}
                />
              ),
            }}
          />
          <div className="px-3 py-2 text-xs border-t border-gray-200 bg-gray-50 flex flex-wrap gap-4">
            {Object.entries(totalsFooter.mainByUnit).map(([unit, total]) => (
              <span key={`main_${unit}`}>
                جمع واحد اصلی ({unit}): <span className="font-semibold">{toQty(total)}</span>
              </span>
            ))}
            {Object.entries(totalsFooter.subByUnit).map(([unit, total]) => (
              <span key={`sub_${unit}`}>
                جمع واحد فرعی ({unit}): <span className="font-semibold">{toQty(total)}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200">
          <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
            <div className="font-semibold text-sm">لیست فرم‌های تحویل کالا</div>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateForm} loading={loading}>
              فرم جدید
            </Button>
          </div>

          {forms.length === 0 ? (
            <div className="p-6">
              <Empty description="فرمی برای این مرحله ثبت نشده است." />
            </div>
          ) : (
            <Table
              size="small"
              rowKey={(record: StageHandoverFormListRow) => `${record.ownerTaskId}:${record.id}:${record.direction}`}
              pagination={false}
              dataSource={forms}
              scroll={{ x: true }}
              rowClassName={(record: StageHandoverFormListRow) =>
                String(record.id) === String(selectedFormId) ? 'bg-amber-50 cursor-pointer' : 'cursor-pointer'
              }
              onRow={(record) => ({
                onClick: () => {
                  onSelectForm(record.id);
                  onOpenForm(record.id, record.ownerTaskId);
                },
              })}
              columns={[
                {
                  title: 'نوع',
                  dataIndex: 'direction',
                  key: 'direction',
                  width: 90,
                  render: (value: StageHandoverFormListRow['direction']) =>
                    value === 'outgoing'
                      ? <Tag color="red">خروجی</Tag>
                      : <Tag color="green">ورودی</Tag>,
                },
                {
                  title: 'فرم',
                  dataIndex: 'title',
                  key: 'title',
                  width: 220,
                  render: (value: string) => value || '-',
                },
                {
                  title: 'مرحله تحویل‌دهنده',
                  dataIndex: 'giverStage',
                  key: 'giverStage',
                  width: 170,
                  render: (value: string) => value || '-',
                },
                {
                  title: 'نام تحویل‌دهنده',
                  dataIndex: 'giverName',
                  key: 'giverName',
                  width: 170,
                  render: (value: string) => value || '-',
                },
                {
                  title: 'مرحله تحویل‌گیرنده',
                  dataIndex: 'receiverStage',
                  key: 'receiverStage',
                  width: 170,
                  render: (value: string) => value || '-',
                },
                {
                  title: 'نام تحویل‌گیرنده',
                  dataIndex: 'receiverName',
                  key: 'receiverName',
                  width: 170,
                  render: (value: string) => value || '-',
                },
                {
                  title: 'تحویل‌دهنده',
                  key: 'giverConfirmed',
                  width: 130,
                  render: (_: any, record: StageHandoverFormListRow) =>
                    record.giverConfirmed ? <Tag color="green">تایید شده</Tag> : <Tag color="orange">در انتظار</Tag>,
                },
                {
                  title: 'تحویل‌گیرنده',
                  key: 'receiverConfirmed',
                  width: 130,
                  render: (_: any, record: StageHandoverFormListRow) =>
                    record.receiverConfirmed ? <Tag color="green">تایید شده</Tag> : <Tag color="orange">در انتظار</Tag>,
                },
                {
                  title: 'آخرین بروزرسانی',
                  dataIndex: 'updatedAt',
                  key: 'updatedAt',
                  render: (_: any, record: StageHandoverFormListRow) =>
                    formatDateTime(record.updatedAt || record.createdAt || null),
                },
              ]}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default TaskHandoverFormsModal;
