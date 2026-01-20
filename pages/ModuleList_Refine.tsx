import React, { useEffect, useMemo, useState } from "react";
import { useTable } from "@refinedev/antd";
import { CrudFilters, useDeleteMany, useUpdate } from "@refinedev/core";
import { useNavigate, useParams } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartTableRenderer from "../components/SmartTableRenderer";
import { BlockType, FieldType, SavedView, ViewMode } from "../types";
import { App, Badge, Button, Empty, Spin } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import ViewManager from "../components/ViewManager";
import SmartForm from "../components/SmartForm";
import { supabase } from "../supabaseClient";
import Toolbar from "../components/moduleList/Toolbar";
import BulkActionsBar from "../components/moduleList/BulkActionsBar";
import ViewWrapper from "../components/moduleList/ViewWrapper";
import GridView from "../components/moduleList/GridView";
import RenderCardItem from "../components/moduleList/RenderCardItem";

export const ModuleListRefine = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const { modal, message: msg } = App.useApp();
  
  const moduleConfig = moduleId ? MODULES[moduleId] : null;

  // ✅ Use default view mode from module config, fallback to LIST
  const [viewMode, setViewMode] = useState<ViewMode>(moduleConfig?.defaultViewMode || ViewMode.LIST);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [currentView, setCurrentView] = useState<SavedView | null>(null);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [kanbanGroupBy, setKanbanGroupBy] = useState<string>("");
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);  // ✅ ستون‌های انتخاب‌شده
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});  // ✅ اضافه شد
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});  // ✅ اضافه شد
  const [tagsMap, setTagsMap] = useState<Record<string, any[]>>({});  // ✅ Map of record id to tags
  const [gridPageSize, setGridPageSize] = useState<number>(20); // ✅ Grid pagination
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    setViewMode(moduleConfig?.defaultViewMode || ViewMode.LIST);
    setCurrentView(null);
    setSelectedRowKeys([]);
    setVisibleColumns([]);
    setGridPageSize(20);
    setKanbanGroupBy("");
    setSearchTerm("");
  }, [moduleId, moduleConfig?.defaultViewMode]);

  // ✅ Define field keys FIRST (before any useMemo/useEffect that uses them)
  const imageField = moduleConfig?.fields.find(f => f.type === FieldType.IMAGE)?.key;
  const tagsField = moduleConfig?.fields.find(f => f.type === FieldType.TAGS)?.key;
  const statusField = moduleConfig?.fields.find(f => f.type === FieldType.STATUS)?.key;
  const categoryField = moduleConfig?.fields.find(f => f.key === 'category' || f.key === 'product_category')?.key;

  // ✅ Merge tags into allData
  const enrichedData = useMemo(() => {
    if (!tagsField) return allData;
    const tf: string = tagsField;
    return allData.map(record => ({
      ...record,
      [tf]: tagsMap[record.id as string] || []
    }));
  }, [allData, tagsMap, tagsField]);

  // ✅ Grid view - paginated data
  const gridData = useMemo(() => {
    return enrichedData.slice(0, gridPageSize);
  }, [enrichedData, gridPageSize]);

  // ✅ اضافه شد: Fetch dynamic و relation options
  useEffect(() => {
    if (!moduleConfig) return;

    let isActive = true;

    const fetchOptions = async () => {
      try {
        const [{ data: users }, { data: roles }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, avatar_url"),
          supabase.from("org_roles").select("id, title"),
        ]);

        if (!isActive) return;
        if (users) setAllUsers(users);
        if (roles) setAllRoles(roles);

        const dynFields = [...moduleConfig.fields.filter((f) => (f as any).dynamicOptionsCategory)];
        moduleConfig.blocks?.forEach((b) => {
          if (b.type === BlockType.TABLE && b.tableColumns) {
            b.tableColumns.forEach((c) => {
              if (
                (c.type === FieldType.SELECT || c.type === FieldType.MULTI_SELECT) &&
                (c as any).dynamicOptionsCategory
              ) {
                dynFields.push(c);
              }
            });
          }
        });

        const dynCategories: string[] = Array.from(
          new Set(
            dynFields
              .map((f) => (f as any).dynamicOptionsCategory as string | undefined)
              .filter(Boolean)
          )
        ) as string[];

        const dynResults = await Promise.all(
          dynCategories.map((cat) =>
            supabase
              .from("dynamic_options")
              .select("label, value")
              .eq("category", cat!)
              .eq("is_active", true)
          )
        );

        if (!isActive) return;
        const dynOpts: Record<string, any[]> = {};
        dynCategories.forEach((cat, idx) => {
          const data = dynResults[idx]?.data || [];
          dynOpts[cat] = data.filter((i: any) => i.value !== null);
        });
        setDynamicOptions(dynOpts);

        const relFields = [...moduleConfig.fields.filter((f) => f.type === FieldType.RELATION || f.type === FieldType.USER)];
        moduleConfig.blocks?.forEach((b) => {
          if (b.type === BlockType.TABLE && b.tableColumns) {
            b.tableColumns.forEach((c) => {
              if (c.type === FieldType.RELATION || c.type === FieldType.USER) relFields.push({ ...c, key: `${b.id}_${c.key}` });
            });
          }
        });

        const relOpts: Record<string, any[]> = {};

        const { data: profileData } = await supabase.from("profiles").select("id, full_name");
        if (!isActive) return;
        const profileOptions = profileData?.map((p) => ({ label: p.full_name || p.id, value: p.id })) || [];
        relOpts["profiles"] = profileOptions;
        relOpts["assignee_id"] = profileOptions;

        const relResults = await Promise.all(
          relFields.map(async (field) => {
            if (field.type === FieldType.USER) {
              return { key: field.key, options: profileOptions };
            }
            if (field.relationConfig) {
              const { targetModule, targetField, filter } = field.relationConfig;
              const selectFields = ["id", "system_code"].concat(targetField ? [targetField] : []);
              let query = supabase.from(targetModule).select(selectFields.join(", "));
              if (filter) Object.keys(filter).forEach((k) => (query = query.eq(k, filter[k])));
              const { data: relData } = await query.limit(200);
              const options = (relData || []).map((i: any) => {
                const labelValue = targetField ? (i as any)[targetField] : i.id;
                const sys = (i as any).system_code ? ` (${(i as any).system_code})` : "";
                return { label: `${labelValue}${sys}`, value: i.id };
              });
              return { key: field.key, options };
            }
            return null;
          })
        );

        if (!isActive) return;
        relResults.forEach((res) => {
          if (res) {
            relOpts[res.key] = res.options;
            if (res.key.includes("_")) relOpts[res.key.split("_").pop()!] = res.options;
          }
        });
        setRelationOptions(relOpts);
      } catch (error) {
        console.error("Error fetching options", error);
      }
    };

    fetchOptions();

    return () => {
      isActive = false;
    };
  }, [moduleConfig]);

  // ✅ Fetch tags for all records
  useEffect(() => {
    if (!tagsField || !moduleId || allData.length === 0) return;

    const fetchTags = async () => {
      try {
        // Get all tags for records in this module
        const recordIds = allData.map(r => r.id);
        const { data: tagsData } = await supabase
          .from('record_tags')
          .select('record_id, tags(id, title, color)')
          .in('record_id', recordIds);

        // Map tags to records
        if (tagsData) {
          const newTagsMap: Record<string, any[]> = {};
          tagsData.forEach((item: any) => {
            if (!newTagsMap[item.record_id]) {
              newTagsMap[item.record_id] = [];
            }
            if (item.tags) {
              newTagsMap[item.record_id].push(item.tags);
            }
          });
          setTagsMap(newTagsMap);
        }
      } catch (err) {
        console.error('Error fetching tags:', err);
      }
    };

    fetchTags();
  }, [moduleId, tagsField, allData.length]);

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

  useEffect(() => {
    if (viewMode !== ViewMode.KANBAN) return;
    if (kanbanGroupBy) return;
    if (availableGroupFields.length === 0) return;
    const defaultField = availableGroupFields.find((f) => f.type === FieldType.STATUS) || availableGroupFields[0];
    setKanbanGroupBy(defaultField.key);
  }, [viewMode, kanbanGroupBy, availableGroupFields]);

  useEffect(() => {
    if (!searchTargetField) return;
    const handle = setTimeout(() => handleSearch(searchTerm), 300);
    return () => clearTimeout(handle);
  }, [searchTerm, searchTargetField]);

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

    // ✅ اعمال ستون‌های انتخاب‌شده
    if (config && config.columns && Array.isArray(config.columns) && config.columns.length > 0) {
        setVisibleColumns(config.columns);
    } else {
        setVisibleColumns([]);
    }
  };

  // ✅ FIX: سرچ فقط فیلتر سرچ را اضافه/حذف می‌کند و به فیلترهای View دست نمی‌زند
  const handleSearch = (val: string) => {
      if (!searchTargetField) return;

      const nonSearchFilters = filters.filter(f => {
        const lf = f as any;
        return !(lf?.field === searchTargetField && lf?.operator === 'contains');
      });

      if (!val) {
        setFilters(nonSearchFilters, 'replace');
        return;
      }

      setFilters([
        ...nonSearchFilters,
        {
          field: searchTargetField,
          operator: 'contains',
          value: val
        }
      ], 'replace');
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
        <div className="flex flex-col gap-2 mb-4 shrink-0">
        {/* ردیف ۱: عنوان + شمارنده + دکمه افزودن */}
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2 min-w-0">
                <span className="w-2 h-8 bg-leather-500 rounded-full inline-block shrink-0"></span>
                <span className="truncate">{moduleConfig.titles.fa}</span>
            </h1>
            <Badge
                count={tableQueryResult.data?.total || 0}
                overflowCount={999}
                style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
            />
            </div>

            {selectedRowKeys.length === 0 && (
            <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate(`/${moduleId}/create`)}
                className="rounded-xl bg-leather-600 hover:!bg-leather-500 shadow-lg shadow-leather-500/30 shrink-0"
            >
                افزودن
            </Button>
            )}
        </div>

        <Toolbar
          viewMode={viewMode}
          setViewMode={setViewMode}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onRefresh={() => tableQueryResult.refetch()}
          isFullscreen={isFullscreen}
          toggleFullscreen={() => setIsFullscreen((prev) => !prev)}
          kanbanEnabled={availableGroupFields.length > 0}
          kanbanGroupBy={kanbanGroupBy}
          kanbanGroupOptions={availableGroupFields.map((f) => ({ label: f.labels.fa, value: f.key }))}
          onKanbanGroupChange={setKanbanGroupBy}
        />

        <BulkActionsBar
          selectedCount={selectedRowKeys.length}
          onClear={() => setSelectedRowKeys([])}
          onEdit={selectedRowKeys.length ? handleBulkEditOpen : undefined}
          onDelete={selectedRowKeys.length ? handleBulkDelete : undefined}
          onExport={selectedRowKeys.length ? handleExport : undefined}
        />
        </div>

       <div className="mb-4">
            <ViewManager 
                moduleId={moduleId} 
                currentView={currentView} 
                onViewChange={handleViewChange} 
                onRefresh={() => tableQueryResult.refetch()}
            />
       </div>

         <ViewWrapper isFullscreen={isFullscreen}>
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
                <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full overflow-hidden">
                  <SmartTableRenderer 
                    moduleConfig={moduleConfig}
                    data={enrichedData} 
                    loading={loading}
                    visibleColumns={visibleColumns.length > 0 ? visibleColumns : undefined}
                    onChange={tableProps.onChange as any}
                    pagination={tableProps.pagination}
                    rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                    onRow={(record: any) => ({ 
                      onClick: () => navigate(`/${moduleId}/${record.id}`), 
                      style: { cursor: 'pointer' } 
                    })}
                    dynamicOptions={dynamicOptions}
                    relationOptions={relationOptions}
                    allUsers={allUsers}
                    allRoles={allRoles}
                  />
                </div>
               )}
               {viewMode === ViewMode.GRID && (
                <div className="h-full overflow-y-auto p-1 custom-scrollbar flex flex-col">
                            <GridView
                              data={gridData}
                              moduleId={moduleId}
                              moduleConfig={moduleConfig}
                              imageField={imageField}
                              tagsField={tagsField}
                              statusField={statusField}
                              categoryField={categoryField}
                              selectedRowKeys={selectedRowKeys}
                              setSelectedRowKeys={setSelectedRowKeys}
                              navigate={navigate}
                            />
                            
                  {/* Load More Button */}
                  {gridPageSize < enrichedData.length && (
                    <div className="flex justify-center items-center py-6 border-t border-gray-200 dark:border-gray-800">
                    <Button 
                      size="large"
                      onClick={() => setGridPageSize(prev => prev + 20)}
                      className="px-8 h-12 font-bold"
                    >
                      بارگیری بیشتر ({gridPageSize} از {enrichedData.length})
                    </Button>
                    </div>
                  )}
                </div>
               )}
               {viewMode === ViewMode.KANBAN && (
                <div className="flex gap-4 h-full overflow-x-auto pb-4 px-2">
                  {moduleConfig.fields.find(f => f.key === kanbanGroupBy)?.options?.map((col: any) => {
                    const columnItems = enrichedData.filter((d: any) => d[kanbanGroupBy] === col.value);
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
                              moduleConfig={moduleConfig}
                              imageField={imageField}
                              tagsField={tagsField}
                              statusField={statusField}
                              categoryField={categoryField}
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
         </ViewWrapper>
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
