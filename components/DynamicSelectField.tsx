import React, { useMemo, useState } from 'react';
import { Select, Input, Button, Divider, App, Modal } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { migrateDynamicOptionUsage } from '../utils/dynamicOptionManagement';

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
  onOptionsUpdate?: () => void;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
  popupRootStyle?: React.CSSProperties;
  dropdownStyle?: React.CSSProperties;
}

type ManagedOption = {
  label: string;
  value: string;
};

const containsLatinChars = (value: string) => /[A-Za-z]/.test(value);

const normalizeComparableValue = (value: any) => String(value ?? '').trim();

const toComparableKey = (value: any) => normalizeComparableValue(value).toLowerCase();

const dedupeValues = (values: any[]) => {
  const seen = new Set<string>();
  const next: any[] = [];
  values.forEach((item) => {
    const key = toComparableKey(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    next.push(item);
  });
  return next;
};

const dedupeOptions = (options: Array<{ label: string; value: string }>) => {
  const seen = new Set<string>();
  const next: Array<{ label: string; value: string }> = [];
  options.forEach((option) => {
    const valueKey = toComparableKey(option?.value);
    const labelKey = toComparableKey(option?.label);
    const key = valueKey || labelKey;
    if (!key || seen.has(key)) return;
    seen.add(key);
    next.push(option);
  });
  return next;
};

const normalizeDynamicValueToLabel = (
  input: string | string[] | undefined,
  options: Array<{ label: string; value: string }>,
  mode?: 'multiple' | 'tags'
): string | string[] | undefined => {
  if (input === undefined) return undefined;

  const map = new Map<string, string>();
  (options || []).forEach((opt) => {
    const key = String(opt?.value ?? '');
    const label = String(opt?.label ?? key);
    if (!key) return;
    map.set(key, label);
  });

  if (mode === 'multiple' || mode === 'tags') {
    const arr = Array.isArray(input) ? input : [input];
    return arr.map((val) => {
      const normalized = String(val ?? '');
      return map.get(normalized) || normalized;
    });
  }

  const normalized = String(input ?? '');
  return map.get(normalized) || normalized;
};

const remapCurrentValue = (
  input: string | string[] | undefined,
  fromValue: string,
  toValue: string | null,
  mode?: 'multiple' | 'tags'
): { changed: boolean; nextValue: string | string[] | undefined } => {
  const normalizedFromValue = normalizeComparableValue(fromValue);
  if (!normalizedFromValue) {
    return { changed: false, nextValue: input };
  }

  if (mode === 'multiple' || mode === 'tags' || Array.isArray(input)) {
    const currentValues = Array.isArray(input) ? input : (input ? [input] : []);
    let changed = false;
    const nextValues = currentValues.flatMap((item) => {
      if (normalizeComparableValue(item) !== normalizedFromValue) return [item];
      changed = true;
      return toValue === null ? [] : [toValue];
    });

    if (!changed) {
      return { changed: false, nextValue: input };
    }

    return {
      changed: true,
      nextValue: dedupeValues(nextValues).map((item) => String(item)),
    };
  }

  if (normalizeComparableValue(input) !== normalizedFromValue) {
    return { changed: false, nextValue: input };
  }

  return {
    changed: true,
    nextValue: toValue === null ? undefined : toValue,
  };
};

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
  getPopupContainer = (trigger) => {
    const modalParent = trigger?.closest('.ant-modal-wrap, .ant-modal-content, .ant-drawer-content');
    if (modalParent instanceof HTMLElement) return modalParent;
    return document.body;
  },
  popupRootStyle,
  dropdownStyle,
}) => {
  const { message: msg } = App.useApp();
  const [newOptionValue, setNewOptionValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedOption | null>(null);
  const [deleteReplacementValue, setDeleteReplacementValue] = useState<string>();
  const [editTarget, setEditTarget] = useState<ManagedOption | null>(null);
  const [editOptionValue, setEditOptionValue] = useState('');
  const isMobileViewport = typeof window !== 'undefined' ? window.innerWidth <= 768 : false;

  const mergedDropdownStyle: React.CSSProperties = {
    minWidth: isMobileViewport ? 220 : 280,
    maxWidth: isMobileViewport ? '92vw' : 520,
    width: isMobileViewport ? '92vw' : undefined,
    zIndex: 13000,
    ...dropdownStyle,
    ...popupRootStyle,
  };

  const normalizedOptions = useMemo(() => {
    const next = dedupeOptions(
      (Array.isArray(options) ? options : []).map((option) => ({
        label: String(option?.label ?? option?.value ?? ''),
        value: String(option?.value ?? option?.label ?? ''),
      }))
    );
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

  const persistedOptionValues = useMemo(() => new Set(
    (options || []).map((option) => String(option?.value ?? ''))
  ), [options]);

  const deleteReplacementOptions = useMemo(() => {
    if (!deleteTarget) return [];
    return normalizedOptions.filter((option) =>
      persistedOptionValues.has(String(option.value))
      && String(option.value) !== String(deleteTarget.value)
    );
  }, [deleteTarget, normalizedOptions, persistedOptionValues]);

  const handleSelectChange = (nextValue: string | string[] | undefined) => {
    const normalized = normalizeDynamicValueToLabel(nextValue, normalizedOptions, mode);
    onChange?.(normalized as any);
  };

  const applyCurrentValueRemap = (fromValue: string, toValue: string | null) => {
    const remapped = remapCurrentValue(value, fromValue, toValue, mode);
    if (remapped.changed) {
      onChange?.(remapped.nextValue as any);
    }
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteReplacementValue(undefined);
  };

  const closeEditModal = () => {
    setEditTarget(null);
    setEditOptionValue('');
  };

  const handleAddOption = async () => {
    const trimmedValue = newOptionValue.trim();
    if (!trimmedValue) {
      msg.warning('لطفاً مقدار گزینه را وارد کنید');
      return;
    }
    if (containsLatinChars(trimmedValue)) {
      msg.warning('مقدار گزینه باید فارسی باشد.');
      return;
    }

    if (normalizedOptions.find((opt) => toComparableKey(opt.value) === toComparableKey(trimmedValue))) {
      msg.warning('این گزینه قبلاً وجود دارد');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('dynamic_options').insert([{
        category,
        label: trimmedValue,
        value: trimmedValue,
        is_active: true,
      }]);

      if (error) throw error;

      msg.success(`گزینه "${trimmedValue}" اضافه شد`);

      if (mode === 'multiple') {
        const currentValues = Array.isArray(value) ? value : (value ? [value] : []);
        handleSelectChange([...currentValues, trimmedValue]);
      } else {
        handleSelectChange(trimmedValue);
      }

      setNewOptionValue('');
      onOptionsUpdate?.();
    } catch (error: any) {
      console.error('Error adding option:', error);
      msg.error('خطا در افزودن گزینه: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteModal = (option: ManagedOption) => {
    const replacements = normalizedOptions.filter((item) =>
      persistedOptionValues.has(String(item.value))
      && String(item.value) !== String(option.value)
    );

    if (replacements.length === 0) {
      msg.warning('برای حذف امن، ابتدا یک گزینه جایگزین دیگر در همین فهرست ایجاد کنید.');
      return;
    }

    setDeleteTarget(option);
    setDeleteReplacementValue(String(replacements[0].value));
  };

  const handleDeleteOption = async () => {
    if (!deleteTarget || !deleteReplacementValue) {
      msg.warning('مقدار جایگزین را انتخاب کنید');
      return;
    }

    setLoading(true);
    try {
      const migration = await migrateDynamicOptionUsage({
        category,
        fromValue: deleteTarget.value,
        toValue: deleteReplacementValue,
      });

      const { error } = await supabase
        .from('dynamic_options')
        .delete()
        .eq('category', category)
        .eq('value', deleteTarget.value);

      if (error) throw error;

      applyCurrentValueRemap(deleteTarget.value, deleteReplacementValue);
      closeDeleteModal();
      onOptionsUpdate?.();
      msg.success(
        migration.updatedRecords > 0
          ? `گزینه حذف شد و ${migration.updatedRecords} رکورد به مقدار جدید منتقل شد`
          : 'گزینه حذف شد'
      );
    } catch (error: any) {
      console.error('Error deleting option:', error);
      msg.error('خطا در حذف گزینه: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (option: ManagedOption) => {
    setEditTarget(option);
    setEditOptionValue(String(option.label || option.value || ''));
  };

  const handleEditOption = async () => {
    if (!editTarget) return;

    const trimmedValue = editOptionValue.trim();
    if (!trimmedValue) {
      msg.warning('لطفاً مقدار جدید را وارد کنید');
      return;
    }
    if (containsLatinChars(trimmedValue)) {
      msg.warning('مقدار گزینه باید فارسی باشد.');
      return;
    }

    if (toComparableKey(trimmedValue) === toComparableKey(editTarget.value)) {
      closeEditModal();
      return;
    }

    const duplicateExists = normalizedOptions.some((option) =>
      persistedOptionValues.has(String(option.value))
      && String(option.value) !== String(editTarget.value)
      && toComparableKey(option.value) === toComparableKey(trimmedValue)
    );
    if (duplicateExists) {
      msg.warning('گزینه‌ای با این نام از قبل وجود دارد. برای ادغام از حذف امن استفاده کنید.');
      return;
    }

    setLoading(true);
    try {
      const migration = await migrateDynamicOptionUsage({
        category,
        fromValue: editTarget.value,
        toValue: trimmedValue,
      });

      const { error } = await supabase
        .from('dynamic_options')
        .update({ label: trimmedValue, value: trimmedValue })
        .eq('category', category)
        .eq('value', editTarget.value);

      if (error) throw error;

      applyCurrentValueRemap(editTarget.value, trimmedValue);
      closeEditModal();
      onOptionsUpdate?.();
      msg.success(
        migration.updatedRecords > 0
          ? `گزینه ویرایش شد و ${migration.updatedRecords} رکورد به‌روزرسانی شد`
          : 'گزینه ویرایش شد'
      );
    } catch (error: any) {
      console.error('Error editing option:', error);
      msg.error('خطا در ویرایش گزینه: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const stopOptionAction = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      <Select
        mode={mode}
        value={mode === 'multiple' ? (Array.isArray(value) ? value : (value ? [value] : [])) : value}
        onChange={handleSelectChange as any}
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
        notFoundContent={loading ? 'در حال بارگذاری...' : 'موردی یافت نشد'}
        styles={{ popup: { root: mergedDropdownStyle } }}
        optionRender={(option) => {
          const optionValue = String(option.value ?? '');
          const canManageOption = persistedOptionValues.has(optionValue);

          return (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                gap: 8,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{option.label}</span>
              {canManageOption && (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 2 }}
                  onMouseDown={stopOptionAction}
                  onClick={stopOptionAction}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditModal({
                      label: String(option.label ?? optionValue),
                      value: optionValue,
                    })}
                    style={{ padding: '0 4px' }}
                  />
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    danger
                    onClick={() => openDeleteModal({
                      label: String(option.label ?? optionValue),
                      value: optionValue,
                    })}
                    style={{ padding: '0 4px' }}
                  />
                </div>
              )}
            </div>
          );
        }}
        popupRender={(menu) => (
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

      <Modal
        title="حذف امن گزینه"
        open={!!deleteTarget}
        onCancel={closeDeleteModal}
        onOk={handleDeleteOption}
        okText="انتقال و حذف"
        cancelText="انصراف"
        confirmLoading={loading}
        okButtonProps={{ disabled: !deleteReplacementValue }}
        zIndex={15000}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <div className="text-sm text-gray-600">
            {deleteTarget
              ? `رکوردهایی که از "${deleteTarget.label}" استفاده کرده‌اند، قبل از حذف به کدام مقدار منتقل شوند؟`
              : ''}
          </div>
          <Select
            value={deleteReplacementValue}
            onChange={setDeleteReplacementValue}
            options={deleteReplacementOptions}
            placeholder="مقدار جایگزین را انتخاب کنید"
            showSearch
            optionFilterProp="label"
            getPopupContainer={getPopupContainer}
            styles={{ popup: { root: { zIndex: 14000 } } }}
          />
        </div>
      </Modal>

      <Modal
        title="ویرایش گزینه"
        open={!!editTarget}
        onCancel={closeEditModal}
        onOk={handleEditOption}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={loading}
        zIndex={15000}
        destroyOnHidden
      >
        <div className="flex flex-col gap-3">
          <div className="text-sm text-gray-600">
            {editTarget
              ? `نام گزینه "${editTarget.label}" تغییر می‌کند و تمام استفاده‌های فعلی به مقدار جدید منتقل می‌شوند.`
              : ''}
          </div>
          <Input
            value={editOptionValue}
            onChange={(event) => setEditOptionValue(event.target.value)}
            onPressEnter={() => {
              void handleEditOption();
            }}
            placeholder="مقدار جدید را وارد کنید"
            disabled={loading}
          />
        </div>
      </Modal>
    </>
  );
};

export default DynamicSelectField;
