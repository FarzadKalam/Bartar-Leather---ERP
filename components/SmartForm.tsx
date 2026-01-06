import React, { useEffect, useState } from 'react';
import { Form, Button, message, Spin, Divider } from 'antd';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import SmartFieldRenderer from './SmartFieldRenderer';
import EditableTable from './EditableTable';
import { ModuleDefinition, FieldLocation, BlockType, LogicOperator } from '../types';

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
  module, visible, onCancel, onSave, recordId, title, forceEditMode, isBulkEdit = false 
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  
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
    try {
      if (onSave) {
        await onSave(values);
      } else {
        if (recordId) {
          const { error } = await supabase.from(module.table).update(values).eq('id', recordId);
          if (error) throw error;
          message.success('ویرایش انجام شد');
        } else {
          const { error } = await supabase.from(module.table).insert(values);
          if (error) throw error;
          message.success('رکورد جدید ثبت شد');
        }
        onCancel();
      }
    } catch (err: any) {
      message.error('خطا: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleValuesChange = (changedValues: any, allValues: any) => {
    setFormData(allValues);
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
  const headerFields = module.fields.filter(f => f.location === FieldLocation.HEADER).sort((a, b) => (a.order || 0) - (b.order || 0));

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
                        forceEditMode={true} // <--- نکته مهم: فعال کردن حالت ویرایش
                      />
                    </div>
                  ))}
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
                      <Divider orientation="left" className="!border-leather-200 !text-leather-600 !font-bold !text-sm">
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
                              onChange={(val) => {
                                form.setFieldValue(field.key, val);
                                setFormData({ ...form.getFieldsValue(), [field.key]: val });
                              }}
                              forceEditMode={true} // <--- نکته مهم: فعال کردن حالت ویرایش
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
                                                onChange={(val) => {
                                                    form.setFieldValue(field.key, val);
                                                    setFormData({ ...form.getFieldsValue(), [field.key]: val });
                                                }}
                                                forceEditMode={true} // <--- نکته مهم
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
                                relationOptions={{}} 
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