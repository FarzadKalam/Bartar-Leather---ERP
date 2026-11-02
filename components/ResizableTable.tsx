import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

type ResizableColumn = Record<string, any> & { key?: React.Key; dataIndex?: React.Key | React.Key[]; width?: number };

const MIN_COLUMN_WIDTH = 72;
const MAX_COLUMN_WIDTH = 960;

const columnKey = (column: ResizableColumn, index: number) => {
  const raw = column.key ?? column.dataIndex;
  if (Array.isArray(raw)) return raw.join('.');
  return String(raw ?? `column-${index}`);
};

const storageKey = (tableKey: string) => `erp-table-column-widths:${tableKey}`;

const clampWidth = (width: number) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));

const readWidths = (tableKey: string): Record<string, number> => {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(tableKey)) || '{}');
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => Number.isFinite(Number(value))).map(([key, value]) => [key, clampWidth(Number(value))]));
  } catch {
    return {};
  }
};

const ResizeHandle: React.FC<{
  columnKey: string;
  width: number;
  onResize: (key: string, width: number) => void;
}> = ({ columnKey: key, width, onResize }) => {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const stopDragging = useCallback(() => {
    dragRef.current = null;
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      onResize(key, dragRef.current.startWidth + event.clientX - dragRef.current.startX);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [key, onResize, stopDragging]);

  return (
    <span
      role="separator"
      aria-label="تغییر عرض ستون"
      aria-orientation="vertical"
      aria-valuemin={MIN_COLUMN_WIDTH}
      aria-valuemax={MAX_COLUMN_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      className="erp-table-resize-handle"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dragRef.current = { startX: event.clientX, startWidth: width };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const step = event.shiftKey ? 32 : 8;
        onResize(key, width + (event.key === 'ArrowRight' ? step : -step));
      }}
    />
  );
};

const ResizableHeaderCell: React.FC<any> = ({ children, width, columnKey: key, onResize, ...rest }) => (
  <th {...rest} style={{ ...rest.style, width, minWidth: width, position: 'relative' }}>
    {children}
    {key ? <ResizeHandle columnKey={key} width={width} onResize={onResize} /> : null}
  </th>
);

export type ResizableTableProps<RecordType = any> = TableProps<RecordType> & {
  resizableKey?: string;
};

const ResizableTable = <RecordType extends object = any>({ resizableKey, columns = [], components, ...props }: ResizableTableProps<RecordType>) => {
  const tableKey = resizableKey || (columns as ResizableColumn[]).map(columnKey).join('|') || 'default';
  const [widths, setWidths] = useState<Record<string, number>>(() => readWidths(tableKey));

  useEffect(() => {
    setWidths(readWidths(tableKey));
  }, [tableKey]);

  const updateWidth = useCallback((key: string, rawWidth: number) => {
    const width = clampWidth(rawWidth);
    setWidths((previous) => {
      const next = { ...previous, [key]: width };
      if (typeof window !== 'undefined') window.localStorage.setItem(storageKey(tableKey), JSON.stringify(next));
      return next;
    });
  }, [tableKey]);

  const resizedColumns = useMemo(() => {
    const resizeColumns = (source: ResizableColumn[], parentKey = ''): ResizableColumn[] => source.map((column, index) => {
    const key = columnKey(column, index);
    const resizeKey = parentKey ? `${parentKey}.${key}` : key;
    const width = widths[resizeKey] || (Number(column.width) > 0 ? Number(column.width) : undefined);
    return {
      ...column,
      ...(width ? { width } : {}),
      ...(Array.isArray(column.children) ? { children: resizeColumns(column.children, resizeKey) } : {}),
      ...(!Array.isArray(column.children) ? {
        onHeaderCell: (header: any) => ({
          ...(column.onHeaderCell ? column.onHeaderCell(header) : {}),
          columnKey: resizeKey,
          width: width || MIN_COLUMN_WIDTH,
          onResize: updateWidth,
        }),
      } : {}),
    };
    });
    return resizeColumns(columns as ResizableColumn[]);
  }, [columns, updateWidth, widths]);

  const mergedComponents = useMemo(() => ({
    ...components,
    header: {
      ...(components as any)?.header,
      cell: ResizableHeaderCell,
    },
  }), [components]);

  return <Table<RecordType> {...props} scroll={props.scroll || { x: 'max-content' }} columns={resizedColumns as any} components={mergedComponents} />;
};

export default ResizableTable;
