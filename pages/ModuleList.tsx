import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, Progress, Checkbox, Dropdown, Space, DatePicker, InputNumber, Empty, Spin, message, Drawer, Input } from 'antd';
import { 
  PlusOutlined, AppstoreOutlined, BarsOutlined, MoreOutlined,
  ExportOutlined, ImportOutlined, DeploymentUnitOutlined, BarChartOutlined,
  SearchOutlined, FilterOutlined, ClearOutlined, ReloadOutlined
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, FieldDefinition } from '../types';
import SmartForm from '../components/SmartForm';

const { RangePicker } = DatePicker;

// --- Helper Functions ---
const getStockStatus = (stock: number, reorderPoint: number) => {
  const max = (reorderPoint * 5) || 100;
  const percent = Math.min((stock / max) * 100, 100);
  let color = '#52c41a';
  if (stock <= reorderPoint) color = '#ff4d4f';
  else if (stock <= (reorderPoint * 2)) color = '#faad14';
  return { percent, color };
};

const ModuleList: React.FC = () => {
  const { moduleId = 'products' } = useParams();
  const navigate = useNavigate();
  const moduleConfig = MODULES[moduleId] || MODULES['products'];
  
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(moduleConfig?.defaultViewMode === 'grid' ? 'grid' : 'table');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // اضافه کردن هوک useMessage برای جلوگیری از وارنینگ استاتیک
  const [messageApi, contextHolder] = message.useMessage();

  const fetchData = async () => {
    setLoading(true);
    try {
      const tableName = moduleId; 
      const { data: result, error } = await supabase
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (result) setData(result);
    } catch (error: any) {
      console.error('Error fetching:', error);
      messageApi.error('خطا در دریافت اطلاعات'); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (moduleConfig) fetchData();
  }, [moduleId]);

  if (!moduleConfig) return <div>ماژول یافت نشد</div>;

  // --- Search Logic (Simplified for brevity, logic remains same) ---
  const getColumnSearchProps = (field: FieldDefinition) => {
    // ... (همان کدهای قبلی سرچ که تغییری نکردن رو اینجا فرض میکنیم هست)
    // برای جلوگیری از شلوغی اینجا تکرار نکردم، اگر کپی کردی و ارور داد بگو
    // ولی منطقش همونیه که تو فایل قبلی بود.
     if ([FieldType.SELECT, FieldType.STATUS, FieldType.MULTI_SELECT].includes(field.type)) {
        return {
          filters: field.options?.map(opt => ({ text: opt.label, value: opt.value })),
          onFilter: (value: any, record: any) => record[field.key] === value,
          filterIcon: (filtered: boolean) => <FilterOutlined style={{ color: filtered ? '#c58f60' : '#888' }} />,
        };
      }
      return {
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }: any) => (
          <div className="p-2 bg-white dark:bg-dark-surface border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
            <Input
              placeholder={`جستجو`}
              value={selectedKeys[0]}
              onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
              onPressEnter={() => confirm()}
              className="mb-2 text-xs"
            />
            <Space>
              <Button type="primary" onClick={() => confirm()} icon={<SearchOutlined />} size="small" />
              <Button onClick={() => clearFilters()} size="small">پاک</Button>
            </Space>
          </div>
        ),
        filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? '#c58f60' : '#888' }} />,
        onFilter: (value: any, record: any) => record[field.key] ? record[field.key].toString().toLowerCase().includes(value.toLowerCase()) : false,
      };
  };

  const dynamicColumns = moduleConfig.fields
    .filter(f => f.isKey || f.key === 'stock' || f.key === 'sell_price')
    .sort((a,b) => a.order - b.order)
    .slice(0, 6)
    .map(field => {
       // ... (کد ستون‌ها بدون تغییر)
       const col: any = {
        title: field.labels.fa,
        dataIndex: field.key,
        key: field.key,
        width: field.key === 'name' ? 200 : 120,
        ...getColumnSearchProps(field),
        render: (val: any, record: any) => {
             if (field.key === 'name') {
            return (
              <div className="flex items-center gap-2 py-0.5">
                 {record.image_url && <img src={record.image_url} className="w-8 h-8 rounded-md object-cover border border-gray-200 dark:border-gray-700 hidden md:block" alt="" />}
                 <div className="flex flex-col leading-tight overflow-hidden">
                    <span className="font-bold text-gray-900 dark:text-gray-200 text-[11px] md:text-sm cursor-pointer hover:text-leather-500 transition-colors truncate" onClick={() => navigate(`/${moduleId}/${record.id}`)}>{val}</span>
                    <span className="text-[9px] text-gray-500 dark:text-gray-500 font-mono tracking-tighter uppercase">{record.sku || record.custom_code}</span>
                 </div>
              </div>
            );
          }
          if (field.type === FieldType.STOCK) {
             const { percent, color } = getStockStatus(val, record.reorder_point || 10);
             return (
              <div className="flex flex-col w-full gap-0.5">
                 <span style={{ color }} className="text-[10px] font-black">{val}</span>
                 <Progress percent={percent} strokeColor={color} showInfo={false} size={2} trailColor="#404040" />
              </div>
             );
          }
          if (field.type === FieldType.PRICE) {
             return <span className="font-black text-gray-800 dark:text-gray-300 text-[11px]">{val?.toLocaleString('fa-IR')} <span className="text-[8px] text-gray-400">ت</span></span>
          }
          if (field.type === FieldType.STATUS) {
             const opt = field.options?.find(o => o.value === val);
             return <Tag color={opt?.color || 'default'} className="border-none text-[9px] font-bold">{opt?.label || val}</Tag>;
          }
          return <span className="text-gray-500 dark:text-gray-400 text-[11px]">{val}</span>;
        }
      };
      if (field.key === 'name') col.fixed = 'right';
      return col;
    });

  // آیتم‌های منو به فرمت جدید
  const toolItems = [
      { key: 'export', label: 'خروجی اکسل', icon: <ExportOutlined /> },
      { key: 'import', label: 'وارد کردن داده‌ها', icon: <ImportOutlined /> },
      { key: 'workflow', label: 'گردش کار', icon: <DeploymentUnitOutlined /> },
      { key: 'reports', label: 'گزارشات آماری', icon: <BarChartOutlined /> },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 space-y-4 w-full">
      {contextHolder}
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white/80 dark:bg-dark-surface/90 backdrop-blur-xl p-4 md:p-6 rounded-[2rem] border border-gray-300 dark:border-gray-800 shadow-lg gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-leather-500 to-leather-800 flex items-center justify-center text-white text-lg shadow-lg">
             <AppstoreOutlined />
          </div>
          <h1 className="text-base md:text-2xl font-black text-gray-900 dark:text-white m-0 tracking-tighter">{moduleConfig.titles.fa}</h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Button type="text" onClick={fetchData} icon={<ReloadOutlined className={loading ? 'animate-spin' : ''} />} />
          <div className="flex items-center p-0.5 bg-gray-200 dark:bg-dark-surface rounded-xl">
             <Button size="small" type={viewMode === 'table' ? 'primary' : 'text'} icon={<BarsOutlined />} onClick={() => setViewMode('table')} className={viewMode === 'table' ? 'bg-leather-500' : ''} />
             <Button size="small" type={viewMode === 'grid' ? 'primary' : 'text'} icon={<AppstoreOutlined />} onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? 'bg-leather-500' : ''} />
          </div>
          
          {/* اصلاح Dropdown */}
          <Dropdown menu={{ items: toolItems }} trigger={['click']}>
             <Button shape="circle" icon={<MoreOutlined rotate={90} />} />
          </Dropdown>
          
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsDrawerOpen(true)} className="bg-leather-500 border-none font-black rounded-2xl px-4 md:px-6 h-10 md:h-12 hidden md:flex items-center">جدید</Button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-[60vh] w-full relative">
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20 backdrop-blur-sm rounded-[2rem]"><Spin size="large" /></div>}

        {!loading && data.length === 0 && (
             <div className="flex items-center justify-center h-64 border border-gray-200 dark:border-gray-800 rounded-[2rem] bg-white/50">
                <Empty description="داده‌ای موجود نیست" />
                <Button type="primary" onClick={() => setIsDrawerOpen(true)} className="mt-4 bg-leather-500">افزودن اولین رکورد</Button>
             </div>
        )}

        {data.length > 0 && viewMode === 'table' && (
          <div className="bg-white dark:bg-dark-surface rounded-[2rem] border border-gray-300 dark:border-gray-800 shadow-xl overflow-hidden">
            <Table 
              rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
              columns={dynamicColumns} 
              dataSource={data} 
              rowKey="id"
              pagination={{ pageSize: 12, position: ['bottomCenter'], size: 'small' }}
              className="custom-erp-table-compact" 
              scroll={{ x: 900 }} 
            />
          </div>
        )}

        {/* Grid View */}
          {data.length > 0 && viewMode === 'grid' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
              {data.map(item => {
                const isSelected = selectedRowKeys.includes(item.id);
                return (
                  <div 
                      key={item.id} 
                    // کلیک روی کل کارت برای رفتن به جزئیات
                      onClick={() => navigate(`/${moduleId}/${item.id}`)}
                      className={`bg-white dark:bg-dark-surface border rounded-[1.5rem] p-3 md:p-5 relative group transition-all duration-300 hover:shadow-2xl cursor-pointer ${isSelected ? 'border-leather-500 bg-leather-500/5' : 'border-gray-300 dark:border-gray-800'}`}
                  >
                    <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                     <Checkbox 
                        checked={isSelected} 
                        onChange={(e) => {
                            e.target.checked 
                                ? setSelectedRowKeys([...selectedRowKeys, item.id]) 
                                : setSelectedRowKeys(selectedRowKeys.filter(k => k !== item.id))
                        }}
                     />
                  </div>
                  
                  {/* نمایش تصویر */}
                  <div className="aspect-[4/3] rounded-xl overflow-hidden mb-3 border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-black/20">
                    {item.image_url ? (
                        <img src={item.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full text-gray-400">
                           <AppstoreOutlined className="text-3xl" />
                        </div>
                    )}
                  </div>
                    
                  <div className="px-1">
                      <Tag className="bg-gray-100 dark:bg-dark-bg border-none text-gray-600 dark:text-gray-400 text-[8px] font-black mb-1 uppercase tracking-tighter">
                          {/* نمایش لیبل فارسی وضعیت یا دسته‌بندی */}
                          {item.category || item.status}
                      </Tag>
                      <h3 className="text-gray-900 dark:text-gray-200 font-bold text-[11px] md:text-sm mb-3 line-clamp-1 group-hover:text-leather-500 transition-colors">{item.name}</h3>
                      
                      <div className="flex justify-between items-center border-t border-gray-200 dark:border-gray-800/50 pt-3">
                         {item.sell_price ? (
                              <span className="text-leather-500 font-black text-[11px] md:text-sm">{item.sell_price.toLocaleString()}</span>
                         ) : (
                             <span className="text-[10px] text-gray-500">بدون قیمت</span>
                         )}
                      </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drawer */}
      <Drawer
        title={`افزودن ${moduleConfig.titles.fa} جدید`}
        width={720}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
        styles={{ body: { paddingBottom: 80 } }}
        destroyOnClose
        zIndex={5000} // رفع مشکل زیر سایدبار رفتن
      >
        <SmartForm 
            moduleConfig={moduleConfig}
            onSuccess={() => {
                setIsDrawerOpen(false);
                fetchData();
            }}
            onCancel={() => setIsDrawerOpen(false)}
        />
      </Drawer>

      <style>{`
        .custom-erp-table-compact .ant-table-thead > tr > th { background: #f3f4f6 !important; font-size: 10px !important; }
        .dark .custom-erp-table-compact .ant-table-thead > tr > th { background: #262626 !important; color: #bbb; }
        .dark .ant-drawer-content { background-color: #141414; }
        .dark .ant-drawer-header { border-bottom: 1px solid #303030; }
        .dark .ant-drawer-title { color: white; }
      `}</style>
    </div>
  );
};

export default ModuleList;