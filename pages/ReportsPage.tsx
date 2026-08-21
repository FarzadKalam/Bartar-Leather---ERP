import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Select, Spin, Statistic, Table, Tag } from 'antd';
import type { ColumnType, ColumnsType } from 'antd/es/table';
import { FilterOutlined, PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import PersianDatePicker from '../components/PersianDatePicker';
import { supabase } from '../supabaseClient';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';

type ReportId = 'inventory' | 'movements' | 'trade' | 'production_flow' | 'performance';
type ReportColumn = { key: string; title: string; kind?: 'number' | 'price' | 'date' | 'status' };
type ReportDefinition = { id: ReportId; title: string; description: string; dateKey?: string; columns: ReportColumn[] };

const REPORTS: ReportDefinition[] = [
  {
    id: 'inventory', title: 'موجودی لحظه‌ای', description: 'موجودی به تفکیک کالا، بسته، انبار و قفسه',
    columns: [
      { key: 'product', title: 'محصول' }, { key: 'bundle', title: 'بسته محصول' }, { key: 'warehouse', title: 'انبار' }, { key: 'shelf', title: 'قفسه' },
      { key: 'stock', title: 'مقدار اصلی', kind: 'number' }, { key: 'main_unit', title: 'واحد اصلی' }, { key: 'sub_stock', title: 'مقدار فرعی', kind: 'number' }, { key: 'sub_unit', title: 'واحد فرعی' },
    ],
  },
  {
    id: 'movements', title: 'گردش موجودی', description: 'دفتر گردش ورود، خروج و جابه‌جایی بسته‌ها', dateKey: 'delivered_at',
    columns: [
      { key: 'delivered_at', title: 'تاریخ تحویل', kind: 'date' }, { key: 'transfer_type_label', title: 'نوع تردد', kind: 'status' }, { key: 'product', title: 'محصول' }, { key: 'bundle', title: 'بسته محصول' },
      { key: 'from_shelf', title: 'قفسه برداشت' }, { key: 'to_shelf', title: 'قفسه ورود' }, { key: 'delivered_qty', title: 'مقدار اصلی', kind: 'number' }, { key: 'required_qty', title: 'مقدار فرعی', kind: 'number' },
    ],
  },
  {
    id: 'trade', title: 'خرید و فروش', description: 'فاکتورهای خرید و فروش با مبلغ و وضعیت', dateKey: 'invoice_date',
    columns: [
      { key: 'invoice_date', title: 'تاریخ', kind: 'date' }, { key: 'direction', title: 'نوع', kind: 'status' }, { key: 'system_code', title: 'کد' }, { key: 'name', title: 'عنوان فاکتور' },
      { key: 'party', title: 'طرف حساب' }, { key: 'status_label', title: 'وضعیت', kind: 'status' }, { key: 'total_invoice_amount', title: 'مبلغ کل', kind: 'price' }, { key: 'remaining_balance', title: 'مانده', kind: 'price' },
    ],
  },
  {
    id: 'production_flow', title: 'مصرف و خروجی تولید', description: 'گردش کالاهای مرتبط با تولید و مراحل تولید', dateKey: 'delivered_at',
    columns: [
      { key: 'delivered_at', title: 'تاریخ تحویل', kind: 'date' }, { key: 'transfer_type_label', title: 'نوع حرکت', kind: 'status' }, { key: 'production_order', title: 'سفارش تولید' },
      { key: 'product', title: 'محصول' }, { key: 'bundle', title: 'بسته محصول' }, { key: 'from_shelf', title: 'مبدا' }, { key: 'to_shelf', title: 'مقصد' }, { key: 'delivered_qty', title: 'مقدار', kind: 'number' },
    ],
  },
  {
    id: 'performance', title: 'گزارش عملکرد تولید', description: 'وضعیت، مقدار، زمان و پیشرفت سفارش‌ها و مراحل تولید', dateKey: 'production_started_at',
    columns: [
      { key: 'production_started_at', title: 'شروع تولید', kind: 'date' }, { key: 'production_completed_at', title: 'تکمیل تولید', kind: 'date' }, { key: 'system_code', title: 'کد' }, { key: 'name', title: 'سفارش تولید' },
      { key: 'status_label', title: 'وضعیت', kind: 'status' }, { key: 'quantity', title: 'مقدار برنامه', kind: 'number' }, { key: 'task_count', title: 'تعداد مرحله', kind: 'number' }, { key: 'completed_task_count', title: 'مراحل تکمیل‌شده', kind: 'number' }, { key: 'produced_qty', title: 'خروجی ثبت‌شده', kind: 'number' }, { key: 'wage', title: 'دستمزد مراحل', kind: 'price' },
    ],
  },
];

const TRANSFER_TYPE_LABELS: Record<string, string> = {
  production: 'تولید', production_stage: 'مرحله تولید', sales_invoice: 'فاکتور فروش', purchase_invoice: 'فاکتور خرید',
  sales_invoice_cancel: 'برگشت فروش', purchase_invoice_cancel: 'برگشت خرید', opening_balance: 'موجودی اول دوره', inventory_count: 'انبارگردانی', waste: 'ضایعات', stock_adjustment: 'اصلاح موجودی', inventory_row_deletion: 'حذف ردیف موجودی',
};
const INVOICE_STATUS_LABELS: Record<string, string> = { created: 'ایجاد شده', proforma: 'پیش فاکتور', final: 'نهایی', settled: 'تسویه شده', completed: 'تکمیل شده', cancelled: 'لغو شده' };
const PRODUCTION_STATUS_LABELS: Record<string, string> = { pending: 'در انتظار', in_progress: 'در حال تولید', completed: 'تکمیل شده' };
const numeric = (value: any) => Number.isFinite(Number(value)) ? Number(value) : 0;
const norm = (value: any) => String(value ?? '').trim().toLocaleLowerCase('fa-IR');
const dayValue = (value: any) => String(value || '').slice(0, 10);
const displayValue = (value: any, kind?: ReportColumn['kind']) => {
  if (kind === 'date') return safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '-';
  if (kind === 'price') return formatPersianPrice(value || 0) || '۰';
  if (kind === 'number') return toPersianNumber(Math.round(numeric(value) * 1000) / 1000);
  return value === null || value === undefined || value === '' ? '-' : String(value);
};

const ReportsPage: React.FC = () => {
  const { message } = App.useApp();
  const { reportId: routeReportId } = useParams();
  const [reportId, setReportId] = useState<ReportId>('inventory');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const activeReport = REPORTS.find((report) => report.id === reportId) || REPORTS[0];

  useEffect(() => {
    if (REPORTS.some((report) => report.id === routeReportId)) setReportId(routeReportId as ReportId);
  }, [routeReportId]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: { moduleTitle: 'گزارش‌ها', moduleId: 'reports', recordName: activeReport.title } }));
    return () => { window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null })); };
  }, [activeReport.title]);

  const loadLookups = useCallback(async () => {
    const [products, bundles, shelves, warehouses, customers, suppliers, orders] = await Promise.all([
      supabase.from('products').select('*').limit(3000), supabase.from('product_bundles').select('*').limit(3000), supabase.from('shelves').select('*').limit(3000),
      supabase.from('warehouses').select('*').limit(1000), supabase.from('customers').select('*').limit(3000), supabase.from('suppliers').select('*').limit(3000), supabase.from('production_orders').select('*').limit(3000),
    ]);
    const map = (items: any[] | null | undefined, label: (item: any) => string) => new Map((items || []).map((item) => [String(item.id), label(item) || String(item.id)]));
    const shelfWarehouseIds = new Map((shelves.data || []).map((item: any) => [String(item.id), String(item.warehouse_id || '')]));
    return {
      products: map(products.data, (item) => [item.system_code, item.name].filter(Boolean).join(' - ')), bundles: map(bundles.data, (item) => item.bundle_number || item.system_code),
      shelves: map(shelves.data, (item) => item.name || item.system_code), warehouses: map(warehouses.data, (item) => item.name || item.system_code),
      customers: map(customers.data, (item) => [item.first_name, item.last_name, item.name, item.business_name].filter(Boolean).join(' ') || item.system_code),
      suppliers: map(suppliers.data, (item) => item.business_name || item.name || item.system_code), orders: map(orders.data, (item) => [item.system_code, item.name].filter(Boolean).join(' - ')), shelfWarehouseIds,
    };
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const lookups = await loadLookups();
      if (reportId === 'inventory') {
        const { data, error } = await supabase.from('product_inventory').select('*').limit(5000);
        if (error) throw error;
        setRows((data || []).map((row: any) => {
          const shelfId = String(row.shelf_id || '');
          const warehouseId = String(row.warehouse_id || lookups.shelfWarehouseIds.get(shelfId) || '');
          return { ...row, key: row.id || `${row.product_id}-${row.bundle_id}-${row.shelf_id}`, product: lookups.products.get(String(row.product_id)) || '-', bundle: lookups.bundles.get(String(row.bundle_id)) || '-', shelf: lookups.shelves.get(shelfId) || '-', warehouse: lookups.warehouses.get(warehouseId) || '-' };
        }));
      } else if (reportId === 'trade') {
        const [sales, purchases] = await Promise.all([supabase.from('invoices').select('*').limit(5000), supabase.from('purchase_invoices').select('*').limit(5000)]);
        if (sales.error) throw sales.error; if (purchases.error) throw purchases.error;
        setRows([
          ...(sales.data || []).map((row: any) => ({ ...row, key: `sale-${row.id}`, direction: 'فروش', party: lookups.customers.get(String(row.customer_id)) || '-', status_label: INVOICE_STATUS_LABELS[row.status] || row.status || '-' })),
          ...(purchases.data || []).map((row: any) => ({ ...row, key: `purchase-${row.id}`, direction: 'خرید', party: lookups.suppliers.get(String(row.supplier_id)) || '-', status_label: INVOICE_STATUS_LABELS[row.status] || row.status || '-' })),
        ]);
      } else if (reportId === 'performance') {
        const [orders, tasks] = await Promise.all([supabase.from('production_orders').select('*').limit(5000), supabase.from('tasks').select('*').eq('related_to_module', 'production_orders').limit(10000)]);
        if (orders.error) throw orders.error; if (tasks.error) throw tasks.error;
        const tasksByOrder = new Map<string, any[]>();
        (tasks.data || []).forEach((task: any) => { const key = String(task.related_production_order || ''); if (key) tasksByOrder.set(key, [...(tasksByOrder.get(key) || []), task]); });
        setRows((orders.data || []).map((order: any) => {
          const orderTasks = tasksByOrder.get(String(order.id)) || [];
          return { ...order, key: order.id, status_label: PRODUCTION_STATUS_LABELS[order.status] || order.status || '-', task_count: orderTasks.length, completed_task_count: orderTasks.filter((task) => task.status === 'done').length, produced_qty: orderTasks.reduce((sum, task) => sum + numeric(task.produced_qty), 0), wage: orderTasks.reduce((sum, task) => sum + numeric(task.wage), 0) };
        }));
      } else {
        const { data, error } = await supabase.from('stock_transfers').select('*').limit(10000);
        if (error) throw error;
        const productionOnly = reportId === 'production_flow';
        setRows((data || []).filter((row: any) => !productionOnly || ['production', 'production_stage'].includes(String(row.transfer_type))).map((row: any) => ({
          ...row, key: row.id, delivered_at: row.delivered_at || row.created_at, transfer_type_label: TRANSFER_TYPE_LABELS[row.transfer_type] || row.transfer_type || '-',
          product: lookups.products.get(String(row.product_id)) || '-', bundle: lookups.bundles.get(String(row.bundle_id)) || '-', from_shelf: lookups.shelves.get(String(row.from_shelf_id)) || '-', to_shelf: lookups.shelves.get(String(row.to_shelf_id)) || '-', production_order: lookups.orders.get(String(row.production_order_id)) || '-',
        })));
      }
    } catch (error: any) {
      message.error(`خواندن گزارش ناموفق بود: ${error?.message || 'خطای نامشخص'}`);
      setRows([]);
    } finally { setLoading(false); }
  }, [loadLookups, message, reportId]);

  useEffect(() => { setFilters({}); setFromDate(null); setToDate(null); void loadReport(); }, [loadReport]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    if (activeReport.dateKey) { const date = dayValue(row[activeReport.dateKey]); if (fromDate && (!date || date < fromDate)) return false; if (toDate && (!date || date > toDate)) return false; }
    return Object.entries(filters).every(([key, value]) => !value || norm(row[key]).includes(norm(value)));
  }), [activeReport.dateKey, filters, fromDate, rows, toDate]);

  const uniqueOptions = useCallback((key: string) => Array.from(new Set(rows.map((row) => String(row[key] || '')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fa')), [rows]);
  const columns = useMemo<ColumnsType<any>>(() => activeReport.columns.map((column) => {
    const filterDropdown: ColumnType<any>['filterDropdown'] = ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => <div className="p-2 min-w-[190px]" onKeyDown={(event) => event.stopPropagation()}><Input autoFocus value={selectedKeys[0]} placeholder={`فیلتر ${column.title}`} onChange={(event) => setSelectedKeys(event.target.value ? [event.target.value] : [])} onPressEnter={() => confirm()} /><div className="flex gap-2 mt-2"><Button size="small" type="primary" onClick={() => confirm()}>اعمال</Button><Button size="small" onClick={() => { clearFilters?.(); confirm(); }}>حذف</Button><Button size="small" type="link" onClick={() => close()}>بستن</Button></div></div>;
    return { title: column.title, dataIndex: column.key, key: column.key, sorter: (left: any, right: any) => String(left[column.key] ?? '').localeCompare(String(right[column.key] ?? ''), 'fa', { numeric: true }), filterDropdown, onFilter: (value: any, row: any) => norm(row[column.key]).includes(norm(value)), render: (value: any) => column.kind === 'status' ? <Tag color="green">{displayValue(value, column.kind)}</Tag> : displayValue(value, column.kind) };
  }), [activeReport.columns, uniqueOptions]);

  const totalPrimary = useMemo(() => filteredRows.reduce((sum, row) => sum + numeric(row.delivered_qty ?? row.stock ?? row.quantity), 0), [filteredRows]);
  const printReport = () => {
    const html = `<html dir="rtl"><head><meta charset="utf-8"/><title>${activeReport.title}</title><style>body{font-family:Tahoma,sans-serif;padding:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #999;padding:7px;text-align:right}th{background:#eef5f0}</style></head><body><h2>${activeReport.title}</h2><p>تاریخ چاپ: ${new Date().toLocaleString('fa-IR')}</p><table><thead><tr>${activeReport.columns.map((column) => `<th>${column.title}</th>`).join('')}</tr></thead><tbody>${filteredRows.map((row) => `<tr>${activeReport.columns.map((column) => `<td>${String(displayValue(row[column.key], column.kind)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
    const popup = window.open('', '_blank');
    if (!popup) { message.error('باز کردن پنجره چاپ توسط مرورگر مسدود شده است.'); return; }
    popup.opener = null;
    popup.document.write(html); popup.document.close(); popup.focus(); setTimeout(() => popup.print(), 200);
  };

  return <div className="p-4 md:p-6 max-w-[1800px] mx-auto space-y-5" dir="rtl">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black text-[#17372a] m-0">گزارش‌ها</h1><p className="text-sm text-gray-500 mt-1 mb-0">گزارش‌های عملیاتی با فیلترهای ترکیبی، بازه زمانی، فیلتر سرستون و چاپ</p></div><div className="flex gap-2"><Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadReport()}>بروزرسانی</Button><Button type="primary" icon={<PrinterOutlined />} onClick={printReport}>چاپ گزارش</Button></div></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">{REPORTS.map((report) => <button type="button" key={report.id} onClick={() => setReportId(report.id)} className={`text-right rounded-2xl border p-4 transition ${report.id === reportId ? 'border-leather-600 bg-leather-600 text-white shadow-lg' : 'border-gray-200 bg-white hover:border-leather-300'}`}><div className="font-black">{report.title}</div><div className={`mt-1 text-xs ${report.id === reportId ? 'text-white/80' : 'text-gray-500'}`}>{report.description}</div></button>)}</div>
    <Card className="rounded-2xl"><div className="flex items-center gap-2 mb-4 font-bold"><FilterOutlined /> فیلترهای گزارش</div><div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">{activeReport.dateKey ? <><div><div className="text-xs mb-1">از تاریخ</div><PersianDatePicker type="DATE" value={fromDate} onChange={setFromDate} placeholder="بدون محدودیت" /></div><div><div className="text-xs mb-1">تا تاریخ</div><PersianDatePicker type="DATE" value={toDate} onChange={setToDate} placeholder="بدون محدودیت" /></div></> : null}{activeReport.columns.filter((column) => column.kind !== 'date').map((column) => <div key={column.key}><div className="text-xs mb-1">{column.title}</div><Select allowClear showSearch optionFilterProp="label" className="w-full" placeholder={`همه ${column.title}`} value={filters[column.key] || undefined} options={uniqueOptions(column.key).map((value) => ({ label: value, value }))} onChange={(value) => setFilters((previous) => ({ ...previous, [column.key]: String(value || '') }))} /></div>)}</div><div className="mt-3"><Button onClick={() => { setFilters({}); setFromDate(null); setToDate(null); }}>پاک کردن همه فیلترها</Button></div></Card>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><Card><Statistic title="تعداد ردیف‌های منطبق" value={toPersianNumber(filteredRows.length)} /></Card><Card><Statistic title="جمع مقدار اصلی" value={toPersianNumber(Math.round(totalPrimary * 1000) / 1000)} /></Card><Card><Statistic title="گزارش فعال" value={activeReport.title} /></Card></div>
    <Card className="rounded-2xl" title={<span className="font-black">{activeReport.title}</span>} extra={<span className="text-xs text-gray-500">برای فیلتر سریع هر ستون، آیکون فیلتر سرستون را استفاده کنید.</span>}>{loading ? <div className="py-20 text-center"><Spin size="large" /></div> : filteredRows.length === 0 ? <Empty description="داده‌ای مطابق فیلترها یافت نشد." /> : <Table size="small" rowKey="key" columns={columns} dataSource={filteredRows} pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: [20, 50, 100, 200], showTotal: (total) => `${toPersianNumber(total)} ردیف` }} scroll={{ x: 'max-content' }} />}</Card>
  </div>;
};

export default ReportsPage;
