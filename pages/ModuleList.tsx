import React, { useState, useEffect } from 'react';
import { 
  Table, Button, Tag, Dropdown, Space, Empty, Spin, 
  message, Drawer, Segmented, Input, Avatar, Badge, Tooltip, App, Checkbox 
} from 'antd';
import { 
  PlusOutlined, AppstoreOutlined, BarsOutlined, MoreOutlined,
  ReloadOutlined, EditOutlined, DeleteOutlined, SearchOutlined, 
  UserOutlined, ProjectOutlined, ShopOutlined
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, SavedView, ViewMode } from '../types';
import SmartForm from '../components/SmartForm';
import ViewManager from '../components/ViewManager';
import SmartTableRenderer from '../components/SmartTableRenderer';

const ModuleList: React.FC = () => {
  const { moduleId = 'products' } = useParams();
  const navigate = useNavigate();
  const { message: msg, modal } = App.useApp();
  const moduleConfig = MODULES[moduleId];

  // --- States ---
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState('');
  
  // Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isBulkEditDrawerOpen, setIsBulkEditDrawerOpen] = useState(false);
  const [currentView, setCurrentView] = useState<SavedView | null>(null);

  useEffect(() => {
    if (moduleConfig) {
      fetchData();
      setViewMode(moduleConfig.defaultViewMode || ViewMode.LIST);
      setSelectedRowKeys([]);
    }
  }, [moduleId, moduleConfig]);

  // --- Optimized Fetch Function ---
  const fetchData = async () => {
    if (!moduleConfig) return;
    setLoading(true);
    try {
      // 1. دریافت رکوردهای اصلی
      let query = supabase
        .from(moduleId)
        .select('*')
        .order('created_at', { ascending: false });

      const { data: records, error } = await query;
      if (error) throw error;
      
      if (!records || records.length === 0) {
          setData([]);
          setLoading(false);
          return;
      }

      // 2. دریافت تگ‌ها برای این رکوردها (در یک کوئری جداگانه برای پرفورمنس بهتر)
      const recordIds = records.map(r => r.id);
      const { data: tagsData } = await supabase
        .from('record_tags')
        .select(`
            record_id,
            tags ( title, color )
        `)
        .in('record_id', recordIds)
        .eq('module_id', moduleId);

      // 3. ترکیب رکوردها با تگ‌ها
      const formattedRecords = records.map(record => {
        const relatedTags = tagsData
            ?.filter((rt: any) => rt.record_id === record.id)
            .map((rt: any) => rt.tags) || [];

        return {
            ...record,
            tags: relatedTags
        };
      });

      setData(formattedRecords);

    } catch (error: any) {
      console.error('Fetch Error:', error);
      msg.error('خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  };

  // --- Delete Handler ---
  const handleDelete = async (ids: React.Key[]) => {
    modal.confirm({
      title: `حذف ${ids.length} رکورد`, content: 'آیا اطمینان دارید؟', okType: 'danger',
      onOk: async () => {
        try {
          // حذف تگ‌های وابسته (اگر Cascade در دیتابیس تنظیم نشده باشد)
          await supabase.from('record_tags').delete().in('record_id', ids);
          
          const { error } = await supabase.from(moduleId).delete().in('id', ids);
          if (error) throw error;
          msg.success('حذف شد'); setSelectedRowKeys([]); fetchData();
        } catch (e: any) { msg.error(e.message); }
      }
    });
  };

  // --- Card Component (Shared for Grid & Kanban) ---
  const CardItem = ({ item }: { item: any }) => {
    const isSelected = selectedRowKeys.includes(item.id);

    const toggleSelect = (e: any) => {
        e.stopPropagation(); 
        const newSelected = isSelected 
            ? selectedRowKeys.filter(k => k !== item.id)
            : [...selectedRowKeys, item.id];
        setSelectedRowKeys(newSelected);
    };

    return (
        <div 
            onClick={() => navigate(`/${moduleId}/${item.id}`)}
            className={`
                bg-white dark:bg-[#1e1e1e] p-3 rounded-xl border shadow-sm cursor-pointer transition-all whitespace-normal group relative flex flex-col
                ${isSelected ? 'border-leather-500 ring-1 ring-leather-500' : 'border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-leather-400'}
            `}
        >
            <div className="absolute top-2 left-2 z-10" onClick={e => e.stopPropagation()}>
                <Checkbox checked={isSelected} onChange={toggleSelect} className="scale-110" />
            </div>

            <div className="flex gap-3 mb-2">
                <div className="shrink-0">
                    {item.image_url ? (
                        <Avatar shape="square" size={48} src={item.image_url} className="rounded-lg bg-gray-50 border border-gray-100" />
                    ) : (
                        <Avatar shape="square" size={48} icon={moduleId === 'customers' ? <UserOutlined /> : moduleId === 'suppliers' ? <ShopOutlined /> : <AppstoreOutlined />} className="rounded-lg bg-gray-50 dark:bg-white/5 text-gray-300" />
                    )}
                </div>
                
                <div className="flex-1 min-w-0 pt-0.5">
                    <h4 className="font-bold text-sm text-gray-800 dark:text-white truncate mb-1 group-hover:text-leather-600 transition-colors">
                        {item.name || item.business_name || `${item.first_name || ''} ${item.last_name}`}
                    </h4>
                    <div className="text-xs text-gray-400 font-mono truncate">
                        {item.system_code || item.mobile_1 || '---'}
                    </div>
                </div>
            </div>

            {/* Tags Section */}
            {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {item.tags.map((tag: any, idx: number) => (
                        <Tag key={idx} color={tag.color} style={{ fontSize: '10px', margin: 0, padding: '0 4px', lineHeight: '18px', border: 'none' }}>
                            {tag.title}
                        </Tag>
                    ))}
                </div>
            )}

            <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-1">
                     {item.rank && <Tag className="m-0 text-[10px] px-1">{item.rank}</Tag>}
                     
                     {(item.sell_price || item.total_spend) ? (
                        <span className="font-bold text-xs text-gray-700 dark:text-gray-300">
                            {Number(item.sell_price || item.total_spend).toLocaleString()} <span className="text-[9px] font-normal text-gray-400">تومان</span>
                        </span>
                     ) : null}
                </div>

                {item.assignee_id && (
                    <Tooltip title="مسئول"><Avatar size={18} className="bg-leather-100 text-leather-600 border border-white" icon={<UserOutlined />} /></Tooltip>
                )}
            </div>
        </div>
    );
  };

  // --- Filter Logic ---
  const filteredData = data.filter(item => {
      const term = searchText.toLowerCase();
      const title = (item.name || item.business_name || item.last_name || '').toLowerCase();
      const code = (item.system_code || '').toLowerCase();
      return title.includes(term) || code.includes(term);
  });

  // --- Kanban Grouping Logic ---
  const getKanbanGroupingField = () => {
      const statusField = moduleConfig?.fields.find(f => f.type === FieldType.STATUS);
      if (statusField) return statusField;
      if (moduleId === 'products') return moduleConfig?.fields.find(f => f.key === 'category');
      // Fallback: اگر هیچ فیلدی پیدا نشد، null برمیگرداند
      return null;
  };
  const kanbanField = getKanbanGroupingField();
  const kanbanColumns = kanbanField?.options || [];

  if (!moduleConfig) return <div className="p-10 text-center">ماژول یافت نشد</div>;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto animate-fadeIn pb-20 h-[calc(100vh-64px)] flex flex-col">
      
      {/* Header */}
      <div className="flex flex-wrap md:flex-nowrap justify-between items-center mb-4 gap-4 shrink-0">
        <div className="w-full md:w-auto">
            <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
                <span className="w-2 h-8 bg-leather-500 rounded-full inline-block"></span>
                {moduleConfig.titles.fa}
                <span className="text-sm font-normal text-gray-400 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded-lg mr-2">{filteredData.length}</span>
            </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <Input prefix={<SearchOutlined className="text-gray-300" />} placeholder="جستجو..." className="rounded-xl border-none bg-white dark:bg-[#1a1a1a] shadow-sm h-10 grow md:grow-0 md:w-64" value={searchText} onChange={e => setSearchText(e.target.value)} allowClear />
            
            <Segmented
                options={[
                    { value: ViewMode.LIST, icon: <BarsOutlined /> },
                    { value: ViewMode.GRID, icon: <AppstoreOutlined /> },
                    { value: ViewMode.KANBAN, icon: <ProjectOutlined /> },
                ]}
                value={viewMode}
                onChange={(v) => setViewMode(v as ViewMode)}
                className="bg-white dark:bg-[#1a1a1a] shadow-sm p-1 rounded-xl"
            />

            <div className="flex gap-2 mr-auto md:mr-0">
                {selectedRowKeys.length > 0 && (
                    <Dropdown menu={{ items: [{ key: 'edit', label: 'ویرایش گروهی', icon: <EditOutlined />, onClick: () => setIsBulkEditDrawerOpen(true) }, { key: 'delete', label: 'حذف', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(selectedRowKeys) }] }}>
                        <Button className="h-10 rounded-xl border-leather-500 text-leather-600 px-3">
                            <span className="hidden md:inline">عملیات</span> ({selectedRowKeys.length}) <MoreOutlined />
                        </Button>
                    </Dropdown>
                )}
                <Button icon={<ReloadOutlined />} onClick={fetchData} className="h-10 w-10 rounded-xl border-none shadow-sm" />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsDrawerOpen(true)} className="h-10 px-4 md:px-6 rounded-xl bg-leather-600 hover:!bg-leather-500 border-none">
                     <span className="hidden md:inline">افزودن</span><span className="md:hidden">جدید</span>
                </Button>
            </div>
        </div>
      </div>

      <div className="mb-2 shrink-0"><ViewManager moduleId={moduleId} currentView={currentView} onViewChange={setCurrentView} /></div>

      <div className="flex-1 overflow-hidden relative rounded-[2rem]">
          {loading ? <div className="flex h-full items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-[2rem]"><Spin size="large" /></div> : 
           filteredData.length === 0 ? <div className="flex h-full items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-[2rem]"><Empty description="رکوردی یافت نشد" /></div> : 
           
           /* === VIEW MODES === */
           viewMode === ViewMode.LIST ? (
              <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full flex flex-col">
                  <SmartTableRenderer 
                      moduleConfig={moduleConfig} data={filteredData} loading={loading}
                      rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                      onRow={(record: any) => ({ onClick: () => navigate(`/${moduleId}/${record.id}`), style: { cursor: 'pointer' } })}
                  />
              </div>

           ) : viewMode === ViewMode.GRID ? (
              <div className="h-full overflow-y-auto p-1 scroll-smooth">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 pb-20">
                      {filteredData.map(record => (
                          <CardItem key={record.id} item={record} />
                      ))}
                  </div>
              </div>

           ) : ( /* KANBAN */
              <div className="h-full overflow-x-auto overflow-y-hidden whitespace-nowrap pb-4 px-1">
                  {kanbanField && kanbanColumns.length > 0 ? (
                      <div className="flex gap-4 h-full">
                          {kanbanColumns.map((col: any) => {
                              const colItems = filteredData.filter(item => item[kanbanField.key] === col.value);
                              return (
                                  <div key={col.value} className="w-72 min-w-[280px] flex flex-col max-h-full bg-gray-100 dark:bg-[#121212] rounded-2xl border border-gray-200 dark:border-gray-800">
                                      {/* Header */}
                                      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-[#1a1a1a] rounded-t-2xl sticky top-0 z-10">
                                          <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: col.color || '#ccc' }}></span><span className="font-bold text-sm text-gray-700 dark:text-gray-200">{col.label}</span></div>
                                          <Badge count={colItems.length} style={{ backgroundColor: '#f0f0f0', color: '#999', boxShadow: 'none' }} />
                                      </div>
                                      
                                      {/* Cards Area - اصلاح شده: max-h-full و flex-1 */}
                                      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                          {colItems.map(item => (
                                              <CardItem key={item.id} item={item} />
                                          ))}
                                          {colItems.length === 0 && <div className="text-center py-10 text-gray-300 text-xs">خالی</div>}
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  ) : <div className="flex h-full items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-[2rem]"><Empty description="فیلد گروه‌بندی (وضعیت/دسته‌بندی) یافت نشد" /></div>}
              </div>
           )
          }
      </div>

      <Drawer title={`افزودن ${moduleConfig.titles.fa}`} width={720} onClose={() => setIsDrawerOpen(false)} open={isDrawerOpen} styles={{ body: { paddingBottom: 80 } }} destroyOnClose zIndex={1000}>
        <SmartForm moduleConfig={moduleConfig} mode="create" onSuccess={() => { setIsDrawerOpen(false); fetchData(); }} onCancel={() => setIsDrawerOpen(false)} />
      </Drawer>
      <Drawer title={`ویرایش گروهی`} width={720} onClose={() => setIsBulkEditDrawerOpen(false)} open={isBulkEditDrawerOpen} styles={{ body: { paddingBottom: 80 } }} destroyOnClose zIndex={1000}>
        <SmartForm moduleConfig={moduleConfig} mode="edit" recordId={selectedRowKeys[0] as string} onSuccess={() => { setIsBulkEditDrawerOpen(false); setSelectedRowKeys([]); fetchData(); }} onCancel={() => setIsBulkEditDrawerOpen(false)} />
      </Drawer>
      
      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #ddd; border-radius: 4px; } .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; }`}</style>
    </div>
  );
};

export default ModuleList;