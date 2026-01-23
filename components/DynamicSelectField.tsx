import React, { useState } from 'react';
import { Select, Input, Button, Space, Popconfirm, Divider, App } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';

interface DynamicSelectFieldProps {
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  options: Array<{ label: string; value: string }>;
  category: string;
  placeholder?: string;
  className?: string;
  showSearch?: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  mode?: 'multiple' | 'tags';
  onOptionsUpdate?: () => void; // callback برای رفرش options
}

/**
 * کامپوننت SELECT با قابلیت افزودن و حذف گزینه‌های دینامیک
 * برای استفاده در هر دو SmartForm و ModuleShow
 */
const DynamicSelectField: React.FC<DynamicSelectFieldProps> = ({
  value,
  onChange,
  options,
  category,
  placeholder = 'انتخاب کنید',
  className = 'w-full',
  showSearch = true,
  allowClear = true,
  disabled = false,
  mode = undefined,
  onOptionsUpdate
}) => {
  const { message: msg } = App.useApp();
  const [newOptionValue, setNewOptionValue] = useState('');
  const [loading, setLoading] = useState(false);

  // افزودن گزینه جدید
  const handleAddOption = async () => {
    const trimmedValue = newOptionValue.trim();
    if (!trimmedValue) {
      msg.warning('لطفاً مقدار گزینه را وارد کنید');
      return;
    }

    // بررسی تکراری بودن
    if (options.find(opt => opt.value === trimmedValue)) {
      msg.warning('این گزینه قبلاً وجود دارد');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('dynamic_options').insert([{
        category,
        label: trimmedValue,
        value: trimmedValue,
        is_active: true
      }]);

      if (error) throw error;

      msg.success(`گزینه "${trimmedValue}" اضافه شد`);
      
      // انتخاب خودکار مقدار جدید
      if (mode === 'multiple') {
        // برای MULTI_SELECT، مقدار جدید را به آرایه اضافه کن
        const currentValues = Array.isArray(value) ? value : (value ? [value] : []);
        onChange?.([...currentValues, trimmedValue]);
      } else {
        onChange?.(trimmedValue);
      }
      setNewOptionValue('');
      
      // رفرش options از parent
      onOptionsUpdate?.();
    } catch (error: any) {
      console.error('Error adding option:', error);
      msg.error('خطا در افزودن گزینه: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // حذف گزینه
  const handleDeleteOption = async (optionValue: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('dynamic_options')
        .delete()
        .eq('category', category)
        .eq('value', optionValue);

      if (error) throw error;

      msg.success('گزینه حذف شد');
      
      // اگر مقدار فعلی همین است، پاک کن
      if (value === optionValue) {
        onChange?.(undefined as any);
      }
      
      // رفرش options
      onOptionsUpdate?.();
    } catch (error: any) {
      console.error('Error deleting option:', error);
      msg.error('خطا در حذف گزینه: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select
      mode={mode}
      value={mode === 'multiple' ? (Array.isArray(value) ? value : (value ? [value] : [])) : value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      showSearch={showSearch}
      allowClear={allowClear}
      disabled={disabled || loading}
      loading={options.length === 0} // نمایش loading تا زمان بارگذاری options
      optionFilterProp="label"
      getPopupContainer={(trigger) => trigger.parentNode as HTMLElement}
      options={options}
      notFoundContent={options.length === 0 ? "در حال بارگذاری..." : "موردی یافت نشد"}
      // رندر سفارشی برای هر آیتم با دکمه حذف
      optionRender={(option) => (
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            width: '100%'
          }}
        >
          <span>{option.label}</span>
          <Popconfirm
            title="حذف گزینه"
            description={`آیا از حذف "${option.label}" مطمئن هستید؟`}
            onConfirm={(e) => {
              e?.stopPropagation();
              handleDeleteOption(option.value as string);
            }}
            onCancel={(e) => e?.stopPropagation()}
            okText="بله، حذف شود"
            cancelText="خیر"
            placement="left"
            zIndex={9999} // بالاتر از modal و drawer
          >
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              onClick={(e) => {
                e.stopPropagation();
              }}
              style={{ 
                padding: '0 4px',
                marginRight: '8px'
              }}
            />
          </Popconfirm>
        </div>
      )}
      // بخش پایین dropdown برای افزودن گزینه جدید
      dropdownRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          <div style={{ padding: '4px 8px 8px' }}>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                placeholder="افزودن گزینه جدید..."
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                onPressEnter={handleAddOption}
                disabled={loading}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddOption}
                loading={loading}
              >
                افزودن
              </Button>
            </Space.Compact>
          </div>
        </>
      )}
    />
  );
};

export default DynamicSelectField;
