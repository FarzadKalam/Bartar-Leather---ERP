import React, { useMemo, useState } from 'react';
import { Select, Input, Button, Popconfirm, Divider, App } from 'antd';
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
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
  dropdownStyle?: React.CSSProperties;
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
  onOptionsUpdate,
  getPopupContainer = () => document.body,
  dropdownStyle
}) => {
  const { message: msg } = App.useApp();
  const [newOptionValue, setNewOptionValue] = useState('');
  const [loading, setLoading] = useState(false);
  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;
  const mergedDropdownStyle: React.CSSProperties = {
    minWidth: isMobileViewport ? 220 : 280,
    maxWidth: isMobileViewport ? '92vw' : 520,
    width: isMobileViewport ? '92vw' : undefined,
    ...dropdownStyle,
  };
  const normalizedOptions = useMemo(() => {
    const next = Array.isArray(options) ? [...options] : [];
    const currentValues = mode === 'multiple'
      ? (Array.isArray(value) ? value : [])
      : (value ? [value] : []);

    currentValues.forEach((val) => {
      if (val === undefined || val === null || val === '') return;
      const exists = next.some((opt) => String(opt.value) === String(val));
      if (!exists) {
        next.unshift({ label: String(val), value: String(val) });
      }
    });
    return next;
  }, [options, value, mode]);

  // افزودن گزینه جدید
  const handleAddOption = async () => {
    const trimmedValue = newOptionValue.trim();
    if (!trimmedValue) {
      msg.warning('لطفاً مقدار گزینه را وارد کنید');
      return;
    }

    // بررسی تکراری بودن
    if (normalizedOptions.find(opt => String(opt.value).trim().toLowerCase() === trimmedValue.toLowerCase())) {
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
      loading={loading}
      optionFilterProp="label"
      getPopupContainer={getPopupContainer}
      options={normalizedOptions}
      popupMatchSelectWidth={isMobileViewport}
      notFoundContent={loading ? "در حال بارگذاری..." : "موردی یافت نشد"}
      dropdownStyle={mergedDropdownStyle}
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
          <div style={{ padding: '8px 10px 10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input
                placeholder="افزودن گزینه جدید..."
                value={newOptionValue}
                onChange={(e) => setNewOptionValue(e.target.value)}
                onPressEnter={handleAddOption}
                disabled={loading}
                className="w-full"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleAddOption}
                  loading={loading}
                >
                  افزودن
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    />
  );
};

export default DynamicSelectField;
