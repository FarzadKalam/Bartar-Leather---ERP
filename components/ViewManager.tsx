import React, { useState, useEffect } from 'react';
import { 
  Button, Modal, Input, Checkbox, Tabs, Badge, List, 
  Tooltip, Popconfirm, message, Alert 
} from 'antd';
import { 
  PlusOutlined, SaveOutlined, EyeOutlined, DeleteOutlined, 
  ArrowUpOutlined, ArrowDownOutlined, CheckSquareOutlined,
  EditOutlined
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { SavedView, ViewConfig } from '../types';
import FilterBuilder from './FilterBuilder';

interface ViewManagerProps {
  moduleId: string;
  currentView: SavedView | null;
  onViewChange: (view: SavedView | null, config: ViewConfig | null) => void;
}

const ViewManager: React.FC<ViewManagerProps> = ({ moduleId, currentView, onViewChange }) => {
  const [views, setViews] = useState<SavedView[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [viewName, setViewName] = useState('');
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  
  // استیت کانفیگ
  const [config, setConfig] = useState<ViewConfig>({ columns: [], filters: [] });

  const moduleConfig = MODULES[moduleId];

  useEffect(() => {
    fetchViews();
  }, [moduleId]);

  const fetchViews = async () => {
    const { data } = await supabase.from('saved_views').select('*').eq('module_id', moduleId);
    
    // نماهای پیش فرض
    const defaults: SavedView[] = [
        { 
            id: 'default_all', module_id: moduleId, name: 'همه رکوردها', is_default: true, 
            config: { columns: [], filters: [] } 
        }
    ];

    if (moduleId === 'tasks') {
        defaults.push({ 
            id: 'def_todo', module_id: 'tasks', name: 'کارهای باز', is_default: true, 
            config: { columns: [], filters: [{id:'def1', field: 'status', operator: 'neq', value: 'done'}] } as any 
        });
    }

    setViews([...defaults, ...(data || [])]);
  };

  const handleOpenNewView = () => {
    // پیش فرض: تمام ستون‌ها انتخاب شوند
    const allCols = moduleConfig.fields.map(f => f.key);
    setConfig({ columns: allCols, filters: [] });
    setViewName('');
    setEditingViewId(null);
    setIsModalOpen(true);
  };

  const handleEditView = (view: SavedView, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // اطمینان از وجود آرایه‌ها برای جلوگیری از کرش
    const rawConfig = view.config || {};
    const safeConfig: ViewConfig = {
        columns: Array.isArray(rawConfig.columns) ? rawConfig.columns : [],
        filters: Array.isArray(rawConfig.filters) ? rawConfig.filters : [],
        sort: rawConfig.sort
    };
    
    // کپی عمیق
    setConfig(JSON.parse(JSON.stringify(safeConfig)));
    
    if (view.id.startsWith('default_') || view.id.startsWith('def_')) {
        setViewName(view.name + ' (کپی)');
        setEditingViewId(null); 
    } else {
        setViewName(view.name);
        setEditingViewId(view.id);
    }
    
    setIsModalOpen(true);
  };

  const handleSaveView = async () => {
    if (!viewName.trim()) {
        message.error('نام نما را وارد کنید');
        return;
    }

    // پاکسازی فیلترهای ناقص
    const cleanConfig = {
        ...config,
        filters: (config.filters || []).filter(f => f.field && f.operator)
    };

    const payload = {
      module_id: moduleId,
      name: viewName,
      config: cleanConfig, 
      is_default: false
    };

    try {
        let savedData;
        if (editingViewId) {
            const { data, error } = await supabase.from('saved_views').update(payload).eq('id', editingViewId).select().single();
            if (error) throw error;
            savedData = data;
            setViews(prev => prev.map(v => v.id === editingViewId ? savedData : v));
            message.success('بروزرسانی شد');
        } else {
            const { data, error } = await supabase.from('saved_views').insert([payload]).select().single();
            if (error) throw error;
            savedData = data;
            setViews(prev => [...prev, savedData]);
            message.success('ذخیره شد');
        }

        setIsModalOpen(false);
        onViewChange(savedData, savedData.config);

    } catch (err: any) {
        message.error('خطا: ' + err.message);
    }
  };

  // --- اصلاح مهم: استفاده از Functional Updates برای جلوگیری از تداخل استیت ---
  
  const moveColumn = (index: number, direction: 'up' | 'down') => {
      setConfig(prev => {
          const newCols = [...(prev.columns || [])];
          if (direction === 'up' && index > 0) {
              [newCols[index], newCols[index - 1]] = [newCols[index - 1], newCols[index]];
          } else if (direction === 'down' && index < newCols.length - 1) {
              [newCols[index], newCols[index + 1]] = [newCols[index + 1], newCols[index]];
          }
          return { ...prev, columns: newCols };
      });
  };

  const toggleColumn = (key: string) => {
      setConfig(prev => {
          let newCols = [...(prev.columns || [])];
          if (newCols.includes(key)) newCols = newCols.filter(c => c !== key);
          else newCols.push(key);
          return { ...prev, columns: newCols };
      });
  };

  const handleFilterChange = (newFilters: any[]) => {
      setConfig(prev => ({ ...prev, filters: newFilters }));
  };

  return (
    <>
      <div className="flex items-center gap-2 bg-white dark:bg-[#1f1f1f] p-1 rounded-xl border border-gray-200 dark:border-gray-800 h-10 shadow-sm">
         <span className="text-gray-500 px-2 flex items-center"><EyeOutlined /></span>
         
         <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] sm:max-w-[400px] no-scrollbar px-1">
             {views.map(view => (
                 <div 
                    key={view.id}
                    onClick={() => onViewChange(view, view.config)}
                    className={`
                        group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border border-transparent
                        ${currentView?.id === view.id 
                            ? 'bg-leather-600 text-white shadow-md font-bold' 
                            : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 text-gray-700 dark:text-gray-300 hover:border-gray-300'}
                    `}
                 >
                     {view.name}
                     
                     <div className="flex items-center gap-1 mr-1">
                        <Tooltip title="ویرایش">
                            <span 
                                className={`p-1 rounded-full transition-colors flex items-center justify-center ${
                                    currentView?.id === view.id 
                                    ? 'text-white/80 hover:bg-white/20' 
                                    : 'text-gray-500 hover:text-leather-600 hover:bg-gray-200'
                                }`}
                                onClick={(e) => handleEditView(view, e)}
                            >
                                <EditOutlined className="text-[10px]" />
                            </span>
                        </Tooltip>

                        {!view.id.startsWith('default_') && !view.id.startsWith('def_') && (
                            <Popconfirm 
                                title="حذف؟" 
                                onConfirm={async (e) => {
                                    e?.stopPropagation();
                                    await supabase.from('saved_views').delete().eq('id', view.id);
                                    setViews(prev => prev.filter(v => v.id !== view.id));
                                    if (currentView?.id === view.id) onViewChange(null, null);
                                }}
                                onCancel={(e) => e?.stopPropagation()}
                            >
                                <span 
                                    className={`p-1 rounded-full transition-colors flex items-center justify-center ${
                                        currentView?.id === view.id 
                                        ? 'text-white/80 hover:bg-white/20' 
                                        : 'text-gray-500 hover:text-red-500 hover:bg-red-50'
                                    }`}
                                    onClick={(e) => e.stopPropagation()} 
                                >
                                    <DeleteOutlined className="text-[10px]" />
                                </span>
                            </Popconfirm>
                        )}
                     </div>
                 </div>
             ))}
         </div>

         <div className="w-[1px] h-5 bg-gray-300 mx-1"></div>
         
         <Tooltip title="ایجاد نمای سفارشی">
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={handleOpenNewView} className="hover:bg-gray-100 rounded-lg text-gray-600" />
         </Tooltip>
      </div>

      <Modal 
        title={editingViewId ? "ویرایش نما" : "ساخت نمای جدید"} 
        open={isModalOpen} 
        onCancel={() => setIsModalOpen(false)}
        width={700}
        zIndex={1001}
        footer={[
            <Button key="back" onClick={() => setIsModalOpen(false)}>انصراف</Button>,
            <Button key="submit" type="primary" icon={<SaveOutlined />} onClick={handleSaveView} className="bg-leather-600">
                {editingViewId ? 'ذخیره تغییرات' : 'ایجاد نما'}
            </Button>
        ]}
      >
          <div className="flex flex-col gap-4 py-4">
              {!editingViewId && viewName.includes('(کپی)') && (
                  <Alert type="info" showIcon message="شما در حال ویرایش یک نمای پیش‌فرض بودید. تغییرات به عنوان یک نمای جدید ذخیره خواهد شد." className="mb-2" />
              )}
              <Input placeholder="نام نما" value={viewName} onChange={e => setViewName(e.target.value)} prefix={<span className="text-red-500">*</span>} />
              
              <Tabs type="card" items={[
                  {
                      key: 'columns',
                      label: <span><CheckSquareOutlined /> ستون‌ها</span>,
                      children: (
                          <div className="flex gap-4 h-[350px]">
                              <div className="flex-1 border rounded-lg p-3 overflow-y-auto bg-gray-50">
                                  <div className="text-xs text-gray-500 mb-2 font-bold">همه ستون‌ها</div>
                                  {moduleConfig.fields.map(field => (
                                      <div key={field.key} className="flex items-center gap-2 py-1">
                                          {/* استفاده از Optional Chaining برای اطمینان */}
                                          <Checkbox 
                                            checked={config.columns?.includes(field.key)} 
                                            onChange={() => toggleColumn(field.key)}
                                          >
                                              {field.labels.fa}
                                          </Checkbox>
                                      </div>
                                  ))}
                              </div>
                              <div className="flex-1 border rounded-lg p-3 overflow-y-auto bg-white">
                                  <div className="text-xs text-gray-500 mb-2 font-bold flex justify-between">
                                      <span>نمایش به ترتیب:</span>
                                      <span className="text-[10px] font-normal">{config.columns?.length || 0} مورد</span>
                                  </div>
                                  <List 
                                    size="small" 
                                    dataSource={config.columns || []} 
                                    renderItem={(colKey, index) => {
                                        const field = moduleConfig.fields.find(f => f.key === colKey);
                                        if (!field) return null;
                                        return (
                                            <List.Item className="bg-gray-50 mb-1 rounded px-2 border border-gray-100 !py-2">
                                                <span className="text-sm">{field.labels.fa}</span>
                                                <div className="flex gap-1">
                                                    <Button size="small" icon={<ArrowUpOutlined className="text-[10px]" />} disabled={index === 0} onClick={() => moveColumn(index, 'up')} />
                                                    <Button size="small" icon={<ArrowDownOutlined className="text-[10px]" />} disabled={index === (config.columns?.length || 0) - 1} onClick={() => moveColumn(index, 'down')} />
                                                </div>
                                            </List.Item>
                                        )
                                    }} 
                                  />
                              </div>
                          </div>
                      )
                  },
                  {
                      key: 'filters',
                      label: <Badge count={config.filters?.length} offset={[10, 0]} size="small">فیلترها</Badge>,
                      children: (
                          <div className="bg-white p-4 border rounded-lg min-h-[200px]">
                              <FilterBuilder 
                                module={moduleConfig} 
                                filters={config.filters || []} 
                                // استفاده از هندلر ایمن
                                onChange={handleFilterChange} 
                              />
                          </div>
                      )
                  }
              ]} />
          </div>
      </Modal>
    </>
  );
};
export default ViewManager;