import { CrudFilters } from "@refinedev/core";
import { FilterItem } from "../types";

const isBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() === "";

const hasMeaningfulValue = (value: any): boolean => {
  if (value === undefined || value === null) return false;
  if (isBlankString(value)) return false;

  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulValue(item));
  }

  if (typeof value === "object") {
    if ("value" in value) {
      return hasMeaningfulValue(value.value);
    }
    return Object.keys(value).length > 0;
  }

  return true;
};

export const sanitizeViewFilters = (filters: any[] | undefined | null): FilterItem[] => {
  if (!Array.isArray(filters)) return [];

  return filters
    .filter((filter) => filter?.field && filter?.operator && hasMeaningfulValue(filter.value))
    .map((filter, index) => ({
      id: String(filter.id || `${Date.now()}_${index}`),
      field: String(filter.field),
      operator: String(filter.operator || "eq"),
      value: filter.value,
    }));
};

export const toCrudViewFilters = (filters: any[] | undefined | null): CrudFilters =>
  sanitizeViewFilters(filters).map((filter) => ({
    field: filter.field,
    operator: filter.operator as any,
    value: filter.value,
  }));
