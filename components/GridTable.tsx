import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, InputNumber, Select, Spin, Table, Typography, message } from 'antd';
import { PlusOutlined, SaveOutlined, CloseOutlined, EditOutlined, RightOutlined, CloseCircleOutlined, LockOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { BlockDefinition, FieldType } from '../types';
import { MODULES } from '../moduleRegistry';
import { convertArea } from '../utils/unitConversions';
import { getSingleOptionLabel } from '../utils/optionHelpers';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import SmartFieldRenderer from './SmartFieldRenderer';
import QrScanPopover from './QrScanPopover';
import { buildProductFilters, runProductsQuery } from './editableTable/productionOrderHelpers';

const { Text } = Typography;
type ResponsiveBreakpoint = 'xxl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';

interface GridTableProps {
  block: BlockDefinition;
  initialData: any[];
  moduleId?: string;
  recordId?: string;
  relationOptions: Record<string, any[]>;
  dynamicOptions?: Record<string, any[]>;
  onSaveSuccess?: (newData: any[]) => void;
  onChange?: (newData: any[]) => void;
  mode?: 'db' | 'local' | 'external_view';
  canEditModule?: boolean;
  canViewField?: (fieldKey: string) => boolean;
  readOnly?: boolean;
  orderQuantity?: number;
}

const defaultPiece = () => ({
  name: '',
  length: 0,
  width: 0,
  quantity: 1,
  waste_rate: 0,
  main_unit: null,
  sub_unit: null,
  qty_main: 0,
  qty_sub: 0,
  formula_id: null,
  final_usage: 0,
  unit_price: 0,
  cost_per_item: 0,
  total_usage: 0,
  total_cost: 0,
  image_url: null,
});

const unitOptions = [
  { label: 'عدد', value: 'عدد' },
  { label: 'بسته', value: 'بسته' },
  { label: 'فوت مربع', value: 'فوت مربع' },
  { label: 'سانتیمتر مربع', value: 'سانتیمتر مربع' },
  { label: 'میلیمتر مربع', value: 'میلیمتر مربع' },
  { label: 'متر مربع', value: 'متر مربع' },
];

const createEmptyRow = () => ({
  key: Date.now(),
  collapsed: true,
  header: {
    category: null,
    selected_product_id: null,
    selected_product_name: null,
  },
  specs: {},
  pieces: [{ key: Date.now(), ...defaultPiece() }],
  totals: {},
});

const GridTable: React.FC<GridTableProps> = ({
  block,
  initialData,
  moduleId,
  recordId,
  relationOptions,
  dynamicOptions = {},
  onSaveSuccess,
  onChange,
  mode = 'db',
  canEditModule,
  canViewField,
  readOnly,
  orderQuantity = 0,
}) => {
  const isReadOnly = readOnly === true || canEditModule === false || block?.readonly === true;
  const isProductionOrder = moduleId === 'production_orders';
  const [isEditing, setIsEditing] = useState(mode === 'local' && !isReadOnly);
  const [data, setData] = useState<any[]>(Array.isArray(initialData) ? initialData : []);
  const [tempData, setTempData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading] = useState(false);
  const [productOptions, setProductOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [localDynamicOptions, setLocalDynamicOptions] = useState<Record<string, any[]>>({});

  const productModule = MODULES['products'];
  const specFieldsByBlock = useMemo(() => {
    const map = new Map<string, any[]>();
    (productModule?.fields || []).forEach((f: any) => {
      if (!f.blockId) return;
      if (!map.has(f.blockId)) map.set(f.blockId, []);
      map.get(f.blockId)!.push(f);
    });
    return map;
  }, [productModule]);

  useEffect(() => {
    const safeData = Array.isArray(initialData) ? initialData : [];
    const normalized = safeData.map((item, idx) => ({
      key: item.key || item.id || `grid_${Date.now()}_${idx}`,
      collapsed: item.collapsed ?? true,
      ...item,
      pieces: Array.isArray(item.pieces)
        ? item.pieces.map((piece: any, pIdx: number) => ({
            key: piece.key || piece.id || `piece_${idx}_${pIdx}`,
            ...piece,
          }))
        : item.pieces,
    }));
    const next = normalized.length > 0 ? normalized : [createEmptyRow()];
    setData(next);
    if (mode === 'local') setTempData(next);
  }, [initialData, mode]);

  const categories = block?.gridConfig?.categories || [];

  const getSpecFields = (category: string | null) => {
    const specBlockId = categories.find((c) => c.value === category)?.specBlockId;
    if (!specBlockId) return [];
    return specFieldsByBlock.get(specBlockId) || [];
  };

  const updateGrid = (nextData: any[]) => {
    if (isEditing) setTempData(nextData);
    else setData(nextData);
    if (mode === 'local' && onChange) onChange(nextData);
  };

  const formatQuantity = (value: any, decimals = 2) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return toPersianNumber(0);
    const rounded = Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    return toPersianNumber(rounded);
  };

  const applyCalculations = (gridRow: any) => {
    const pieces = Array.isArray(gridRow.pieces) ? gridRow.pieces : [];
    const qty = Number(orderQuantity) || 0;

    let totalQty = 0;
    let totalMain = 0;
    let totalSub = 0;
    let totalFinal = 0;
    let totalUsageAll = 0;
    let totalCost = 0;

    const nextPieces = pieces.map((piece: any) => {
      const length = parseFloat(piece.length) || 0;
      const width = parseFloat(piece.width) || 0;
      const quantity = parseFloat(piece.quantity) || 0;
      const wasteRate = parseFloat(piece.waste_rate) || 0;
      const baseUsage = length && width ? length * width * (quantity || 1) : quantity || 0;
      const finalUsage = baseUsage * (1 + wasteRate / 100);
      const mainUnit = piece.main_unit || gridRow?.header?.main_unit || null;
      const subUnit = piece.sub_unit || null;
      const qtySubRaw = convertArea(baseUsage, mainUnit, subUnit);
      const qtySub = Number.isFinite(qtySubRaw) ? Math.round(qtySubRaw * 100) / 100 : 0;

      const unitPrice = parseFloat(piece.unit_price) || 0;
      const costPerItem = unitPrice * finalUsage;
      const totalUsage = qty ? finalUsage * qty : 0;
      const totalCostRow = qty ? costPerItem * qty : costPerItem;

      totalQty += quantity || 0;
      totalMain += baseUsage || 0;
      totalSub += qtySub || 0;
      totalFinal += finalUsage || 0;
      totalUsageAll += totalUsage || 0;
      totalCost += totalCostRow || 0;

      return {
        ...piece,
        qty_main: baseUsage,
        qty_sub: qtySub,
        final_usage: finalUsage,
        cost_per_item: costPerItem,
        total_usage: totalUsage,
        total_cost: totalCostRow,
      };
    });

    return {
      ...gridRow,
      pieces: nextPieces,
      totals: {
        total_quantity: totalQty,
        total_qty_main: totalMain,
        total_qty_sub: totalSub,
        total_final_usage: totalFinal,
        total_usage: totalUsageAll,
        total_cost: totalCost,
      },
    };
  };

  const updateRow = (rowIndex: number, patch: Record<string, any>) => {
    const source = isEditing ? tempData : data;
    const nextData = [...source];
    const row = { ...nextData[rowIndex], ...patch };
    if (patch.header || patch.specs) {
      row.collapsed = false;
    }
    nextData[rowIndex] = applyCalculations(row);
    updateGrid(nextData);
  };

  const updatePiece = (rowIndex: number, pieceIndex: number, patch: Record<string, any>) => {
    const source = isEditing ? tempData : data;
    const nextData = [...source];
    const row = { ...nextData[rowIndex] };
    const pieces = Array.isArray(row.pieces) ? [...row.pieces] : [];
    pieces[pieceIndex] = { ...pieces[pieceIndex], ...patch };
    row.pieces = pieces;
    nextData[rowIndex] = applyCalculations(row);
    updateGrid(nextData);
  };

  const addPiece = (rowIndex: number) => {
    const source = isEditing ? tempData : data;
    const nextData = [...source];
    const row = { ...nextData[rowIndex] };
    const pieces = Array.isArray(row.pieces) ? [...row.pieces] : [];
    pieces.push({ key: Date.now(), ...defaultPiece() });
    row.pieces = pieces;
    nextData[rowIndex] = applyCalculations(row);
    updateGrid(nextData);
  };

  const addGridRow = () => {
    if (isReadOnly) return;
    const newRow = createEmptyRow();
    const source = isEditing ? tempData : data;
    const nextData = [...source, newRow];
    updateGrid(nextData);
  };

  const removeGridRow = (rowIndex: number) => {
    if (isReadOnly) return;
    const source = isEditing ? tempData : data;
    const nextData = [...source];
    nextData.splice(rowIndex, 1);
    updateGrid(nextData);
  };

  const startEdit = () => {
    if (isReadOnly) return;
    setIsEditing(true);
    setTempData(JSON.parse(JSON.stringify(data)));
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setTempData([]);
  };

  const handleSave = async () => {
    if (mode === 'local' || mode === 'external_view') return;
    setSaving(true);
    try {
      if (!moduleId || !recordId) throw new Error('رکورد یافت نشد');
      const payload = (tempData || []).map(({ key, ...rest }: any) => rest);
      const { error } = await supabase.from(moduleId).update({ [block.id]: payload }).eq('id', recordId);
      if (error) throw error;
      setData(payload);
      setIsEditing(false);
      if (onSaveSuccess) onSaveSuccess(payload);
      message.success('ذخیره شد');
    } catch (e: any) {
      message.error(e.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const fetchProductById = async (productId: string) => {
    const { data: product, error } = await supabase.from('products').select('*').eq('id', productId).single();
    if (error) throw error;
    return product;
  };

  const applySelectedProduct = async (rowIndex: number, productId: string | null) => {
    const source = isEditing ? tempData : data;
    const nextData = [...source];
    const row = { ...nextData[rowIndex] };

    if (!productId) {
      row.header = { ...row.header, selected_product_id: null, selected_product_name: null };
      row.collapsed = false;
      row.specs_locked = false;
      nextData[rowIndex] = row;
      updateGrid(nextData);
      return;
    }

    try {
      const product = await fetchProductById(productId);
      row.header = {
        ...row.header,
        selected_product_id: product?.id || productId,
        selected_product_name: product?.name || '',
      };
      row.collapsed = false;

      const specFields = getSpecFields(row.header?.category || null);
      const specs: any = { ...(row.specs || {}) };
      specFields.forEach((f: any) => {
        if (product && product[f.key] !== undefined) specs[f.key] = product[f.key];
      });

      row.specs = specs;
      row.specs_locked = true;

      const pieces = (row.pieces || []).map((piece: any) => ({
        ...piece,
        waste_rate: product?.waste_rate ?? piece.waste_rate,
        main_unit: product?.main_unit ?? piece.main_unit,
        sub_unit: product?.sub_unit ?? piece.sub_unit,
        unit_price: product?.buy_price ?? piece.unit_price,
      }));
      row.pieces = pieces;

      nextData[rowIndex] = applyCalculations(row);
      updateGrid(nextData);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProductOptions = async () => {
    if (productOptionsLoading) return;
    setProductOptionsLoading(true);
    try {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, system_code, category, product_type')
        .order('created_at', { ascending: false })
        .limit(200);
      const options = (products || []).map((p: any) => ({
        value: p.id,
        label: p.system_code ? `${p.system_code} - ${p.name}` : p.name,
        category: p.category || null,
        product_type: p.product_type || null,
      }));
      setProductOptions(options);
    } catch (err) {
      console.warn('Could not load products', err);
    } finally {
      setProductOptionsLoading(false);
    }
  };

  useEffect(() => {
    if (!isProductionOrder || productOptionsLoading) return;
    const source = isEditing ? tempData : data;
    const selectedIds = Array.from(
      new Set(
        (source || [])
          .map((row: any) => row?.header?.selected_product_id)
          .filter((val: any) => !!val)
      )
    ) as string[];
    if (selectedIds.length === 0) return;

    const existing = new Set(productOptions.map((opt: any) => opt.value));
    const missing = selectedIds.filter((id) => !existing.has(id));
    if (missing.length === 0) return;

    const fetchMissingSelected = async () => {
      try {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, system_code, category, product_type')
          .in('id', missing);
        const options = (products || []).map((p: any) => ({
          value: p.id,
          label: p.system_code ? `${p.system_code} - ${p.name}` : p.name,
          category: p.category || null,
          product_type: p.product_type || null,
        }));
        if (options.length) {
          setProductOptions((prev) => {
            const prevMap = new Map(prev.map((item: any) => [item.value, item]));
            options.forEach((item) => prevMap.set(item.value, item));
            return Array.from(prevMap.values());
          });
        }
      } catch (err) {
        console.warn('Could not load selected products labels', err);
      }
    };
    fetchMissingSelected();
  }, [isProductionOrder, isEditing, tempData, data, productOptions, productOptionsLoading]);

  const ensureDynamicOptions = async (categoriesToLoad: string[]) => {
    const missing = categoriesToLoad.filter(
      (cat) => !dynamicOptions?.[cat] && !localDynamicOptions?.[cat]
    );
    if (missing.length === 0) return;
    const updates: Record<string, any[]> = {};
    for (const cat of missing) {
      try {
        const { data } = await supabase
          .from('dynamic_options')
          .select('label, value')
          .eq('category', cat)
          .eq('is_active', true)
          .order('display_order', { ascending: true });
        if (data) updates[cat] = data.filter((i: any) => i.value !== null);
      } catch (err) {
        console.warn('Dynamic options load failed:', cat, err);
      }
    }
    if (Object.keys(updates).length > 0) {
      setLocalDynamicOptions((prev) => ({ ...prev, ...updates }));
    }
  };

  const fetchFilteredProducts = async (row: any) => {
    const specFields = getSpecFields(row.header?.category || null);
    const tableColumns = specFields.map((f: any) => ({
      key: f.key,
      title: f.labels?.fa,
      type: f.type,
      filterable: true,
      filterKey: f.key,
      dynamicOptionsCategory: f.dynamicOptionsCategory,
    }));

    const rowData = { ...(row.specs || {}) };
    const filters = buildProductFilters(tableColumns, rowData, dynamicOptions, localDynamicOptions);
    const categoryValue = row?.header?.category || null;
    const baseFilters: Array<{ filterKey: string; value: any; colType: FieldType }> = [];
    if (categoryValue) {
      const categoryLabel = categories.find((c: any) => c.value === categoryValue)?.label || null;
      const categoryValues = [categoryValue, categoryLabel]
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .map((v) => String(v).trim())
        .filter((v, i, arr) => arr.indexOf(v) === i);
      baseFilters.push({
        filterKey: 'category',
        value: categoryValues.length > 1 ? categoryValues : categoryValues[0],
        colType: FieldType.SELECT,
      });
    }
    const result = await runProductsQuery(supabase as any, [...baseFilters, ...filters]);
    if (result.error) throw result.error;
    return result.data || [];
  };

  if (loading) return <div className="p-6 text-center"><Spin /></div>;

  const sourceData = isEditing ? tempData : data;
  const rowHeaderBarStyle = { backgroundColor: '#8b5e3c' };

  return (
    <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 transition-all">
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center gap-2 flex-row-reverse">
          <h3 className="font-bold text-base text-gray-700 dark:text-white m-0 flex items-center gap-2">
            <span className="w-1 h-5 bg-leather-500 rounded-full inline-block"></span>
            {block.titles.fa}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'db' && !isEditing && !isReadOnly && (
            <Button size="small" icon={<EditOutlined />} onClick={startEdit}>ویرایش لیست</Button>
          )}
          {isEditing && mode !== 'local' && (
            <>
              <Button type="primary" onClick={handleSave} loading={saving} icon={<SaveOutlined />}>ذخیره</Button>
              <Button onClick={cancelEdit} disabled={saving} icon={<CloseOutlined />}>انصراف</Button>
            </>
          )}
        </div>
      </div>

      {sourceData.length === 0 && (
        <div className="py-6">
          <Empty description="هنوز گروهی ثبت نشده" />
        </div>
      )}

      <div className="space-y-4">
        {sourceData.map((row: any, rowIndex: number) => {
          const categoryValue = row.header?.category || null;
          let specFields = getSpecFields(categoryValue);
          if (moduleId === 'production_boms') {
            specFields = specFields.filter((f: any) => !String(f.key || '').toLowerCase().includes('color'));
          }
          const collapsed = row.collapsed === true;
          const isSpecsLocked = row.specs_locked === true;

          const specCategories = specFields
            .map((f: any) => f.dynamicOptionsCategory)
            .filter(Boolean) as string[];
          if (specCategories.length > 0) {
            ensureDynamicOptions(specCategories);
          }

          return (
            <div key={row.key || rowIndex} className="border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
              <div
                id={`grid-row-${row.key || rowIndex}`}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-white"
                style={rowHeaderBarStyle}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Button
                    type="text"
                    size="small"
                    className="p-0 !text-white hover:!text-white/90"
                    onClick={() => {
                      const nextCollapsed = !collapsed;
                      updateRow(rowIndex, { collapsed: nextCollapsed });
                      if (!nextCollapsed) {
                        setTimeout(() => {
                          const el = document.getElementById(`grid-row-${row.key || rowIndex}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 80);
                      }
                    }}
                    icon={<RightOutlined className={`transition-transform text-white ${collapsed ? '' : 'rotate-90'}`} />}
                  />
                  <span className="text-xs text-white">دسته‌بندی مواد اولیه</span>
                  <Select
                    value={categoryValue}
                    onChange={(val) => updateRow(rowIndex, { header: { ...row.header, category: val }, specs: {}, pieces: [defaultPiece()], collapsed: false })}
                    options={categories.map((c) => ({ label: c.label, value: c.value }))}
                    placeholder="انتخاب کنید"
                    className="min-w-[160px]"
                    disabled={isReadOnly}
                    getPopupContainer={() => document.body}
                    dropdownStyle={{ zIndex: 10050 }}
                  />
                  {isProductionOrder && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                      {(() => {
                        const selectedId = row.header?.selected_product_id || null;
                        const selectedName = row.header?.selected_product_name || null;
                        const rawOptions = (productOptions.length ? productOptions : (relationOptions['products'] || []));
                        const filteredOptions = rawOptions
                          .filter((o: any) => {
                            if (o.product_type && o.product_type !== 'raw') return false;
                            if (categoryValue && o.category && o.category !== categoryValue) {
                              if (selectedId && o.value === selectedId) return true;
                              return false;
                            }
                            return true;
                          })
                          .map((o: any) => ({ label: o.label, value: o.value }));
                        const hasSelected = selectedId && filteredOptions.some((o: any) => o.value === selectedId);
                        if (selectedId && !hasSelected) {
                          filteredOptions.unshift({
                            value: selectedId,
                            label: selectedName || String(selectedId),
                          });
                        }
                        return (
                      <Select
                        value={row.header?.selected_product_id || null}
                        placeholder="انتخاب محصول"
                        className="min-w-[200px] w-full sm:w-auto"
                        showSearch
                        optionFilterProp="label"
                        options={filteredOptions}
                        loading={productOptionsLoading}
                        onDropdownVisibleChange={(open) => {
                          if (open && productOptions.length === 0) loadProductOptions();
                        }}
                        onChange={(val) => applySelectedProduct(rowIndex, val)}
                        disabled={isReadOnly}
                        getPopupContainer={() => document.body}
                        dropdownStyle={{ zIndex: 10050 }}
                      />
                        );
                      })()}
                      <QrScanPopover
                        label=""
                        buttonClassName="shrink-0 !text-white hover:!text-white/90"
                        onScan={async (scan) => {
                          if (scan.recordId && scan.moduleId === 'products') {
                            await applySelectedProduct(rowIndex, scan.recordId);
                          }
                        }}
                        buttonProps={{ type: 'text', size: 'small' }}
                      />
                      {row.header?.selected_product_id && (
                        <Button
                          type="text"
                          size="small"
                          icon={<CloseCircleOutlined />}
                          onClick={() => applySelectedProduct(rowIndex, null)}
                          className="!text-white hover:!text-white/90"
                        />
                      )}
                    </div>
                  )}
                </div>

                {!isReadOnly && (
                  <Button type="text" size="small" className="!text-white hover:!text-white/90" onClick={() => removeGridRow(rowIndex)}>حذف</Button>
                )}
              </div>

              {!collapsed && (
                <div className="p-4 space-y-4">
                  {specFields.length > 0 && (
                    <>
                      {isSpecsLocked && (
                        <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <LockOutlined />
                          <span>مشخصات از روی محصول انتخاب‌شده قفل شده‌اند. برای ویرایش، محصول را حذف کنید.</span>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {specFields.map((field: any) => {
                          if (canViewField && canViewField(field.key) === false) return null;
                          let options = field.options;
                          if (field.dynamicOptionsCategory) {
                            options = dynamicOptions[field.dynamicOptionsCategory] || localDynamicOptions[field.dynamicOptionsCategory];
                          }
                          const effectiveField = isSpecsLocked ? { ...field, readonly: true } : field;
                          return (
                            <div key={field.key} className={`space-y-1 ${isSpecsLocked ? 'opacity-75' : ''}`}>
                              <div className="text-[11px] text-gray-500 font-medium">{field.labels?.fa}</div>
                              <SmartFieldRenderer
                                field={effectiveField}
                                value={row.specs?.[field.key]}
                                forceEditMode={true}
                                compactMode={true}
                                options={options}
                                onChange={(val) => {
                                  if (isSpecsLocked) return;
                                  updateRow(rowIndex, { specs: { ...(row.specs || {}), [field.key]: val } });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {isProductionOrder && !row.header?.selected_product_id && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-3 bg-white dark:bg-[#141414]">
                      <div className="text-xs text-gray-500 mb-2">لیست محصولات مرتبط</div>
                      <ProductsPreview
                        row={row}
                        relationOptions={relationOptions}
                        dynamicOptions={{ ...dynamicOptions, ...localDynamicOptions }}
                        specFields={specFields}
                        fetchFilteredProducts={fetchFilteredProducts}
                        onSelect={(productId) => applySelectedProduct(rowIndex, productId)}
                      />
                    </div>
                  )}

                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                    <Table
                      dataSource={row.pieces || []}
                      rowKey={(record: any, idx?: number) => record.key || idx}
                      pagination={false}
                      size="small"
                      scroll={{ x: true }}
                      columns={[
                        {
                          title: 'نام قطعه',
                          dataIndex: 'name',
                          key: 'name',
                          width: 205,
                          render: (val: any, _record: any, pieceIndex: number) => (
                            <Input className="font-medium" value={val} onChange={(e) => updatePiece(rowIndex, pieceIndex, { name: e.target.value })} disabled={isReadOnly} />
                          ),
                        },
                        {
                          title: 'طول',
                          dataIndex: 'length',
                          key: 'length',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            <InputNumber className="font-medium" value={val} onChange={(v) => updatePiece(rowIndex, pieceIndex, { length: v })} disabled={isReadOnly} />
                          ),
                        },
                        {
                          title: 'عرض',
                          dataIndex: 'width',
                          key: 'width',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            <InputNumber className="font-medium" value={val} onChange={(v) => updatePiece(rowIndex, pieceIndex, { width: v })} disabled={isReadOnly} />
                          ),
                        },
                        {
                          title: 'تعداد',
                          dataIndex: 'quantity',
                          key: 'quantity',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            <InputNumber className="font-medium" value={val} onChange={(v) => updatePiece(rowIndex, pieceIndex, { quantity: v })} disabled={isReadOnly} />
                          ),
                        },
                        {
                          title: 'نرخ پرت',
                          dataIndex: 'waste_rate',
                          key: 'waste_rate',
                          width: 90,
                          render: (val: any, _record: any, pieceIndex: number) => (
                            <InputNumber className="font-medium" value={val} onChange={(v) => updatePiece(rowIndex, pieceIndex, { waste_rate: v })} disabled={isReadOnly} />
                          ),
                        },
                        {
                          title: 'واحد اصلی',
                          dataIndex: 'main_unit',
                          key: 'main_unit',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            <Select
                              value={val}
                              options={unitOptions}
                              onChange={(v) => updatePiece(rowIndex, pieceIndex, { main_unit: v })}
                              onBlur={() => updatePiece(rowIndex, pieceIndex, {})}
                              disabled={isReadOnly}
                              style={{ minWidth: 120 }}
                              getPopupContainer={() => document.body}
                              dropdownStyle={{ zIndex: 10050 }}
                            />
                          ),
                        },
                        {
                          title: 'واحد فرعی',
                          dataIndex: 'sub_unit',
                          key: 'sub_unit',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            <Select
                              value={val}
                              options={unitOptions}
                              onChange={(v) => updatePiece(rowIndex, pieceIndex, { sub_unit: v })}
                              onBlur={() => updatePiece(rowIndex, pieceIndex, {})}
                              disabled={isReadOnly}
                              style={{ minWidth: 120 }}
                              getPopupContainer={() => document.body}
                              dropdownStyle={{ zIndex: 10050 }}
                            />
                          ),
                        },
                        {
                          title: 'مقدار واحد اصلی',
                          dataIndex: 'qty_main',
                          key: 'qty_main',
                          width: 130,
                          render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>,
                        },
                        {
                          title: 'مقدار واحد فرعی',
                          dataIndex: 'qty_sub',
                          key: 'qty_sub',
                          width: 130,
                          render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>,
                        },
                        {
                          title: 'فرمول',
                          dataIndex: 'formula_id',
                          key: 'formula_id',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            <Select
                              value={val}
                              options={dynamicOptions['calculation_formulas'] || []}
                              onChange={(v) => updatePiece(rowIndex, pieceIndex, { formula_id: v })}
                              disabled={isReadOnly}
                              style={{ minWidth: 150 }}
                              getPopupContainer={() => document.body}
                              dropdownStyle={{ zIndex: 10050 }}
                            />
                          ),
                        },
                        {
                          title: 'مقدار مصرف یک تولید',
                          dataIndex: 'final_usage',
                          key: 'final_usage',
                          width: 140,
                          render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>,
                        },
                        ...(isProductionOrder ? [
                          {
                            title: 'قیمت واحد',
                            dataIndex: 'unit_price',
                            key: 'unit_price',
                            render: (val: any, _record: any, pieceIndex: number) => (
                              <InputNumber className="font-medium" value={val} onChange={(v) => updatePiece(rowIndex, pieceIndex, { unit_price: v })} disabled={isReadOnly} />
                            ),
                          },
                          {
                            title: 'هزینه هر عدد',
                            dataIndex: 'cost_per_item',
                            key: 'cost_per_item',
                            width: 150,
                            render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatPersianPrice(val || 0, true)}</Text>,
                          },
                          {
                            title: 'مقدار مصرف کل',
                            dataIndex: 'total_usage',
                            key: 'total_usage',
                            width: 140,
                            render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>,
                          },
                          {
                            title: 'هزینه کل',
                            dataIndex: 'total_cost',
                            key: 'total_cost',
                            width: 150,
                            render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatPersianPrice(val || 0, true)}</Text>,
                          },
                        ] : []),
                      ]}
                      footer={() => (
                        <Button type="dashed" block icon={<PlusOutlined />} onClick={() => addPiece(rowIndex)} disabled={isReadOnly}>
                          افزودن قطعه {categories.find((c) => c.value === categoryValue)?.label || ''}
                        </Button>
                      )}
                    />
                  </div>

                  <div className="bg-gray-50 dark:bg-[#101010] rounded-xl p-3 flex flex-wrap gap-4 text-xs border border-leather-500">
                    <span>جمع تعداد در یک تولید: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_quantity || 0)}</Text></span>
                    <span>جمع واحد اصلی: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_qty_main || 0)}</Text></span>
                    <span>جمع واحد فرعی: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_qty_sub || 0)}</Text></span>
                    <span>جمع مصرف یک تولید: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_final_usage || 0)}</Text></span>
                    {isProductionOrder && (
                      <span>جمع مقدار مصرف کل: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_usage || 0)}</Text></span>
                    )}
                    {isProductionOrder && (
                      <span>جمع هزینه: <Text className="persian-number font-medium">{formatPersianPrice(row.totals?.total_cost || 0, true)}</Text></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(isEditing || mode === 'local') && !isReadOnly && (
        <div className="mt-4">
          <Button type="dashed" block icon={<PlusOutlined />} onClick={addGridRow}>
            افزودن گروه جدید
          </Button>
        </div>
      )}
    </div>
  );
};

const ProductsPreview: React.FC<{
  row: any;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  specFields: any[];
  fetchFilteredProducts: (row: any) => Promise<any[]>;
  onSelect: (productId: string) => void;
}> = ({ row, fetchFilteredProducts, onSelect, specFields, dynamicOptions }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const result = await fetchFilteredProducts(row);
        if (!active) return;
        setRows(result || []);
      } catch {
        if (!active) return;
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [row, dynamicOptions]);

  if (loading) return <div className="py-4 text-center"><Spin size="small" /></div>;

  if (!rows.length) return <div className="text-xs text-gray-400">محصولی یافت نشد</div>;

  const renderSpecValue = (field: any, value: any) => {
    if (value === undefined || value === null || value === '') return '-';
    if (field.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
      return value
        .map((val: any) => getSingleOptionLabel(field, val, dynamicOptions, {}))
        .filter(Boolean)
        .join('، ') || '-';
    }
    if (field.type === FieldType.SELECT || field.type === FieldType.RELATION) {
      return getSingleOptionLabel(field, value, dynamicOptions, {}) || '-';
    }
    return Array.isArray(value) ? value.join('، ') : value;
  };

  const specColumns = (specFields || []).map((field: any) => ({
    title: field.labels?.fa || field.key,
    dataIndex: field.key,
    key: field.key,
    responsive: ['md'] as ResponsiveBreakpoint[],
    render: (val: any) => renderSpecValue(field, val)
  }));

  return (
    <Table
      dataSource={rows}
      rowKey="id"
      pagination={{ pageSize: 5, size: 'small' }}
      size="small"
      rowSelection={{
        type: 'radio',
        onChange: (_keys, selectedRows) => {
          const selected = selectedRows?.[0];
          if (selected?.id) onSelect(selected.id);
        }
      }}
      columns={[
        { title: 'نام محصول', dataIndex: 'name', key: 'name', ellipsis: true },
        { title: 'کد سیستمی', dataIndex: 'system_code', key: 'system_code', responsive: ['sm'] as ResponsiveBreakpoint[] },
        ...specColumns,
        { title: 'موجودی', dataIndex: 'stock', key: 'stock', responsive: ['md'] as ResponsiveBreakpoint[], render: (val: any) => toPersianNumber(val ?? 0) },
        { title: 'قیمت خرید', dataIndex: 'buy_price', key: 'buy_price', responsive: ['md'] as ResponsiveBreakpoint[], render: (val: any) => formatPersianPrice(val ?? 0, true) },
        { title: 'قیمت فروش', dataIndex: 'sell_price', key: 'sell_price', responsive: ['md'] as ResponsiveBreakpoint[], render: (val: any) => formatPersianPrice(val ?? 0, true) },
      ]}
      scroll={{ x: 'max-content' }}
    />
  );
};

export default GridTable;
