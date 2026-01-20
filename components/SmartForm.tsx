import React, { useEffect, useState } from 'react';
import { Form, Button, message, Spin, Divider, Select, Input } from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import SmartFieldRenderer from './SmartFieldRenderer';
import EditableTable from './EditableTable';
import { ModuleDefinition, FieldLocation, BlockType, LogicOperator, FieldType, FieldNature } from '../types';

interface SmartFormProps {
  module: ModuleDefinition;
  visible: boolean;
  onCancel: () => void;
  onSave?: (values: any) => void;
  recordId?: string;
  title?: string;
  isBulkEdit?: boolean;
}

const SmartForm: React.FC<SmartFormProps> = ({ 
  module, visible, onCancel, onSave, recordId, title, isBulkEdit = false 
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  
  const fetchAllRelationOptionsWrapper = async () => {
    await fetchAllRelationOptions();
    await fetchBaseInfo();
    setOptionsLoaded(true);
  };

  const fetchBaseInfo = async () => {
    const { data: users } = await supabase.from('profiles').select('id, full_name, avatar_url');
    const { data: roles } = await supabase.from('org_roles').select('id, title');
    if (users) setAllUsers(users);
    if (roles) setAllRoles(roles);
  };

  useEffect(() => {
    // Fetch options فقط یک بار در اولین باز شدن
    if (!optionsLoaded) {
      fetchAllRelationOptionsWrapper();
    }
  }, []);

  useEffect(() => {
    if (visible) {
      if (recordId && !isBulkEdit) {
        fetchRecord();
      } else {
        form.resetFields();
        setFormData({});
      }
    }
  }, [visible, recordId]);

  const fetchAllRelationOptions = async () => {
    const relationFields = module.fields.filter(f => f.type === FieldType.RELATION);
    const dynamicFields = module.fields.filter(f => f.dynamicOptionsCategory);
    const tableBlocks = module.blocks?.filter(b => b.type === BlockType.TABLE) || [];
    
    // جمع‌آوری همه fetchها برای اجرای موازی
    const fetchPromises: Promise<{ key: string; options: any[] }>[] = [];

    // Fetch for standalone relation fields
    relationFields.forEach(field => {
      if (field.relationConfig) {
        fetchPromises.push(
          fetchOptionsForRelation(field.relationConfig).then(options => ({ key: field.key, options }))
        );
      }
    });

    // Fetch for dynamic option fields
    dynamicFields.forEach(field => {
      if (field.dynamicOptionsCategory) {
        fetchPromises.push(
          fetchDynamicOptions(field.dynamicOptionsCategory).then(options => ({ key: field.key, options }))
        );
      }
    });

    // Fetch for table columns
    tableBlocks.forEach(block => {
      if (block.tableColumns) {
        block.tableColumns.forEach(col => {
          if (col.type === FieldType.RELATION && col.relationConfig) {
            const key = `${block.id}_${col.key}`;
            fetchPromises.push(
              fetchOptionsForRelation(col.relationConfig).then(options => ({ key, options }))
            );
          }
        });
      }
    });

    // اجرای موازی همه fetchها
    const results = await Promise.all(fetchPromises);
    
    const newOptions: Record<string, any[]> = { ...relationOptions };
    results.forEach(result => {
      newOptions[result.key] = result.options;
    });

    setRelationOptions(newOptions);
  };

  const fetchOptionsForRelation = async (config: any) => {
    try {
      // اگر targetModule یک فیلد است (dynamically تعیین می‌شود)، نمی‌توانیم الان بارگذاری کنیم
      if (config.dependsOn) {
        // بارگذاری تمام ماژول‌های ممکن
        const possibleModules = ['products', 'customers', 'suppliers', 'production_orders', 'production_boms'];
        
        let allOptions: any[] = [];
        for (const moduleName of possibleModules) {
          try {
            // select کردن هم name و هم system_code
            let query = supabase.from(moduleName).select('id, name, system_code');
            const { data, error } = await query;
            if (!error && data) {
              allOptions = allOptions.concat(
                data.map((item: any) => ({
                  label: item.system_code ? `${item.name} (${item.system_code})` : item.name,
                  value: item.id,
                  module: moduleName,
                  name: item.name,
                  system_code: item.system_code
                }))
              );
            }
          } catch (err) {
            // اگر جدول موجود نیست یا خطا دارد، ادامه بده
            console.warn(`Could not fetch from ${moduleName}:`, err);
          }
        }
        return allOptions;
      }
      
      // برای targetModule ثابت
      const targetModule = config.targetModule;
      const targetField = config.targetField || 'name';
      
      // select کردن system_code در کنار targetField
      let query = supabase.from(targetModule).select(`id, ${targetField}, system_code`);
      if (config.filter) {
        query = query.match(config.filter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((item: any) => ({
        label: item.system_code ? `${item[targetField]} (${item.system_code})` : item[targetField],
        value: item.id,
        name: item[targetField],
        system_code: item.system_code
      }));
    } catch (err) {
      console.error('Error fetching relation options:', err);
      return [];
    }
  };

  const fetchDynamicOptions = async (category: string) => {
    try {
      const { data, error } = await supabase
        .from('dynamic_options')
        .select('id, label, value')
        .eq('category', category)
        .eq('is_active', true)
        .order('label');
      
      if (error) {
        console.warn(`Dynamic options for ${category} not found, using empty array`);
        return [];
      }
      return (data || []).map((item: any) => ({
        label: item.label,
        value: item.value
      }));
    } catch (err) {
      console.error('Error fetching dynamic options:', err);
      return [];
    }
  };

  const fetchRecord = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from(module.table).select('*').eq('id', recordId).single();
      if (error) throw error;
      if (data) {
        form.setFieldsValue(data);
        setFormData(data);
      }
    } catch (err: any) {
      message.error('خطا در دریافت اطلاعات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async (values: any) => {
    setLoading(true);
    console.log('📝 Form values before submit:', values);
    console.log('📋 Module config:', module);
    try {
      // حذف فیلدهای سیستمی و خالی از داده‌ها
      const cleanedValues = Object.keys(values).reduce((acc: any, key) => {
        const field = module.fields.find(f => f.key === key);
        // حذف فیلد اگر readonly است یا مقدار undefined دارد
        if (field?.readonly || field?.nature === FieldNature.SYSTEM) {
          console.log(`⏭️ Skipping field: ${key} (readonly or system)`);
          return acc;
        }
        // فقط مقادیر معتبر را اضافه کن
        if (values[key] !== undefined && values[key] !== null && values[key] !== '') {
          let value = values[key];
          
          // اگر فیلد SELECT با mode=tags است و آرایه است، اولین مقدار را بگیر
          if (field?.type === FieldType.SELECT && field?.mode === 'tags' && Array.isArray(value)) {
            value = value.length > 0 ? value[0] : null;
            console.log(`🔄 Converting array to string for ${key}:`, values[key], '→', value);
          }
          
          // اگر فیلد MULTI_SELECT است و آرایه است، آرایه را نگه‌دار
          if (field?.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
            // MULTI_SELECT باید آرایه باقی بماند
            if (value.length > 0) {
              acc[key] = value;
            }
          } else if (value !== null && value !== '') {
            acc[key] = value;
          }
        }
        return acc;
      }, {});

      console.log('✅ Cleaned values for database:', cleanedValues);
      console.log('🗄️ Table name:', module.table);

      if (onSave) {
        await onSave(cleanedValues);
      } else {
        if (recordId) {
          const { error } = await supabase.from(module.table).update(cleanedValues).eq('id', recordId);
          if (error) {
            console.error('Update error:', error);
            throw error;
          }
          message.success('ویرایش انجام شد');
        } else {
          const { data: insertedData, error } = await supabase.from(module.table).insert(cleanedValues).select();
          if (error) {
            console.error('❌ Insert error:', error);
            console.error('📄 Error details:', {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code
            });
            throw error;
          }
          console.log('✅ Inserted data:', insertedData);
          message.success('رکورد جدید ثبت شد');
        }
        onCancel();
      }
    } catch (err: any) {
      console.error('Submit error:', err);
      message.error('خطا: ' + (err.message || 'خطای ناشناخته'));
    } finally {
      setLoading(false);
    }
  };

  const handleValuesChange = (changedValues: any, allValues: any) => {
    setFormData(allValues);
    if (changedValues.related_bom) {
      handleBomSelection(changedValues.related_bom);
    }
    // Handle dynamic relation field updates
    if (changedValues.related_to_module) {
      handleRelatedModuleChange(changedValues.related_to_module);
    }
  };

  const handleRelatedModuleChange = async (selectedModule: string) => {
    if (!selectedModule) {
      // Clear related_to_id if module is not selected
      form.setFieldValue('related_to_id', null);
      setRelationOptions(prev => ({ ...prev, related_to_id: [] }));
      return;
    }

    try {
      // Fetch records from the selected module با name و system_code
      const { data, error } = await supabase
        .from(selectedModule)
        .select('id, name, system_code')
        .order('name');

      if (error) {
        console.error(`Error fetching ${selectedModule} records:`, error);
        setRelationOptions(prev => ({ ...prev, related_to_id: [] }));
        return;
      }

      const options = (data || []).map((item: any) => ({
        label: item.system_code ? `${item.name} (${item.system_code})` : item.name,
        value: item.id,
        module: selectedModule,
        name: item.name,
        system_code: item.system_code
      }));

      setRelationOptions(prev => ({ ...prev, related_to_id: options }));
    } catch (err) {
      console.error('Error handling related module change:', err);
      setRelationOptions(prev => ({ ...prev, related_to_id: [] }));
    }
  };

  const handleBomSelection = async (bomId: string) => {
    if (!bomId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('production_boms')
        .select('items_leather, items_lining, items_fitting, items_accessory')
        .eq('id', bomId)
        .single();
        
      if (error) throw error;
      
      if (data) {
        const updatedData = {
          ...form.getFieldsValue(),
          items_leather: data.items_leather || [],
          items_lining: data.items_lining || [],
          items_fitting: data.items_fitting || [],
          items_accessory: data.items_accessory || []
        };
        form.setFieldsValue(updatedData);
        setFormData(updatedData);
        message.info('مقادیر بر اساس شناسنامه تولید پر شد');
      }
    } catch (err: any) {
      console.error('Error fetching BOM details:', err);
      message.error('خطا در دریافت جزئیات شناسنامه');
    } finally {
      setLoading(false);
    }
  };

  const checkVisibility = (logic: any) => {
    if (!logic) return true;
    const { field, operator, value } = logic;
    const fieldValue = formData[field];

    switch (operator) {
      case LogicOperator.EQUALS: return fieldValue === value;
      case LogicOperator.NOT_EQUALS: return fieldValue !== value;
      case LogicOperator.GREATER_THAN: return Number(fieldValue) > Number(value);
      default: return true;
    }
  };

  if (!visible) return null;
  if (!module || !module.fields) return null;

  const sortedBlocks = [...(module.blocks || [])].sort((a, b) => a.order - b.order);
  // ✅ Exclude assignee_id from header fields as it's handled in ModuleShow hero section
  const headerFields = module.fields
    .filter(f => f.location === FieldLocation.HEADER && f.key !== 'assignee_id')
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#1e1e1e] w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        <div className="flex justify-between items-center p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/5">
          <h2 className="text-xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
            <span className="w-2 h-8 bg-leather-500 rounded-full inline-block"></span>
            {title || (recordId ? `ویرایش ${module.titles.fa}` : `افزودن ${module.titles.fa} جدید`)}
          </h2>
          <Button shape="circle" icon={<CloseOutlined />} onClick={onCancel} className="border-none hover:bg-red-50 hover:text-red-500" />
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading && !isBulkEdit ? (
            <div className="h-full flex items-center justify-center"><Spin size="large" /></div>
          ) : (
            <Form 
              form={form} 
              layout="vertical" 
              onFinish={handleFinish} 
              onValuesChange={handleValuesChange}
              initialValues={formData}
            >
              
              {/* بخش هدر (Header Fields) */}
              {headerFields.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 bg-gray-50 dark:bg-white/5 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                  {headerFields.map(field => (
                    <div key={field.key} className={field.type === 'image' ? 'row-span-2' : ''}>
                      <SmartFieldRenderer 
                        field={field} 
                        value={formData[field.key]} 
                        onChange={(val) => form.setFieldValue(field.key, val)}
                        options={relationOptions[field.key]}
                        forceEditMode={true}
                        onOptionsUpdate={fetchAllRelationOptions}
                        allValues={formData}
                        recordId={recordId}
                        moduleId={module.id}
                      />
                    </div>
                  ))}
                  
                  {/* فیلد انتخاب مسئول */}
                  <div>
                    <Form.Item name="assignee_combined" label="مسئول">
                      <Select
                        placeholder="انتخاب مسئول"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        getPopupContainer={(trigger) => trigger.parentElement || document.body}
                        dropdownStyle={{ zIndex: 1400 }}
                        value={formData.assignee_id && formData.assignee_type ? `${formData.assignee_type}_${formData.assignee_id}` : undefined}
                        onChange={(value: any) => {
                          if (!value) {
                            form.setFieldsValue({ assignee_id: null, assignee_type: null });
                            setFormData({ ...formData, assignee_id: null, assignee_type: null });
                          } else {
                            const [type, id] = value.split('_');
                            form.setFieldsValue({ assignee_id: id, assignee_type: type });
                            setFormData({ ...formData, assignee_id: id, assignee_type: type });
                          }
                        }}
                        options={[
                          {
                            label: 'پرسنل',
                            options: allUsers.map(u => ({
                              label: u.full_name,
                              value: `user_${u.id}`,
                            }))
                          },
                          {
                            label: 'تیم‌ها (جایگاه سازمانی)',
                            options: allRoles.map(r => ({
                              label: r.title,
                              value: `role_${r.id}`,
                            }))
                          }
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="assignee_id" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name="assignee_type" hidden>
                      <Input />
                    </Form.Item>
                  </div>
                </div>
              )}

              {/* بلوک‌ها (Blocks) */}
              {sortedBlocks.map(block => {
                if (block.visibleIf && !checkVisibility(block.visibleIf)) return null;

                // حالت ۱: بلوک گروه فیلد
                if (block.type === BlockType.FIELD_GROUP || block.type === BlockType.DEFAULT) {
                  const blockFields = module.fields
                    .filter(f => f.blockId === block.id)
                    .sort((a, b) => (a.order || 0) - (b.order || 0));
                  
                  if (blockFields.length === 0) return null;

                  return (
                    <div key={block.id} className="mb-6 animate-slideUp">
                      <Divider orientation="right" className="!border-leather-200 !text-leather-600 !font-bold !text-sm">
                        {block.icon && <i className={`mr-2 ${block.icon}`}></i>}
                        {block.titles.fa}
                      </Divider>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {blockFields.map(field => {
                          if (field.logic?.visibleIf && !checkVisibility(field.logic.visibleIf)) return null;
                          return (
                            <SmartFieldRenderer 
                              key={field.key}
                              field={field} 
                              value={formData[field.key]}
                              options={relationOptions[field.key]}
                              onChange={(val) => {
                                form.setFieldValue(field.key, val);
                                setFormData({ ...form.getFieldsValue(), [field.key]: val });
                              }}
                              forceEditMode={true}
                              onOptionsUpdate={fetchAllRelationOptions}
                              allValues={formData}
                              recordId={recordId}
                              moduleId={module.id}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // حالت ۲: بلوک جدول (Table Block)
                if (block.type === BlockType.TABLE) {
                  let externalRecordId = undefined;
                  if (block.externalDataConfig) {
                    externalRecordId = formData[block.externalDataConfig.relationFieldKey];
                  }

                  return (
                    <div key={block.id} className="mb-8 p-1 border border-dashed border-gray-300 dark:border-gray-700 rounded-3xl bg-gray-50/30 dark:bg-white/5">
                        <div className="px-4 pt-4">
                             {module.fields
                                .filter(f => f.blockId === block.id)
                                .map(field => {
                                    if (field.logic?.visibleIf && !checkVisibility(field.logic.visibleIf)) return null;
                                    return (
                                        <div key={field.key} className="mb-4 max-w-md">
                                             <SmartFieldRenderer
                                                field={field}
                                                value={formData[field.key]}
                                                options={relationOptions[field.key]}
                                                onChange={(val) => {
                                                    form.setFieldValue(field.key, val);
                                                    setFormData({ ...form.getFieldsValue(), [field.key]: val });
                                                }}
                                                forceEditMode={true} // <--- نکته مهم
                                                allValues={formData}
                                                recordId={recordId}
                                                moduleId={module.id}
                                             />
                                        </div>
                                    );
                                })}
                        </div>

                        <Form.Item name={block.id} noStyle>
                            <EditableTable
                                block={block}
                                initialData={formData[block.id] || []}
                                mode={externalRecordId ? 'external_view' : 'local'}
                                moduleId={module.id}
                                externalSource={{
                                    moduleId: block.externalDataConfig?.targetModule,
                                    recordId: externalRecordId,
                                    column: block.externalDataConfig?.targetColumn
                                }}
                                relationOptions={relationOptions} 
                                onChange={(newData) => {
                                    form.setFieldValue(block.id, newData);
                                }}
                            />
                        </Form.Item>
                    </div>
                  );
                }
                
                return null;
              })}

            </Form>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1e1e] flex justify-end gap-3">
          <Button size="large" onClick={onCancel} className="rounded-xl">انصراف</Button>
          <Button 
            size="large" 
            type="primary" 
            onClick={() => form.submit()} 
            loading={loading} 
            icon={<SaveOutlined />} 
            className="rounded-xl bg-leather-600 hover:!bg-leather-500 shadow-lg shadow-leather-500/20"
          >
            {recordId ? 'ذخیره تغییرات' : 'ثبت نهایی'}
          </Button>
        </div>

      </div>
    </div>
  );
};

export default SmartForm;