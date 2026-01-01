import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, Progress, Checkbox, Dropdown, Menu, Space, InputNumber, Empty, Spin, message, Drawer, Select, Tooltip, App, Modal } from 'antd';
import { 
  PlusOutlined, AppstoreOutlined, BarsOutlined, MoreOutlined,
  ExportOutlined, ImportOutlined, DeploymentUnitOutlined, BarChartOutlined,
  ReloadOutlined, EyeOutlined, EditOutlined, DeleteOutlined, ClearOutlined
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, SavedView } from '../types';
import SmartForm from '../components/SmartForm';
import { getColumnSearchProps } from '../utils/filterUtils';
import ViewManager from '../components/ViewManager';

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
  const { message: messageApi, modal } = App.useApp();
  
  const moduleConfig = MODULES[moduleId] || MODULES['products'];
  
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(moduleConfig?.defaultViewMode === 'grid' ? 'grid' : 'table');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Drawer States
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // For Create
  const [isBulkEditDrawerOpen, setIsBulkEditDrawerOpen] = useState(false); // For Bulk Edit
  
  // View Manager States
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isViewManagerOpen, setIsViewManagerOpen] = useState(false);
  const [viewToEdit, setViewToEdit] = useState<SavedView | null>(null);
  const [activeColumns, setActiveColumns] = useState<string[]>([]);

  // تابع کمکی برای پیدا کردن لیبل فارسی آپشن‌ها
  const getOptionLabel = (fieldKey: string, value: any) => {
      const field = moduleConfig.fields.find(f => f.key === fieldKey);
      if (!field || !field.options) return value;
      const opt = field.options.find((o: any) => o.value === value);
      return opt ? opt.label : value;
  };

  const fetchViews = async () => {
    const { data } = await supabase.from('views').select('*').eq('module_id', moduleId);
    if (data) setSavedViews(data);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase.from(moduleId).select('*').order('created_at', { ascending: false });

      if (activeViewId) {
          const view = savedViews.find(v => v.id === activeViewId);
          if (view && view.config.filters) {
              view.config.filters.forEach(f => {
                  if (f.value !== undefined && f.value !== null && f.value !== '') {
                      if(f.operator === 'ilike') query = query.ilike(f.field, `%${f.value}%`);
                      else if(f.operator === 'gt') query = query.gt(f.field, f.value);
                      else if(f.operator === 'lt') query = query.lt(f.field, f.value);
                      else query = query.eq(f.field, f.value);
                  }
              });
          }
      }

      const { data: result, error } = await query;
      if (error) throw error;
      if (result) setData(result);
    } catch (error: any) {
      console.error('Error fetching:', error);
      messageApi.error('خطا در دریافت اطلاعات'); 
    } finally {
      setLoading(false);
    }
  };

  const getDefaultColumns = () => {
      return moduleConfig.fields
        .filter(f => 
            f.location === 'header' || 
            f.isKey === true ||
            ['stock', 'sell_price', 'status', 'category'].includes(f.key)
        )
        .filter(f => !(f.key === 'image_url')) // عکس و کد رو در نام ادغام میکنیم
        .map(f => f.key);
  };

  useEffect(() => {
    if (moduleConfig) {
      fetchViews();
      setActiveColumns(getDefaultColumns());
      setActiveViewId(null);
      setSelectedRowKeys([]); // Reset selection on module change
    }
  }, [moduleId]);

  useEffect(() => {
    fetchData();
    if (activeViewId) {
        const view = savedViews.find(v => v.id === activeViewId);
        if (view) setActiveColumns(view.config.columns);
    } else {
        setActiveColumns(getDefaultColumns());
    }
  }, [activeViewId, moduleId]);

  const handleDeleteView = (viewId: string, viewName: string) => {
    modal.confirm({
      title: `حذف لیست "${viewName}"`,
      content: 'آیا از حذف این لیست اطمینان دارید؟',
      okType: 'danger',
      onOk: async () => {
        const { error } = await supabase.from('views').delete().eq('id', viewId);
        if (!error) {
          messageApi.success('لیست حذف شد');
          if (activeViewId === viewId) setActiveViewId(null);
          fetchViews();
        } else {
          messageApi.error(error.message);
        }
      }
    });
  };

  const handleEditView = (view: SavedView | null) => {
    setViewToEdit(view);
    setIsViewManagerOpen(true);
  };

  // --- عملیات حذف گروهی ---
  const handleBulkDelete = () => {
      modal.confirm({
          title: `حذف ${selectedRowKeys.length} رکورد`,
          content: 'آیا مطمئن هستید؟ این عملیات غیرقابل بازگشت است.',
          okType: 'danger',
          okText: 'بله، حذف کن',
          cancelText: 'انصراف',
          onOk: async () => {
              const { error } = await supabase.from(moduleId).delete().in('id', selectedRowKeys);
              if (error) messageApi.error(error.message);
              else {
                  messageApi.success('رکوردها حذف شدند');
                  setSelectedRowKeys([]);
                  fetchData();
              }
          }
      });
  };

  if (!moduleConfig) return <div>ماژول یافت نشد</div>;

  const dynamicColumns = moduleConfig.fields
    .filter(f => activeColumns.includes(f.key))
    .sort((a, b) => activeColumns.indexOf(a.key) - activeColumns.indexOf(b.key))
    .map(field => {
       const col: any = {
        title: field.labels.fa,
        dataIndex: field.key,
        key: field.key,
        width: field.key === 'name' ? 200 : 120,
        ...getColumnSearchProps(field, (keys, confirm) => confirm(), (clear) => clear()),
        render: (val: any, record: any) => {
          if (field.key === 'name') {
            return (
              <div className="flex items-center gap-2 py-0.5">
                 {record.image_url && <img src={record.image_url} className="w-8 h-8 rounded-md object-cover border border-gray-200 dark:border-gray-700 hidden md:block" alt="" />}
                 <div className="flex flex-col leading-tight overflow-hidden">
                    <span className="font-bold text-gray-900 dark:text-gray-200 text-[11px] md:text-sm cursor-pointer hover:text-leather-500 transition-colors truncate" onClick={() => navigate(`/${moduleId}/${record.id}`)}>{val}</span>
                    <span className="text-[9px] text-gray-500 dark:text-gray-500 font-mono tracking-tighter uppercase">
                        {record.system_code || record.custom_code}
                    </span>
                 </div>
              </div>
            );
          }
          // نمایش کد سیستمی اگر ستون جداگانه باشد
          if (field.key === 'system_code') {
              return <span className="font-mono text-xs">{val}</span>;
          }
          if (field.type === FieldType.STOCK) {
             const { percent, color } = getStockStatus(val || 0, record.reorder_point || 10);
             return (
              <div className="flex flex-col w-full gap-0.5">
                 <span style={{ color }} className="text-[10px] font-black">{val}</span>
                 <Progress percent={percent} strokeColor={color} showInfo={false} size={2} trailColor="#404040" />
              </div>
             );
          }
          if (field.type === FieldType.PRICE) return <span className="font-black text-gray-800 dark:text-gray-300 text-[11px]">{val?.toLocaleString('fa-IR')} <span className="text-[8px] text-gray-400">ت</span></span>;
          if (field.type === FieldType.STATUS) {
             const opt = field.options?.find(o => o.value === val);
             return <Tag color={opt?.color || 'default'} className="border-none text-[9px] font-bold">{opt?.label || val}</Tag>;
          }
          // اصلاح نمایش لیبل فارسی برای Select
          if (field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT) {
             return <span>{getOptionLabel(field.key, val)}</span>;
          }
          return <span className="text-gray-500 dark:text-gray-400 text-[11px]">{val}</span>;
        }
      };
      if (field.key === 'name') col.fixed = 'right';
      return col;
    });

  const toolItems = [
      { key: 'export', label: 'خروجی اکسل', icon: <ExportOutlined /> },
      { key: 'import', label: 'وارد کردن داده‌ها', icon: <ImportOutlined /> },
      { key: 'workflow', label: 'گردش کار', icon: <DeploymentUnitOutlined /> },
      { key: 'reports', label: 'گزارشات آماری', icon: <BarChartOutlined /> },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 space-y-4 w-full pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white/80 dark:bg-dark-surface/90 backdrop-blur-xl p-4 md:p-6 rounded-[2rem] border border-gray-300 dark:border-gray-800 shadow-lg gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-leather-500 to-leather-800 flex items-center justify-center text-white text-lg shadow-lg">
             <AppstoreOutlined />
          </div>
          <div className="flex flex-col">
              <h1 className="text-base md:text-2xl font-black text-gray-900 dark:text-white m-0 tracking-tighter">{moduleConfig.titles.fa}</h1>
              <span className="text-xs text-gray-500">{activeViewId ? savedViews.find(v => v.id === activeViewId)?.name : 'نمای پیش‌فرض'}</span>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <div className="flex items-center gap-1 bg-white dark:bg-dark-bg border border-gray-300 dark:border-gray-700 rounded-xl px-2 py-1 h-10">
              <EyeOutlined className="text-gray-400" />
              <Select 
                variant="borderless"
                value={activeViewId}
                onChange={setActiveViewId}
                placeholder="انتخاب نما"
                style={{ width: 180 }}
                className="text-xs"
                optionRender={(option) => {
                    const view = savedViews.find(v => v.id === option.value);
                    if (option.value === null) {
                        return (
                            <div className="flex justify-between items-center group w-full">
                                <span>{option.label}</span>
                                <Button type="text" size="small" icon={<EditOutlined />} className="hidden group-hover:flex text-gray-400" onClick={(e) => { e.stopPropagation(); handleEditView(null); }} />
                            </div>
                        );
                    }
                    if (!view) return <span>{option.label}</span>;
                    return (
                        <div className="flex justify-between items-center group w-full">
                            <span>{view.name}</span>
                            <Space className="hidden group-hover:flex" size={0}>
                                <Button type="text" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); handleEditView(view); }} />
                                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDeleteView(view.id, view.name); }} />
                            </Space>
                        </div>
                    );
                }}
                options={[{ label: 'نمای پیش‌فرض', value: null }, ...savedViews.map(v => ({ label: v.name, value: v.id }))]}
                dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Space style={{ padding: '8px', width: '100%' }}>
                        <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={() => { setViewToEdit(null); setIsViewManagerOpen(true); }}>ساخت نمای جدید</Button>
                      </Space>
                    </>
                  )}
              />
          </div>

          <Tooltip title="بروزرسانی"><Button type="text" onClick={fetchData} icon={<ReloadOutlined className={loading ? 'animate-spin' : ''} />} /></Tooltip>
          
          <div className="flex items-center p-0.5 bg-gray-200 dark:bg-dark-surface rounded-xl">
             <Button size="small" type={viewMode === 'table' ? 'primary' : 'text'} icon={<BarsOutlined />} onClick={() => setViewMode('table')} className={viewMode === 'table' ? 'bg-leather-500' : ''} />
             <Button size="small" type={viewMode === 'grid' ? 'primary' : 'text'} icon={<AppstoreOutlined />} onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? 'bg-leather-500' : ''} />
          </div>
          
          <Dropdown menu={{ items: toolItems }} trigger={['click']}><Button shape="circle" icon={<MoreOutlined rotate={90} />} /></Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsDrawerOpen(true)} className="bg-leather-500 border-none font-black rounded-2xl px-4 md:px-6 h-10 md:h-12 hidden md:flex items-center">جدید</Button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-[60vh] w-full relative">
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 z-20 backdrop-blur-sm rounded-[2rem]"><Spin size="large" /></div>}

        {!loading && data.length === 0 && (
             <div className="flex items-center justify-center h-64 border border-gray-200 dark:border-gray-800 rounded-[2rem] bg-white/50 dark:bg-dark-surface/50">
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
                    onClick={() => navigate(`/${moduleId}/${item.id}`)}
                    className={`bg-white dark:bg-dark-surface border rounded-[1.5rem] p-3 md:p-5 relative group transition-all duration-300 hover:shadow-2xl cursor-pointer ${isSelected ? 'border-leather-500 bg-leather-500/5' : 'border-gray-300 dark:border-gray-800'}`}
                >
                  <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                     <Checkbox 
                        checked={isSelected} 
                        onChange={(e) => { e.target.checked ? setSelectedRowKeys([...selectedRowKeys, item.id]) : setSelectedRowKeys(selectedRowKeys.filter(k => k !== item.id)) }}
                     />
                  </div>
                  
                  <div className="aspect-[4/3] rounded-xl overflow-hidden mb-3 border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-black/20">
                    {item.image_url ? (
                        <img src={item.image_url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                    ) : (
                        <div className="flex items-center justify-center w-full h-full text-gray-400"><AppstoreOutlined className="text-3xl" /></div>
                    )}
                  </div>
                    
                  <div className="px-1">
                      {/* اصلاح نمایش لیبل فارسی در گرید */}
                      <div className="flex gap-1 mb-1">
                          <Tag className="bg-gray-100 dark:bg-dark-bg border-none text-gray-600 dark:text-gray-400 text-[8px] font-black uppercase tracking-tighter">
                              {getOptionLabel('category', item.category) || getOptionLabel('status', item.status)}
                          </Tag>
                          {item.system_code && (
                              <Tag className="bg-blue-50 text-blue-600 border-none text-[8px] font-mono">
                                  {item.system_code}
                              </Tag>
                          )}
                      </div>
                      <h3 className="text-gray-900 dark:text-gray-200 font-bold text-[11px] md:text-sm mb-3 line-clamp-1 group-hover:text-leather-500 transition-colors">{item.name}</h3>
                      
                      <div className="flex justify-between items-center border-t border-gray-200 dark:border-gray-800/50 pt-3">
                         {item.sell_price ? <span className="text-leather-500 font-black text-[11px] md:text-sm">{item.sell_price.toLocaleString()}</span> : <span className="text-[10px] text-gray-500">بدون قیمت</span>}
                      </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Bulk Actions Bar (نوار عملیات گروهی) --- */}
      {selectedRowKeys.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-[#1f1f1f] border border-gray-200 dark:border-gray-700 shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 animate-slideUp">
              <span className="font-bold text-gray-700 dark:text-gray-300 ml-2">{selectedRowKeys.length} انتخاب شده</span>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2"></div>
              <Button type="text" icon={<EditOutlined />} onClick={() => setIsBulkEditDrawerOpen(true)}>ویرایش گروهی</Button>
              <Button type="text" danger icon={<DeleteOutlined />} onClick={handleBulkDelete}>حذف</Button>
              <Button type="text" icon={<ClearOutlined />} onClick={() => setSelectedRowKeys([])}>لغو انتخاب</Button>
          </div>
      )}

      <ViewManager moduleConfig={moduleConfig} isOpen={isViewManagerOpen} onClose={() => setIsViewManagerOpen(false)} viewToEdit={viewToEdit} onViewSaved={(newView) => { fetchViews(); setActiveViewId(newView.id); }} />
      
      {/* Create Drawer */}
      <Drawer title={`افزودن ${moduleConfig.titles.fa} جدید`} width={720} onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen} styles={{ body: { paddingBottom: 80 } }} destroyOnClose zIndex={5000}>
        <SmartForm moduleConfig={moduleConfig} mode="create" onSuccess={() => { setIsDrawerOpen(false); fetchData(); }} onCancel={() => setIsDrawerOpen(false)} />
      </Drawer>

      {/* Bulk Edit Drawer */}
      <Drawer title={`ویرایش گروهی ${selectedRowKeys.length} رکورد`} width={720} onClose={() => setIsBulkEditDrawerOpen(false)} open={isBulkEditDrawerOpen} styles={{ body: { paddingBottom: 80 } }} destroyOnClose zIndex={5000}>
        <SmartForm 
            moduleConfig={moduleConfig} 
            mode="bulk" 
            batchIds={selectedRowKeys}
            onSuccess={() => { setIsBulkEditDrawerOpen(false); setSelectedRowKeys([]); fetchData(); }} 
            onCancel={() => setIsBulkEditDrawerOpen(false)} 
        />
      </Drawer>

      <style>{`
        .custom-erp-table-compact .ant-table-thead > tr > th { background: #f3f4f6 !important; font-size: 10px !important; }
        .dark .custom-erp-table-compact .ant-table-thead > tr > th { background: #262626 !important; color: #bbb; }
        .dark .ant-drawer-content { background-color: #141414; }
        .dark .ant-drawer-header { border-bottom: 1px solid #303030; }
        .dark .ant-drawer-title { color: white; }
        .ant-select-dropdown .ant-select-item-option-content { font-size: 12px !important; }
        @keyframes slideUp { from { transform: translate(-50%, 100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
        .animate-slideUp { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default ModuleList;