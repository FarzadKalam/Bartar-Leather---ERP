import React, { useEffect, useState } from 'react';
import { Button, InputNumber, Popover, message } from 'antd';
import { CalculatorOutlined, CheckOutlined, SwapOutlined } from '@ant-design/icons';
import {
  canConvertUnits,
  convertBetweenUnits,
  getUnitConversionFactor,
  isCrossDimensionUnitConversion,
  normalizeUnitValue,
  resolveUnitConversionWidthMm,
} from '../../utils/unitConversions';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

interface UnitCalculatorButtonProps {
  sourceQty: number;
  pairedQty?: number | null;
  sourceUnit?: string | null;
  targetUnit?: string | null;
  direction?: 'main_to_sub' | 'sub_to_main';
  kind?: 'quantity' | 'unit_price';
  widthMm?: number | null;
  record?: Record<string, any> | null;
  disabled?: boolean;
  size?: 'small' | 'middle';
  className?: string;
  title?: string;
  onConvert: (convertedQty: number, nextWidthMm?: number) => void;
  onReverseConvert?: (convertedQty: number, nextWidthMm?: number) => void;
}

const toPositiveNum = (raw: unknown): number => {
  if (raw === null || raw === undefined) return 0;
  const normalized = String(raw)
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,٬\s]/g, '');
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const UnitCalculatorButton: React.FC<UnitCalculatorButtonProps> = ({
  sourceQty,
  pairedQty,
  sourceUnit,
  targetUnit,
  kind = 'quantity',
  widthMm,
  record,
  disabled = false,
  size = 'small',
  className = '',
  title,
  onConvert,
  onReverseConvert,
}) => {
  const inheritedWidthMm = toPositiveNum(widthMm) || resolveUnitConversionWidthMm({ record }) || null;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [customWidthMm, setCustomWidthMm] = useState<number | null>(inheritedWidthMm);
  const [widthTouched, setWidthTouched] = useState(false);
  const [customFactor, setCustomFactor] = useState<number | null>(null);
  const [reverseMode, setReverseMode] = useState(false);

  useEffect(() => {
    if (!widthTouched && inheritedWidthMm) {
      setCustomWidthMm((prev) => prev || inheritedWidthMm);
    }
  }, [inheritedWidthMm, widthTouched]);

  const resolvedTitle = title || (kind === 'unit_price' ? 'محاسبه قیمت واحد' : 'محاسبه تبدیل واحد');
  const from = normalizeUnitValue(sourceUnit);
  const to = normalizeUnitValue(targetUnit);
  const isCross = isCrossDimensionUnitConversion(from, to);
  const canConvertStandard = canConvertUnits(from, to);

  const activeIsReverse = reverseMode && Boolean(onReverseConvert);
  const activeFrom = activeIsReverse ? to : from;
  const activeTo = activeIsReverse ? from : to;
  const activeFromLabel = activeIsReverse ? targetUnit : sourceUnit;
  const activeToLabel = activeIsReverse ? sourceUnit : targetUnit;
  const activeSourceQty = activeIsReverse ? toPositiveNum(pairedQty) : toPositiveNum(sourceQty);
  const activeApply = activeIsReverse && onReverseConvert ? onReverseConvert : onConvert;

  const finalizeResult = (rawVal: number): number => {
    if (kind === 'unit_price') return Number(rawVal.toPrecision(15));
    return Math.round(rawVal * 1000) / 1000;
  };

  const executeConversion = (
    val: number,
    fromUnit: string,
    toUnit: string,
    resolvedW?: number
  ): number => {
    if (kind === 'unit_price') {
      const factor = getUnitConversionFactor(fromUnit, toUnit, { widthMm: resolvedW ?? null, record });
      if (!Number.isFinite(factor) || factor <= 0) return Number.NaN;
      return val / factor;
    }
    return convertBetweenUnits(val, fromUnit, toUnit, { widthMm: resolvedW ?? null, record });
  };

  const runConversion = (useReverse: boolean, effectiveWidth?: number | null): boolean => {
    const val = useReverse ? toPositiveNum(pairedQty) : toPositiveNum(sourceQty);
    const fromU = useReverse ? to : from;
    const toU = useReverse ? from : to;
    const applyFn = useReverse && onReverseConvert ? onReverseConvert : onConvert;

    if (val <= 0) {
      message.warning('برای محاسبه تبدیل واحد، حداقل یکی از مقادیر اصلی یا فرعی باید بزرگتر از صفر باشد.');
      return false;
    }
    if (!fromU || !toU) {
      message.warning('برای محاسبه تبدیل، هر دو واحد اصلی و فرعی باید انتخاب شده باشند.');
      return false;
    }
    if (fromU === toU) {
      applyFn(finalizeResult(val), effectiveWidth || undefined);
      return true;
    }

    if (isCross) {
      const resolvedW = toPositiveNum(effectiveWidth ?? customWidthMm ?? inheritedWidthMm);
      if (resolvedW <= 0) {
        setReverseMode(useReverse);
        setPopoverOpen(true);
        return false;
      }
      try {
        const res = executeConversion(val, fromU, toU, resolvedW);
        if (Number.isFinite(res) && !Number.isNaN(res)) {
          applyFn(finalizeResult(res), resolvedW);
          message.success(`تبدیل بر اساس عرض ${toPersianNumber(resolvedW)} میلیمتر انجام شد.`);
          return true;
        }
      } catch (err: any) {
        message.error(err?.message || 'خطا در تبدیل واحد');
        return false;
      }
    }

    if (canConvertStandard) {
      try {
        const res = executeConversion(val, fromU, toU);
        if (Number.isFinite(res) && !Number.isNaN(res)) {
          applyFn(finalizeResult(res), effectiveWidth || undefined);
          return true;
        }
      } catch (err: any) {
        message.error(err?.message || 'خطا در تبدیل واحد');
        return false;
      }
    }

    setReverseMode(useReverse);
    setPopoverOpen(true);
    return false;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (inheritedWidthMm && !customWidthMm) {
      setCustomWidthMm(inheritedWidthMm);
    }

    if (!from || !to) {
      message.warning('واحد اصلی و فرعی را مشخص کنید.');
      return;
    }

    const directVal = toPositiveNum(sourceQty);
    const pairedVal = toPositiveNum(pairedQty);
    const shouldReverse = directVal <= 0 && pairedVal > 0 && Boolean(onReverseConvert);
    const effectiveVal = shouldReverse ? pairedVal : directVal;

    if (effectiveVal <= 0) {
      message.warning('حداقل یکی از مقادیر واحد اصلی یا فرعی باید بزرگتر از صفر باشد.');
      return;
    }

    setReverseMode(shouldReverse);

    if (isCross) {
      const currentW = toPositiveNum(customWidthMm ?? inheritedWidthMm);
      if (currentW <= 0) {
        setPopoverOpen(true);
        return;
      }
    } else if (!canConvertStandard && from !== to) {
      setPopoverOpen(true);
      return;
    }

    runConversion(shouldReverse);
  };

  const handleApplyPopover = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const val = activeSourceQty;
    if (val <= 0) {
      message.warning('مقدار مبدا برای تبدیل باید بیشتر از صفر باشد.');
      return;
    }

    if (isCross) {
      const w = toPositiveNum(customWidthMm);
      if (w <= 0) {
        message.warning('لطفاً عرض ماده اولیه را به میلیمتر وارد کنید.');
        return;
      }
      const success = runConversion(activeIsReverse, w);
      if (success) setPopoverOpen(false);
      return;
    }

    if (canConvertStandard && activeFrom !== activeTo) {
      const success = runConversion(activeIsReverse);
      if (success) setPopoverOpen(false);
      return;
    }

    const factor = toPositiveNum(customFactor);
    if (factor <= 0) {
      message.warning('لطفاً ضریب تبدیل معتبر (بزرگتر از صفر) وارد کنید.');
      return;
    }
    const res = kind === 'unit_price' ? val / factor : val * factor;
    activeApply(finalizeResult(res), undefined);
    message.success('تبدیل واحد بر اساس ضریب واردشده اعمال شد.');
    setPopoverOpen(false);
  };

  const activeWidthDisplay = toPositiveNum(customWidthMm ?? inheritedWidthMm);

  const popoverContent = (
    <div
      className="p-1 space-y-3 max-w-xs text-right"
      dir="rtl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-xs font-semibold text-[#17372a] border-b pb-1 flex items-center justify-between gap-2">
        <span>{isCross ? 'تنظیم عرض برای تبدیل طول و سطح' : 'تنظیم ضریب تبدیل واحد'}</span>
        {onReverseConvert ? (
          <Button
            size="small"
            type="text"
            icon={<SwapOutlined />}
            title="تغییر جهت تبدیل"
            onClick={(e) => {
              e.stopPropagation();
              setReverseMode((prev) => !prev);
            }}
          />
        ) : null}
      </div>
      <div className="text-[11px] text-gray-600 leading-5">
        تبدیل از «<span className="font-semibold text-gray-800">{activeFromLabel || '-'}</span>» به «<span className="font-semibold text-gray-800">{activeToLabel || '-'}</span>»
      </div>

      {isCross ? (
        <div className="space-y-1">
          <label className="text-[11px] text-gray-700 block">عرض ماده اولیه / رول (میلیمتر):</label>
          <InputNumber
            value={customWidthMm ?? undefined}
            onChange={(val) => {
              setWidthTouched(true);
              setCustomWidthMm(val === null || val === undefined ? null : Number(val));
            }}
            placeholder="مثلاً: ۱۴۰۰ یا ۳۰"
            className="w-full text-left persian-number"
            min={0.1}
            step={10}
            autoFocus
            onPressEnter={(e) => handleApplyPopover(e as any)}
          />
          <div className="text-[10px] text-gray-500">
            برای تبدیل واحد طولی به مساحت (یا بالعکس)، عرض ماده اولیه به میلیمتر نیاز است و ذخیره می‌شود.
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <label className="text-[11px] text-gray-700 block">
            ضریب تبدیل (هر ۱ {activeFromLabel} = چند {activeToLabel}؟):
          </label>
          <InputNumber
            value={customFactor ?? undefined}
            onChange={(val) => setCustomFactor(val ? Number(val) : null)}
            placeholder="مثلاً: ۱۲"
            className="w-full text-left persian-number"
            min={0.00001}
            step={0.1}
            autoFocus
            onPressEnter={(e) => handleApplyPopover(e as any)}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1 border-t">
        <Button size="small" onClick={(e) => { e.stopPropagation(); setPopoverOpen(false); setWidthTouched(false); }}>
          انصراف
        </Button>
        <Button
          type="primary"
          size="small"
          className="bg-[#17372a] hover:!bg-[#1f4534]"
          icon={<CheckOutlined />}
          onClick={handleApplyPopover}
        >
          اعمال تبدیل
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      trigger="click"
      open={popoverOpen}
      onOpenChange={(open) => {
        if (!open) {
          setPopoverOpen(false);
          setWidthTouched(false);
        }
      }}
    >
      <Button
        htmlType="button"
        type="text"
        size={size}
        title={isCross && activeWidthDisplay > 0 ? `${resolvedTitle} (عرض: ${toPersianNumber(activeWidthDisplay)} میلیمتر — کلیک راست برای ویرایش)` : resolvedTitle}
        disabled={disabled}
        icon={<CalculatorOutlined />}
        className={`!text-gray-500 hover:!text-[#17372a] shrink-0 ${isCross && activeWidthDisplay <= 0 ? '!text-amber-600' : ''} ${className}`}
        onContextMenu={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
          if (inheritedWidthMm && !customWidthMm) setCustomWidthMm(inheritedWidthMm);
          setPopoverOpen(true);
        }}
        onClick={handleClick}
      />
    </Popover>
  );
};

export default UnitCalculatorButton;
