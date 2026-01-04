import React, { useState, useMemo } from "react";
import { useTable } from "@refinedev/antd"; 
import { useDeleteMany, useUpdate, CrudFilters, LogicalFilter } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartTableRenderer from "../components/SmartTableRenderer";
import { ViewMode, FieldType, SavedView } from "../types";
import { 
  Button, Segmented, Input, Spin, Checkbox, 
  Avatar, Tag, Badge, Empty, App, Divider, Tooltip, Select 
} from "antd";
import { 
  BarsOutlined, AppstoreOutlined, ProjectOutlined, PlusOutlined, 
  ReloadOutlined, SearchOutlined, DeleteOutlined, 
  EditOutlined, ExportOutlined, GroupOutlined
} from "@ant-design/icons";
import ViewManager from "../components/ViewManager";
import SmartForm from "../components/SmartForm"; 

// --- کامپوننت‌های کمکی (خارج از کامپوننت اصلی برای رفع خطای Key) ---

const RenderTags = ({ record, tagsField }: { record: any, tagsField?: string }) => {
    if (!tagsField || !record[tagsField]) return null;
    const tags = Array.isArray(record[tagsField]) ? record[tagsField] : [record[tagsField]];
    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((t: string, idx: number) => (
                <Tag key={idx} color="blue" style={{ fontSize: '10px', lineHeight: '18px', margin: 0 }}>
                    {t}
                </Tag>
            ))}
        </div>
    );
};

const RenderCardItem = ({ 
    item, 
    moduleId, 
    imageField, 
    tagsField, 
    selectedRowKeys, 
    setSelectedRowKeys, 
    navigate, 
    minimal = false 
}: any) => {
    const isSelected = selectedRowKeys.includes(item.id);
    const imageUrl = imageField ? item[imageField] : null;
    const title = item.name || item.business_name || item.title || item.last_name || "بدون نام";

    const toggleSelect = (e: any) => {
        e.stopPropagation(); 
        const newSelected = isSelected 
            ? selectedRowKeys.filter((k: any) => k !== item.id)
            : [...selectedRowKeys, item.id];
        setSelectedRowKeys(newSelected);
    };

    return (
        <div 
            onClick={() => navigate(`/${moduleId}/${item.id}`)}
            className={`
                bg-white dark:bg-[#1e1e1e] rounded-xl border shadow-sm cursor-pointer transition-all flex flex-col group relative
                ${isSelected ? 'border-leather-500 ring-1 ring-leather-500 bg-leather-50 dark:bg-leather-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-leather-400 hover:shadow-md'}
                ${minimal ? 'p-3 mb-2' : 'p-3 h-full'}
            `}
        >
            <div className="absolute top-2 left-2 z-10" onClick={e => e.stopPropagation()}>
                <Checkbox checked={isSelected} onChange={toggleSelect} />
            </div>

            <div className="flex gap-3 mb-2">
                <Avatar 
                    shape="square" 
                    size={minimal ? 40 : 54} 
                    src={imageUrl} 
                    icon={<AppstoreOutlined />} 
                    className="rounded-lg bg-gray-50 border border-gray-100 shrink-0 object-cover" 
                />
                <div className="min-w-0 pt-1 flex-1">
                    <h4 className={`font-bold text-gray-800 dark:text-white truncate mb-1 ${minimal ? 'text-xs' : 'text-sm'}`} title={title}>
                        {title}
                    </h4>
                    <div className="text-[10px] text-gray-400 font-mono mb-1">{item.system_code || item.manual_code || '---'}</div>
                    <RenderTags record={item} tagsField={tagsField} />
                </div>
            </div>
            
            {!minimal && (
                <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                     {(item.sell_price || item.total_spend) && (
                        <span className="font-bold text-xs text-gray-700 dark:text-gray-300 font-mono">
                            {Number(item.sell_price || item.total_spend).toLocaleString()}
                        </span>
                     )}
                </div>
            )}
        </div>
    );
};

// --- کامپوننت اصلی ---

