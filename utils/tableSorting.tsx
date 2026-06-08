import React from "react";
import { CaretDownFilled, CaretUpFilled } from "@ant-design/icons";
import { getDefaultSortOrder } from "@refinedev/antd";
import type { CrudSorting } from "@refinedev/core";
import type { CompareFn, SortOrder } from "antd/es/table/interface";
import { FieldType, ModuleField } from "../types";

export type TableSortMode = "server" | "local";

export const DEFAULT_LIST_SORTERS: CrudSorting = [
  { field: "created_at", order: "desc" },
];

const LOCAL_SORT_ONLY_TYPES = new Set<FieldType>([
  FieldType.TAGS,
  FieldType.MULTI_SELECT,
  FieldType.JSON,
  FieldType.PROGRESS_STAGES,
  FieldType.CHECKLIST,
]);

const DESC_FIRST_TYPES = new Set<FieldType>([
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
]);

const EMPTY_VALUE_WEIGHT = 1;

const normalizeText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return String(
            (item as any).title ??
              (item as any).label ??
              (item as any).name ??
              (item as any).value ??
              "",
          );
        }
        return String(item ?? "");
      })
      .join(" | ");
  }
  if (typeof value === "object") {
    return String(
      (value as any).title ??
        (value as any).label ??
        (value as any).name ??
        (value as any).value ??
        JSON.stringify(value),
    );
  }
  return String(value);
};

const normalizeComparableValue = (
  value: unknown,
  fieldType?: FieldType,
): number | string => {
  if (value === null || value === undefined || value === "") {
    return EMPTY_VALUE_WEIGHT;
  }

  if (
    fieldType === FieldType.NUMBER ||
    fieldType === FieldType.PRICE ||
    fieldType === FieldType.PERCENTAGE ||
    fieldType === FieldType.PERCENTAGE_OR_AMOUNT ||
    fieldType === FieldType.STOCK
  ) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : normalizeText(value);
  }

  if (fieldType === FieldType.CHECKBOX) {
    return value ? 1 : 0;
  }

  if (
    fieldType === FieldType.DATE ||
    fieldType === FieldType.TIME ||
    fieldType === FieldType.DATETIME
  ) {
    const timestamp = new Date(String(value)).getTime();
    return Number.isFinite(timestamp) ? timestamp : normalizeText(value);
  }

  return normalizeText(value).trim().toLocaleLowerCase("fa");
};

export const compareSortableValues = (
  left: unknown,
  right: unknown,
  fieldType?: FieldType,
): number => {
  const normalizedLeft = normalizeComparableValue(left, fieldType);
  const normalizedRight = normalizeComparableValue(right, fieldType);

  if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
    return normalizedLeft - normalizedRight;
  }

  return String(normalizedLeft).localeCompare(String(normalizedRight), "fa", {
    numeric: true,
    sensitivity: "base",
  });
};

export const buildFieldSorter = (field: ModuleField): CompareFn<any> => {
  return (leftRecord: any, rightRecord: any) =>
    compareSortableValues(leftRecord?.[field.key], rightRecord?.[field.key], field.type);
};

export const getFieldSortMode = (field: ModuleField): TableSortMode => {
  return LOCAL_SORT_ONLY_TYPES.has(field.type) ? "local" : "server";
};

export const getFieldSortDirections = (field: ModuleField): SortOrder[] => {
  if (DESC_FIRST_TYPES.has(field.type)) {
    return ["descend", "ascend", null];
  }

  return ["ascend", "descend", null];
};

export const getFieldSortOrder = (
  fieldKey: string,
  sorters?: CrudSorting,
): SortOrder | undefined => {
  return getDefaultSortOrder(fieldKey, sorters);
};

export const TableSortIcon: React.FC<{ sortOrder?: SortOrder }> = ({ sortOrder }) => {
  const upColor = sortOrder === "ascend" ? "#356d52" : "#c7d0cb";
  const downColor = sortOrder === "descend" ? "#356d52" : "#c7d0cb";

  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-col items-center justify-center gap-[1px] text-[9px] leading-none"
      style={{ minWidth: 10 }}
    >
      <CaretUpFilled style={{ color: upColor }} />
      <CaretDownFilled style={{ color: downColor, marginTop: -2 }} />
    </span>
  );
};
