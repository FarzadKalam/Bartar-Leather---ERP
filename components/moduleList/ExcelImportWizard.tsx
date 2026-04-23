
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Button,
  Checkbox,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
  Table,
  Tag,
  Upload,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import {
  CloseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  InboxOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { FieldNature, FieldType, ModuleDefinition, ModuleField } from "../../types";
import { supabase } from "../../supabaseClient";
import { attachTaskCompletionIfNeeded } from "../../utils/taskCompletion";
import { buildModuleExcelTemplate } from "../../utils/excelImportTemplates";
import {
  buildVariantName,
  buildVariantSignature,
  normalizeAttributeKey,
  normalizeCatalogProductPayload,
  normalizeProductAttributeRecord,
  type ProductAttributeRecord,
} from "../../utils/productCatalog";

type DuplicateStrategy = "skip" | "overwrite" | "merge";
type EncodingType = "utf-8" | "windows-1256";

type MappingRow = {
  sourceColumn: string;
  sampleValue: string;
  targetFieldKey: string | null;
  defaultValue: string;
};

type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  firstRow: Record<string, string> | null;
};

type RelationLookupMap = Record<string, Map<string, string>>;
type DynamicOptionLookupMap = Record<string, Map<string, string>>;
type WorkbookSheets = Record<string, string[][]>;
type RelationResolutionError = {
  fieldLabel: string;
  value: string;
};

interface ExcelImportWizardProps {
  open: boolean;
  moduleId: string;
  moduleConfig: ModuleDefinition;
  onClose: () => void;
  onImported?: () => void;
}

const WIZARD_STEPS = [
  { index: 0, title: "بارگذاری فایل" },
  { index: 1, title: "مدیریت تکرار" },
  { index: 2, title: "تطبیق فیلدها" },
] as const;

const RENDER_STEPS = [...WIZARD_STEPS].reverse();
const DUPLICATE_OPTIONS = [
  { label: "ثبت نکن", value: "skip" },
  { label: "بازنویسی کن", value: "overwrite" },
  { label: "ادغام کن", value: "merge" },
] as const;

const IMPORTABLE_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.CHECKBOX,
  FieldType.STOCK,
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.CHECKLIST,
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
  FieldType.LINK,
  FieldType.RELATION,
  FieldType.USER,
  FieldType.STATUS,
  FieldType.PHONE,
  FieldType.TAGS,
  FieldType.PERCENTAGE_OR_AMOUNT,
]);

const toEnglishDigits = (value: string): string =>
  value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

const normalizeText = (value: unknown): string =>
  toEnglishDigits(String(value ?? ""))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");

const normalizeKey = (value: unknown): string => normalizeText(value).replace(/\s+/g, "");

const splitByDelimiters = (value: string): string[] =>
  value
    .split(/[,،;|\n\r]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current);
  return result.map((item) => item.trim());
};

const parseCsvText = (text: string): string[][] => {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows = lines
    .map((line) => parseCsvLine(line))
    .filter((cells) => cells.some((cell) => cell.trim() !== ""));

  if (!rows.length) return [];
  const maxLength = Math.max(...rows.map((cells) => cells.length));
  return rows.map((cells) =>
    Array.from({ length: maxLength }).map((_, idx) => (cells[idx] ?? "").trim())
  );
};

const isValueEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const createUniqueHeaders = (rawHeaderRow: string[]): string[] => {
  const used = new Map<string, number>();
  return rawHeaderRow.map((raw, idx) => {
    const base = String(raw ?? "").trim() || `ستون ${idx + 1}`;
    const normalized = normalizeKey(base) || `column_${idx + 1}`;
    const count = used.get(normalized) ?? 0;
    used.set(normalized, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });
};

const matrixToSheetData = (matrix: string[][], hasHeader: boolean): ParsedSheet => {
  if (!matrix.length) {
    return { headers: [], rows: [], firstRow: null };
  }

  const headerRow = hasHeader
    ? matrix[0].map((item) => String(item ?? "").trim())
    : matrix[0].map((_, idx) => `ستون ${idx + 1}`);
  const headers = createUniqueHeaders(headerRow);
  const startIndex = hasHeader ? 1 : 0;
  const rows = matrix.slice(startIndex).map((rawRow) => {
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = String(rawRow[idx] ?? "").trim();
    });
    return row;
  });

  return {
    headers,
    rows,
    firstRow: rows[0] ?? null,
  };
};

const resolveDate = (value: string): Date | null => {
  const numeric = parseFloat(toEnglishDigits(value).replace(/,/g, ""));
  if (!Number.isNaN(numeric) && numeric > 25569 && numeric < 70000) {
    const utcDays = Math.floor(numeric - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    return Number.isNaN(dateInfo.getTime()) ? null : dateInfo;
  }
  const dateInfo = new Date(value);
  return Number.isNaN(dateInfo.getTime()) ? null : dateInfo;
};

const parseBoolean = (value: string): boolean | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (["true", "1", "yes", "on", "فعال", "بله", "بلی", "صحیح"].includes(normalized)) return true;
  if (["false", "0", "no", "off", "غیرفعال", "خیر", "غلط", "نادرست"].includes(normalized)) return false;
  return null;
};

const parseNumber = (value: string): number | null => {
  const normalized = toEnglishDigits(value).replace(/[,\s٬]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const guessTargetField = (sourceColumn: string, fields: ModuleField[]): string | null => {
  const sourceKey = normalizeKey(sourceColumn);
  if (!sourceKey) return null;

  for (const field of fields) {
    if (normalizeKey(field.key) === sourceKey) return field.key;
  }
  for (const field of fields) {
    if (normalizeKey(field.labels.fa) === sourceKey) return field.key;
    if (field.labels.en && normalizeKey(field.labels.en) === sourceKey) return field.key;
  }
  for (const field of fields) {
    const bag = [field.key, field.labels.fa, field.labels.en || ""]
      .map((item) => normalizeKey(item))
      .filter(Boolean);
    if (bag.some((item) => item.includes(sourceKey) || sourceKey.includes(item))) {
      return field.key;
    }
  }
  return null;
};

const encodeForLookup = (value: unknown): string => normalizeKey(value);

const buildRowHasAnyValue = (row: Record<string, string>): boolean =>
  Object.values(row).some((value) => !isValueEmpty(value));

const isUuidLike = (value: unknown): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );

const findSheetMatrix = (sheets: WorkbookSheets, sheetName: string): string[][] | null => {
  const wanted = normalizeKey(sheetName);
  const found = Object.entries(sheets).find(([name]) => normalizeKey(name) === wanted);
  return found?.[1] || null;
};

const getCellValue = (row: Record<string, string>, ...keys: string[]): string => {
  for (const key of keys) {
    const exact = row[key];
    if (exact !== undefined && String(exact).trim() !== "") return String(exact).trim();
    const normalizedKey = normalizeKey(key);
    const foundKey = Object.keys(row).find((item) => normalizeKey(item) === normalizedKey);
    if (foundKey && String(row[foundKey] ?? "").trim() !== "") return String(row[foundKey]).trim();
  }
  return "";
};

const createImportKey = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const getImportErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const item = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    return [item.message, item.details, item.hint, item.code]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" | ") || "خطای نامشخص";
  }
  return "خطای نامشخص";
};

const PRODUCT_VARIANT_BASE_EXCLUDED = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "system_code",
  "stock",
  "sub_stock",
  "site_remote_id",
  "site_sync_status",
  "site_last_synced_at",
  "site_sync_error",
  "variant_signature",
]);

const normalizeProductAttributeValueType = (value: string) => {
  const normalized = normalizeKey(value);
  if (["multiselect", "multi_select", "چندانتخابی", "چندگزینه"].includes(normalized)) return "multi_select";
  if (["text", "متن"].includes(normalized)) return "text";
  if (["number", "عدد", "عددی"].includes(normalized)) return "number";
  if (["color", "رنگ"].includes(normalized)) return "color";
  return "select";
};

const normalizeCatalogOptionSource = (value: string) => {
  const normalized = normalizeKey(value);
  return ["field", "فیلد", "sourcefield", "فیلدمنبع"].includes(normalized) ? "field" : "custom";
};

