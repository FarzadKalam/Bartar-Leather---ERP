import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Avatar, Card, Row, Col, Button, Dropdown, Statistic, Table, Timeline, Empty, Select, Switch, Tag } from 'antd';
import {
  MoreOutlined,
  FileTextOutlined,
  ExperimentOutlined,
  SkinOutlined,
  UserOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import { DASHBOARD_PERMISSION_KEY } from '../utils/permissions';
import { normalizeStoragePublicUrl } from '../utils/storageUrls';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import type { MenuProps } from 'antd';


interface DashboardStats {
  totalSales: number;
  inProductionOrders: number;
  productionOrdersByStatus: { status: string; count: number; }[];
  latestInvoices: any[];
  latestProductionOrders: any[];
  recentActivity: any[];
  monthlySales: { month: string; amount: number; }[];
  topSellingProducts: { product: string; quantity: number; }[];
  monthlyGrowth?: number;
  totalProductsCount?: number;
  totalProductionOrders?: number;
}

type ProductionWorkflowStage = {
  id: string;
  name: string;
  status: string;
  dueDate?: string | null;
  assigneeName: string;
  assigneeAvatar?: string | null;
  assigneeIsRole?: boolean;
};

type ProductionWorkflowGroup = {
  id: string;
  name: string;
  status: string;
  orders: Array<{ id: string; name: string; status: string; stages: ProductionWorkflowStage[] }>;
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    inProductionOrders: 0,
    productionOrdersByStatus: [],
    latestInvoices: [],
    latestProductionOrders: [],
    recentActivity: [],
    monthlySales: [],
    topSellingProducts: [],
    monthlyGrowth: 0,
    totalProductsCount: 0,
    totalProductionOrders: 0,
  });
  const [widgetPermissions, setWidgetPermissions] = useState<Record<string, boolean>>({});
  const [canViewAllProductionLines, setCanViewAllProductionLines] = useState(false);
  const [showAllProductionLines, setShowAllProductionLines] = useState(false);
  const [productionStatusFilter, setProductionStatusFilter] = useState<string[]>([]);
  const [productionWorkflowLoading, setProductionWorkflowLoading] = useState(false);
  const [productionWorkflowGroups, setProductionWorkflowGroups] = useState<ProductionWorkflowGroup[]>([]);
  const stageClickTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (stageClickTimerRef.current !== null) window.clearTimeout(stageClickTimerRef.current);
  }, []);

  // Get today's Persian date
  const getTodayPersianDate = () => {
    try {
      const dateObj = new DateObject({
        date: new Date(),
        calendar: gregorian,
        locale: gregorian_en,
      }).convert(persian, persian_fa);
      return dateObj.format('dddd، DD MMMM YYYY');
    } catch (error) {
      console.error('Error formatting Persian date:', error);
      return 'تاریخ امروز';
    }
  };

  const formatPersianDate = (val: any, format: string) => {
    if (!val) return '-';
    try {
      let dateObj: DateObject;
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        dateObj = new DateObject({
          date: val,
          format: 'YYYY-MM-DD',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else {
        const jsDate = new Date(val);
        if (Number.isNaN(jsDate.getTime())) return '-';
        dateObj = new DateObject({
          date: jsDate,
          calendar: gregorian,
          locale: gregorian_en,
        });
      }
      return dateObj.convert(persian, persian_fa).format(format);
    } catch {
      return '-';
    }
  };

  const canShowWidget = (key: string) => {
    if (widgetPermissions.__all === false) return false;
    return widgetPermissions[key] !== false;
  };

  const fetchDashboardWidgetPermissions = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) {
        setWidgetPermissions({});
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.role_id) {
        setWidgetPermissions({});
        return;
      }

      const { data: role } = await supabase
        .from('org_roles')
        .select('permissions, title')
        .eq('id', profile.role_id)
        .maybeSingle();

      const dashboardPerms = role?.permissions?.[DASHBOARD_PERMISSION_KEY] || {};
      const canViewDashboard = dashboardPerms.view !== false;
      if (!canViewDashboard) {
        setWidgetPermissions({ __all: false });
        return;
      }

      const fields = dashboardPerms.fields || {};
      // نقش‌های مدیریتی موجود، بدون نیاز به تنظیم دستیِ دوباره، از ابتدا نمای همه را می‌بینند.
      const isManagerRole = /مدیر|management|manager|admin|administrator|مالک/i.test(String(role?.title || ''));
      const canViewAll = fields.production_lines_all === true || isManagerRole;
      setCanViewAllProductionLines(canViewAll);
      setShowAllProductionLines(canViewAll);
      setWidgetPermissions(fields);
    } catch {
      setWidgetPermissions({});
      setCanViewAllProductionLines(false);
      setShowAllProductionLines(false);
    }
  };

  const fetchProductionWorkflowWidget = async () => {
    setProductionWorkflowLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_dashboard_production_workflow', {
        p_include_all: showAllProductionLines,
        p_statuses: productionStatusFilter.length ? productionStatusFilter : null,
      });
      if (error) throw error;
      const grouped = new Map<string, ProductionWorkflowGroup>();
      (data || []).forEach((row: any) => {
        const groupId = String(row?.group_id || '__ungrouped__');
        const current = grouped.get(groupId) || {
          id: groupId,
          name: String(row?.group_name || 'سفارش‌های بدون گروه'),
          status: String(row?.group_status || ''),
          orders: [],
        };
        const orderId = String(row?.production_order_id || '');
        let order = current.orders.find((item) => item.id === orderId);
        if (!order) {
          order = {
            id: orderId,
            name: String(row?.production_order_name || 'سفارش تولید'),
            status: String(row?.production_order_status || 'draft'),
            stages: [],
          };
          current.orders.push(order);
        }
        order.stages.push({
          id: String(row?.stage_id || ''),
          name: String(row?.stage_name || 'مرحله'),
          status: String(row?.stage_status || 'todo'),
          dueDate: row?.due_date || null,
          assigneeName: String(row?.assignee_name || 'مسئول تعیین‌نشده'),
          assigneeAvatar: normalizeStoragePublicUrl(row?.assignee_avatar_url) || null,
          assigneeIsRole: !!row?.assignee_is_role,
        });
        grouped.set(groupId, current);
      });
      setProductionWorkflowGroups(Array.from(grouped.values()));
    } catch (error) {
      console.error('Error fetching production workflow dashboard widget', error);
      setProductionWorkflowGroups([]);
    } finally {
      setProductionWorkflowLoading(false);
    }
  };

  // Fetch dashboard data
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch invoices for sales statistics
      const { data: invoices } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch production orders
      const { data: productionOrders } = await supabase
        .from('production_orders')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch products for top-selling calculation
      const { data: products } = await supabase
        .from('products')
        .select('*');

      // Fetch recent changelogs from tasks table
      const { data: changelogTasks } = await supabase
        .from('tasks')
        .select('id, task_type, name, created_at, recurrence_info')
        .ilike('task_type', 'log|%')
        .order('created_at', { ascending: false })
        .limit(10);

      // Calculate total sales
      const totalSales = invoices?.reduce((sum, inv) => sum + (inv.total_invoice_amount || 0), 0) || 0;

      // Count in-production orders
      const inProductionOrders = productionOrders?.filter(po => po.status === 'in_production').length || 0;

      // Production orders by status
      const statusCounts = productionOrders?.reduce((acc: any, po) => {
        const status = po.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {}) || {};
      
      const productionOrdersByStatus = Object.entries(statusCounts).map(([status, count]) => ({
        status: getStatusLabel(status as string),
        count: count as number,
      }));

      // Calculate total production orders count
      const totalProductionOrders = productionOrdersByStatus.reduce((sum, s) => sum + s.count, 0);

      // Latest 5 invoices
      const latestInvoices = (invoices || []).slice(0, 5);

      // Latest 5 production orders
      const latestProductionOrders = (productionOrders || []).slice(0, 5);

      // Recent activity timeline (combining invoices and production orders)
      const moduleTitles: Record<string, string> = Object.keys(MODULES).reduce((acc: any, key) => {
        acc[key] = MODULES[key]?.titles?.fa || MODULES[key]?.titles?.en || key;
        return acc;
      }, {});

      const fieldLabelMap: Record<string, string> = {
        name: 'نام',
        sell_price: 'قیمت فروش',
        buy_price: 'قیمت خرید واحد اصلی',
        sub_buy_price: 'قیمت خرید واحد فرعی',
        price: 'قیمت',
      };

      const getFieldLabel = (moduleId: string | undefined, fieldKey: string | undefined) => {
        if (!moduleId || !fieldKey) return fieldKey || 'فیلد';
        const def = MODULES[moduleId]?.fields?.find((f: any) => f.key === fieldKey);
        return (def as any)?.label || (def as any)?.title || fieldLabelMap[fieldKey] || fieldKey;
      };

      const changelogActivity = (changelogTasks || []).map(task => {
        const meta = (task as any).recurrence_info || {};
        const fieldLabel = getFieldLabel(meta.module_id, meta.field_key);
        const oldVal = meta.old_value ?? 'خالی';
        const newVal = meta.new_value ?? 'خالی';
        const moduleLabel = meta.module_id ? moduleTitles[meta.module_id] || meta.module_id : '';
        const userName = meta.user_name || 'سیستم';
        const description = `${userName} ${fieldLabel}${moduleLabel ? ` در ${moduleLabel}` : ''} را از "${oldVal}" به "${newVal}" تغییر داد`;
        return {
          time: task.created_at,
          type: 'change',
          description,
          color: '#5f9075',
        };
      });

      const recentActivity = [
        ...changelogActivity,
        ...(invoices || []).slice(0, 3).filter(inv => inv.created_at).map(inv => ({
          time: inv.created_at,
          type: 'invoice',
          description: `فاکتور ${inv.name} ایجاد شد`,
          color: '#356d52',
        })),
        ...(productionOrders || []).slice(0, 3).filter(po => po.created_at).map(po => ({
          time: po.created_at,
          type: 'production',
          description: `سفارش تولید ${po.name} ایجاد شد`,
          color: '#285641',
        })),
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10);

      // Monthly sales (last 6 months)
      const monthlySales = calculateMonthlySales(invoices || []);

      // Top selling products
      const topSellingProducts = calculateTopSellingProducts(invoices || [], products || []);

      // Calculate monthly growth
      const monthlyGrowth = calculateMonthlyGrowth(monthlySales);

      // Get actual product count
      const totalProductsCount = products?.length || 0;

      setStats({
        totalSales,
        inProductionOrders,
        productionOrdersByStatus,
        latestInvoices,
        latestProductionOrders,
        recentActivity,
        monthlySales,
        topSellingProducts,
        monthlyGrowth,
        totalProductsCount,
        totalProductionOrders,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardWidgetPermissions();
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (!canShowWidget('production_lines')) return;
    void fetchProductionWorkflowWidget();
  }, [showAllProductionLines, canViewAllProductionLines, productionStatusFilter, widgetPermissions.production_lines]);

  // Helper functions
  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      draft: 'پیش‌نویس',
      pending: 'در انتظار',
      in_progress: 'در حال تولید',
      in_production: 'در حال تولید',
      todo: 'انجام نشده',
      completed: 'تکمیل شده',
      cancelled: 'لغو شده',
      on_hold: 'معلق',
    };
    return labels[status] || status;
  };
  
  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      draft: 'default',
      pending: 'orange',
      in_production: 'blue',
      in_progress: 'blue',
      todo: 'red',
      completed: 'green',
      cancelled: 'red',
      on_hold: 'purple',
    };
    return colors[status] || 'default';
  };

  const calculateMonthlySales = (invoices: any[]): { month: string; amount: number; }[] => {
    try {
      const last6Months = Array.from({ length: 6 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = new DateObject({
          date,
          calendar: gregorian,
          locale: gregorian_en,
        }).convert(persian, persian_fa).format('MMMM');
        return { monthKey, monthLabel };
      }).reverse();

      return last6Months.map(({ monthKey, monthLabel }) => {
        const monthTotal = invoices
          .filter(inv => inv.invoice_date && inv.invoice_date.startsWith(monthKey))
          .reduce((sum, inv) => sum + (inv.total_invoice_amount || 0), 0);
        
        return { month: monthLabel, amount: monthTotal };
      });
    } catch (error) {
      console.error('Error calculating monthly sales:', error);
      return [];
    }
  };

  const calculateTopSellingProducts = (invoices: any[], products: any[]): { product: string; quantity: number; }[] => {
    const productSales: Record<string, number> = {};
    
    invoices.forEach(invoice => {
      if (invoice.invoiceItems && Array.isArray(invoice.invoiceItems)) {
        invoice.invoiceItems.forEach((item: any) => {
          const productId = item.product_id;
          if (productId) {
            productSales[productId] = (productSales[productId] || 0) + (item.quantity || 0);
          }
        });
      }
    });

    const sortedProducts = Object.entries(productSales)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([productId, quantity]) => {
        const product = products.find(p => p.id === productId);
        return {
          product: product?.name || `محصول ${productId}`,
          quantity,
        };
      });

    return sortedProducts;
  };

  const calculateMonthlyGrowth = (monthlySales: { month: string; amount: number; }[]): number => {
    if (monthlySales.length < 2) return 0;
    
    const currentMonth = monthlySales[monthlySales.length - 1];
    const previousMonth = monthlySales[monthlySales.length - 2];
    
    if (previousMonth.amount === 0) return 0;
    
    const growth = ((currentMonth.amount - previousMonth.amount) / previousMonth.amount) * 100;
    return Math.round(growth * 10) / 10; // Round to 1 decimal
  };

  // Widget menu items
  const getWidgetMenu = (): MenuProps => ({
    items: [
      {
        key: 'today',
        label: 'امروز',
      },
      {
        key: 'week',
        label: 'هفته جاری',
      },
      {
        key: 'month',
        label: 'ماه جاری',
      },
      {
        key: 'year',
        label: 'سال جاری',
      },
    ],
  });

  // Invoice table columns
  const invoiceColumns = [
    {
      title: 'عنوان',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => text || '-',
    },
    {
      title: 'تاریخ',
      dataIndex: 'invoice_date',
      key: 'invoice_date',
      render: (date: string) => formatPersianDate(date, 'YYYY/MM/DD'),
    },
    {
      title: 'مبلغ',
      dataIndex: 'total_invoice_amount',
      key: 'total_invoice_amount',
      render: (amount: number) => formatPersianPrice(amount) + ' تومان',
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{getStatusLabel(status)}</Tag>
      ),
    },
  ];

  // Production order table columns
  const productionOrderColumns = [
    {
      title: 'عنوان',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => text || '-',
    },
    {
      title: 'تاریخ شروع',
      dataIndex: 'start_date',
      key: 'start_date',
      render: (date: string) => formatPersianDate(date, 'YYYY/MM/DD'),
    },
    {
      title: 'وضعیت',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{getStatusLabel(status)}</Tag>
      ),
    },
  ];

  const productionStatusOptions = [
    { value: 'draft', label: 'پیش‌نویس' },
    { value: 'pending', label: 'در انتظار' },
    { value: 'in_production', label: 'در حال تولید' },
    { value: 'in_progress', label: 'در حال تولید' },
    { value: 'completed', label: 'تکمیل شده' },
    { value: 'cancelled', label: 'لغو شده' },
    { value: 'on_hold', label: 'معلق' },
  ];

  const visibleProductionWorkflowGroups = useMemo(() => productionWorkflowGroups
    .map((group) => ({
      ...group,
      orders: group.orders.filter((order) => (
        productionStatusFilter.length === 0 || productionStatusFilter.includes(order.status)
      )),
    }))
    .filter((group) => group.orders.length > 0), [productionStatusFilter, productionWorkflowGroups]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6faf7_0%,#eef5f0_100%)] dark:bg-dark-bg p-4 md:p-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="bg-white/95 dark:bg-dark-surface rounded-[2rem] shadow-[0_22px_50px_rgba(17,41,31,0.08)] p-6 border border-leather-100 dark:border-dark-border">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-black text-leather-500 mb-2">
                تولیدی چرم مهربانو
              </h1>
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <CalendarOutlined />
                <span className="text-sm">{getTodayPersianDate()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Section */}
      {canShowWidget('quick_add') && (
      <div className="mb-6">
        <Card 
          className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          title={
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">افزودن سریع</span>
              <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                <Button type="text" icon={<MoreOutlined />} />
              </Dropdown>
            </div>
          }
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                size="large"
                block
                onClick={() => navigate('/invoices/create')}
                className="h-auto py-4"
              >
                <div className="text-center">
                  <div className="font-bold">فاکتور فروش جدید</div>
                </div>
              </Button>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Button
                type="default"
                icon={<ExperimentOutlined />}
                size="large"
                block
                onClick={() => navigate('/production_orders/create')}
                className="h-auto py-4 border-leather-500 text-leather-500 hover:bg-leather-500 hover:text-white"
              >
                <div className="text-center">
                  <div className="font-bold">سفارش تولید جدید</div>
                </div>
              </Button>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Button
                type="default"
                icon={<SkinOutlined />}
                size="large"
                block
                onClick={() => navigate('/products/create')}
                className="h-auto py-4"
              >
                <div className="text-center">
                  <div className="font-bold">محصول جدید</div>
                </div>
              </Button>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Button
                type="default"
                icon={<UserOutlined />}
                size="large"
                block
                onClick={() => navigate('/customers/create')}
                className="h-auto py-4"
              >
                <div className="text-center">
                  <div className="font-bold">مشتری جدید</div>
                </div>
              </Button>
            </Col>
          </Row>
        </Card>
      </div>
      )}

      {/* KPI Cards */}
      {(canShowWidget('kpi_total_sales') || canShowWidget('kpi_in_production') || canShowWidget('kpi_total_products') || canShowWidget('kpi_monthly_growth')) && (
      <Row gutter={[16, 16]} className="mb-6">
        {canShowWidget('kpi_total_sales') && (
        <Col xs={24} sm={12} lg={6} className="flex">
          <Card
            className="shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full min-h-[170px] w-full"
            onClick={() => navigate('/invoices')}
          >
            <div className="flex items-center justify-between">
              <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                <Button 
                  type="text" 
                  icon={<MoreOutlined />} 
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
            <Statistic
              title="مجموع فروش"
              value={stats.totalSales}
              formatter={(value) => formatPersianPrice(value as number)}
              suffix="تومان"
              valueStyle={{ color: '#356d52', fontSize: '1.5rem', fontWeight: 'bold' }}
            />
            <div className="mt-2 text-green-600 text-sm flex items-center gap-1">
              <ArrowUpOutlined />
              <span>{toPersianNumber(stats.monthlyGrowth || 0)}% نسبت به ماه قبل</span>
            </div>
          </Card>
        </Col>
        )}
        {canShowWidget('kpi_in_production') && (
        <Col xs={24} sm={12} lg={6} className="flex">
          <Card
            className="shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full min-h-[170px] w-full"
            onClick={() => navigate('/production_orders')}
          >
            <div className="flex items-center justify-between">
              <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                <Button 
                  type="text" 
                  icon={<MoreOutlined />} 
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
            <Statistic
              title="سفارشات در حال تولید"
              value={stats.inProductionOrders}
              formatter={(value) => toPersianNumber(value as number)}
              valueStyle={{ color: '#1f4534', fontSize: '1.5rem', fontWeight: 'bold' }}
            />
            <div className="mt-2 text-gray-600 text-sm flex items-center gap-1">
              <ClockCircleOutlined />
              <span>در حال انجام</span>
            </div>
          </Card>
        </Col>
        )}
        {canShowWidget('kpi_total_products') && (
        <Col xs={24} sm={12} lg={6} className="flex">
          <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full min-h-[170px] w-full">
            <div className="flex items-center justify-between">
              <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                <Button 
                  type="text" 
                  icon={<MoreOutlined />} 
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
            <Statistic
              title="تعداد محصولات"
              value={stats.totalProductsCount || 0}
              formatter={(value) => toPersianNumber(value as number)}
              valueStyle={{ color: '#356d52', fontSize: '1.5rem', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        )}
        {canShowWidget('kpi_monthly_growth') && (
        <Col xs={24} sm={12} lg={6} className="flex">
          <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full min-h-[170px] w-full">
            <div className="flex items-center justify-between">
              <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                <Button 
                  type="text" 
                  icon={<MoreOutlined />} 
                  size="small"
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
            <Statistic
              title="رشد ماهانه"
              value={stats.monthlyGrowth || 0}
              formatter={(value) => toPersianNumber(value as number)}
              suffix="%"
              prefix={stats.monthlyGrowth && stats.monthlyGrowth > 0 ? <ArrowUpOutlined /> : undefined}
              valueStyle={{ color: stats.monthlyGrowth && stats.monthlyGrowth > 0 ? '#356d52' : '#ff4d4f', fontSize: '1.5rem', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        )}
      </Row>
      )}

      {canShowWidget('production_lines') && (
        <div className="mb-6">
          <Card
            className="shadow-sm"
            title={<span className="text-lg font-bold">نوارهای تولید</span>}
            extra={(
              <div className="flex items-center gap-3 flex-wrap">
                <Select
                  mode="multiple"
                  allowClear
                  value={productionStatusFilter}
                  onChange={setProductionStatusFilter}
                  options={productionStatusOptions}
                  placeholder="فیلتر وضعیت"
                  className="min-w-48"
                  maxTagCount="responsive"
                />
                {canViewAllProductionLines ? (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>همه سفارش‌ها</span>
                    <Switch checked={showAllProductionLines} onChange={setShowAllProductionLines} size="small" />
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">فقط مراحل من</span>
                )}
              </div>
            )}
          >
            {productionWorkflowLoading ? (
              <div className="py-10 text-center text-gray-500">در حال بارگیری نوارهای تولید…</div>
            ) : visibleProductionWorkflowGroups.length === 0 ? (
              <Empty description={showAllProductionLines ? 'مرحله‌ای برای نمایش وجود ندارد' : 'در هیچ مرحلهٔ تولیدی مسئول نیستید'} />
            ) : (
              <div className="space-y-4">
                {visibleProductionWorkflowGroups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-leather-50 px-4 py-2 flex items-center justify-between gap-3">
                      <span className="font-bold text-leather-800">{group.name}</span>
                      {group.status ? <Tag color={getStatusColor(group.status)}>{getStatusLabel(group.status)}</Tag> : null}
                    </div>
                    <div className="p-3 space-y-3">
                      {group.orders.map((order) => (
                        <button
                          type="button"
                          key={order.id}
                          className="w-full text-right rounded-lg border border-gray-100 p-3 hover:border-leather-300 hover:bg-leather-50/40 transition-colors"
                          onClick={() => navigate(`/production_orders/${order.id}`)}
                        >
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="font-semibold text-gray-800">{order.name}</span>
                            <Tag color={getStatusColor(order.status)}>{getStatusLabel(order.status)}</Tag>
                          </div>
                          <div className="flex min-h-20 rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                            {order.stages.map((stage, index) => (
                              <div
                                key={stage.id}
                                role="button"
                                tabIndex={0}
                                title="کلیک: جزئیات مرحله · دابل‌کلیک: فرم‌های تحویل"
                                className={`relative flex-1 min-w-28 px-3 py-2 text-center text-white cursor-pointer hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white/90 ${index ? 'border-r border-white/30' : ''}`}
                                style={{ backgroundColor: getStatusColor(stage.status) === 'green' ? '#10b981' : getStatusColor(stage.status) === 'blue' ? '#3b82f6' : getStatusColor(stage.status) === 'orange' ? '#f97316' : getStatusColor(stage.status) === 'red' ? '#ef4444' : '#9ca3af' }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (stageClickTimerRef.current !== null) window.clearTimeout(stageClickTimerRef.current);
                                  stageClickTimerRef.current = window.setTimeout(() => {
                                    navigate(`/production_orders/${order.id}?stage=${encodeURIComponent(stage.id)}`);
                                    stageClickTimerRef.current = null;
                                  }, 220);
                                }}
                                onDoubleClick={(event) => {
                                  event.stopPropagation();
                                  if (stageClickTimerRef.current !== null) window.clearTimeout(stageClickTimerRef.current);
                                  stageClickTimerRef.current = null;
                                  navigate(`/production_orders/${order.id}?stage=${encodeURIComponent(stage.id)}&handover=forms`);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== 'Enter' && event.key !== ' ') return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  navigate(`/production_orders/${order.id}?stage=${encodeURIComponent(stage.id)}`);
                                }}
                              >
                                <Avatar
                                  size={26}
                                  src={stage.assigneeAvatar || undefined}
                                  icon={stage.assigneeIsRole ? <TeamOutlined /> : <UserOutlined />}
                                  className="!absolute right-2 top-2 !bg-white/90 !text-leather-700"
                                />
                                <div className="font-bold text-xs truncate mt-7">{stage.name}</div>
                                <div className="text-[10px] truncate opacity-95">{stage.assigneeName}</div>
                                <div className="text-[9px] truncate opacity-90 mt-0.5">
                                  {getStatusLabel(stage.status)}{stage.dueDate ? ` · ${formatPersianDate(stage.dueDate, 'YYYY/MM/DD HH:mm')}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Charts Row */}
      {(canShowWidget('chart_production_status') || canShowWidget('chart_monthly_sales')) && (
      <Row gutter={[16, 16]} className="mb-6">
        {/* Production Orders by Status - Pie Chart */}
        {canShowWidget('chart_production_status') && (
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow h-full"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/production_orders')}>
                <span className="text-lg font-bold">سفارشات تولید بر اساس وضعیت</span>
                <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                  <Button 
                    type="text" 
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            }
          >
            {stats.productionOrdersByStatus.length > 0 ? (
              <div className="space-y-4">
                {stats.productionOrdersByStatus.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg rounded-lg">
                    <span className="font-medium">{item.status}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-200 dark:bg-dark-border rounded-full h-2">
                        <div
                          className="bg-leather-500 h-2 rounded-full"
                          style={{
                            width: stats.totalProductionOrders && stats.totalProductionOrders > 0 
                              ? `${(item.count / stats.totalProductionOrders) * 100}%` 
                              : '0%',
                          }}
                        />
                      </div>
                      <span className="font-bold text-leather-500 min-w-[3rem] text-left">
                        {toPersianNumber(item.count)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="داده‌ای وجود ندارد" />
            )}
          </Card>
        </Col>
        )}

        {/* Monthly Sales Chart */}
        {canShowWidget('chart_monthly_sales') && (
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow h-full"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/invoices')}>
                <span className="text-lg font-bold">فروش ماهانه</span>
                <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                  <Button 
                    type="text" 
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            }
          >
            {stats.monthlySales.length > 0 ? (
              <div className="space-y-4">
                {stats.monthlySales.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg rounded-lg">
                    <span className="font-medium">{item.month}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-200 dark:bg-dark-border rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{
                            width: `${Math.min((item.amount / Math.max(...stats.monthlySales.map(m => m.amount))) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="font-bold text-blue-500 min-w-[6rem] text-left">
                        {formatPersianPrice(item.amount, false)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="داده‌ای وجود ندارد" />
            )}
          </Card>
        </Col>
        )}
      </Row>
      )}

      {/* Tables Row */}
      {(canShowWidget('table_latest_invoices') || canShowWidget('table_latest_production_orders')) && (
      <Row gutter={[16, 16]} className="mb-6">
        {/* Latest Invoices */}
        {canShowWidget('table_latest_invoices') && (
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/invoices')}>
                <span className="text-lg font-bold">آخرین فاکتورها</span>
                <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                  <Button 
                    type="text" 
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            }
            extra={
              <Button type="link" onClick={() => navigate('/invoices')}>
                مشاهده همه
              </Button>
            }
          >
            <Table
              dataSource={stats.latestInvoices}
              columns={invoiceColumns}
              pagination={false}
              size="small"
              loading={loading}
              rowKey="id"
              onRow={(record) => ({
                onClick: () => navigate(`/invoices/${record.id}`),
                className: 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border',
              })}
            />
          </Card>
        </Col>
        )}

        {/* Latest Production Orders */}
        {canShowWidget('table_latest_production_orders') && (
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/production_orders')}>
                <span className="text-lg font-bold">آخرین سفارشات تولید</span>
                <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                  <Button 
                    type="text" 
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            }
            extra={
              <Button type="link" onClick={() => navigate('/production_orders')}>
                مشاهده همه
              </Button>
            }
          >
            <Table
              dataSource={stats.latestProductionOrders}
              columns={productionOrderColumns}
              pagination={false}
              size="small"
              loading={loading}
              rowKey="id"
              onRow={(record) => ({
                onClick: () => navigate(`/production_orders/${record.id}`),
                className: 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border',
              })}
            />
          </Card>
        </Col>
        )}
      </Row>
      )}

      {/* Bottom Row */}
      {(canShowWidget('timeline_recent_activity') || canShowWidget('top_selling_products')) && (
      <Row gutter={[16, 16]}>
        {/* Recent Activity Timeline */}
        {canShowWidget('timeline_recent_activity') && (
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow"
            title={
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">تغییرات اخیر</span>
                <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                  <Button type="text" icon={<MoreOutlined />} />
                </Dropdown>
              </div>
            }
          >
            {stats.recentActivity.length > 0 ? (
              <Timeline
                items={stats.recentActivity.map((activity, index) => ({
                  key: index,
                  color: activity.color,
                  children: (
                    <div>
                      <div className="font-medium">{activity.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatPersianDate(activity.time, 'YYYY/MM/DD HH:mm')}
                      </div>
                    </div>
                  ),
                }))}
              />
            ) : (
              <Empty description="فعالیتی وجود ندارد" />
            )}
          </Card>
        </Col>
        )}

        {/* Top Selling Products */}
        {canShowWidget('top_selling_products') && (
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/products')}>
                <span className="text-lg font-bold">پرفروش‌ترین محصولات</span>
                <Dropdown menu={getWidgetMenu()} trigger={['click']}>
                  <Button 
                    type="text" 
                    icon={<MoreOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              </div>
            }
          >
            {stats.topSellingProducts.length > 0 ? (
              <div className="space-y-4">
                {stats.topSellingProducts.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border transition-colors cursor-pointer" onClick={() => navigate('/products')}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-leather-500 text-white flex items-center justify-center font-bold">
                        {toPersianNumber(index + 1)}
                      </div>
                      <span className="font-medium">{item.product}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-32 bg-gray-200 dark:bg-dark-border rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{
                            width: `${(item.quantity / Math.max(...stats.topSellingProducts.map(p => p.quantity))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="font-bold text-green-600 min-w-[3rem] text-left">
                        {toPersianNumber(item.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="داده‌ای وجود ندارد" />
            )}
          </Card>
        </Col>
        )}
      </Row>
      )}
    </div>
  );
};

export default Dashboard;
