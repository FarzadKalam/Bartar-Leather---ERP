import React from 'react';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

type DeliveryProgressBarProps = {
  delivered: number;
  required: number;
  className?: string;
};

const toSafeNumber = (value: number) => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);

const DeliveryProgressBar: React.FC<DeliveryProgressBarProps> = ({ delivered, required, className = '' }) => {
  const safeDelivered = toSafeNumber(delivered);
  const safeRequired = toSafeNumber(required);
  const rawPercent = safeRequired > 0 ? (safeDelivered / safeRequired) * 100 : (safeDelivered > 0 ? 100 : 0);
  const visiblePercent = Math.min(100, Math.max(0, rawPercent));
  const completed = safeRequired > 0 && safeDelivered >= safeRequired - 0.000001;
  const percentLabel = toPersianNumber(String(Math.round(rawPercent)));

  return (
    <div className={`mt-2 flex items-center gap-2 ${className}`} aria-label={`پیشرفت تحویل ${Math.round(rawPercent)} درصد`}>
      <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-black/10">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${completed ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${visiblePercent}%` }}
        />
      </div>
      <span className="shrink-0 text-[10px] font-semibold tabular-nums">{percentLabel}٪</span>
    </div>
  );
};

export default DeliveryProgressBar;