const parseDelimitedOptions = (value: string) =>
  String(value || "")
    .split(/[|؛;\n\r،,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

const parseVariantValues = (value: string) => {
  const result: Record<string, string> = {};
  parseDelimitedOptions(value).forEach((part) => {
    const [rawKey, ...rest] = part.split(/[=:]/);
    const key = normalizeAttributeKey(String(rawKey || "").trim());
    const val = rest.join("=").trim();
    if (key && val) result[key] = val;
  });
  return result;
};

const withTimeout = async <T,>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label}: زمان پاسخ تمام شد.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const ExcelImportWizard: React.FC<ExcelImportWizardProps> = ({
  open,
  moduleId,
  moduleConfig,
  onClose,
  onImported,
}) => {
  const { message } = App.useApp();

  const [step, setStep] = useState<number>(0);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [encoding, setEncoding] = useState<EncodingType>("utf-8");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [rawMatrix, setRawMatrix] = useState<string[][]>([]);
  const [workbookSheets, setWorkbookSheets] = useState<WorkbookSheets>({});
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("skip");
  const [duplicateFields, setDuplicateFields] = useState<string[]>([]);
  const [saveCustomMapping, setSaveCustomMapping] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  const importableFields = useMemo(() => {
    return [...moduleConfig.fields]
      .filter((field) => IMPORTABLE_TYPES.has(field.type))
      .filter((field) => !field.readonly)
      .filter((field) => field.nature !== FieldNature.SYSTEM)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }, [moduleConfig.fields]);

  const fieldByKey = useMemo(() => {
    const map = new Map<string, ModuleField>();
    importableFields.forEach((field) => map.set(field.key, field));
    return map;
  }, [importableFields]);

  const requiredFields = useMemo(
    () => importableFields.filter((field) => field.validation?.required),
    [importableFields]
  );

  const parsedSheet = useMemo(() => matrixToSheetData(rawMatrix, hasHeader), [rawMatrix, hasHeader]);

  const mappedFieldKeys = useMemo(() => {
    return mappingRows
      .map((row) => row.targetFieldKey)
      .filter((key): key is string => Boolean(key));
  }, [mappingRows]);

  const mappedRequiredFieldKeys = useMemo(() => {
    const set = new Set(mappedFieldKeys);
    return requiredFields.filter((field) => set.has(field.key)).map((field) => field.key);
  }, [mappedFieldKeys, requiredFields]);

  const missingRequiredFields = useMemo(() => {
    const set = new Set(mappedRequiredFieldKeys);
    return requiredFields.filter((field) => !set.has(field.key));
  }, [mappedRequiredFieldKeys, requiredFields]);

  const resetWizard = useCallback(() => {
    setStep(0);
    setIsParsing(false);
    setIsImporting(false);
    setHasHeader(true);
    setEncoding("utf-8");
    setSelectedFile(null);
    setFileList([]);
    setRawMatrix([]);
    setWorkbookSheets({});
    setMappingRows([]);
    setDuplicateStrategy("skip");
    setDuplicateFields([]);
    setSaveCustomMapping(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetWizard();
  }, [open, moduleId, resetWizard]);

  const parseFile = useCallback(
    async (file: File, textEncoding: EncodingType) => {
      setIsParsing(true);
      try {
        const extension = file.name.split(".").pop()?.toLowerCase() || "";
        if (extension === "csv") {
          const buffer = await file.arrayBuffer();
          const decoder = new TextDecoder(textEncoding);
          const text = decoder.decode(buffer);
          const matrix = parseCsvText(text);
          setWorkbookSheets({ CSV: matrix });
          setRawMatrix(matrix);
          return;
        }

        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: false });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setWorkbookSheets({});
          setRawMatrix([]);
          return;
        }
        const sheets = workbook.SheetNames.reduce<WorkbookSheets>((acc, sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, {
            header: 1,
            defval: "",
            raw: false,
          });
          acc[sheetName] = matrix.map((row) => row.map((cell) => String(cell ?? "").trim()));
          return acc;
        }, {});
        const matrix = sheets[firstSheetName] || [];
        setWorkbookSheets(sheets);
        setRawMatrix(matrix.map((row) => row.map((cell) => String(cell ?? "").trim())));
      } finally {
        setIsParsing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedFile) return;
    const extension = selectedFile.name.split(".").pop()?.toLowerCase() || "";
    if (extension !== "csv") return;
    void parseFile(selectedFile, encoding);
  }, [encoding, parseFile, selectedFile]);

  useEffect(() => {
    if (!parsedSheet.headers.length) {
      setMappingRows([]);
      return;
    }
    const rows: MappingRow[] = parsedSheet.headers.map((header) => ({
      sourceColumn: header,
      sampleValue: parsedSheet.firstRow?.[header] ?? "",
      targetFieldKey: guessTargetField(header, importableFields),
      defaultValue: "",
    }));
    setMappingRows(rows);
  }, [importableFields, parsedSheet.firstRow, parsedSheet.headers]);

  const handleSelectFile = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setFileList([
        {
          uid: String(Date.now()),
          name: file.name,
          status: "done",
          size: file.size,
          type: file.type,
        },
      ]);

      try {
        await parseFile(file, encoding);
      } catch (error) {
        setRawMatrix([]);
        message.error(`خطا در خواندن فایل: ${error instanceof Error ? error.message : "نامشخص"}`);
      }
    },
    [encoding, message, parseFile]
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFileList([]);
    setRawMatrix([]);
    setWorkbookSheets({});
    setMappingRows([]);
  }, []);

  const updateMappingRow = useCallback(
    (sourceColumn: string, patch: Partial<MappingRow>) => {
      setMappingRows((prev) =>
        prev.map((row) => (row.sourceColumn === sourceColumn ? { ...row, ...patch } : row))
      );
    },
    []
  );

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const template = buildModuleExcelTemplate(moduleConfig);
      const workbook = XLSX.utils.book_new();
      template.sheets.forEach((sheet) => {
        const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      });
      XLSX.writeFile(workbook, template.fileName, { bookType: "xlsx" });
    } catch (error) {
      message.error(`ساخت فایل نمونه ناموفق بود: ${error instanceof Error ? error.message : "نامشخص"}`);
    }
  }, [message, moduleConfig]);

  const loadDynamicOptionLookups = useCallback(async (): Promise<DynamicOptionLookupMap> => {
    const categories = Array.from(
      new Set(
        mappingRows
          .map((row) => (row.targetFieldKey ? fieldByKey.get(row.targetFieldKey)?.dynamicOptionsCategory : null))
          .filter((category): category is string => Boolean(category))
      )
    );
    if (!categories.length) return {};

    const { data } = await withTimeout(
      supabase
        .from("dynamic_options")
        .select("category, label, value")
        .in("category", categories)
        .eq("is_active", true),
      20000,
      "دریافت گزینه‌های داینامیک"
    );

    const lookups: DynamicOptionLookupMap = {};
    categories.forEach((category) => {
      lookups[category] = new Map<string, string>();
    });
    (data || []).forEach((item: { category: string | null; label: string | null; value: string | null }) => {
      const category = String(item.category || "").trim();
      const value = String(item.value || item.label || "").trim();
      if (!category || !value) return;
      if (!lookups[category]) lookups[category] = new Map<string, string>();
      lookups[category].set(encodeForLookup(value), value);
      if (item.label) lookups[category].set(encodeForLookup(item.label), value);
    });

    const additions: Array<{ category: string; label: string; value: string; is_active: boolean }> = [];
    const addValue = (category: string, rawValue: string) => {
      splitByDelimiters(rawValue).forEach((part) => {
        const value = part.trim();
        if (!value) return;
        if (!lookups[category]) lookups[category] = new Map<string, string>();
        const key = encodeForLookup(value);
        if (lookups[category].has(key)) return;
        lookups[category].set(key, value);
        additions.push({ category, label: value, value, is_active: true });
      });
    };

    parsedSheet.rows.forEach((row) => {
      mappingRows.forEach((mapping) => {
        if (!mapping.targetFieldKey) return;
        const field = fieldByKey.get(mapping.targetFieldKey);
        const category = field?.dynamicOptionsCategory;
        if (!category) return;
        addValue(category, row[mapping.sourceColumn] || mapping.defaultValue || "");
      });
    });

    if (additions.length > 0) {
      const { error } = await withTimeout(
        supabase.from("dynamic_options").insert(additions),
        20000,
        "ساخت گزینه‌های داینامیک جدید"
      );
      if (error) throw error;
    }

    return lookups;
  }, [fieldByKey, mappingRows, parsedSheet.rows]);

  const convertValueByType = useCallback(
    (
      field: ModuleField,
      rawValue: string,
      relationLookups: RelationLookupMap,
      dynamicOptionLookups: DynamicOptionLookupMap = {}
    ): unknown => {
      const value = String(rawValue ?? "").trim();
      if (!value) return undefined;

      if ((field.type === FieldType.SELECT || field.type === FieldType.STATUS) && field.options?.length) {
        const byValue = field.options.find((option) => normalizeKey(option.value) === normalizeKey(value));
        if (byValue) return byValue.value;
        const byLabel = field.options.find((option) => normalizeKey(option.label) === normalizeKey(value));
        if (byLabel) return byLabel.value;
      }

      if ((field.type === FieldType.SELECT || field.type === FieldType.STATUS) && field.dynamicOptionsCategory) {
        const map = dynamicOptionLookups[field.dynamicOptionsCategory];
        const exact = map?.get(encodeForLookup(value));
        if (exact) return exact;
      }

      if (
        field.type === FieldType.RELATION ||
        field.type === FieldType.USER
      ) {
        const map = relationLookups[field.key];
        if (!map) return value;
        const exact = map.get(encodeForLookup(value));
        if (exact) return exact;
        return value;
      }

      switch (field.type) {
        case FieldType.NUMBER:
        case FieldType.PRICE:
        case FieldType.STOCK:
        case FieldType.PERCENTAGE: {
          const numberVal = parseNumber(value);
          return numberVal ?? undefined;
        }
        case FieldType.CHECKBOX: {
          const boolVal = parseBoolean(value);
          return boolVal ?? undefined;
        }
        case FieldType.DATE: {
          const date = resolveDate(value);
          return date ? date.toISOString().slice(0, 10) : value;
        }
        case FieldType.DATETIME: {
          const date = resolveDate(value);
          return date ? date.toISOString() : value;
        }
        case FieldType.MULTI_SELECT:
        case FieldType.CHECKLIST:
        case FieldType.TAGS:
          return splitByDelimiters(value);
        case FieldType.PHONE:
          return toEnglishDigits(value).replace(/[^\d+]/g, "");
        default:
          return value;
      }
    },
    []
  );

  const loadRelationLookups = useCallback(async (): Promise<RelationLookupMap> => {
    const mappedTargets = mappingRows
      .map((row) => row.targetFieldKey)
      .filter((key): key is string => Boolean(key));
    const uniqueKeys = Array.from(new Set(mappedTargets));
    const relationFields: ModuleField[] = [];
    uniqueKeys.forEach((key) => {
      const field = fieldByKey.get(key);
      if (!field) return;
      if (field.type === FieldType.RELATION || field.type === FieldType.USER) {
        relationFields.push(field);
      }
    });

    const lookupMap: RelationLookupMap = {};
    for (const field of relationFields) {
      const map = new Map<string, string>();
      if (field.type === FieldType.USER) {
        const { data } = await withTimeout(
          supabase.from("profiles").select("id, full_name"),
          20000,
          "دریافت کاربران برای تطبیق"
        );
        (data || []).forEach((item: { id: string; full_name: string | null }) => {
          map.set(encodeForLookup(item.id), item.id);
          if (item.full_name) map.set(encodeForLookup(item.full_name), item.id);
        });
      } else if (field.relationConfig?.targetModule) {
        const targetField = field.relationConfig.targetField || "name";
        const columns = ["id", targetField];
        if (targetField !== "system_code") columns.push("system_code");
        const { data } = await withTimeout(
          supabase
            .from(field.relationConfig.targetModule)
            .select(columns.join(", "))
            .limit(5000),
          20000,
          `دریافت داده مرجع (${field.labels.fa})`
        );
        const rows = (data || []) as unknown as Record<string, unknown>[];
        rows.forEach((item) => {
          const id = String(item.id ?? "");
          if (!id) return;
          map.set(encodeForLookup(id), id);
          const title = item[targetField];
          if (title) map.set(encodeForLookup(String(title)), id);
          const systemCode = item.system_code;
          if (systemCode) map.set(encodeForLookup(String(systemCode)), id);
          if (title && systemCode) {
            map.set(encodeForLookup(`${title} (${systemCode})`), id);
          }
        });
      }
      lookupMap[field.key] = map;
    }

    return lookupMap;
  }, [fieldByKey, mappingRows]);

  const buildPayloadFromRow = useCallback(
    (
      row: Record<string, string>,
      relationLookups: RelationLookupMap,
      dynamicOptionLookups: DynamicOptionLookupMap,
      relationErrors: RelationResolutionError[] = []
    ): Record<string, unknown> => {
      const payload: Record<string, unknown> = {};

      mappingRows.forEach((mapping) => {
        if (!mapping.targetFieldKey) return;
        const field = fieldByKey.get(mapping.targetFieldKey);
        if (!field) return;

        const rawValue = row[mapping.sourceColumn] ?? "";
        if ((field.type === FieldType.RELATION || field.type === FieldType.USER) && String(rawValue || "").trim()) {
          const map = relationLookups[field.key];
          const resolved = map?.get(encodeForLookup(rawValue));
          if (!resolved && !isUuidLike(rawValue)) {
            relationErrors.push({ fieldLabel: field.labels.fa, value: String(rawValue).trim() });
            return;
          }
        }
        const converted = convertValueByType(field, rawValue, relationLookups, dynamicOptionLookups);
        if (!isValueEmpty(converted)) {
          payload[field.key] = converted;
          return;
        }

        if (mapping.defaultValue.trim() !== "") {
          const defaultConverted = convertValueByType(field, mapping.defaultValue, relationLookups, dynamicOptionLookups);
          if (!isValueEmpty(defaultConverted)) payload[field.key] = defaultConverted;
        }
      });

      importableFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(payload, field.key)) return;
        if (field.defaultValue === undefined || field.defaultValue === null) return;
        payload[field.key] = field.defaultValue;
      });

      if (moduleId === "products" && Object.prototype.hasOwnProperty.call(payload, "related_supplier")) {
        payload.supplier_id = payload.related_supplier;
        delete payload.related_supplier;
      }
      if (moduleId === "products") {
        delete payload.tags;
      }

      return payload;
    },
    [convertValueByType, fieldByKey, importableFields, mappingRows, moduleId]
  );

  const isProductionBomTemplate = useMemo(() => {
    if (moduleId !== "production_boms") return false;
    return Boolean(findSheetMatrix(workbookSheets, "BOM") && findSheetMatrix(workbookSheets, "مواد اولیه"));
  }, [moduleId, workbookSheets]);

  const isProductCatalogTemplate = useMemo(() => {
    if (moduleId !== "products") return false;
    return Boolean(findSheetMatrix(workbookSheets, "ویژگی‌ها") || findSheetMatrix(workbookSheets, "متغیرها"));
  }, [moduleId, workbookSheets]);

  const ensureDynamicOptionValues = useCallback(async (valuesByCategory: Record<string, string[]>) => {
    const categories = Object.keys(valuesByCategory).filter((category) => valuesByCategory[category]?.length);
    if (!categories.length) return;

    const { data } = await withTimeout(
      supabase
        .from("dynamic_options")
        .select("category, label, value")
        .in("category", categories)
        .eq("is_active", true),
      20000,
      "دریافت گزینه‌های داینامیک"
    );

    const existing = new Set<string>();
    (data || []).forEach((item: { category: string | null; label: string | null; value: string | null }) => {
      const category = String(item.category || "").trim();
      if (!category) return;
      if (item.value) existing.add(`${category}:${encodeForLookup(item.value)}`);
      if (item.label) existing.add(`${category}:${encodeForLookup(item.label)}`);
    });

    const additions: Array<{ category: string; label: string; value: string; is_active: boolean }> = [];
    categories.forEach((category) => {
      valuesByCategory[category].forEach((rawValue) => {
        splitByDelimiters(rawValue).forEach((part) => {
          const value = part.trim();
          if (!value) return;
          const key = `${category}:${encodeForLookup(value)}`;
          if (existing.has(key)) return;
          existing.add(key);
          additions.push({ category, label: value, value, is_active: true });
        });
      });
    });

    if (additions.length > 0) {
      const { error } = await withTimeout(
        supabase.from("dynamic_options").insert(additions),
        20000,
        "ساخت گزینه‌های داینامیک جدید"
      );
      if (error) throw error;
    }
  }, []);

  const handleProductionBomTemplateImport = useCallback(async () => {
    const bomMatrix = findSheetMatrix(workbookSheets, "BOM");
    const materialMatrix = findSheetMatrix(workbookSheets, "مواد اولیه");
    if (!bomMatrix || !materialMatrix) {
      message.error("فایل نمونه BOM باید شیت‌های «BOM» و «مواد اولیه» داشته باشد.");
      return;
    }

    const bomRows = matrixToSheetData(bomMatrix, true).rows.filter(buildRowHasAnyValue);
    const materialRows = matrixToSheetData(materialMatrix, true).rows.filter(buildRowHasAnyValue);
    if (!bomRows.length) {
      message.error("در شیت BOM داده‌ای پیدا نشد.");
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: bomRows.length });
    try {
      const specFieldMeta = new Map<string, { key: string; category: string; multi?: boolean }>([
        [normalizeKey("نوع چرم"), { key: "leather_type", category: "leather_type" }],
        [normalizeKey("رنگ چرم"), { key: "leather_colors", category: "general_color", multi: true }],
        [normalizeKey("صفحه چرم"), { key: "leather_finish_1", category: "leather_finish" }],
        [normalizeKey("افکت چرم"), { key: "leather_effect", category: "leather_effect", multi: true }],
        [normalizeKey("سورت چرم"), { key: "leather_sort", category: "leather_sort" }],
        [normalizeKey("جنس آستر"), { key: "lining_material", category: "lining_material" }],
        [normalizeKey("رنگ آستر"), { key: "lining_color", category: "general_color" }],
        [normalizeKey("عرض آستر"), { key: "lining_width", category: "lining_width" }],
        [normalizeKey("جنس خرجکار"), { key: "acc_material", category: "acc_material" }],
        [normalizeKey("نوع یراق"), { key: "fitting_type", category: "fitting_type" }],
        [normalizeKey("جنس یراق"), { key: "fitting_material", category: "fitting_material" }],
        [normalizeKey("رنگ یراق"), { key: "fitting_colors", category: "general_color", multi: true }],
        [normalizeKey("سایز یراق"), { key: "fitting_size", category: "fitting_size" }],
      ]);
      const statusField = moduleConfig.fields.find((field) => field.key === "status");
      const dynamicValues: Record<string, string[]> = {};
      const addDynamicValue = (fieldKey: string, value: string) => {
        const field = moduleConfig.fields.find((item) => item.key === fieldKey);
        const category = field?.dynamicOptionsCategory;
        if (!category || !value) return;
        if (!dynamicValues[category]) dynamicValues[category] = [];
        dynamicValues[category].push(value);
      };

      bomRows.forEach((row) => {
        addDynamicValue("product_category", getCellValue(row, "دسته بندی محصول"));
        addDynamicValue("model_name", getCellValue(row, "نام مدل"));
      });
      materialRows.forEach((row) => {
        [
          "نوع چرم",
          "رنگ چرم",
          "صفحه چرم",
          "افکت چرم",
          "سورت چرم",
          "جنس آستر",
          "رنگ آستر",
          "عرض آستر",
          "جنس خرجکار",
          "نوع یراق",
          "جنس یراق",
          "رنگ یراق",
          "سایز یراق",
        ].forEach((label) => {
          const meta = specFieldMeta.get(normalizeKey(label));
          const value = getCellValue(row, label);
          if (!meta || !value) return;
          if (!dynamicValues[meta.category]) dynamicValues[meta.category] = [];
          dynamicValues[meta.category].push(value);
        });
      });
      await ensureDynamicOptionValues(dynamicValues);

      const categoryMap = new Map<string, string>([
        [normalizeKey("چرم"), "leather"],
        [normalizeKey("leather"), "leather"],
        [normalizeKey("آستر"), "lining"],
        [normalizeKey("lining"), "lining"],
        [normalizeKey("خرجکار"), "accessory"],
        [normalizeKey("accessory"), "accessory"],
        [normalizeKey("یراق"), "fitting"],
        [normalizeKey("fitting"), "fitting"],
      ]);
      const specLabels = [
        "نوع چرم",
        "رنگ چرم",
        "صفحه چرم",
        "افکت چرم",
        "سورت چرم",
        "جنس آستر",
        "رنگ آستر",
        "عرض آستر",
        "جنس خرجکار",
        "نوع یراق",
        "جنس یراق",
        "رنگ یراق",
        "سایز یراق",
      ];
      const materialsByBom = new Map<string, Map<string, any>>();

      const calculateGridRow = (gridRow: any) => {
        let totalQty = 0;
        let totalMain = 0;
        let totalFinal = 0;
        let totalCost = 0;
        const pieces = (gridRow.pieces || []).map((piece: any) => {
          const length = Number(piece.length) || 0;
          const width = Number(piece.width) || 0;
          const quantity = Number(piece.quantity) || 0;
          const wasteRate = Number(piece.waste_rate) || 0;
          const baseUsage = length && width ? length * width * (quantity || 1) : quantity || 0;
          const finalUsage = baseUsage * (1 + wasteRate / 100);
          const unitPrice = Number(piece.unit_price) || 0;
          const costPerItem = unitPrice * finalUsage;
          totalQty += quantity;
          totalMain += baseUsage;
          totalFinal += finalUsage;
          totalCost += costPerItem;
          return {
            ...piece,
            qty_main: baseUsage,
            final_usage: finalUsage,
            cost_per_item: costPerItem,
            total_usage: 0,
            total_cost: costPerItem,
          };
        });
        return {
          ...gridRow,
          pieces,
          totals: {
            total_quantity: totalQty,
            total_qty_main: totalMain,
            total_qty_sub: 0,
            total_final_usage: totalFinal,
            total_usage: 0,
            total_cost: totalCost,
          },
        };
      };

      materialRows.forEach((row) => {
        const bomKey = getCellValue(row, "کلید BOM", "عنوان مدل");
        if (!bomKey) return;
        const categoryRaw = getCellValue(row, "دسته ماده", "مواد اولیه");
        const category = categoryMap.get(normalizeKey(categoryRaw)) || categoryRaw;
        if (!category) return;

        const specs: Record<string, string | string[]> = {};
        specLabels.forEach((label) => {
          const meta = specFieldMeta.get(normalizeKey(label));
          const value = getCellValue(row, label);
          if (!meta?.key || !value) return;
          specs[meta.key] = meta.multi ? splitByDelimiters(value) : value;
        });

        const groupKey = `${category}:${JSON.stringify(specs)}`;
        if (!materialsByBom.has(bomKey)) materialsByBom.set(bomKey, new Map<string, any>());
        const bomMaterials = materialsByBom.get(bomKey)!;
        if (!bomMaterials.has(groupKey)) {
          bomMaterials.set(groupKey, {
            key: createImportKey("grid"),
            collapsed: false,
            header: {
              category,
              selected_product_id: null,
              selected_product_name: null,
              selected_product_stock: null,
              selected_product_main_unit: null,
              selected_product_sub_unit: null,
            },
            specs,
            pieces: [],
            totals: {},
          });
        }

        bomMaterials.get(groupKey).pieces.push({
          key: createImportKey("piece"),
          name: getCellValue(row, "نام تکه") || "مصرف",
          length: parseNumber(getCellValue(row, "طول")) || 0,
          width: parseNumber(getCellValue(row, "عرض")) || 0,
          quantity: parseNumber(getCellValue(row, "تعداد")) || 0,
          waste_rate: parseNumber(getCellValue(row, "نرخ پرت")) || 0,
          main_unit: getCellValue(row, "واحد اصلی", "واحد"),
          sub_unit: getCellValue(row, "واحد فرعی"),
          unit_price: parseNumber(getCellValue(row, "قیمت خرید")) || 0,
          qty_main: 0,
          qty_sub: 0,
          formula_id: null,
          final_usage: 0,
          cost_per_item: 0,
          total_usage: 0,
          total_cost: 0,
          image_url: null,
        });
      });

      let inserted = 0;
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let idx = 0; idx < bomRows.length; idx += 1) {
        const row = bomRows[idx];
        setImportProgress({ current: idx + 1, total: bomRows.length });
        const bomKey = getCellValue(row, "کلید BOM", "عنوان مدل");
        const name = getCellValue(row, "عنوان مدل", "نام", "name");
        if (!name) {
          failed += 1;
          errors.push(`ردیف ${idx + 2}: عنوان مدل خالی است.`);
          continue;
        }

        const statusRaw = getCellValue(row, "وضعیت");
        const statusOption = statusField?.options?.find(
          (option) => normalizeKey(option.label) === normalizeKey(statusRaw) || normalizeKey(option.value) === normalizeKey(statusRaw)
        );
        const grid_materials = Array.from(materialsByBom.get(bomKey)?.values() || []).map(calculateGridRow);
        const payload = {
          name,
          status: statusOption?.value || statusRaw || "active",
          product_category: getCellValue(row, "دسته بندی محصول") || null,
          model_name: getCellValue(row, "نام مدل") || null,
          grid_materials,
        };

        try {
          const { data: existing } = await withTimeout(
            supabase.from(moduleConfig.table).select("id").eq("name", name).limit(1),
            20000,
            `بررسی BOM تکراری ردیف ${idx + 2}`
          );
          const existingId = (existing && existing[0]?.id) ? String(existing[0].id) : "";
          if (existingId) {
            const { error } = await withTimeout(
              supabase.from(moduleConfig.table).update(payload).eq("id", existingId),
              20000,
              `بروزرسانی BOM ردیف ${idx + 2}`
            );
            if (error) throw error;
            updated += 1;
          } else {
            const { error } = await withTimeout(
              supabase.from(moduleConfig.table).insert(payload),
              20000,
              `ثبت BOM ردیف ${idx + 2}`
            );
            if (error) throw error;
            inserted += 1;
          }
        } catch (error) {
          failed += 1;
          errors.push(`ردیف ${idx + 2}: ${getImportErrorMessage(error)}`);
        }
      }

      const baseMessage = `واردسازی BOM انجام شد. جدید: ${inserted} | بروزرسانی: ${updated} | خطا: ${failed}`;
      if (failed > 0) {
        message.warning(baseMessage);
        if (errors.length > 0) message.error(errors.slice(0, 3).join(" | "));
      } else {
        message.success(baseMessage);
      }
      onImported?.();
      onClose();
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  }, [ensureDynamicOptionValues, message, moduleConfig.fields, moduleConfig.table, onClose, onImported, workbookSheets]);

  const handleProductCatalogTemplateImport = useCallback(async () => {
    const productsMatrix = findSheetMatrix(workbookSheets, "محصولات") || rawMatrix;
    const attributesMatrix = findSheetMatrix(workbookSheets, "ویژگی‌ها");
    const variantsMatrix = findSheetMatrix(workbookSheets, "متغیرها");
    const productRows = matrixToSheetData(productsMatrix, true).rows.filter(buildRowHasAnyValue);
    const attributeRows = attributesMatrix ? matrixToSheetData(attributesMatrix, true).rows.filter(buildRowHasAnyValue) : [];
    const variantRows = variantsMatrix ? matrixToSheetData(variantsMatrix, true).rows.filter(buildRowHasAnyValue) : [];

    if (!productRows.length) {
      message.error("در شیت محصولات داده‌ای پیدا نشد.");
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: productRows.length });
    try {
      const relationLookups = await withTimeout(
        loadRelationLookups(),
        30000,
        "آماده‌سازی تطبیق روابط"
      );
      const dynamicOptionLookups = await withTimeout(
        loadDynamicOptionLookups(),
        30000,
        "آماده‌سازی گزینه‌های داینامیک"
      );

      const parentIdByKey = new Map<string, string>();
      const parentNameByKey = new Map<string, string>();
      const parentBaseByKey = new Map<string, Record<string, any>>();
      const attributesByParentKey = new Map<string, ProductAttributeRecord[]>();
      const parentKeyByAttributeKey = new Map<string, Map<string, ProductAttributeRecord>>();

      attributeRows.forEach((row, index) => {
        const parentKey = getCellValue(row, "کلید محصول مادر", "کلید محصول");
        if (!parentKey) return;
        const label = getCellValue(row, "عنوان ویژگی", "ویژگی");
        const key = normalizeAttributeKey(getCellValue(row, "کلید ویژگی") || label || `attribute_${index + 1}`);
        if (!label || !key) return;
        const optionSourceType = normalizeCatalogOptionSource(getCellValue(row, "منبع گزینه"));
        const options = optionSourceType === "custom"
          ? parseDelimitedOptions(getCellValue(row, "گزینه‌ها")).map((option, optionIndex) => ({
              label: option,
              value: option,
              sort_order: optionIndex,
              is_active: true,
            }))
          : [];
        const attribute = normalizeProductAttributeRecord({
          key,
          label,
          scope_type: "parent",
          value_type: normalizeProductAttributeValueType(getCellValue(row, "نوع مقدار")),
          option_source_type: optionSourceType,
          source_field_key: getCellValue(row, "کلید فیلد منبع") || null,
          is_variation: parseBoolean(getCellValue(row, "ویژگی متغیر")) !== false,
          is_visible_on_site: parseBoolean(getCellValue(row, "نمایش در سایت")) !== false,
          sort_order: parseNumber(getCellValue(row, "ترتیب")) ?? index,
          is_active: parseBoolean(getCellValue(row, "فعال")) !== false,
          options,
        }, index);
        if (!attributesByParentKey.has(parentKey)) attributesByParentKey.set(parentKey, []);
        attributesByParentKey.get(parentKey)!.push(attribute);
      });

      let inserted = 0;
      let updated = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let idx = 0; idx < productRows.length; idx += 1) {
        const row = productRows[idx];
        setImportProgress({ current: idx + 1, total: productRows.length });
        const relationErrors: RelationResolutionError[] = [];
        const payloadRaw = buildPayloadFromRow(row, relationLookups, dynamicOptionLookups, relationErrors);
        if (relationErrors.length > 0) {
          failed += 1;
          errors.push(
            `ردیف ${idx + 2}: مقدار رابطه پیدا نشد (${relationErrors
              .map((item) => `${item.fieldLabel}: ${item.value}`)
              .join("، ")})`
          );
          continue;
        }

        const payload = normalizeCatalogProductPayload(payloadRaw as Record<string, any>);
        const roleRaw = getCellValue(row, "نقش کاتالوگی");
        const roleKey = normalizeKey(payload.catalog_role || roleRaw || "standalone");
        payload.catalog_role = roleKey === "parent" || roleKey === normalizeKey("محصول مادر")
          ? "parent"
          : roleKey === "variant" || roleKey === normalizeKey("متغیر")
            ? "variant"
            : "standalone";
        if (payload.catalog_role === "variant") {
          payload.catalog_role = "standalone";
        }
        delete payload.tags;

        const recordKey = getCellValue(row, "کلید محصول");
        const name = String(payload.name || "").trim();
        const manualCode = String(payload.manual_code || "").trim();
        if (!name) {
          failed += 1;
          errors.push(`ردیف ${idx + 2}: نام محصول خالی است.`);
          continue;
        }

        try {
          let existingId = "";
          let query = supabase.from("products").select("*").limit(1);
          if (manualCode) {
            query = query.eq("manual_code", manualCode);
          } else {
            query = query.eq("name", name);
          }
          const { data: existingRows } = await withTimeout(
            Promise.resolve(query),
            20000,
            `بررسی محصول ردیف ${idx + 2}`
          );
          const existingRow = existingRows?.[0] as Record<string, any> | undefined;
          existingId = existingRow?.id ? String(existingRow.id) : "";

          let savedRow: Record<string, any> | null = null;
          if (existingId) {
            const { data: updatedRow, error } = await withTimeout(
              supabase.from("products").update(payload).eq("id", existingId).select("*").single(),
              20000,
              `بروزرسانی محصول ردیف ${idx + 2}`
            );
            if (error) throw error;
            savedRow = updatedRow as Record<string, any>;
            updated += 1;
          } else {
            const { data: insertedRow, error } = await withTimeout(
              supabase.from("products").insert(payload).select("*").single(),
              20000,
              `ثبت محصول ردیف ${idx + 2}`
            );
            if (error) throw error;
            savedRow = insertedRow as Record<string, any>;
            inserted += 1;
          }

          if (payload.catalog_role === "parent" && savedRow?.id) {
            const parentId = String(savedRow.id);
            if (recordKey) parentIdByKey.set(recordKey, parentId);
            if (recordKey) parentNameByKey.set(recordKey, String(savedRow.name || name));
            if (recordKey) parentBaseByKey.set(recordKey, { ...savedRow });

            const attributes = (attributesByParentKey.get(recordKey) || []).map((attribute, attrIndex) =>
              normalizeProductAttributeRecord({ ...attribute, scope_type: "parent", parent_product_id: parentId }, attrIndex)
            );
            parentKeyByAttributeKey.set(recordKey, new Map(attributes.map((attribute) => [attribute.key, attribute])));

            for (const attribute of attributes) {
              const { data: existingAttributeRows, error: attrLookupError } = await withTimeout(
                supabase
                  .from("product_attributes")
                  .select("id")
                  .eq("scope_type", "parent")
                  .eq("parent_product_id", parentId)
                  .eq("key", attribute.key)
                  .limit(1),
                20000,
                `بررسی ویژگی ${attribute.label}`
              );
              if (attrLookupError) throw attrLookupError;

              const existingAttributeId = existingAttributeRows?.[0]?.id ? String(existingAttributeRows[0].id) : undefined;
              const attributePayload = {
                ...(existingAttributeId ? { id: existingAttributeId } : {}),
                scope_type: "parent",
                parent_product_id: parentId,
                key: attribute.key,
                label: attribute.label,
                value_type: attribute.value_type,
                option_source_type: attribute.option_source_type,
                source_field_key: attribute.source_field_key ?? null,
                is_variation: attribute.is_variation !== false,
                is_visible_on_site: attribute.is_visible_on_site !== false,
                sort_order: attribute.sort_order ?? 0,
                is_active: attribute.is_active !== false,
              };

              const { data: savedAttribute, error: attrSaveError } = await withTimeout(
                supabase.from("product_attributes").upsert(attributePayload, { onConflict: "id" }).select("*").single(),
                20000,
                `ثبت ویژگی ${attribute.label}`
              );
              if (attrSaveError) throw attrSaveError;
              const attributeId = String((savedAttribute as any)?.id || existingAttributeId || "");
              if (!attributeId) continue;

              if (attribute.option_source_type === "custom") {
                const optionsPayload = (attribute.options || []).map((option, optionIndex) => ({
                  attribute_id: attributeId,
                  label: option.label,
                  value: option.value,
                  sort_order: typeof option.sort_order === "number" ? option.sort_order : optionIndex,
                  is_active: option.is_active !== false,
                }));
                if (optionsPayload.length > 0) {
                  const { error: optError } = await withTimeout(
                    supabase.from("product_attribute_options").upsert(optionsPayload, { onConflict: "attribute_id,value" }),
                    20000,
                    `ثبت گزینه‌های ویژگی ${attribute.label}`
                  );
                  if (optError) throw optError;
                }
              }
            }
          }
        } catch (error) {
          failed += 1;
          errors.push(`ردیف ${idx + 2}: ${getImportErrorMessage(error)}`);
        }
      }

      const variantTotal = variantRows.length;
      for (let idx = 0; idx < variantRows.length; idx += 1) {
        const row = variantRows[idx];
        const parentKey = getCellValue(row, "کلید محصول مادر", "کلید محصول");
        if (!parentKey) {
          failed += 1;
          errors.push(`ردیف متغیر ${idx + 2}: کلید محصول مادر خالی است.`);
          continue;
        }
        const parentId = parentIdByKey.get(parentKey);
        const parentBase = parentBaseByKey.get(parentKey);
        const parentName = parentNameByKey.get(parentKey) || "محصول";
        const attributesMap = parentKeyByAttributeKey.get(parentKey) || new Map<string, ProductAttributeRecord>();
        if (!parentId || !parentBase) {
          failed += 1;
          errors.push(`ردیف متغیر ${idx + 2}: محصول مادر با کلید ${parentKey} پیدا نشد.`);
          continue;
        }

        try {
          const variantValues = parseVariantValues(getCellValue(row, "مقادیر ویژگی"));
          Object.keys(row).forEach((header) => {
            const normalizedHeader = normalizeAttributeKey(header);
            const attribute = attributesMap.get(normalizedHeader) || Array.from(attributesMap.values()).find(
              (item) => normalizeAttributeKey(item.label) === normalizedHeader
            );
            const rawValue = String(row[header] || "").trim();
            if (!attribute || !rawValue) return;
            variantValues[attribute.key] = rawValue;
          });
          if (!Object.keys(variantValues).length) {
            throw new Error("مقادیر ویژگی برای متغیر خالی است.");
          }

          const activeAttributes = Array.from(attributesMap.values()).filter((attribute) => attribute.is_active !== false);
          const payload: Record<string, any> = { ...parentBase };
          Object.keys(payload).forEach((key) => {
            if (PRODUCT_VARIANT_BASE_EXCLUDED.has(key)) delete payload[key];
          });
          payload.catalog_role = "variant";
          payload.parent_product_id = parentId;
          payload.site_code = getCellValue(row, "کد سایت") || null;
          payload.sell_price = parseNumber(getCellValue(row, "قیمت فروش"));
          payload.status = getCellValue(row, "وضعیت") || "active";
          payload.site_sync_enabled = parseBoolean(getCellValue(row, "فعال‌سازی sync سایت")) === true;
          payload.variant_values = variantValues;
          activeAttributes.forEach((attribute) => {
            if (attribute.option_source_type !== "field" || !attribute.source_field_key) return;
            payload[attribute.source_field_key] = variantValues[attribute.key] ?? null;
          });
          payload.name = getCellValue(row, "نام متغیر") || buildVariantName(parentName, variantValues, activeAttributes);
          payload.variant_signature = buildVariantSignature(variantValues);

          const { data: existingVariantRows, error: variantLookupError } = await withTimeout(
            supabase
              .from("products")
              .select("id")
              .eq("catalog_role", "variant")
              .eq("parent_product_id", parentId)
              .eq("variant_signature", payload.variant_signature)
              .limit(1),
            20000,
            `بررسی متغیر ${idx + 2}`
          );
          if (variantLookupError) throw variantLookupError;
          const existingVariantId = existingVariantRows?.[0]?.id ? String(existingVariantRows[0].id) : "";
          if (existingVariantId) {
            const { error } = await withTimeout(
              supabase.from("products").update(payload).eq("id", existingVariantId),
              20000,
              `بروزرسانی متغیر ${idx + 2}`
            );
            if (error) throw error;
            updated += 1;
          } else {
            const { error } = await withTimeout(
              supabase.from("products").insert(payload),
              20000,
              `ثبت متغیر ${idx + 2}`
            );
            if (error) throw error;
            inserted += 1;
          }
        } catch (error) {
          failed += 1;
          errors.push(`ردیف متغیر ${idx + 2}: ${getImportErrorMessage(error)}`);
        }
      }

      const baseMessage = `واردسازی محصولات انجام شد. جدید: ${inserted} | بروزرسانی: ${updated} | خطا: ${failed}`;
      if (failed > 0) {
        message.warning(baseMessage);
        if (errors.length > 0) {
          message.error(errors.slice(0, 3).join(" | "));
        }
      } else {
        const extra = variantTotal > 0 ? ` | متغیرها: ${variantTotal}` : "";
        message.success(baseMessage + extra);
      }
      onImported?.();
      onClose();
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  }, [
    buildPayloadFromRow,
    loadDynamicOptionLookups,
    loadRelationLookups,
    message,
    onClose,
    onImported,
    rawMatrix,
    workbookSheets,
  ]);

  const validateBeforeImport = useCallback((): boolean => {
    if (!selectedFile) {
      message.error("فایل را انتخاب کنید.");
      return false;
    }
    if (!parsedSheet.rows.length) {
      message.error("در فایل داده‌ای برای وارد کردن پیدا نشد.");
      return false;
    }
    if ((duplicateStrategy === "overwrite" || duplicateStrategy === "merge") && !duplicateFields.length) {
      message.error("برای بازنویسی یا ادغام، حداقل یک فیلد تطبیق انتخاب کنید.");
      return false;
    }
    if (missingRequiredFields.length > 0) {
      message.error(
        `این فیلدهای اجباری هنوز تطبیق داده نشده‌اند: ${missingRequiredFields
          .map((field) => field.labels.fa)
          .join("، ")}`
      );
      return false;
    }
    return true;
  }, [
    duplicateFields.length,
    duplicateStrategy,
    message,
    missingRequiredFields,
    parsedSheet.rows.length,
    selectedFile,
  ]);

  const handleImport = useCallback(async () => {
    if (!validateBeforeImport()) return;
    setIsImporting(true);
    setImportProgress({ current: 0, total: parsedSheet.rows.length });
    try {
      const relationLookups = await withTimeout(
        loadRelationLookups(),
        30000,
        "آماده‌سازی تطبیق روابط"
      );
      const dynamicOptionLookups = await withTimeout(
        loadDynamicOptionLookups(),
        30000,
        "آماده‌سازی گزینه‌های داینامیک"
      );
      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let idx = 0; idx < parsedSheet.rows.length; idx += 1) {
        const row = parsedSheet.rows[idx];
        const sourceLine = hasHeader ? idx + 2 : idx + 1;
        setImportProgress({ current: idx + 1, total: parsedSheet.rows.length });

        if (!buildRowHasAnyValue(row)) continue;

        const relationErrors: RelationResolutionError[] = [];
        const payloadRaw = buildPayloadFromRow(row, relationLookups, dynamicOptionLookups, relationErrors);
        if (relationErrors.length > 0) {
          failed += 1;
          errors.push(
            `ردیف ${sourceLine}: مقدار رابطه پیدا نشد (${relationErrors
              .map((item) => `${item.fieldLabel}: ${item.value}`)
              .join("، ")})`
          );
          continue;
        }
        const payload =
          moduleId === "tasks"
            ? attachTaskCompletionIfNeeded(payloadRaw as Record<string, unknown>)
            : payloadRaw;

        const missingInRow = requiredFields.filter((field) => isValueEmpty(payload[field.key]));
        if (missingInRow.length > 0) {
          failed += 1;
          errors.push(`ردیف ${sourceLine}: مقدار فیلدهای اجباری کامل نیست.`);
          continue;
        }

        try {
          let existingRecord: Record<string, unknown> | null = null;

          if (duplicateFields.length > 0) {
            const duplicateFilter = duplicateFields.reduce<Record<string, unknown>>((acc, fieldKey) => {
              const value = payload[fieldKey];
              if (!isValueEmpty(value)) acc[fieldKey] = value;
              return acc;
            }, {});

            if (Object.keys(duplicateFilter).length === duplicateFields.length) {
              let query = supabase.from(moduleConfig.table).select("*").limit(1);
              Object.entries(duplicateFilter).forEach(([key, value]) => {
                query = query.eq(key, value as never);
              });
              const { data } = await withTimeout(
                Promise.resolve(query),
                20000,
                `بررسی تکراری بودن ردیف ${sourceLine}`
              );
              existingRecord = (data && data[0] ? (data[0] as Record<string, unknown>) : null);
            }
          }

          if (existingRecord) {
            if (duplicateStrategy === "skip") {
              skipped += 1;
              continue;
            }
            const updatePayload =
              duplicateStrategy === "merge"
                ? Object.entries(payload).reduce<Record<string, unknown>>((acc, [key, value]) => {
                    if (!isValueEmpty(value)) acc[key] = value;
                    return acc;
                  }, {})
                : payload;

            const { error } = await withTimeout(
              supabase
                .from(moduleConfig.table)
                .update(updatePayload)
                .eq("id", existingRecord.id as string),
              20000,
              `بروزرسانی ردیف ${sourceLine}`
            );
            if (error) throw error;
            updated += 1;
            continue;
          }

          const { error } = await withTimeout(
            supabase.from(moduleConfig.table).insert(payload),
            20000,
            `ثبت ردیف ${sourceLine}`
          );
          if (error) throw error;
          inserted += 1;
        } catch (rowError) {
          failed += 1;
          errors.push(`ردیف ${sourceLine}: ${getImportErrorMessage(rowError)}`);
        }
      }

      const baseMessage = `واردسازی انجام شد. جدید: ${inserted} | بروزرسانی: ${updated} | تکراری/ثبت‌نشده: ${skipped} | خطا: ${failed}`;
      if (failed > 0) {
        message.warning(baseMessage);
        if (errors.length > 0) {
          message.error(errors.slice(0, 3).join(" | "));
        }
      } else {
        message.success(baseMessage);
      }

      onImported?.();
      onClose();
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  }, [
    buildPayloadFromRow,
    duplicateFields,
    duplicateStrategy,
    hasHeader,
    loadRelationLookups,
    loadDynamicOptionLookups,
    message,
    moduleConfig.table,
    moduleId,
    onClose,
    onImported,
    parsedSheet.rows,
    requiredFields,
    setImportProgress,
    validateBeforeImport,
  ]);

  const handleNext = useCallback(async () => {
    if (step === 0) {
      if (!selectedFile) {
        message.error("ابتدا فایل را انتخاب کنید.");
        return;
      }
      if (isProductCatalogTemplate) {
        await handleProductCatalogTemplateImport();
        return;
      }
      if (isProductionBomTemplate) {
        await handleProductionBomTemplateImport();
        return;
      }
      if (!parsedSheet.rows.length) {
        message.error("داده قابل واردسازی در فایل پیدا نشد.");
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if ((duplicateStrategy === "overwrite" || duplicateStrategy === "merge") && !duplicateFields.length) {
        message.error("برای این روش، فیلد تطبیق را انتخاب کنید.");
        return;
      }
      setStep(2);
      return;
    }
    await handleImport();
  }, [
    duplicateFields.length,
    duplicateStrategy,
    handleImport,
    handleProductCatalogTemplateImport,
    handleProductionBomTemplateImport,
    isProductCatalogTemplate,
    isProductionBomTemplate,
    message,
    parsedSheet.rows.length,
    selectedFile,
    step,
  ]);

  const stepContent = useMemo(() => {
    if (step === 0) {
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-leather-200 bg-leather-50/60 px-3 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-gray-700">
                نمونه فایل {moduleConfig.titles.fa || moduleId}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                فایل را با همین قالب تکمیل کنید تا تطبیق ستون‌ها دقیق‌تر انجام شود.
              </div>
            </div>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => {
                void handleDownloadTemplate();
              }}
              className="!h-9 rounded-xl border-leather-500 text-leather-700 bg-white"
            >
              دانلود نمونه فایل {moduleConfig.titles.fa || moduleId}
            </Button>
          </div>

          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-3">
            <Upload.Dragger
              multiple={false}
              showUploadList={false}
              accept=".xlsx,.xls,.csv"
              fileList={[]}
              beforeUpload={(file) => {
                void handleSelectFile(file);
                return false;
              }}
              className="!bg-transparent"
            >
              <div className="py-4 text-center">
                <InboxOutlined className="text-3xl text-gray-400" />
                <div className="mt-3 text-lg font-bold text-gray-600">
                  فایل خود را به این قسمت کشیده و رها کنید
                </div>
                <div className="text-gray-400 mt-1">یا</div>
                <Button
                  type="default"
                  icon={<UploadOutlined />}
                  className="mt-2 rounded-xl bg-leather-600 !text-white hover:!bg-leather-500 border-leather-600 !h-9 px-5"
                >
                  یک فایل انتخاب کنید
                </Button>
              </div>
            </Upload.Dragger>
          </div>

          {fileList.length > 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileOutlined className="text-gray-500" />
                <span className="font-medium text-gray-600 truncate text-sm">{fileList[0].name}</span>
              </div>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={handleRemoveFile}
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 px-3 py-2">
              <Checkbox checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)}>
                هدر دارد
              </Checkbox>
            </div>
            <div className="rounded-xl border border-gray-200 px-3 py-2">
              <div className="text-xs text-gray-500 mb-0.5">
                نحوه کدگذاری کاراکترها <span className="text-red-500">*</span>
              </div>
              <Select
                value={encoding}
                onChange={(val) => setEncoding(val)}
                className="w-full"
                options={[
                  { label: "UTF-8", value: "utf-8" },
                  { label: "Windows-1256", value: "windows-1256" },
                ]}
              />
            </div>
          </div>

          {isParsing && (
            <div className="flex items-center gap-2 text-gray-500">
              <Spin size="small" />
              <span>در حال خواندن فایل...</span>
            </div>
          )}
        </div>
      );
    }

    if (step === 1) {
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 px-3 py-2">
            <div className="text-sm text-gray-500 mb-1">
              نحوه رسیدگی به اطلاعات تکراری <span className="text-red-500">*</span>
            </div>
            <Select
              value={duplicateStrategy}
              onChange={(val) => setDuplicateStrategy(val)}
              options={DUPLICATE_OPTIONS.map((item) => ({ label: item.label, value: item.value }))}
              className="w-full"
            />
          </div>

          <div className="rounded-xl border border-gray-200 px-3 py-2">
            <div className="text-sm text-gray-500 mb-2">
              فیلدهای مطابق برای پیدا کردن رکوردهای تکراری <span className="text-red-500">*</span>
            </div>
            <Select
              mode="multiple"
              value={duplicateFields}
              onChange={(values) => setDuplicateFields(values)}
              className="w-full"
              optionFilterProp="label"
              options={importableFields.map((field) => ({
                label: field.labels.fa,
                value: field.key,
              }))}
              placeholder="انتخاب فیلدهای تطبیق"
            />
          </div>
        </div>
      );
    }

    if (!mappingRows.length) {
      return <Empty description="ستونی برای تطبیق پیدا نشد." />;
    }

    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-gray-600">
            فیلدهای زیر اجباری هستند و ضروری است ستون های مرتبط به آن ها مشخص شود.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {requiredFields.map((field) => (
              <Tag
                key={field.key}
                color={mappedRequiredFieldKeys.includes(field.key) ? "blue" : "red"}
                className="!m-0 text-sm px-3 py-1 rounded-lg"
              >
                {field.labels.fa}
              </Tag>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-gray-700">ذخیره به عنوان معادل یابی سفارشی</div>
          <Checkbox checked={saveCustomMapping} onChange={(event) => setSaveCustomMapping(event.target.checked)} />
        </div>

        <Table<MappingRow>
          rowKey="sourceColumn"
          pagination={false}
          dataSource={mappingRows}
          size="middle"
          scroll={{ y: 300 }}
          columns={[
            {
              title: "تیتر",
              dataIndex: "sourceColumn",
              key: "sourceColumn",
              width: 280,
              render: (value: string) => <span className="font-semibold">{value}</span>,
            },
            {
              title: "ردیف اول",
              dataIndex: "sampleValue",
              key: "sampleValue",
              width: 260,
              render: (value: string) => <span className="text-gray-600">{value || "-"}</span>,
            },
            {
              title: "فیلد های موجود",
              dataIndex: "targetFieldKey",
              key: "targetFieldKey",
              width: 320,
              render: (value: string | null, row: MappingRow) => (
                <Select
                  value={value}
                  allowClear
                  className="w-full"
                  optionFilterProp="label"
                  placeholder="انتخاب فیلد"
                  onChange={(nextValue) =>
                    updateMappingRow(row.sourceColumn, { targetFieldKey: nextValue || null })
                  }
                  options={importableFields.map((field) => ({
                    label: field.labels.fa,
                    value: field.key,
                    disabled:
                      Boolean(field.key !== value) &&
                      mappedFieldKeys.includes(field.key),
                  }))}
                />
              ),
            },
            {
              title: "مقدار پیش فرض",
              dataIndex: "defaultValue",
              key: "defaultValue",
              width: 220,
              render: (value: string, row: MappingRow) => (
                <Input
                  value={value}
                  onChange={(event) =>
                    updateMappingRow(row.sourceColumn, { defaultValue: event.target.value })
                  }
                  placeholder="اختیاری"
                />
              ),
            },
          ]}
        />
      </div>
    );
  }, [
    duplicateFields,
    duplicateStrategy,
    fileList,
    handleRemoveFile,
    handleSelectFile,
    handleDownloadTemplate,
    hasHeader,
    importableFields,
    isParsing,
    moduleConfig.titles.fa,
    moduleId,
    mappedFieldKeys,
    mappedRequiredFieldKeys,
    mappingRows,
    requiredFields,
    saveCustomMapping,
    step,
    updateMappingRow,
    encoding,
  ]);

  const connectorClass = (leftStepIndex: number, rightStepIndex: number): string => {
    const threshold = Math.max(leftStepIndex, rightStepIndex);
    return step >= threshold ? "bg-leather-600" : "bg-gray-200";
  };
  const contentWrapperClass =
    step === 2
      ? "pt-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar"
      : "pt-3";

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="min(1040px, calc(100vw - 16px))"
      style={{ top: 8 }}
      destroyOnHidden
      closeIcon={<CloseOutlined className="text-base" />}
      title={<span className="text-xl font-black">ورود اطلاعات از فایل</span>}
      className="excel-import-wizard"
      styles={{
        body: {
          maxHeight: "calc(100vh - 34px)",
          padding: "10px 14px 14px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="border-b border-gray-200 pb-3">
          <div className="flex items-center gap-2 px-1 md:px-6" dir="ltr">
            {RENDER_STEPS.map((current, index) => {
              const status = step === current.index ? "active" : step > current.index ? "done" : "idle";
              const circleClass =
                status === "active" || status === "done"
                  ? "bg-leather-600 text-white"
                  : "bg-gray-100 text-gray-400";
              const labelClass =
                status === "active" || status === "done"
                  ? "text-leather-700"
                  : "text-gray-400";

              return (
                <React.Fragment key={current.index}>
                  <div className="flex flex-col items-center min-w-[74px]">
                    <div
                      className={`h-10 w-10 rounded-xl text-sm font-black flex items-center justify-center ${circleClass}`}
                    >
                      {(current.index + 1).toLocaleString("fa-IR")}
                    </div>
                    <div className={`mt-1.5 text-sm font-bold ${labelClass}`}>{current.title}</div>
                  </div>
                  {index < RENDER_STEPS.length - 1 && (
                    <div
                      className={`h-[3px] flex-1 rounded-full ${connectorClass(
                        current.index,
                        RENDER_STEPS[index + 1].index
                      )}`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className={contentWrapperClass}>{stepContent}</div>
      </div>

      <div className="border-t border-gray-200 pt-3 mt-3 flex items-center justify-center gap-2.5">
        {step > 0 && (
          <Button
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            disabled={isImporting}
            className="!h-10 px-6 text-sm rounded-xl border-2 border-gray-400 text-gray-700 bg-white"
          >
            قبلی
          </Button>
        )}
        <Button
          type="primary"
          loading={isImporting}
          disabled={isParsing}
          onClick={() => {
            void handleNext();
          }}
          className="!h-10 px-6 text-sm rounded-xl bg-leather-600 hover:!bg-leather-500"
        >
          {step === 2 ? "وارد کردن اطلاعات" : "بعدی"}
        </Button>
      </div>
      {isImporting && importProgress && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          در حال واردسازی ردیف {importProgress.current.toLocaleString("fa-IR")} از{" "}
          {importProgress.total.toLocaleString("fa-IR")}
        </div>
      )}
    </Modal>
  );
};

export default ExcelImportWizard;
