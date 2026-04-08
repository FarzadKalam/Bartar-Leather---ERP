import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PrintTemplate } from './index';
import { InvoiceCard } from './templates/invoice-card';
import { ProductLabel } from './templates/product-label';
import { ProductionPassport } from './templates/production-passport';
import { PRINT_PAPER_DIMENSIONS, PrintPaperSize } from './printSizing';
import { toPersianNumber, formatPersianPrice, safeJalaliFormat } from '../../utils/persianNumberFormatter';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';

interface UsePrintManagerProps {
  moduleId: string;
  data: any;
  moduleConfig: any;
  printableFields: any[];
  formatPrintValue: (field: any, value: any) => string;
  relationOptions?: Record<string, any[]>;
}

export const usePrintManager = ({
  moduleId,
  data,
  moduleConfig,
  printableFields,
  formatPrintValue,
  relationOptions = {},
}: UsePrintManagerProps) => {
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [printSize, setPrintSize] = useState<PrintPaperSize>('A5');
  const printSizeRef = useRef<PrintPaperSize>('A5');
  const [printMode, setPrintMode] = useState(false);
  const [selectedPrintFields, setSelectedPrintFields] = useState<Record<string, string[]>>({});
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);

  const printTemplates = useMemo<PrintTemplate[]>(() => {
    let templates: PrintTemplate[] = [];

    if (moduleId === 'products') {
      templates = [
        {
          id: 'product_label',
          title: '\u0645\u0634\u062e\u0635\u0627\u062a \u06a9\u0627\u0644\u0627',
          description: '\u0628\u0631\u0686\u0633\u0628 A6 \u0628\u0631\u0627\u06cc \u0645\u062d\u0635\u0648\u0644',
        },
      ];
    } else if (moduleId === 'invoices') {
      templates = [
        {
          id: 'invoice_sales_official',
          title: '\u0641\u0627\u06a9\u062a\u0648\u0631 \u0641\u0631\u0648\u0634 (\u0631\u0633\u0645\u06cc)',
          description: '\u0646\u0645\u0627\u06cc\u0634 \u06a9\u0627\u0645\u0644 \u0645\u0634\u062e\u0635\u0627\u062a \u062e\u0631\u06cc\u062f\u0627\u0631 \u0648 \u0641\u0631\u0648\u0634\u0646\u062f\u0647',
        },
        {
          id: 'invoice_sales_simple',
          title: '\u0641\u0627\u06a9\u062a\u0648\u0631 \u0641\u0631\u0648\u0634 (\u063a\u06cc\u0631\u0631\u0633\u0645\u06cc)',
          description: '\u0641\u0642\u0637 \u0646\u0627\u0645 \u0648 \u0634\u0645\u0627\u0631\u0647 \u0641\u0631\u0648\u0634\u0646\u062f\u0647',
        },
      ];
    } else if (moduleId === 'production_boms' || moduleId === 'production_orders') {
      templates = [
        {
          id: 'production_passport',
          title: '\u0634\u0646\u0627\u0633\u0646\u0627\u0645\u0647 \u062a\u0648\u0644\u06cc\u062f',
          description: '\u0628\u0631\u06af\u0647 \u0634\u0646\u0627\u0633\u0646\u0627\u0645\u0647 \u062a\u0648\u0644\u06cc\u062f',
        },
      ];
    }

    return templates;
  }, [moduleId]);

  useEffect(() => {
    if (!printTemplates.length) {
      if (selectedTemplateId) setSelectedTemplateId('');
      return;
    }
    const exists = printTemplates.some((template) => template.id === selectedTemplateId);
    if (!exists) {
      setSelectedTemplateId(printTemplates[0].id);
    }
  }, [printTemplates, selectedTemplateId]);

  const handlePrintSizeChange = useCallback((size: PrintPaperSize) => {
    printSizeRef.current = size;
    setPrintSize(size);
  }, []);

  useEffect(() => {
    if (moduleId === 'products') {
      handlePrintSizeChange('A6');
      return;
    }
    if (moduleId === 'invoices') {
      handlePrintSizeChange('A5');
      return;
    }
    handlePrintSizeChange('A5');
  }, [moduleId, handlePrintSizeChange]);

  const activeTemplate = printTemplates.find((t) => t.id === selectedTemplateId) || printTemplates[0];
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const printQrValue = pageUrl;

  const productionGridSpecFields = useMemo(() => {
    if (!(moduleId === 'production_boms' || moduleId === 'production_orders')) return [];

    const parseJsonSafely = (input: any) => {
      if (typeof input !== 'string') return input;
      const trimmed = input.trim();
      if (!trimmed) return input;
      try {
        return JSON.parse(trimmed);
      } catch {
        return input;
      }
    };

    const gridMaterialsRaw = parseJsonSafely(data?.grid_materials);
    const rows = Array.isArray(gridMaterialsRaw)
      ? gridMaterialsRaw
      : Array.isArray(gridMaterialsRaw?.rows)
        ? gridMaterialsRaw.rows
        : [];
    if (!rows.length) return [];

    const moduleFields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
    const productFields = Array.isArray(MODULES?.products?.fields) ? MODULES.products.fields : [];
    const allFields = [...moduleFields, ...productFields];
    if (!allFields.length) return [];

    const normalizeKey = (value: any) => String(value || '').trim().toLowerCase();

    const fieldMap = new Map<string, any>();
    const normalizedFieldMap = new Map<string, any>();
    allFields.forEach((field: any) => {
      const key = String(field?.key || '');
      if (!key) return;
      // prefer products field definitions for richer labels/options
      fieldMap.set(key, field);
      normalizedFieldMap.set(normalizeKey(key), field);
    });

    const getFieldDef = (key: string) => fieldMap.get(key) || normalizedFieldMap.get(normalizeKey(key));

    const specFieldKeys = Array.from(
      new Set(
        allFields
          .filter((field: any) => typeof field?.blockId === 'string' && field.blockId.toLowerCase().includes('spec'))
          .map((field: any) => String(field.key || '').trim())
          .filter(Boolean)
      )
    );

    const categoryLabelMap = new Map<string, string>();
    ['category', 'parent_category', 'material_category'].forEach((key) => {
      const categoryField = getFieldDef(key);
      if (!Array.isArray(categoryField?.options)) return;
      categoryField.options.forEach((option: any) => {
        const value = normalizeKey(option?.value);
        if (!value) return;
        categoryLabelMap.set(value, String(option?.label || option?.value || value));
      });
    });

    const fallbackCategoryLabels: Record<string, string> = {
      leather: 'چرم',
      lining: 'آستر',
      accessory: 'خرجکار',
      fitting: 'یراق',
      kharjkar: 'خرجکار',
      yaragh: 'یراق',
    };
    Object.entries(fallbackCategoryLabels).forEach(([value, label]) => {
      if (!categoryLabelMap.has(value)) categoryLabelMap.set(value, label);
    });

    const specLabelFallback: Record<string, string> = {
      leather_type: 'نوع چرم',
      leather_colors: 'رنگ چرم',
      leather_finish_1: 'صفحه چرم',
      leather_effect: 'افکت چرم',
      leather_sort: 'سورت چرم',
      lining_material: 'جنس آستر',
      lining_color: 'رنگ آستر',
      lining_width: 'عرض آستر',
      acc_material: 'جنس خرجکار',
      fitting_type: 'نوع یراق',
      fitting_material: 'جنس یراق',
      fitting_colors: 'رنگ یراق',
      fitting_size: 'سایز یراق',
    };

    const prettifyKey = (key: string) => key.replace(/_/g, ' ').trim();

    const isPlainObject = (value: any) =>
      value !== null && typeof value === 'object' && !Array.isArray(value);

    const isSpecLikeField = (field: any) =>
      typeof field?.blockId === 'string' && field.blockId.toLowerCase().includes('spec');

    const resolveSpecLabel = (fieldDef: any, key: string) => {
      const fallbackFa = specLabelFallback[normalizeKey(key)];
      const fa = fieldDef?.labels?.fa;
      const en = fieldDef?.labels?.en;
      if (typeof fa === 'string' && fa.trim()) return fa;
      if (typeof en === 'string' && en.trim()) return en;
      if (fallbackFa) return fallbackFa;
      return prettifyKey(key);
    };

    const hasOwn = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

    const pickValueByKey = (obj: any, key: string) => {
      if (!isPlainObject(obj)) return undefined;
      if (hasOwn(obj, key)) return obj[key];
      const normalized = normalizeKey(key);
      const matchedKey = Object.keys(obj).find((candidate) => normalizeKey(candidate) === normalized);
      return matchedKey ? obj[matchedKey] : undefined;
    };

    const getValueFromRow = (row: any, key: string) => {
      const direct = pickValueByKey(row, key);
      if (direct !== undefined) return direct;
      if (isPlainObject(row?.header)) {
        return pickValueByKey(row.header, key);
      }
      return undefined;
    };

    const getRowSpecKeys = (rowSpecs: Record<string, any>) => {
      if (!isPlainObject(rowSpecs)) return [];
      return Object.keys(rowSpecs)
        .map((key) => String(key || '').trim())
        .filter(Boolean);
    };

    const hasValue = (value: any) => {
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.trim() !== '';
      if (Array.isArray(value)) return value.length > 0;
      if (isPlainObject(value)) return Object.keys(value).length > 0;
      return true;
    };

    const extracted: any[] = [];

    rows.forEach((rawRow: any, rowIndex: number) => {
      const row = parseJsonSafely(rawRow);
      if (!isPlainObject(row)) return;

      const rowSpecsRaw = parseJsonSafely(row?.specs);
      const rowSpecs = isPlainObject(rowSpecsRaw) ? rowSpecsRaw : {};

      const rowCategoryRaw = row?.header?.category ?? row?.parent_category ?? row?.category ?? '';
      const categoryLabel = categoryLabelMap.get(normalizeKey(rowCategoryRaw)) || String(rowCategoryRaw || '').trim() || 'بدون دسته';
      const rowLabel = `ردیف ${toPersianNumber(rowIndex + 1)} - ${categoryLabel}`;

      const keysForRow = Array.from(new Set([...specFieldKeys, ...getRowSpecKeys(rowSpecs)]));
      keysForRow.forEach((specKey) => {
        const normalizedSpecKey = String(specKey || '').trim();
        if (!normalizedSpecKey) return;

        const fieldDef = getFieldDef(normalizedSpecKey);
        const specValueFromSpecs = pickValueByKey(rowSpecs, normalizedSpecKey);
        const hasSpecValue = specValueFromSpecs !== undefined;
        const specValue = hasSpecValue ? specValueFromSpecs : getValueFromRow(row, normalizedSpecKey);

        if (!isSpecLikeField(fieldDef) && !hasSpecValue) return;
        if (!hasValue(specValue)) return;

        const baseLabel = resolveSpecLabel(fieldDef, normalizedSpecKey);

        extracted.push({
          ...(fieldDef || {
            key: normalizedSpecKey,
            type: 'text',
            labels: { fa: baseLabel, en: baseLabel },
          }),
          key: `grid_spec_${rowIndex}_${normalizedSpecKey}`,
          sourceKey: normalizedSpecKey,
          blockId: 'gridSpec',
          labels: {
            ...(fieldDef?.labels || { fa: baseLabel, en: baseLabel }),
            fa: `${baseLabel} (${rowLabel})`,
          },
          value: specValue,
          order: typeof fieldDef?.order === 'number' ? fieldDef.order + rowIndex / 100 : 9000 + rowIndex,
        });
      });
    });

    return extracted;
  }, [moduleId, data?.grid_materials, moduleConfig]);

  const printableFieldsForTemplate = useMemo(() => {
    if (selectedTemplateId !== 'production_passport') return printableFields;
    const merged = [...productionGridSpecFields, ...printableFields];
    const seen = new Set<string>();
    return merged.filter((field: any, index: number) => {
      const key = String(field?.key || `field_${index}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [selectedTemplateId, productionGridSpecFields, printableFields]);

  useEffect(() => {
    if (selectedTemplateId && printableFieldsForTemplate.length > 0) {
      setSelectedPrintFields((prev) => ({
        ...prev,
        [selectedTemplateId]: printableFieldsForTemplate.map((field) => field.key),
      }));
    }
  }, [selectedTemplateId, printableFieldsForTemplate]);

  const openPrintModal = useCallback(() => {
    setIsPrintModalOpen(true);
  }, []);

  const closePrintModal = useCallback(() => {
    setIsPrintModalOpen(false);
  }, []);

  const handlePrint = useCallback(() => {
    if (!selectedTemplateId || typeof window === 'undefined') return;

    const activePrintSize = printSizeRef.current;
    const { widthMm, heightMm } = PRINT_PAPER_DIMENSIONS[activePrintSize];
    const shouldExpandCardHeight = selectedTemplateId === 'production_passport';

    const sizeStyle = document.createElement('style');
    sizeStyle.setAttribute('data-print-size', activePrintSize);
    sizeStyle.textContent = `
      @media print {
        @page { size: ${activePrintSize} portrait; margin: 0; }
        #print-root {
          width: ${widthMm}mm !important;
          min-height: ${heightMm}mm !important;
          max-width: ${widthMm}mm !important;
          margin: 0 auto !important;
        }
        #print-root .print-card {
          width: ${widthMm}mm !important;
          min-height: ${heightMm}mm !important;
          ${shouldExpandCardHeight ? 'height: auto !important;' : ''}
          margin: 0 auto !important;
        }
      }
    `;
    document.head.appendChild(sizeStyle);

    const printRoot = document.getElementById('print-root');
    if (printRoot) {
      printRoot.setAttribute('data-print-size', activePrintSize);
    }

    setIsPrintModalOpen(false);
    setPrintMode(true);

    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      setPrintMode(false);
      sizeStyle.remove();
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    try {
      window.print();
    } catch (error) {
      console.error('Print failed:', error);
      cleanup();
    }
  }, [selectedTemplateId]);

  const handleTogglePrintField = useCallback((templateId: string, fieldName: string) => {
    setSelectedPrintFields((prev) => {
      const current = prev[templateId] || [];
      if (current.includes(fieldName)) {
        return {
          ...prev,
          [templateId]: current.filter((f) => f !== fieldName),
        };
      }
      return {
        ...prev,
        [templateId]: [...current, fieldName],
      };
    });
  }, []);

  const renderPrintCard = useCallback(() => {
    const selected = selectedPrintFields[selectedTemplateId] || [];
    let fieldsToDisplay = printableFieldsForTemplate.filter(
      (field) => selected.length === 0 || selected.includes(field.key)
    );

    if (selectedTemplateId === 'production_passport') {
      fieldsToDisplay = [...fieldsToDisplay].sort((a: any, b: any) => {
        const aIsSpec = typeof a?.blockId === 'string'
          && (a.blockId.toLowerCase().includes('spec') || a.blockId === 'gridSpec');
        const bIsSpec = typeof b?.blockId === 'string'
          && (b.blockId.toLowerCase().includes('spec') || b.blockId === 'gridSpec');
        if (aIsSpec !== bIsSpec) return aIsSpec ? -1 : 1;
        return (a?.order ?? 0) - (b?.order ?? 0);
      });
    } else {
      fieldsToDisplay = [...fieldsToDisplay].sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0));
    }

    switch (selectedTemplateId) {
      case 'invoice_sales_official':
      case 'invoice_sales_simple':
        return React.createElement(InvoiceCard, {
          data,
          formatPersianPrice,
          toPersianNumber,
          safeJalaliFormat,
          relationOptions,
          templateId: selectedTemplateId,
          customer: customerInfo,
          seller: sellerInfo,
          printSize,
        });

      case 'product_label':
        return React.createElement(ProductLabel, {
          title: activeTemplate?.title || '',
          subtitle: moduleConfig?.titles.fa || '',
          qrValue: printQrValue,
          fields: fieldsToDisplay,
          formatPrintValue,
          printSize,
        });

      case 'production_passport':
        return React.createElement(ProductionPassport, {
          title: activeTemplate?.title || '',
          subtitle: moduleConfig?.titles.fa || '',
          qrValue: printQrValue,
          fields: fieldsToDisplay,
          formatPrintValue,
          printSize,
        });
    }

    return null;
  }, [
    selectedTemplateId,
    data,
    printableFieldsForTemplate,
    selectedPrintFields,
    activeTemplate,
    moduleConfig,
    printQrValue,
    formatPrintValue,
    sellerInfo,
    customerInfo,
    relationOptions,
    printSize,
  ]);

  useEffect(() => {
    if (moduleId !== 'invoices') return;

    let isMounted = true;

    const load = async () => {
      try {
        const [{ data: companyData, error: companyError }, { data: customerData, error: customerError }] = await Promise.all([
          supabase.from('company_settings').select('*').limit(1).maybeSingle(),
          data?.customer_id
            ? supabase.from('customers').select('*').eq('id', data.customer_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (!isMounted) return;

        if (companyError) {
          console.error('Load company settings failed', companyError.message);
        } else {
          setSellerInfo(companyData || null);
        }

        if (customerError) {
          console.error('Load customer failed', customerError.message);
        } else {
          setCustomerInfo(customerData || null);
        }
      } catch (err) {
        console.error('Load print data failed', err);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [moduleId, data?.customer_id]);

  return {
    isPrintModalOpen,
    selectedTemplateId,
    printSize,
    printMode,
    selectedPrintFields,
    printableFieldsForTemplate,
    printTemplates,
    activeTemplate,
    printQrValue,

    setIsPrintModalOpen,
    setSelectedTemplateId,
    setPrintSize: handlePrintSizeChange,
    setPrintMode,
    openPrintModal,
    closePrintModal,
    handlePrint,
    handleTogglePrintField,
    renderPrintCard,
  };
};

