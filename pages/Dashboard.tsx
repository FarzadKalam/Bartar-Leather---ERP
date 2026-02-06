import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Dropdown, Statistic, Table, Timeline, Empty, Tag } from 'antd';
import {
  MoreOutlined,
  FileTextOutlined,
  ExperimentOutlined,
  SkinOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
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
      const recentActivity = [
        ...(invoices || []).slice(0, 3).filter(inv => inv.created_at).map(inv => ({
          time: inv.created_at,
          type: 'invoice',
          description: `فاکتور ${inv.name} ایجاد شد`,
          color: '#c58f60',
        })),
        ...(productionOrders || []).slice(0, 3).filter(po => po.created_at).map(po => ({
          time: po.created_at,
          type: 'production',
          description: `سفارش تولید ${po.name} ایجاد شد`,
          color: '#a67c52',
        })),
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 6);

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
    fetchDashboardData();
  }, []);

  // Helper functions
  const getStatusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      draft: 'پیش‌نویس',
      pending: 'در انتظار',
      in_progress: 'در حال تولید',
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
  const getWidgetMenu = (widgetId: string): MenuProps => ({
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg p-4 md:p-6">
      {/* Header Section */}
      <div className="mb-6">
        <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm p-6 border border-gray-200 dark:border-dark-border">
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
      <div className="mb-6">
        <Card 
          className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
          title={
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">افزودن سریع</span>
              <Dropdown menu={getWidgetMenu('quick-add')} trigger={['click']}>
                <Button type="text" icon={<MoreOutlined />} />
              </Dropdown>
            </div>
          }
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                size="large"
                block
                onClick={() => navigate('/invoices/create')}
                className="h-auto py-4"
              >
                <div className="text-center">
                  <div className="font-bold">فاکتور جدید</div>
                </div>
              </Button>
            </Col>
            <Col xs={24} sm={8}>
              <Button
                type="default"
                icon={<ExperimentOutlined />}
                size="large"
                block
                onClick={() => navigate('/production_orders/create')}
                className="h-auto py-4 border-leather-500 text-leather-500 hover:bg-leather-500 hover:text-white"
              >
                <div className="text-center">
                  <div className="font-bold">سفارش تولید</div>
                </div>
              </Button>
            </Col>
            <Col xs={24} sm={8}>
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
          </Row>
        </Card>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} className="mb-6">
        <Col xs={24} sm={12} lg={6}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate('/invoices')}
          >
            <div className="flex items-center justify-between">
              <Dropdown menu={getWidgetMenu('total-sales')} trigger={['click']}>
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
              valueStyle={{ color: '#c58f60', fontSize: '1.5rem', fontWeight: 'bold' }}
            />
            <div className="mt-2 text-green-600 text-sm flex items-center gap-1">
              <ArrowUpOutlined />
              <span>{toPersianNumber(stats.monthlyGrowth || 0)}% نسبت به ماه قبل</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => navigate('/production_orders')}
          >
            <div className="flex items-center justify-between">
              <Dropdown menu={getWidgetMenu('in-production')} trigger={['click']}>
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
              valueStyle={{ color: '#1890ff', fontSize: '1.5rem', fontWeight: 'bold' }}
            />
            <div className="mt-2 text-gray-600 text-sm flex items-center gap-1">
              <ClockCircleOutlined />
              <span>در حال انجام</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <Dropdown menu={getWidgetMenu('products-count')} trigger={['click']}>
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
              valueStyle={{ color: '#52c41a', fontSize: '1.5rem', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center justify-between">
              <Dropdown menu={getWidgetMenu('monthly-growth')} trigger={['click']}>
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
              valueStyle={{ color: stats.monthlyGrowth && stats.monthlyGrowth > 0 ? '#52c41a' : '#ff4d4f', fontSize: '1.5rem', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} className="mb-6">
        {/* Production Orders by Status - Pie Chart */}
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow h-full"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/production_orders')}>
                <span className="text-lg font-bold">سفارشات تولید بر اساس وضعیت</span>
                <Dropdown menu={getWidgetMenu('production-status')} trigger={['click']}>
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

        {/* Monthly Sales Chart */}
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow h-full"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/invoices')}>
                <span className="text-lg font-bold">فروش ماهانه</span>
                <Dropdown menu={getWidgetMenu('monthly-sales')} trigger={['click']}>
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
      </Row>

      {/* Tables Row */}
      <Row gutter={[16, 16]} className="mb-6">
        {/* Latest Invoices */}
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/invoices')}>
                <span className="text-lg font-bold">آخرین فاکتورها</span>
                <Dropdown menu={getWidgetMenu('latest-invoices')} trigger={['click']}>
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

        {/* Latest Production Orders */}
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/production_orders')}>
                <span className="text-lg font-bold">آخرین سفارشات تولید</span>
                <Dropdown menu={getWidgetMenu('latest-production')} trigger={['click']}>
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
      </Row>

      {/* Bottom Row */}
      <Row gutter={[16, 16]}>
        {/* Recent Activity Timeline */}
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow"
            title={
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">تغییرات اخیر</span>
                <Dropdown menu={getWidgetMenu('recent-activity')} trigger={['click']}>
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

        {/* Top Selling Products */}
        <Col xs={24} lg={12}>
          <Card
            className="shadow-sm hover:shadow-md transition-shadow"
            title={
              <div className="flex items-center justify-between cursor-pointer" onClick={() => navigate('/products')}>
                <span className="text-lg font-bold">پرفروش‌ترین محصولات</span>
                <Dropdown menu={getWidgetMenu('top-products')} trigger={['click']}>
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
      </Row>
    </div>
  );
};

export default Dashboard;