export const ModuleListRefine = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { modal, message: msg } = App.useApp();
  
  const moduleConfig = moduleId ? MODULES[moduleId] : null;

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [currentView, setCurrentView] = useState<SavedView | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [kanbanGroupBy, setKanbanGroupBy] = useState<string>("");

  const { tableProps, tableQueryResult, setFilters, filters } = useTable({
    resource: moduleId,
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    pagination: { pageSize: 100 }, 
    queryOptions: { enabled: !!moduleId },
    syncWithLocation: false,
  });

  const { mutate: deleteMany } = useDeleteMany();
  const { mutate: updateRecord } = useUpdate();

  const loading = tableQueryResult.isLoading;
  const allData = tableQueryResult.data?.data || [];

  const imageField = moduleConfig?.fields.find(f => f.type === FieldType.IMAGE)?.key;
  const tagsField = moduleConfig?.fields.find(f => f.type === FieldType.TAGS)?.key;

  const searchTargetField = useMemo(() => {
    if (!moduleConfig) return null;
    const priorityKeys = ['name', 'title', 'business_name', 'full_name', 'subject', 'description'];
    const priorityField = moduleConfig.fields.find(f => priorityKeys.includes(f.key));
    if (priorityField) return priorityField.key;
    const textField = moduleConfig.fields.find(f => f.type === FieldType.TEXT);
    if (textField) return textField.key;
    return null;
  }, [moduleConfig]);

  const availableGroupFields = useMemo(() => {
    return moduleConfig?.fields.filter(f => 
        (f.type === FieldType.STATUS || f.type === FieldType.SELECT) && f.options && f.options.length > 0
    ) || [];
  }, [moduleConfig]);

  if (!kanbanGroupBy && availableGroupFields.length > 0) {
      const defaultField = availableGroupFields.find(f => f.type === FieldType.STATUS) || availableGroupFields[0];
      setKanbanGroupBy(defaultField.key);
  }

  const handleViewChange = (view: SavedView | null, config: any) => {
    setCurrentView(view);
    if (config && config.filters && Array.isArray(config.filters) && config.filters.length > 0) {
        const refineFilters: CrudFilters = config.filters.map((f: any) => ({
            field: f.field,
            operator: f.operator || 'eq',
            value: f.value
        }));
        setFilters(refineFilters, 'replace');
    } else {
        setFilters([], 'replace');
    }
  };

  const handleSearch = (val: string) => {
      if (!val) {
          // حل خطای f.field با کست کردن به LogicalFilter
          const activeViewFilters = filters.filter(f => (f as LogicalFilter).field !== searchTargetField || f.operator !== 'contains');
          setFilters(activeViewFilters, 'replace');
          return;
      }
      if (!searchTargetField) return;

      setFilters([
          {
              field: searchTargetField,
              operator: 'contains',
              value: val
          }
      ], 'merge'); 
  };

  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;
    modal.confirm({
      title: `حذف ${selectedRowKeys.length} رکورد`,
      content: 'آیا مطمئن هستید؟',
      okType: 'danger',
      okText: 'بله، حذف کن',
      cancelText: 'خیر',
      onOk: () => {
        deleteMany(
          { resource: moduleId!, ids: selectedRowKeys as string[] },
          { onSuccess: () => { setSelectedRowKeys([]); msg.success('حذف شد'); tableQueryResult.refetch(); } }
        );
      }
    });
  };

  const handleBulkEditOpen = () => {
      if (selectedRowKeys.length === 0) return;
      setIsBulkEditOpen(true);
  };

  const handleBulkSave = (values: any) => {
      const changes: any = {};
      Object.keys(values).forEach(key => {
          if (values[key] !== undefined && values[key] !== null && values[key] !== '') {
              changes[key] = values[key];
          }
      });
      if (Object.keys(changes).length === 0) return;

      let completed = 0;
      selectedRowKeys.forEach(id => {
          updateRecord(
            { resource: moduleId!, id: id as string, values: changes },
            { onSuccess: () => {
                  completed++;
                  if (completed === selectedRowKeys.length) {
                      msg.success('بروزرسانی شد');
                      setIsBulkEditOpen(false);
                      setSelectedRowKeys([]);
                      tableQueryResult.refetch();
                  }
              }
            }
          );
      });
  };

  const handleExport = () => {
      const recordsToExport = allData.filter((d: any) => selectedRowKeys.includes(d.id));
      if(recordsToExport.length === 0) return;
      const headers = moduleConfig?.fields.map(f => f.key).join(',') || '';
      const rows = recordsToExport.map((row: any) => {
          return moduleConfig?.fields.map(f => {
              const val = row[f.key];
              return val ? `"${val}"` : '';
          }).join(',');
      }).join('\n');
      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers + '\n' + rows;
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${moduleId}_export_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  if (!moduleId || !moduleConfig) return null;

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto animate-fadeIn pb-20 h-[calc(100vh-64px)] flex flex-col">
       <div className="flex flex-col gap-4 mb-4 shrink-0">
          <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
                      <span className="w-2 h-8 bg-leather-500 rounded-full inline-block"></span>
                      {moduleConfig.titles.fa}
                  </h1>
                  <Badge count={tableQueryResult.data?.total || 0} overflowCount={999} style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }} />
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                 {selectedRowKeys.length === 0 && (
                     <>
                        <Input 
                            prefix={<SearchOutlined className="text-gray-400" />} 
                            placeholder={searchTargetField ? `جستجو در ${moduleConfig.fields.find(f=>f.key===searchTargetField)?.labels.fa}...` : "جستجو غیرفعال"}
                            allowClear
                            disabled={!searchTargetField}
                            onChange={e => handleSearch(e.target.value)}
                            className="rounded-xl w-40 md:w-64 border-none shadow-sm bg-white dark:bg-[#1a1a1a]"
                        />
                        <Divider type="vertical" />
                        
                        <div className="bg-white dark:bg-[#1a1a1a] shadow-sm rounded-xl p-1 flex">
                            <Segmented
                                options={[
                                    { value: ViewMode.LIST, icon: <div className="flex items-center justify-center h-full px-1"><BarsOutlined /></div> },
                                    { value: ViewMode.GRID, icon: <div className="flex items-center justify-center h-full px-1"><AppstoreOutlined /></div> },
                                    { value: ViewMode.KANBAN, icon: <div className="flex items-center justify-center h-full px-1"><ProjectOutlined /></div> },
                                ]}
                                value={viewMode}
                                onChange={(v) => setViewMode(v as ViewMode)}
                                className="bg-transparent"
                            />
                        </div>

                        {viewMode === ViewMode.KANBAN && availableGroupFields.length > 0 && (
                             <Select
                                value={kanbanGroupBy}
                                onChange={setKanbanGroupBy}
                                options={availableGroupFields.map(f => ({ label: `چیدمان: ${f.labels.fa}`, value: f.key }))}
                                className="w-40"
                                variant="borderless"
                                suffixIcon={<GroupOutlined />}
                             />
                        )}
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/${moduleId}/create`)} className="rounded-xl bg-leather-600 hover:!bg-leather-500 shadow-lg shadow-leather-500/30">
                            افزودن
                        </Button>
                     </>
                 )}
              </div>
          </div>
          {selectedRowKeys.length > 0 && (
             <div className="bg-leather-600 text-white rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 animate-slideDown shadow-lg shadow-leather-600/20">
                 <div className="flex items-center gap-3">
                    <span className="font-bold text-lg">{selectedRowKeys.length}</span>
                    <span className="text-sm opacity-90">مورد انتخاب شده</span>
                    <div className="h-4 w-[1px] bg-white/30 mx-2"></div>
                    <Button size="small" type="text" onClick={() => setSelectedRowKeys([])} className="text-white hover:bg-white/20 text-xs">
                        لغو انتخاب
                    </Button>
                 </div>
                 <div className="flex flex-wrap gap-2 items-center justify-end flex-1">
                     <Button ghost icon={<EditOutlined />} onClick={handleBulkEditOpen} className="border-white/50 hover:border-white">
                        ویرایش گروهی
                     </Button>
                     <Button ghost icon={<ExportOutlined />} onClick={handleExport} className="border-white/50 hover:border-white">
                        خروجی
                     </Button>
                     <Button danger type="primary" icon={<DeleteOutlined />} onClick={handleBulkDelete} className="bg-white text-red-500 hover:bg-red-50 border-none">
                        حذف
                     </Button>
                 </div>
             </div>
          )}
       </div>

       <div className="mb-4">
            <ViewManager 
                moduleId={moduleId} 
                currentView={currentView} 
                onViewChange={handleViewChange} 
                onRefresh={() => tableQueryResult.refetch()}
            />
       </div>

       <div className="flex-1 overflow-hidden relative rounded-[2rem]">
           {loading ? (
               <div className="flex h-full items-center justify-center flex-col gap-4 text-gray-400">
                   <Spin size="large" />
                   <span>در حال دریافت اطلاعات...</span>
               </div>
           ) : allData.length === 0 ? (
               <div className="flex h-full items-center justify-center bg-white dark:bg-[#1a1a1a] rounded-[2rem] border border-dashed border-gray-300">
                   <Empty description="هیچ داده‌ای یافت نشد" />
               </div>
           ) : (
               <>
                   {viewMode === ViewMode.LIST && (
                      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full flex flex-col overflow-hidden">
                          <SmartTableRenderer 
                              moduleConfig={moduleConfig}
                              data={allData} 
                              loading={loading}
                              onChange={tableProps.onChange}
                              pagination={tableProps.pagination}
                              rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                              onRow={(record: any) => ({ 
                                  onClick: () => navigate(`/${moduleId}/${record.id}`), 
                                  style: { cursor: 'pointer' } 
                              })}
                          />
                      </div>
                   )}
                   {viewMode === ViewMode.GRID && (
                      <div className="h-full overflow-y-auto p-1 custom-scrollbar">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
                              {allData.map((item: any) => (
                                <RenderCardItem 
                                    key={item.id} 
                                    item={item} 
                                    moduleId={moduleId}
                                    imageField={imageField}
                                    tagsField={tagsField}
                                    selectedRowKeys={selectedRowKeys}
                                    setSelectedRowKeys={setSelectedRowKeys}
                                    navigate={navigate}
                                />
                              ))}
                          </div>
                      </div>
                   )}
                   {viewMode === ViewMode.KANBAN && (
                      <div className="flex gap-4 h-full overflow-x-auto pb-4 px-2">
                        {moduleConfig.fields.find(f => f.key === kanbanGroupBy)?.options?.map((col: any) => {
                            const columnItems = allData.filter((d: any) => d[kanbanGroupBy] === col.value);
                            return (
                                <div key={col.value} className="min-w-[280px] w-[280px] flex flex-col bg-gray-100/50 dark:bg-white/5 rounded-2xl p-2 border border-gray-200 dark:border-gray-800 h-full">
                                    <div className="flex items-center justify-between p-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color || '#ccc' }}></span>
                                            <span className="font-bold text-gray-700 dark:text-gray-300 text-sm">{col.label}</span>
                                        </div>
                                        <span className="bg-white dark:bg-white/10 px-2 py-0.5 rounded-full text-xs text-gray-500">
                                            {columnItems.length}
                                        </span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-0 custom-scrollbar pb-2">
                                        {columnItems.map((item: any) => (
                                            <RenderCardItem 
                                                key={item.id} 
                                                item={item} 
                                                moduleId={moduleId}
                                                imageField={imageField}
                                                tagsField={tagsField}
                                                selectedRowKeys={selectedRowKeys}
                                                setSelectedRowKeys={setSelectedRowKeys}
                                                navigate={navigate}
                                                minimal={true}
                                            />
                                        ))}
                                    </div>
                                    <Button 
                                        type="dashed" 
                                        block 
                                        icon={<PlusOutlined />} 
                                        className="mt-2 text-xs text-gray-500 hover:text-leather-600 hover:border-leather-400"
                                        onClick={() => {
                                            navigate(`/${moduleId}/create`, { 
                                                state: { initialValues: { [kanbanGroupBy]: col.value } } 
                                            });
                                        }}
                                    >
                                        افزودن در {col.label}
                                    </Button>
                                </div>
                            );
                        })}
                      </div>
                   )}
               </>
           )}
       </div>
       {isBulkEditOpen && (
           <SmartForm 
               module={moduleConfig}
               visible={isBulkEditOpen}
               onCancel={() => setIsBulkEditOpen(false)}
               onSave={handleBulkSave}
               title={`ویرایش گروهی ${selectedRowKeys.length} مورد`}
               isBulkEdit={true}
           />
       )}
    </div>
  );
};

export default ModuleListRefine;