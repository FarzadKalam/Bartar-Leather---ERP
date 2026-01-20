/**
 * @deprecated این فایل نسخه قدیمی ModuleList است
 * TODO: حذف شود بعد از اطمینان ModuleList_Refine تمام ویژگی‌ها دارد
 * 
 * جایگزین: ModuleList_Refine.tsx
 * تاریخ حذف پیشنهادی: پس از Phase 1
 * 
 * قبل از حذف باید بررسی شود:
 * - آیا KANBAN view در ModuleList_Refine کار می‌کند؟
 * - آیا تمام ViewModes در نسخه جدید پیاده‌شده است؟
 */

import React, { useState, useEffect } from 'react';
import { 
  Button, Tag, Input, App, Drawer, Segmented, 
  Empty, Avatar, Tooltip, Spin // <--- Spin اضافه شده
} from 'antd';
import { 
  PlusOutlined, SearchOutlined, AppstoreOutlined, BarsOutlined, 
  DeleteOutlined, EditOutlined, TableOutlined, FilterFilled, CloseCircleFilled
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { ViewMode, SavedView, ViewConfig } from '../types';
import SmartForm from '../components/SmartForm';
import ViewManager from '../components/ViewManager';
import SmartTableRenderer from '../components/SmartTableRenderer';
import dayjs from 'dayjs';

const ModuleList: React.FC = () => {
  const { moduleId = 'products' } = useParams();
  const navigate = useNavigate();
  const { message: msg, modal } = App.useApp();
  const moduleConfig = MODULES[moduleId];

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
  const [searchText, setSearchText] = useState('');
  
  const [currentView, setCurrentView] = useState<SavedView | null>(null);
  const [activeConfig, setActiveConfig] = useState<ViewConfig | null>(null);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null); 
  const [isBulkEditMode, setIsBulkEditMode] = useState(false); 

  // دریافت اطلاعات با وابستگی دقیق به activeConfig
  useEffect(() => {
    const fetchData = async () => {
        if (!moduleConfig) return;
        setLoading(true);
        setSelectedRowKeys([]);
        
        // --- LOGGING FOR DEBUGGING ---
        console.group('ModuleList: Fetching Data');
        console.log('Active View:', currentView?.name);
        console.log('Active Config Filters:', activeConfig?.filters);

        let query = supabase.from(moduleId).select('*').order('created_at', { ascending: false });

        // اعمال فیلترهای ویو
        if (activeConfig?.filters && Array.isArray(activeConfig.filters)) {
           activeConfig.filters.forEach((filter, index) => {
              if (!filter.field || !filter.operator) return;
              
              // بررسی دقیق مقدار (اجازه به 0 و false، حذف فقط undefined/null/empty string)
              const val = filter.value;
              const hasValue = val !== undefined && val !== null && val !== '';
              
              // عملگرهای خاص مثل 'is' و 'is_not' نیاز به مقدار ندارند
              const needsValue = !['is', 'is_not'].includes(filter.operator);

              if (needsValue && !hasValue) {
                  console.warn(`Skipping filter #${index} (${filter.field}): No value provided`);
                  return;
              }

              console.log(`Applying Filter #${index}:`, filter.field, filter.operator, val);

              // نگاشت عملگرها
              switch (filter.operator) {
                  case 'eq': query = query.eq(filter.field, val); break;
                  case 'neq': query = query.neq(filter.field, val); break;
                  case 'ilike': query = query.ilike(filter.field, `%${val}%`); break; // شامل (Case Insensitive)
                  case 'like': query = query.like(filter.field, `%${val}%`); break;
                  case 'gt': query = query.gt(filter.field, val); break;
                  case 'lt': query = query.lt(filter.field, val); break;
                  case 'gte': query = query.gte(filter.field, val); break;
                  case 'lte': query = query.lte(filter.field, val); break;
                  case 'in': 
                      // تبدیل رشته جدا شده با کاما به آرایه (اگر ورودی آرایه نبود)
                      const valArr = Array.isArray(val) ? val : String(val).split(',').map(s => s.trim());
                      query = query.in(filter.field, valArr); 
                      break;
                  case 'is':
                      if (String(val) === 'null' || val === null) query = query.is(filter.field, null);
                      else if (String(val) === 'true') query = query.is(filter.field, true);
                      else if (String(val) === 'false') query = query.is(filter.field, false);
                      break;
                  default:
                      console.warn('Unknown operator:', filter.operator);
              }
           });
        }
        console.groupEnd();

        const { data: result, error } = await query;
        if (error) {
            console.error('Supabase Error:', error);
            msg.error('خطا در دریافت اطلاعات: ' + error.message);
        } else {
            setData(result || []);
        }
        setLoading(false);
    };

    fetchData();
  }, [moduleId, currentView, activeConfig]);

  // --- Handlers ---
  const handleCreate = () => {
    setEditingRecord(null);
    setIsBulkEditMode(false);
    setIsCreateDrawerOpen(true);
  };

  const handleEditRow = (record: any) => {
    setEditingRecord(record);
    setIsBulkEditMode(false);
    setIsEditDrawerOpen(true);
  };

  const handleBulkEdit = () => {
    if (selectedRowKeys.length === 0) return;
    setEditingRecord(null); 
    setIsBulkEditMode(true);
    setIsEditDrawerOpen(true);
  };

  const handleDeleteBulk = () => {
    modal.confirm({
      title: `آیا از حذف ${selectedRowKeys.length} رکورد اطمینان دارید؟`,
      okType: 'danger',
      onOk: async () => {
        const { error } = await supabase.from(moduleId).delete().in('id', selectedRowKeys);
        if (!error) {
          msg.success('حذف شد');
          setSelectedRowKeys([]);
          // Force refresh by triggering config update (safe trick)
          setActiveConfig(prev => ({ ...prev! }));
        } else msg.error(error.message);
      }
    });
  };

  const saveToSupabase = async (values: any) => {
    const cleanedValues = Object.fromEntries(
        Object.entries(values).filter(([_, v]) => v !== undefined && v !== '')
    );
    const user = (await supabase.auth.getUser()).data.user;

    if (isBulkEditMode) {
       const { error } = await supabase.from(moduleId).update(cleanedValues).in('id', selectedRowKeys);
       if (error) throw error;
    } else if (editingRecord) {
       const { error } = await supabase.from(moduleId).update({ ...cleanedValues, updated_by: user?.id }).eq('id', editingRecord.id);
       if (error) throw error;
    } else {
       const { error } = await supabase.from(moduleId).insert([{
          ...cleanedValues,
          created_by: user?.id,
          updated_by: user?.id
       }]);
       if (error) throw error;
    }
  };

  const handleFormSuccess = () => {
    setIsCreateDrawerOpen(false);
    setIsEditDrawerOpen(false);
    setSelectedRowKeys([]);
    setActiveConfig(prev => ({ ...prev! })); // Refresh Data
    msg.success('عملیات با موفقیت انجام شد');
  };

  const filteredData = data.filter(item => 
    JSON.stringify(item).toLowerCase().includes(searchText.toLowerCase())
  );

  const renderCard = (item: any) => (
      <div 
        key={item.id} 
        onClick={() => navigate(`/${moduleId}/${item.id}`)}
        className="bg-white dark:bg-[#1f1f1f] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 cursor-pointer hover:shadow-md hover:-translate-y-1 transition-all group flex flex-col h-full"
      >
        <div className="flex items-start gap-3 mb-3">
            {item.image_url ? (
                <Avatar src={item.image_url} shape="square" size={48} className="rounded-lg border bg-gray-50" />
            ) : (
                <div className="w-12 h-12 rounded-lg bg-leather-50 text-leather-500 flex items-center justify-center font-bold text-lg">
                    {item.name?.[0] || 'A'}
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-800 dark:text-white truncate">{item.name}</div>
                <div className="text-xs text-gray-400 mt-1">{item.system_code}</div>
            </div>
        </div>
        <div className="mt-auto pt-3 border-t border-gray-50 dark:border-gray-800 flex justify-between items-center">
            <span className="text-[10px] text-gray-400">{dayjs(item.created_at).calendar('jalali').format('YYYY/MM/DD')}</span>
            <Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); handleEditRow(item); }} />
        </div>
      </div>
  );

  if (!moduleConfig) return <div>ماژول یافت نشد</div>;

  return (
    <div className="p-4 md:p-6 pb-24 md:ml-16 transition-all min-h-screen bg-gray-50/50 dark:bg-[#0a0a0a]">
       
       <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-4">
         <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black m-0 text-gray-800 dark:text-white">{moduleConfig.titles.fa}</h1>
            <Tag className="rounded-full">{data.length}</Tag>
         </div>

         <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <Input 
              prefix={<SearchOutlined className="text-gray-400" />} 
              placeholder="جستجو..." 
              className="rounded-xl border-none bg-white dark:bg-[#1f1f1f] shadow-sm w-full sm:w-56 h-10"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
            
            <ViewManager 
               moduleId={moduleId} 
               currentView={currentView} 
               onViewChange={(view, config) => { 
                   // پارس کردن کانفیگ اگر به صورت رشته ذخیره شده باشد (جهت اطمینان)
                   let parsedConfig = config;
                   if (typeof config === 'string') {
                       try { parsedConfig = JSON.parse(config); } catch(e) { console.error('Config Parse Error', e); }
                   }
                   setCurrentView(view); 
                   setActiveConfig(parsedConfig); 
               }}
            />

            <div className="w-[1px] h-8 bg-gray-300 mx-1 hidden sm:block"></div>

            <Segmented
              options={[
                { value: ViewMode.LIST, icon: <BarsOutlined /> },
                { value: ViewMode.GRID, icon: <TableOutlined /> },
                { value: ViewMode.KANBAN, icon: <AppstoreOutlined /> },
              ]}
              value={viewMode}
              onChange={(val: any) => setViewMode(val)}
              className="bg-gray-200 dark:bg-[#1f1f1f] p-1 rounded-xl"
            />
            
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} className="h-10 px-6 rounded-xl bg-leather-600 hover:bg-leather-500 shadow-lg border-none">
               جدید
            </Button>
         </div>
       </div>

       {/* تگ فیلترهای فعال */}
       {activeConfig?.filters && activeConfig.filters.length > 0 && (
           <div className="flex flex-wrap gap-2 mb-4 animate-fadeIn">
               <span className="text-xs text-gray-400 flex items-center gap-1"><FilterFilled /> فیلترهای فعال:</span>
               {activeConfig.filters.map((f, idx) => {
                   if (!f.field) return null;
                   const fieldLabel = moduleConfig.fields.find(field => field.key === f.field)?.labels.fa || f.field;
                   const valDisplay = (typeof f.value === 'object') ? '...' : f.value;
                   return (
                       <Tag key={idx} color="blue" className="rounded-full px-3 py-1 m-0 flex items-center gap-2 border-none bg-blue-50 text-blue-600">
                           <span>{fieldLabel}</span>
                           <span className="opacity-50 text-[10px]">{f.operator}</span>
                           <span className="font-bold">{valDisplay}</span>
                       </Tag>
                   )
               })}
               <Button size="small" type="text" danger icon={<CloseCircleFilled />} onClick={() => setActiveConfig({ ...activeConfig, filters: [] })}>حذف همه</Button>
           </div>
       )}

       {selectedRowKeys.length > 0 && (
         <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white px-4 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-fadeInUp">
            <span className="font-bold text-sm px-2">{selectedRowKeys.length} انتخاب</span>
            <Button size="small" type="text" className="text-white hover:text-blue-400" icon={<EditOutlined />} onClick={handleBulkEdit}>ویرایش</Button>
            <Button size="small" type="text" className="text-white hover:text-red-400" icon={<DeleteOutlined />} onClick={handleDeleteBulk}>حذف</Button>
            <Button size="small" type="text" className="text-gray-400" onClick={() => setSelectedRowKeys([])}>لغو</Button>
         </div>
       )}

       <div className="bg-white dark:bg-[#141414] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 min-h-[500px] overflow-hidden relative p-1">
          {loading && <div className="absolute inset-0 z-10 bg-white/60 dark:bg-black/60 flex items-center justify-center z-50 backdrop-blur-[1px]"><div className="bg-white dark:bg-[#222] px-6 py-3 rounded-xl shadow-lg font-bold text-gray-600 dark:text-gray-300 flex items-center gap-3"><Spin /> در حال بارگذاری...</div></div>}
          
          {viewMode === ViewMode.LIST && (
             <SmartTableRenderer 
               module={moduleConfig}
               data={filteredData}
               loading={false} 
               onRowClick={(record) => navigate(`/${moduleId}/${record.id}`)}
               viewConfig={activeConfig} 
               selection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
               onEditRow={handleEditRow}
             />
          )}

          {viewMode === ViewMode.GRID && (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredData.map(item => renderCard(item))}
              </div>
          )}

          {viewMode === ViewMode.KANBAN && (
             <div className="p-4 flex gap-4 overflow-x-auto h-[calc(100vh-280px)]">
                {(() => {
                   const statusField = moduleConfig.fields.find(f => f.key === 'status');
                   if (!statusField || !statusField.options) return <Empty description="فیلد وضعیت یافت نشد" />;
                   
                   return statusField.options.map(opt => (
                      <div key={opt.value} className="min-w-[280px] w-[280px] flex flex-col h-full bg-gray-50 dark:bg-[#1f1f1f] rounded-xl border border-gray-200 dark:border-gray-800">
                         <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center sticky top-0 bg-inherit rounded-t-xl z-10">
                            <div className="flex items-center gap-2">
                               <div className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color || '#ccc' }}></div>
                               <span className="font-bold text-sm">{opt.label}</span>
                            </div>
                            <Tag>{filteredData.filter(d => d.status === opt.value).length}</Tag>
                         </div>
                         <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                            {filteredData.filter(d => d.status === opt.value).map(item => renderCard(item))}
                         </div>
                      </div>
                   ));
                })()}
             </div>
          )}
       </div>

       <Drawer
         title={`افزودن ${moduleConfig.titles.fa}`}
         width={720}
         open={isCreateDrawerOpen}
         onClose={() => setIsCreateDrawerOpen(false)}
         destroyOnClose
         styles={{ body: { padding: 0 } }} 
       >
          <SmartForm 
            module={moduleConfig}
            visible={true}
            onCancel={() => setIsCreateDrawerOpen(false)}
            onSave={async (val) => { await saveToSupabase(val); handleFormSuccess(); }}
            embedded={true} 
          />
       </Drawer>

       <Drawer
         title={isBulkEditMode ? 'ویرایش گروهی' : `ویرایش ${editingRecord?.name || ''}`}
         width={720}
         open={isEditDrawerOpen}
         onClose={() => setIsEditDrawerOpen(false)}
         destroyOnClose
         styles={{ body: { padding: 0 } }}
       >
          <SmartForm 
            module={moduleConfig}
            visible={true}
            initialValues={editingRecord || {}}
            onCancel={() => setIsEditDrawerOpen(false)}
            onSave={async (val) => { await saveToSupabase(val); handleFormSuccess(); }}
            isBulkEdit={isBulkEditMode}
            embedded={true}
          />
       </Drawer>

    </div>
  );
};

export default ModuleList;