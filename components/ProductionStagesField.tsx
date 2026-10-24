import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Avatar, Popover, Button, Tooltip, Modal, Form, Input, message, Spin, Select, InputNumber, Space } from 'antd';
import { PlusOutlined, UserOutlined, DownOutlined, TeamOutlined, CopyOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined, PlayCircleOutlined, AuditOutlined, WarningOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import PersianDatePicker from './PersianDatePicker';
import SmartFieldRenderer from './SmartFieldRenderer';
import TaskHandoverModal, {
  type StageHandoverConfirm,
  type StageHandoverBundleOption,
  type StageHandoverGroup,
  type StageHandoverDeliveryRow,
  type StageHandoverTaskOption,
  type StageHandoverTrafficType,
} from './production/TaskHandoverModal';
import TaskHandoverFormsModal, {
  type StageHandoverFormListRow,
  type StageHandoverInventoryRow,
  type StageHandoverSummaryRow,
} from './production/TaskHandoverFormsModal';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { applyInventoryDeltas, syncMultipleProductsStock } from '../utils/inventoryTransactions';
import { applyProductionMoves, type ProductionMove } from '../utils/productionWorkflow';
import { CREATE_NEW_BUNDLE_VALUE, USE_SOURCE_BUNDLE_VALUE, hasTargetBundleSelection, isCreateNewBundleValue, isUseSourceBundleValue } from '../utils/productionBundles';
import { loadDestinationBundleOptions, type DestinationBundleOption } from '../utils/destinationBundleOptions';
import { MODULES } from '../moduleRegistry';
import { buildTaskStatusUpdatePayload } from '../utils/taskCompletion';
import { calculateUnitQuantity, getUnitQuantityConversion } from '../utils/unitQuantityConversion';
import { clearDurableDraft, readDurableDraft, writeDurableDraft } from '../utils/durableDraft';
import { normalizeStoragePublicUrl } from '../utils/storageUrls';
import { formatGroupedNumberInput, parseGroupedNumberInput } from '../utils/groupedNumberInput';
import { FieldType } from '../types';
import { formatProductionShelfLabel } from '../utils/productionShelfLabel';
import { getDeliveryMainQuantity, normalizeProductionDeliverySnapshot } from '../utils/productionDeliveryRows';

interface ProductionStagesFieldProps {
  recordId?: string;
  moduleId?: string;
  readOnly?: boolean;
  compact?: boolean;
  lazyLoad?: boolean;
  onlyLineId?: string | null;
  onQuantityChange?: (qty: number) => void;
  orderStatus?: string | null;
  draftStages?: any[];
  onDraftStagesChange?: (stages: any[]) => void | Promise<void>;
  draftStagesPersistedByParent?: boolean;
  showWageSummary?: boolean;
  focusedTaskId?: string | null;
  focusedTaskAction?: 'popover' | 'handover-forms' | null;
  onFocusedTaskHandled?: () => void;
}

type StageHandoverSide = 'giver' | 'receiver';

type StageAssignee = {
  id: string | null;
  type: 'user' | 'role' | null;
  label: string;
};

type StageHandoverContext = {
  taskId: string;
  orderId: string;
  lineId: string | null;
  sourceTaskId: string | null;
  sourceStageName: string;
  sourceShelfId: string | null;
  targetShelfId: string | null;
  giver: StageAssignee;
  receiver: StageAssignee;
  groups: StageHandoverGroup[];
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  previousTotalsByProduct: Record<string, number>;
  previousWasteByProduct: Record<string, number>;
  sourceTotalsByProduct: Record<string, number>;
  orderTotalsByProduct: Record<string, number>;
};

type StageHandoverForm = {
  id: string;
  direction?: StageHandoverTrafficType;
  sourceTaskId: string | null;
  destinationTaskId?: string | null;
  sourceStageName: string;
  sourceShelfId: string | null;
  targetShelfId: string | null;
  giver: StageAssignee;
  receiver: StageAssignee;
  groups: StageHandoverGroup[];
  wasteByProduct: Record<string, number>;
  giverConfirmation: StageHandoverConfirm;
  receiverConfirmation: StageHandoverConfirm;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type OpenHandoverOptions = {
  openFormId?: string | null;
  openEditor?: boolean;
  createNewForm?: boolean;
  sourceOverrideTask?: any | null;
};

const ProductionStagesField: React.FC<ProductionStagesFieldProps> = ({ recordId, moduleId, readOnly = false, compact = false, lazyLoad = false, onlyLineId = null, onQuantityChange, orderStatus, draftStages, onDraftStagesChange, draftStagesPersistedByParent = false, showWageSummary = false, focusedTaskId = null, focusedTaskAction = null, onFocusedTaskHandled }) => {
  const [lines, setLines] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [loading, setLoading] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [lineForm] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [draftLocal, setDraftLocal] = useState<any[]>(() => (Array.isArray(draftStages) ? draftStages : []));
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftForm] = Form.useForm();
  const [, setDraftToCreate] = useState<any | null>(null);
  const [editingDraft, setEditingDraft] = useState<any | null>(null);
  const [isReadyToLoad, setIsReadyToLoad] = useState(!lazyLoad);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isBom = moduleId === 'production_boms';
  const [currentUser, setCurrentUser] = useState<{ id: string | null; roleId: string | null; fullName: string }>({ id: null, roleId: null, fullName: 'کاربر' });
  const [handoverTask, setHandoverTask] = useState<any | null>(null);
  const [handoverOrderTitle, setHandoverOrderTitle] = useState<string | null>(null);
  const [handoverContext, setHandoverContext] = useState<StageHandoverContext | null>(null);
  const [handoverGroups, setHandoverGroups] = useState<StageHandoverGroup[]>([]);
  const [handoverForms, setHandoverForms] = useState<StageHandoverForm[]>([]);
  const [nextStageTotalsByProduct, setNextStageTotalsByProduct] = useState<Record<string, number>>({});
  const [nextStageSubTotalsByProduct, setNextStageSubTotalsByProduct] = useState<Record<string, number>>({});
  const [handoverStageInventoryRows, setHandoverStageInventoryRows] = useState<StageHandoverInventoryRow[]>([]);
  const [handoverBundleOptionsByProduct, setHandoverBundleOptionsByProduct] = useState<Record<string, StageHandoverBundleOption[]>>({});
  const [destinationBundleOptions, setDestinationBundleOptions] = useState<DestinationBundleOption[]>([]);
  const [handoverNextTask, setHandoverNextTask] = useState<any | null>(null);
  const [activeHandoverFormId, setActiveHandoverFormId] = useState<string | null>(null);
  const [handoverFormsModalOpen, setHandoverFormsModalOpen] = useState(false);
  const [handoverEditorOpen, setHandoverEditorOpen] = useState(false);
  useEffect(() => {
    if (!handoverEditorOpen) return;
    let active = true;
    void loadDestinationBundleOptions(supabase as any)
      .then((options) => { if (active) setDestinationBundleOptions(options); })
      .catch((error) => console.warn('Could not load destination bundles', error));
    return () => { active = false; };
  }, [handoverEditorOpen]);
  const [handoverLoading, setHandoverLoading] = useState(false);
  const [productionShelfOptions, setProductionShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [allShelfOptions, setAllShelfOptions] = useState<Array<{ label: string; value: string; warehouseName: string }>>([]);
  const [handoverTrafficType, setHandoverTrafficType] = useState<StageHandoverTrafficType>('incoming');
  const [handoverTrafficTypeEditable, setHandoverTrafficTypeEditable] = useState<boolean>(true);
  const [handoverSourceStageValue, setHandoverSourceStageValue] = useState<string | null>(null);
  const [handoverSourceShelfId, setHandoverSourceShelfId] = useState<string | null>(null);
  const [handoverDestinationStageId, setHandoverDestinationStageId] = useState<string | null>(null);
  const [expandedStageBars, setExpandedStageBars] = useState<Record<string, boolean>>({});
  const [lineQuantityDrafts, setLineQuantityDrafts] = useState<Record<string, number>>({});
  const [savingLineQuantityId, setSavingLineQuantityId] = useState<string | null>(null);
  const hasFetchedLinesRef = useRef(false);
  const handledFocusedTaskRef = useRef<string | null>(null);

  const handoverDraftKey = useMemo(() => {
    if (!recordId || !handoverTask?.id || !activeHandoverFormId) return null;
    return `production-stage-handover:${recordId}:${String(handoverTask.id)}:${activeHandoverFormId}`;
  }, [activeHandoverFormId, handoverTask?.id, recordId]);

  // تغییرات ردیف‌ها همان لحظه در دستگاه کاربر نوشته می‌شوند تا قطع اینترنت یا refresh
  // باعث از بین رفتن مقادیر ثبت‌نشده نشود.
  useEffect(() => {
    if (!handoverEditorOpen || !handoverDraftKey) return;
    writeDurableDraft(handoverDraftKey, {
      groups: handoverGroups,
      trafficType: handoverTrafficType,
      sourceStageValue: handoverSourceStageValue,
      sourceShelfId: handoverSourceShelfId,
      destinationStageId: handoverDestinationStageId,
    });
  }, [handoverDestinationStageId, handoverDraftKey, handoverEditorOpen, handoverGroups, handoverSourceShelfId, handoverSourceStageValue, handoverTrafficType]);

  useEffect(() => {
    if (!handoverEditorOpen || !handoverDraftKey) return;
    const draft = readDurableDraft<{
      groups?: StageHandoverGroup[];
      trafficType?: StageHandoverTrafficType;
      sourceStageValue?: string | null;
      sourceShelfId?: string | null;
      destinationStageId?: string | null;
    }>(handoverDraftKey);
    if (!draft?.groups?.length) return;
    setHandoverGroups(draft.groups);
    if (draft.trafficType) setHandoverTrafficType(draft.trafficType);
    setHandoverSourceStageValue(draft.sourceStageValue || null);
    setHandoverSourceShelfId(draft.sourceShelfId || null);
    setHandoverDestinationStageId(draft.destinationStageId || null);
  // فقط هنگام بازشدن فرم/تغییر شناسه بازیابی شود، نه بعد از هر ویرایش.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoverDraftKey, handoverEditorOpen]);

  const onQuantityChangeRef = useRef<((qty: number) => void) | undefined>();

  useEffect(() => {
    onQuantityChangeRef.current = onQuantityChange;
  }, [onQuantityChange]);

  const normalizedDraftStages = useMemo(
    () => (Array.isArray(draftStages) ? draftStages : []),
    [draftStages]
  );

  useEffect(() => {
    setDraftLocal((prev) => (prev === normalizedDraftStages ? prev : normalizedDraftStages));
  }, [normalizedDraftStages]);

  useEffect(() => {
    if (!lazyLoad) {
      setIsReadyToLoad(true);
      return;
    }
    setIsReadyToLoad(false);
  }, [lazyLoad, recordId, moduleId]);

  useEffect(() => {
    hasFetchedLinesRef.current = false;
  }, [recordId, isBom]);

  useEffect(() => {
    if (!lazyLoad || isReadyToLoad) return;
    const target = containerRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setIsReadyToLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [lazyLoad, isReadyToLoad]);

  const toNumber = useCallback((value: any) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);
  const isLineCreationLocked = false;

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const productionModule = MODULES['production_orders'] as any;
    const gridBlock = (productionModule?.blocks || []).find((block: any) => block?.id === 'grid_materials');
    const categories = gridBlock?.gridConfig?.categories || [];
    categories.forEach((category: any) => {
      const key = String(category?.value || '').trim();
      if (!key) return;
      map.set(key, String(category?.label || key));
    });
    return map;
  }, []);

  const resolveCategoryLabel = useCallback((rawCategory: any) => {
    const raw = String(rawCategory || '').trim();
    if (!raw) return 'مواد اولیه';
    return categoryLabelMap.get(raw) || raw;
  }, [categoryLabelMap]);

  const buildHandoverRowKey = useCallback(
    () => `handover_row_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  const normalizeHandoverDeliveryRow = useCallback((group: StageHandoverGroup, rawRow?: any): StageHandoverDeliveryRow => {
    const firstPiece = Array.isArray(group?.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
    const firstDeliveryRow = Array.isArray(group?.deliveryRows) && group.deliveryRows.length > 0 ? group.deliveryRows[0] : null;
    const length = Math.max(0, toNumber(rawRow?.length ?? firstPiece?.length ?? 0));
    const width = Math.max(0, toNumber(rawRow?.width ?? firstPiece?.width ?? 0));
    const quantity = Math.max(0, toNumber(rawRow?.quantity ?? firstPiece?.quantity ?? 1));
    return {
      key: String(rawRow?.key || buildHandoverRowKey()),
      pieceKey: rawRow?.pieceKey ? String(rawRow.pieceKey) : undefined,
      name: String(rawRow?.name ?? firstPiece?.name ?? ''),
      length,
      width,
      quantity,
      mainUnit: String(rawRow?.mainUnit ?? firstPiece?.mainUnit ?? ''),
      subUnit: String(rawRow?.subUnit ?? firstPiece?.subUnit ?? ''),
      mainQuantity: getDeliveryMainQuantity({ length, width, quantity, ...rawRow }),
      subQuantity: Math.max(0, toNumber(rawRow?.subQuantity ?? 0)),
      deliveredQty: getDeliveryMainQuantity({ length, width, quantity, ...rawRow }),
      sourceBundleId: rawRow?.sourceBundleId || rawRow?.source_bundle_id || rawRow?.bundle_id || firstDeliveryRow?.sourceBundleId || (firstDeliveryRow as any)?.source_bundle_id || (firstDeliveryRow as any)?.bundle_id || group?.sourceBundleId || (group as any)?.source_bundle_id || (group as any)?.bundle_id || null,
      sourceBundleLabel: rawRow?.sourceBundleLabel || rawRow?.source_bundle_label || null,
      targetBundleId: rawRow
        ? (rawRow?.targetBundleId || rawRow?.target_bundle_id || USE_SOURCE_BUNDLE_VALUE)
        : CREATE_NEW_BUNDLE_VALUE,
      targetBundleLabel: rawRow?.targetBundleLabel || rawRow?.target_bundle_label || null,
      sourceShelfId: rawRow?.sourceShelfId || rawRow?.source_shelf_id || firstDeliveryRow?.sourceShelfId || (firstDeliveryRow as any)?.source_shelf_id || group?.sourceShelfId || (group as any)?.source_shelf_id || null,
      giverNote: String(rawRow?.giverNote ?? rawRow?.giver_note ?? ''),
    };
  }, [buildHandoverRowKey, toNumber]);

  const sumDeliveredRows = useCallback((rows: StageHandoverDeliveryRow[]) => {
    return rows.reduce(
      (sum, row) => sum + Math.max(0, toNumber((row as any)?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity)))),
      0
    );
  }, [toNumber]);

  const recalcHandoverGroup = useCallback((group: StageHandoverGroup): StageHandoverGroup => {
    const pieces = Array.isArray(group?.pieces) ? group.pieces : [];
    const orderPieces = Array.isArray(group?.orderPieces) ? group.orderPieces : [];
    const deliveryRows = Array.isArray(group?.deliveryRows)
      ? group.deliveryRows.map((row) => normalizeHandoverDeliveryRow(group, row))
      : [];
    const totalSourceQty = pieces.reduce((sum, row) => sum + Math.max(0, toNumber(row?.sourceQty)), 0);
    const totalOrderQty = orderPieces.reduce((sum, row) => sum + Math.max(0, toNumber(row?.sourceQty)), 0);
    const fallbackTotal = pieces.reduce(
      (sum, row) => sum + Math.max(0, toNumber((row as any)?.handoverQty ?? row?.sourceQty)),
      0
    );
    const totalHandoverQty = deliveryRows.length > 0 ? sumDeliveredRows(deliveryRows) : fallbackTotal;
    return {
      ...group,
      pieces,
      orderPieces,
      deliveryRows,
      totalSourceQty,
      totalOrderQty,
      totalHandoverQty,
    };
  }, [normalizeHandoverDeliveryRow, sumDeliveredRows, toNumber]);

  const parseRecurrenceInfo = useCallback((value: any) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, []);

  const getHandoverFromTask = useCallback((task: any) => {
    const recurrence = parseRecurrenceInfo(task?.recurrence_info);
    const handover = recurrence?.production_handover;
    if (!handover || typeof handover !== 'object') return null;
    return handover as any;
  }, [parseRecurrenceInfo]);

  const assigneeLabelFromIds = useCallback((assigneeId: string | null | undefined, assigneeType: string | null | undefined) => {
    if (!assigneeId) return 'تعیین نشده';
    if (assigneeType === 'role') {
      const role = assignees.roles.find((item: any) => String(item?.id) === String(assigneeId));
      return role?.title || 'تعیین نشده';
    }
    const user = assignees.users.find((item: any) => String(item?.id) === String(assigneeId));
    return user?.full_name || 'تعیین نشده';
  }, [assignees.roles, assignees.users]);

  const fetchAssignees = async () => {
    try {
      const { data: users } = await supabase.from('profiles').select('id, full_name');
      const { data: roles } = await supabase.from('org_roles').select('id, title');
      setAssignees({ users: users || [], roles: roles || [] });
    } catch (e) {
      console.error('Error fetching assignees', e);
    }
  };

  const fetchCurrentUser = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      if (!userId) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role_id')
        .eq('id', userId)
        .maybeSingle();
      setCurrentUser({ id: userId, roleId: profile?.role_id ? String(profile.role_id) : null, fullName: profile?.full_name || 'کاربر' });
    } catch (err) {
      console.warn('Could not fetch current user for handover', err);
    }
  }, []);

  const fetchProductionShelves = useCallback(async () => {
    try {
      const { data: shelves } = await supabase
        .from('shelves')
        .select('id, shelf_number, name, warehouses(name)')
        .limit(500);
      const allOptions = (shelves || []).map((row: any) => ({
        value: String(row.id),
        label: formatProductionShelfLabel(row),
        warehouseName: String(row?.warehouses?.name || ''),
      }));
      setAllShelfOptions(allOptions);
      const filtered = allOptions.filter((row: any) => {
        const warehouseName = String(row?.warehouseName || '');
        return warehouseName.includes('تولید') || /production/i.test(warehouseName);
      });
      const source = filtered.length ? filtered : allOptions;
      setProductionShelfOptions(source.map(({ value, label }) => ({ value, label })));
    } catch (err) {
      console.warn('Could not fetch production shelves', err);
      setAllShelfOptions([]);
      setProductionShelfOptions([]);
    }
  }, []);

  const fetchLines = async () => {
    if (!recordId || isBom) return;
    try {
      const { data, error } = await supabase
        .from('production_lines')
        .select('*')
        .eq('production_order_id', recordId)
        .order('line_no', { ascending: true });
      if (error) throw error;
      setLines(data || []);
      hasFetchedLinesRef.current = true;
    } catch (error) {
      console.error('Error fetching lines:', error);
    }
  };

  const fetchTasks = async () => {
    if (!recordId || isBom) return [] as any[];
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(full_name, avatar_url),
          assigned_role:org_roles(title)
        `)
        .eq('related_production_order', recordId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      const next = data || [];
      setTasks(next);
      return next;
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      return [] as any[];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isReadyToLoad) return;
    fetchLines();
    fetchTasks();
    fetchAssignees();
    fetchCurrentUser();
    fetchProductionShelves();
  }, [recordId, isBom, isReadyToLoad, fetchCurrentUser, fetchProductionShelves]);

  const syncOrderQuantity = useCallback(async (nextLines: any[]) => {
    if (!recordId || isBom) return;
    const nextTotal = nextLines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0), 0);
    onQuantityChangeRef.current?.(nextTotal);
    const { error } = await supabase
      .from('production_orders')
      .update({ quantity: nextTotal })
      .eq('id', recordId);
    if (error) {
      message.error(`خطا در بروزرسانی تعداد تولید: ${error.message}`);
    }
  }, [recordId]);

  useEffect(() => {
    if (!recordId || isBom || !hasFetchedLinesRef.current) return;
    syncOrderQuantity(lines);
  }, [lines, recordId, syncOrderQuantity, isBom]);

  const tasksByLine = useMemo(() => {
    const map = new Map<string, any[]>();
    lines.forEach(line => map.set(String(line.id), []));
    tasks.forEach(task => {
      const lineId = task.production_line_id ? String(task.production_line_id) : null;
      if (lineId && map.has(lineId)) {
        map.get(lineId)!.push(task);
      }
    });
    return map;
  }, [lines, tasks]);

  const getLineTaskChain = useCallback((lineId: string | null | undefined, sourceTasks?: any[]) => {
    const availableTasks = sourceTasks || tasks;
    const scoped = lineId
      ? availableTasks.filter((item: any) => String(item?.production_line_id || '') === String(lineId))
      : [];
    // برخی سفارش‌های قدیمی task را بدون production_line_id ذخیره کرده‌اند.
    // در این حالت، مراحل همین سفارش را به‌عنوان زنجیرهٔ fallback برمی‌گردانیم
    // تا فهرست «مرحله مقصد» خالی نمایش داده نشود.
    const chain = scoped.length > 0
      ? scoped
      : availableTasks.filter((item: any) => (
          !recordId || String(item?.related_production_order || '') === String(recordId)
        ));
    return chain
      .slice()
      .sort((a: any, b: any) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  }, [recordId, tasks]);

  const toGroupTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const anyGroup = group as any;
      const pickedPiece = (Array.isArray(anyGroup?.pieces) ? anyGroup.pieces : []).find(
        (piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id
      );
      const productId =
        anyGroup?.selectedProductId
        || anyGroup?.selected_product_id
        || pickedPiece?.selectedProductId
        || pickedPiece?.selected_product_id
        || pickedPiece?.product_id
        || null;
      const normalizedProductId = productId ? String(productId) : '';
      if (!normalizedProductId) return;
      const deliveryRows = Array.isArray(anyGroup?.deliveryRows) ? anyGroup.deliveryRows : [];
      const qty = deliveryRows.length > 0
        ? deliveryRows.reduce(
            (sum: number, row: any) => sum + Math.max(0, toNumber(row?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity)))),
            0
          )
        : (Array.isArray(anyGroup?.pieces) ? anyGroup.pieces : []).reduce(
            (sum: number, piece: any) => sum + toNumber(piece?.handoverQty ?? piece?.handover_qty ?? piece?.sourceQty ?? piece?.source_qty ?? 0),
            0
          );
      totals[normalizedProductId] = (totals[normalizedProductId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  // موجودی فیزیکی با کلید کالا + بسته جابه‌جا می‌شود؛ جمع‌زدن صرفاً بر اساس کالا
  // در حالتی که یک کالا از چند بسته آمده باشد، رهگیری را از بین می‌برد.
  const toGroupBundleTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals = new Map<string, { productId: string; bundleId: string | null; shelfId: string | null; quantity: number; unit: string | null }>();
    groups.forEach((group: any) => {
      const pickedPiece = (Array.isArray(group?.pieces) ? group.pieces : []).find(
        (piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id
      );
      const productId = String(
        group?.selectedProductId || group?.selected_product_id || pickedPiece?.selectedProductId || pickedPiece?.selected_product_id || pickedPiece?.product_id || ''
      ).trim();
      if (!productId) return;
      const rows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
      const sourceRows = rows.length > 0 ? rows : [{
        mainQuantity: (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
          (sum: number, piece: any) => sum + toNumber(piece?.handoverQty ?? piece?.handover_qty ?? piece?.sourceQty ?? piece?.source_qty ?? 0),
          0
        ),
        sourceBundleId: group?.sourceBundleId || group?.source_bundle_id || group?.bundle_id || null,
        sourceShelfId: group?.sourceShelfId || group?.source_shelf_id || null,
        mainUnit: pickedPiece?.mainUnit || pickedPiece?.main_unit || null,
      }];
      sourceRows.forEach((row: any) => {
        const quantity = Math.max(0, toNumber(row?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity))));
        if (!quantity) return;
        const bundleId = row?.sourceBundleId || row?.source_bundle_id || row?.bundle_id || group?.sourceBundleId || group?.source_bundle_id || group?.bundle_id || null;
        const normalizedBundleId = bundleId ? String(bundleId) : null;
        const key = `${productId}::${normalizedBundleId || '__unbundled__'}`;
        const current = totals.get(key);
        totals.set(key, {
          productId,
          bundleId: normalizedBundleId,
          shelfId: row?.sourceShelfId || row?.source_shelf_id || group?.sourceShelfId || group?.source_shelf_id || null,
          quantity: (current?.quantity || 0) + quantity,
          unit: current?.unit || String(row?.mainUnit || row?.main_unit || pickedPiece?.mainUnit || pickedPiece?.main_unit || '').trim() || null,
        });
      });
    });
    return totals;
  }, [toNumber]);

  const toGroupSubTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const anyGroup = group as any;
      const pickedPiece = (Array.isArray(anyGroup?.pieces) ? anyGroup.pieces : []).find(
        (piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id
      );
      const productId =
        anyGroup?.selectedProductId
        || anyGroup?.selected_product_id
        || pickedPiece?.selectedProductId
        || pickedPiece?.selected_product_id
        || pickedPiece?.product_id
        || null;
      const normalizedProductId = productId ? String(productId) : '';
      if (!normalizedProductId) return;

      const deliveryRows = Array.isArray(anyGroup?.deliveryRows) ? anyGroup.deliveryRows : [];
      const qty = deliveryRows.length > 0
        ? deliveryRows.reduce((sum: number, row: any) => {
            const quantity = Math.max(0, toNumber(row?.quantity || 0));
            const base = toNumber(row?.subQty ?? row?.sub_qty);
            const usage = toNumber(row?.subUsage ?? row?.sub_usage ?? row?.qty_sub);
            const resolved = base > 0 ? base : (usage > 0 ? usage * (quantity || 1) : 0);
            return sum + Math.max(0, resolved);
          }, 0)
        : (Array.isArray(anyGroup?.pieces) ? anyGroup.pieces : []).reduce(
            (sum: number, piece: any) => sum + Math.max(0, toNumber(piece?.subQty ?? piece?.sub_qty ?? piece?.subUsage ?? piece?.sub_usage ?? piece?.qty_sub ?? 0)),
            0
          );
      totals[normalizedProductId] = (totals[normalizedProductId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const toSourceTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const qty = (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
        (sum: number, piece: any) => sum + Math.max(0, toNumber(piece?.sourceQty)),
        0
      );
      totals[productId] = (totals[productId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const toOrderTotals = useCallback((groups: StageHandoverGroup[]) => {
    const totals: Record<string, number> = {};
    groups.forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const qty = (Array.isArray(group?.orderPieces) ? group.orderPieces : []).reduce(
        (sum: number, piece: any) => sum + Math.max(0, toNumber(piece?.sourceQty)),
        0
      );
      totals[productId] = (totals[productId] || 0) + qty;
    });
    return totals;
  }, [toNumber]);

  const buildHandoverFormId = useCallback(
    () => `handover_form_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    []
  );

  const buildPiecesFromOrderRow = useCallback((row: any, rowIndex: number, orderQty: number, useDeliveredQty: boolean) => {
    const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
    return rowPieces.map((piece: any, pieceIndex: number) => {
      const hasDelivered = Object.prototype.hasOwnProperty.call(piece || {}, 'delivered_qty');
      const deliveredQty = hasDelivered ? toNumber(piece?.delivered_qty) : null;
      const finalUsage = toNumber(piece?.final_usage);
      const totalUsage = toNumber(piece?.total_usage);
      const fallback = totalUsage > 0 ? totalUsage : (finalUsage > 0 ? finalUsage * orderQty : 0);
      const sourceQty = useDeliveredQty && deliveredQty !== null ? deliveredQty : fallback;
      return {
        key: `${String(piece?.key || 'piece')}_${rowIndex}_${pieceIndex}`,
        name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
        length: toNumber(piece?.length),
        width: toNumber(piece?.width),
        quantity: toNumber(piece?.quantity),
        totalQuantity: toNumber(piece?.quantity) * orderQty,
        mainUnit: String(piece?.main_unit || row?.main_unit || ''),
        subUnit: String(piece?.sub_unit || ''),
        subUsage: toNumber(piece?.qty_sub),
        sourceQty,
        handoverQty: sourceQty,
      } as any;
    });
  }, [toNumber]);

  const buildGroupsFromOrder = useCallback((order: any): StageHandoverGroup[] => {
    const rows = Array.isArray(order?.grid_materials) ? order.grid_materials : [];
    // در سفارش تولید، مقدار واقعی برنامه از مجموع تعداد خطوط تولید به‌دست می‌آید.
    const lineQuantity = lines.reduce((sum, line: any) => sum + Math.max(0, toNumber(line?.quantity)), 0);
    const orderQty = Math.max(1, lineQuantity || toNumber(order?.quantity));
    return rows.map((row: any, rowIndex: number) => {
      const header = row?.header || {};
      const rowPieces = Array.isArray(row?.pieces) && row.pieces.length > 0 ? row.pieces : [row];
      const selectedPiece = rowPieces.find((piece: any) => (
        piece?.selected_product_id || piece?.product_id || piece?.selected_product_name || piece?.product_name
      )) || null;
      const selectedProductId =
        header?.selected_product_id
        || row?.selected_product_id
        || row?.product_id
        || selectedPiece?.selected_product_id
        || selectedPiece?.product_id
        || null;
      const selectedProductName =
        header?.selected_product_name
        || row?.selected_product_name
        || row?.product_name
        || selectedPiece?.selected_product_name
        || selectedPiece?.product_name
        || '-';
      const selectedProductCode =
        header?.selected_product_code
        || row?.selected_product_code
        || row?.product_code
        || selectedPiece?.selected_product_code
        || selectedPiece?.product_code
        || '';
      const categoryLabel = resolveCategoryLabel(header?.category_label || header?.category);
      const pieces = buildPiecesFromOrderRow(row, rowIndex, orderQty, true);
      const orderPieces = buildPiecesFromOrderRow(row, rowIndex, orderQty, false);
      const deliveryRows = pieces.map((piece: any) => normalizeHandoverDeliveryRow(
        { pieces } as StageHandoverGroup,
        {
          pieceKey: piece.key,
          name: piece.name,
          length: piece.length,
          width: piece.width,
          quantity: piece.quantity,
          mainUnit: piece.mainUnit,
          subUnit: piece.subUnit,
          deliveredQty: piece.sourceQty,
        }
      ));

      return recalcHandoverGroup({
        key: `${String(row?.key || 'group')}_${rowIndex}`,
        rowIndex,
        categoryLabel: String(categoryLabel || 'مواد اولیه'),
        selectedProductId: selectedProductId ? String(selectedProductId) : null,
        selectedProductName: String(selectedProductName || '-'),
        selectedProductCode: String(selectedProductCode || ''),
        sourceShelfId: null,
        sourceBundleId: row?.source_bundle_id || row?.bundle_id ? String(row?.source_bundle_id || row?.bundle_id) : null,
        targetShelfId: null,
        pieces,
        orderPieces,
        deliveryRows,
        totalSourceQty: 0,
        totalOrderQty: 0,
        totalHandoverQty: 0,
        collapsed: rowIndex !== 0,
        isConfirmed: false,
      } as StageHandoverGroup);
    });
  }, [buildPiecesFromOrderRow, lines, normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const buildGroupsFromPreviousStage = useCallback((groups: any[]) => {
    const sourceGroups = Array.isArray(groups) ? groups : [];
    return sourceGroups.map((group: any, groupIndex: number) => {
      const piecesRaw = Array.isArray(group?.pieces) ? group.pieces : [];
      const selectedPiece = piecesRaw.find((piece: any) => (
        piece?.selectedProductId || piece?.selected_product_id || piece?.product_id || piece?.selectedProductName || piece?.selected_product_name
      )) || null;
      const pieces = piecesRaw.map((piece: any, pieceIndex: number) => {
        const sourceQty = toNumber(piece?.handoverQty ?? piece?.sourceQty ?? piece?.totalUsage ?? 0);
        return {
          key: String(piece?.key || `${groupIndex}_${pieceIndex}`),
          name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
          length: toNumber(piece?.length),
          width: toNumber(piece?.width),
          quantity: toNumber(piece?.quantity),
          totalQuantity: toNumber(piece?.totalQuantity),
          mainUnit: String(piece?.mainUnit || piece?.main_unit || ''),
          subUnit: String(piece?.subUnit || piece?.sub_unit || ''),
          subUsage: toNumber(piece?.subUsage ?? piece?.sub_usage ?? 0),
          sourceQty,
          handoverQty: sourceQty,
        };
      });
      const savedDeliveryRows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
      const deliveryRows = savedDeliveryRows.length > 0
        ? savedDeliveryRows.map((row: any) => normalizeHandoverDeliveryRow({ pieces } as StageHandoverGroup, row))
        : pieces.map((piece: any) => normalizeHandoverDeliveryRow(
            { pieces } as StageHandoverGroup,
            {
              pieceKey: piece.key,
              name: piece.name,
              length: piece.length,
              width: piece.width,
              quantity: piece.quantity,
              mainUnit: piece.mainUnit,
              subUnit: piece.subUnit,
              deliveredQty: toNumber(piece?.handoverQty ?? piece?.sourceQty),
            }
          ));
      return recalcHandoverGroup({
        key: String(group?.key || `group_${groupIndex}`),
        rowIndex: Number(group?.rowIndex ?? groupIndex),
        categoryLabel: resolveCategoryLabel(group?.categoryLabel || group?.category_label),
        selectedProductId: (group?.selectedProductId || group?.selected_product_id || selectedPiece?.selectedProductId || selectedPiece?.selected_product_id || selectedPiece?.product_id)
          ? String(group?.selectedProductId || group?.selected_product_id || selectedPiece?.selectedProductId || selectedPiece?.selected_product_id || selectedPiece?.product_id)
          : null,
        selectedProductName: String(group?.selectedProductName || group?.selected_product_name || selectedPiece?.selectedProductName || selectedPiece?.selected_product_name || selectedPiece?.product_name || '-'),
        selectedProductCode: String(group?.selectedProductCode || group?.selected_product_code || selectedPiece?.selectedProductCode || selectedPiece?.selected_product_code || selectedPiece?.product_code || ''),
        sourceShelfId: (group?.sourceShelfId || group?.source_shelf_id)
          ? String(group?.sourceShelfId || group?.source_shelf_id)
          : null,
        sourceBundleId: (group?.sourceBundleId || group?.source_bundle_id || group?.bundle_id)
          ? String(group?.sourceBundleId || group?.source_bundle_id || group?.bundle_id)
          : null,
        targetShelfId: (group?.targetShelfId || group?.target_shelf_id)
          ? String(group?.targetShelfId || group?.target_shelf_id)
          : null,
        pieces,
        orderPieces: Array.isArray(group?.orderPieces) ? group.orderPieces : [],
        deliveryRows,
        totalSourceQty: 0,
        totalOrderQty: 0,
        totalHandoverQty: 0,
        collapsed: typeof group?.collapsed === 'boolean' ? group.collapsed : groupIndex !== 0,
        isConfirmed: group?.isConfirmed === true,
      } as StageHandoverGroup);
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const mergeSavedGroups = useCallback((baseGroups: StageHandoverGroup[], savedGroups: any[]) => {
    const savedMap = new Map<string, any>((Array.isArray(savedGroups) ? savedGroups : []).map((group: any) => [String(group?.key || ''), group]));
    return baseGroups.map((group) => {
      const savedGroup = savedMap.get(String(group.key));
      if (!savedGroup) return recalcHandoverGroup(group);
      const savedSourcePieces = Array.isArray(savedGroup?.pieces) ? savedGroup.pieces : [];
      const savedPieces = new Map<string, any>(savedSourcePieces.map((piece: any) => [String(piece?.key || ''), piece]));
      const pieces = savedSourcePieces.length > 0 ? savedSourcePieces.map((savedPiece: any, pieceIndex: number) => ({
        ...savedPiece,
        key: String(savedPiece?.key || `${String(group.key)}_source_${pieceIndex}`),
        sourceQty: Math.max(0, toNumber(savedPiece?.sourceQty ?? savedPiece?.source_qty ?? savedPiece?.handoverQty ?? savedPiece?.deliveredQty)),
        handoverQty: Math.max(0, toNumber(savedPiece?.handoverQty ?? savedPiece?.sourceQty ?? savedPiece?.source_qty ?? savedPiece?.deliveredQty)),
      })) : group.pieces.map((piece: any) => {
        const savedPiece = savedPieces.get(String(piece.key));
        if (!savedPiece) return piece;
        return {
          ...piece,
          sourceQty: Math.max(0, toNumber(savedPiece?.sourceQty ?? savedPiece?.source_qty ?? piece.sourceQty)),
          handoverQty: Math.max(0, toNumber(savedPiece?.handoverQty)),
        };
      });

      let deliveryRows = Array.isArray(savedGroup?.deliveryRows)
        ? savedGroup.deliveryRows.map((row: any) => normalizeHandoverDeliveryRow(group, row))
        : [];
      if (!deliveryRows.length) {
        deliveryRows = pieces.map((piece: any) => {
          const savedPiece = savedPieces.get(String(piece.key));
          return normalizeHandoverDeliveryRow(group, {
            pieceKey: piece.key,
            name: piece.name,
            length: piece.length,
            width: piece.width,
            quantity: piece.quantity,
            mainUnit: piece.mainUnit,
            subUnit: piece.subUnit,
            deliveredQty: toNumber(savedPiece?.handoverQty ?? piece?.sourceQty),
          });
        });
      }

      return recalcHandoverGroup({
        ...group,
        categoryLabel: resolveCategoryLabel(savedGroup?.categoryLabel || group.categoryLabel),
        sourceBundleId: savedGroup?.sourceBundleId || savedGroup?.source_bundle_id || savedGroup?.bundle_id || group.sourceBundleId || null,
        targetShelfId: savedGroup?.targetShelfId ? String(savedGroup.targetShelfId) : group.targetShelfId,
        pieces,
        deliveryRows,
        collapsed: typeof savedGroup?.collapsed === 'boolean' ? savedGroup.collapsed : group.collapsed,
        isConfirmed: savedGroup?.isConfirmed === true,
      });
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup, resolveCategoryLabel, toNumber]);

  const loadStageInventoryRows = useCallback(async (
    targetShelfId: string | null,
    groups: StageHandoverGroup[]
  ) => {
    const productIds = Array.from(
      new Set(
        (Array.isArray(groups) ? groups : [])
          .map((group) => String(group?.selectedProductId || '').trim())
          .filter(Boolean)
      )
    );

    // بسته‌ها مستقل از قفسهٔ مرحله انتخاب می‌شوند؛ قفسهٔ واقعی هر بسته فقط
    // برای ثبت گردش موجودی از روی همین ردیف‌ها استفاده خواهد شد.
    const bundleOptions: Record<string, StageHandoverBundleOption[]> = {};
    if (productIds.length > 0) {
      const { data: bundleRows } = await supabase
        .from('product_inventory')
        .select('product_id, shelf_id, stock, bundle_id, product_bundles:bundle_id(bundle_number)')
        .in('product_id', productIds)
        .gt('stock', 0);
      (bundleRows || []).forEach((row: any) => {
        const productId = String(row?.product_id || '').trim();
        const bundleId = String(row?.bundle_id || '').trim();
        if (!productId || !bundleId) return;
        const shelfId = row?.shelf_id ? String(row.shelf_id) : null;
        const shelfLabel = shelfId
          ? (allShelfOptions.find((item) => String(item.value) === shelfId)?.label || shelfId)
          : 'قفسه تعیین نشده';
        const bundleNumber = String(row?.product_bundles?.bundle_number || bundleId);
        const option: StageHandoverBundleOption = {
          value: bundleId,
          label: `${bundleNumber} — ${shelfLabel} (موجودی: ${toNumber(row?.stock).toLocaleString('en-US')})`,
          shelfId,
          stock: toNumber(row?.stock),
        };
        const current = bundleOptions[productId] || [];
        if (!current.some((item) => String(item.value) === bundleId && String(item.shelfId || '') === String(shelfId || ''))) {
          current.push(option);
          bundleOptions[productId] = current;
        }
      });
    }
    setHandoverBundleOptionsByProduct(bundleOptions);

    if (!targetShelfId) {
      setHandoverStageInventoryRows([]);
      return;
    }
    if (!productIds.length) {
      setHandoverStageInventoryRows([]);
      return;
    }

    const stockByProduct = new Map<string, { mainQty: number; subQty: number }>();

    const { data: inventorySourceRows, error: inventoryError } = await supabase
      .from('product_inventory')
      .select('product_id, stock')
      .eq('shelf_id', targetShelfId)
      .in('product_id', productIds);

    if (!inventoryError) {
      (inventorySourceRows || []).forEach((row: any) => {
        const productId = String(row?.product_id || '').trim();
        if (!productId) return;
        stockByProduct.set(productId, {
          mainQty: toNumber(row?.stock),
          subQty: 0,
        });
      });
    } else {
      const inventoryErrorText = [
        inventoryError?.message,
        inventoryError?.details,
        inventoryError?.hint,
      ].filter(Boolean).join(' ');
      const hasLegacyRelationIssue =
        /shelf_products/i.test(inventoryErrorText)
        || (/product_inventory/i.test(inventoryErrorText) && /does not exist/i.test(inventoryErrorText));

      if (!hasLegacyRelationIssue) {
        throw inventoryError;
      }

      const { data: transferRows, error: transferError } = await supabase
        .from('stock_transfers')
        .select('product_id, delivered_qty, required_qty, from_shelf_id, to_shelf_id')
        .in('product_id', productIds)
        .or(`from_shelf_id.eq.${targetShelfId},to_shelf_id.eq.${targetShelfId}`);
      if (transferError) throw transferError;

      (transferRows || []).forEach((row: any) => {
        const productId = String(row?.product_id || '').trim();
        if (!productId) return;
        const qty = Math.max(0, toNumber(row?.delivered_qty || row?.required_qty));
        if (!qty) return;

        const fromShelfId = String(row?.from_shelf_id || '').trim();
        const toShelfId = String(row?.to_shelf_id || '').trim();
        const prev = stockByProduct.get(productId) || { mainQty: 0, subQty: 0 };
        const nextMain = prev.mainQty + (toShelfId === targetShelfId ? qty : 0) - (fromShelfId === targetShelfId ? qty : 0);
        stockByProduct.set(productId, {
          mainQty: nextMain,
          subQty: prev.subQty,
        });
      });
    }

    const metaByProduct = new Map<string, { name: string; code: string; unit: string; subUnit: string }>();
    (Array.isArray(groups) ? groups : []).forEach((group) => {
      const productId = String(group?.selectedProductId || '').trim();
      if (!productId || metaByProduct.has(productId)) return;
      const firstPiece = Array.isArray(group?.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
      metaByProduct.set(productId, {
        name: String(group?.selectedProductName || '-'),
        code: String(group?.selectedProductCode || ''),
        unit: String(firstPiece?.mainUnit || ''),
        subUnit: String(firstPiece?.subUnit || ''),
      });
    });

    const inventoryRows: StageHandoverInventoryRow[] = productIds.map((productId) => {
      const stock = stockByProduct.get(productId) || { mainQty: 0, subQty: 0 };
      const meta = metaByProduct.get(productId) || { name: '-', code: '', unit: '', subUnit: '' };
      return {
        productId,
        productName: meta.name,
        productCode: meta.code,
        unit: meta.unit,
        subUnit: meta.subUnit,
        mainQty: Math.max(0, toNumber(stock.mainQty)),
        subQty: Math.max(0, toNumber(stock.subQty)),
      };
    });

    setHandoverStageInventoryRows(inventoryRows);
  }, [allShelfOptions, toNumber]);

  const openTaskHandoverModal = useCallback(async (task: any, providedTasks?: any[]) => {
    if (!task?.id || !recordId || isBom) return;
    try {
      setHandoverLoading(true);
      if (!productionShelfOptions.length) await fetchProductionShelves();
      if (!assignees.users.length && !assignees.roles.length) await fetchAssignees();

      const [{ data: latestTask }, { data: order }] = await Promise.all([
        supabase.from('tasks').select('*').eq('id', task.id).maybeSingle(),
        supabase
          .from('production_orders')
          .select('id, name, system_code, quantity, assignee_id, assignee_type, grid_materials, production_shelf_id')
          .eq('id', recordId)
          .maybeSingle(),
      ]);
      const currentTask = latestTask || task;
      const lineId = currentTask?.production_line_id ? String(currentTask.production_line_id) : null;
      const allTasks = (providedTasks && providedTasks.length > 0) ? providedTasks : tasks;
      const lineTasks = getLineTaskChain(lineId, allTasks);
      const currentTaskIndex = lineTasks.findIndex((item: any) => String(item?.id) === String(currentTask.id));
      const previousTask = currentTaskIndex > 0 ? lineTasks[currentTaskIndex - 1] : null;
      const nextTask = currentTaskIndex >= 0 && currentTaskIndex < lineTasks.length - 1
        ? lineTasks[currentTaskIndex + 1]
        : null;

      const previousHandover = previousTask ? getHandoverFromTask(previousTask) : null;
      const currentHandover = getHandoverFromTask(currentTask);
      const nextHandover = nextTask ? getHandoverFromTask(nextTask) : null;

      const sourceStageName = previousTask?.name || 'شروع تولید';
      const sourceShelfId = previousTask?.production_shelf_id
        ? String(previousTask.production_shelf_id)
        : (previousHandover?.targetShelfId || order?.production_shelf_id || null);
      const targetShelfId = currentTask?.production_shelf_id
        ? String(currentTask.production_shelf_id)
        : (currentHandover?.targetShelfId || sourceShelfId || order?.production_shelf_id || null);

      const orderGroups = buildGroupsFromOrder(order || {});
      const orderByKey = new Map<string, StageHandoverGroup>(
        orderGroups.map((group) => [String(group.key), group])
      );
      const orderByProductCategory = new Map<string, StageHandoverGroup>();
      orderGroups.forEach((group) => {
        const key = `${String(group.selectedProductId || '')}|${String(group.categoryLabel || '')}`;
        if (key !== '|') orderByProductCategory.set(key, group);
      });

      const baseGroups = previousTask
        ? buildGroupsFromPreviousStage(previousHandover?.groups || [])
        : orderGroups;

      const withOrderGroups = baseGroups.map((group, index) => {
        const byKey = orderByKey.get(String(group.key));
        const byProductCategory = orderByProductCategory.get(
          `${String(group.selectedProductId || '')}|${String(group.categoryLabel || '')}`
        );
        const byIndex = orderGroups[index];
        const matched = byKey || byProductCategory || byIndex;
        const orderPieces = matched?.orderPieces || matched?.pieces || group.orderPieces || [];
        return recalcHandoverGroup({
          ...group,
          categoryLabel: resolveCategoryLabel(group.categoryLabel),
          orderPieces,
        });
      });

      const mergedGroups = mergeSavedGroups(withOrderGroups, currentHandover?.groups || []).map((group) =>
        recalcHandoverGroup({
          ...group,
          sourceShelfId: sourceShelfId ? String(sourceShelfId) : null,
          targetShelfId: targetShelfId ? String(targetShelfId) : null,
        })
      );
      await loadStageInventoryRows(targetShelfId ? String(targetShelfId) : null, mergedGroups);

      const defaultGiverSourceId = previousTask?.assignee_id || order?.assignee_id || null;
      const defaultGiverSourceType = previousTask?.assignee_type || order?.assignee_type || null;
      const defaultGiver: StageAssignee = {
        id: defaultGiverSourceId ? String(defaultGiverSourceId) : null,
        type: defaultGiverSourceType === 'role' ? 'role' : (defaultGiverSourceType === 'user' ? 'user' : null),
        label: assigneeLabelFromIds(defaultGiverSourceId, defaultGiverSourceType),
      };
      const defaultReceiver: StageAssignee = {
        id: currentTask?.assignee_id ? String(currentTask.assignee_id) : null,
        type: currentTask?.assignee_type === 'role' ? 'role' : (currentTask?.assignee_type === 'user' ? 'user' : null),
        label: assigneeLabelFromIds(currentTask?.assignee_id, currentTask?.assignee_type),
      };

      const normalizeForm = (rawForm: any): StageHandoverForm => {
        const formId = String(rawForm?.id || buildHandoverFormId());
        const rawDirection = String(rawForm?.direction || '').toLowerCase();
        const derivedDirection: StageHandoverTrafficType =
          rawDirection === 'outgoing' || rawDirection === 'incoming'
            ? (rawDirection as StageHandoverTrafficType)
            : (rawForm?.sourceTaskId && String(rawForm.sourceTaskId) === String(currentTask?.id) ? 'outgoing' : 'incoming');
        const destinationTaskId = rawForm?.destinationTaskId
          ? String(rawForm.destinationTaskId)
          : (derivedDirection === 'outgoing' && nextTask?.id ? String(nextTask.id) : null);
        const destinationTask = destinationTaskId
          ? lineTasks.find((taskItem: any) => String(taskItem?.id || '') === String(destinationTaskId))
          : null;
        const destinationShelfId = destinationTask?.production_shelf_id ? String(destinationTask.production_shelf_id) : null;
        const normalizedSourceTaskId = rawForm?.sourceTaskId
          ? String(rawForm.sourceTaskId)
          : (derivedDirection === 'outgoing'
            ? String(currentTask?.id || '')
            : (previousTask?.id ? String(previousTask.id) : null));
        const mergedFormGroups = mergeSavedGroups(withOrderGroups, rawForm?.groups || []).map((group) =>
          recalcHandoverGroup({
            ...group,
            sourceShelfId: derivedDirection === 'incoming'
              ? (sourceShelfId ? String(sourceShelfId) : null)
              : (targetShelfId ? String(targetShelfId) : null),
            targetShelfId: rawForm?.targetShelfId
              ? String(rawForm.targetShelfId)
              : (derivedDirection === 'outgoing'
                ? (destinationShelfId || null)
                : (targetShelfId ? String(targetShelfId) : null)),
          })
        );
        return {
          id: formId,
          direction: derivedDirection,
          sourceTaskId: normalizedSourceTaskId || null,
          destinationTaskId,
          sourceStageName: String(
            rawForm?.sourceStageName
            || (derivedDirection === 'outgoing' ? (currentTask?.name || currentTask?.title || 'مرحله') : sourceStageName)
            || 'شروع تولید'
          ),
          sourceShelfId: rawForm?.sourceShelfId
            ? String(rawForm.sourceShelfId)
            : (derivedDirection === 'incoming'
              ? (sourceShelfId ? String(sourceShelfId) : null)
              : (targetShelfId ? String(targetShelfId) : null)),
          targetShelfId: rawForm?.targetShelfId
            ? String(rawForm.targetShelfId)
            : (derivedDirection === 'outgoing'
              ? (destinationShelfId || null)
              : (targetShelfId ? String(targetShelfId) : null)),
          giver: rawForm?.giver && typeof rawForm.giver === 'object' ? rawForm.giver : defaultGiver,
          receiver: rawForm?.receiver && typeof rawForm.receiver === 'object' ? rawForm.receiver : defaultReceiver,
          groups: mergedFormGroups,
          wasteByProduct: rawForm?.wasteByProduct && typeof rawForm.wasteByProduct === 'object'
            ? rawForm.wasteByProduct
            : {},
          giverConfirmation: rawForm?.giverConfirmation?.confirmed
            ? rawForm.giverConfirmation
            : { confirmed: false },
          receiverConfirmation: rawForm?.receiverConfirmation?.confirmed
            ? rawForm.receiverConfirmation
            : { confirmed: false },
          createdAt: rawForm?.createdAt || rawForm?.updatedAt || new Date().toISOString(),
          updatedAt: rawForm?.updatedAt || rawForm?.createdAt || new Date().toISOString(),
        };
      };

      const existingFormsRaw = Array.isArray(currentHandover?.forms) ? currentHandover.forms : [];
      const legacyForm =
        existingFormsRaw.length === 0 && Array.isArray(currentHandover?.groups)
          ? [{
              id: currentHandover?.activeFormId || buildHandoverFormId(),
              sourceTaskId: currentHandover?.sourceTaskId || (previousTask?.id ? String(previousTask.id) : null),
              sourceStageName: currentHandover?.sourceStageName || sourceStageName,
              sourceShelfId: currentHandover?.sourceShelfId || sourceShelfId,
              targetShelfId: currentHandover?.targetShelfId || targetShelfId,
              giverConfirmation: currentHandover?.giverConfirmation || { confirmed: false },
              receiverConfirmation: currentHandover?.receiverConfirmation || { confirmed: false },
              wasteByProduct: currentHandover?.wasteByProduct || {},
              groups: currentHandover?.groups || [],
              updatedAt: currentHandover?.updatedAt || new Date().toISOString(),
            }]
          : [];
      const seedForms = existingFormsRaw.length > 0 ? existingFormsRaw : legacyForm;
      const normalizedForms: StageHandoverForm[] = (seedForms.length > 0
        ? seedForms
        : [{
            id: buildHandoverFormId(),
            direction: 'incoming',
            groups: mergedGroups,
            sourceTaskId: previousTask?.id ? String(previousTask.id) : null,
            destinationTaskId: null,
            sourceStageName,
            sourceShelfId,
            targetShelfId,
            giverConfirmation: { confirmed: false },
            receiverConfirmation: { confirmed: false },
            wasteByProduct: {},
            updatedAt: new Date().toISOString(),
          }]
      ).map((form: any) => normalizeForm(form));

      const preferredFormId = String(currentHandover?.activeFormId || normalizedForms[0]?.id || '');
      const activeForm = normalizedForms.find((form) => String(form.id) === preferredFormId) || normalizedForms[0];
      const sourceTotalsByProduct = toSourceTotals(withOrderGroups);
      const orderTotalsByProduct = toOrderTotals(withOrderGroups);

      const nextTotals: Record<string, number> = {};
      const nextSubTotals: Record<string, number> = {};
      const currentTaskIdStr = String(currentTask.id);
      const nextFormsRaw = Array.isArray(nextHandover?.forms) ? nextHandover.forms : [];
      const nextLegacyForms =
        nextFormsRaw.length === 0 && Array.isArray(nextHandover?.groups)
          ? [{
              id: nextHandover?.activeFormId || `handover_legacy_${String(nextTask?.id || '')}`,
              sourceTaskId: nextHandover?.sourceTaskId || null,
              sourceStageName: nextHandover?.sourceStageName || null,
              giverConfirmation: nextHandover?.giverConfirmation || null,
              receiverConfirmation: nextHandover?.receiverConfirmation || null,
              createdAt: nextHandover?.updatedAt || null,
              updatedAt: nextHandover?.updatedAt || null,
              groups: nextHandover?.groups || [],
            }]
          : [];
      const nextSeeded = nextFormsRaw.length > 0 ? nextFormsRaw : nextLegacyForms;
      nextSeeded.forEach((rawForm: any) => {
        const sourceId = rawForm?.sourceTaskId ? String(rawForm.sourceTaskId) : '';
        if (sourceId !== currentTaskIdStr) return;
        const totals = toGroupTotals((rawForm?.groups || []) as any);
        const subTotals = toGroupSubTotals((rawForm?.groups || []) as any);
        Object.entries(totals).forEach(([productId, qty]) => {
          const pid = String(productId || '').trim();
          if (!pid) return;
          nextTotals[pid] = (nextTotals[pid] || 0) + toNumber(qty);
        });
        Object.entries(subTotals).forEach(([productId, qty]) => {
          const pid = String(productId || '').trim();
          if (!pid) return;
          nextSubTotals[pid] = (nextSubTotals[pid] || 0) + toNumber(qty);
        });
      });

      setHandoverTask(currentTask);
      setHandoverOrderTitle(() => {
        const name = String(order?.name || '').trim();
        const code = String(order?.system_code || '').trim();
        if (name && code) return `${name} (${code})`;
        return name || code || null;
      });
      setHandoverForms(normalizedForms);
      setNextStageTotalsByProduct(nextTotals);
      setNextStageSubTotalsByProduct(nextSubTotals);
      setHandoverNextTask(nextTask || null);
      setActiveHandoverFormId(activeForm?.id || null);
      setHandoverGroups(activeForm?.groups || []);
      setHandoverContext({
        taskId: String(currentTask.id),
        orderId: String(recordId),
        lineId,
        sourceTaskId: activeForm?.sourceTaskId || (previousTask?.id ? String(previousTask.id) : null),
        sourceStageName: activeForm?.sourceStageName || sourceStageName,
        sourceShelfId: activeForm?.sourceShelfId || (sourceShelfId ? String(sourceShelfId) : null),
        targetShelfId: activeForm?.targetShelfId || (targetShelfId ? String(targetShelfId) : null),
        giver: activeForm?.giver || defaultGiver,
        receiver: activeForm?.receiver || defaultReceiver,
        groups: withOrderGroups,
        giverConfirmation: activeForm?.giverConfirmation || { confirmed: false },
        receiverConfirmation: activeForm?.receiverConfirmation || { confirmed: false },
        previousTotalsByProduct: toGroupTotals((activeForm?.groups || []) as any),
        previousWasteByProduct: activeForm?.wasteByProduct || {},
        sourceTotalsByProduct,
        orderTotalsByProduct,
      });
      const initialTrafficType: StageHandoverTrafficType = activeForm?.direction === 'outgoing' ? 'outgoing' : 'incoming';
      setHandoverTrafficType(initialTrafficType);
      setHandoverTrafficTypeEditable(!(activeForm?.giverConfirmation?.confirmed || activeForm?.receiverConfirmation?.confirmed));
      setHandoverSourceStageValue(
        initialTrafficType === 'incoming'
          ? (activeForm?.sourceTaskId ? String(activeForm.sourceTaskId) : '__central__')
          : (activeForm?.sourceTaskId ? String(activeForm.sourceTaskId) : String(currentTask.id))
      );
      setHandoverSourceShelfId(
        initialTrafficType === 'incoming' && !activeForm?.sourceTaskId
          ? (activeForm?.sourceShelfId || null)
          : null
      );
      setHandoverDestinationStageId(
        activeForm?.destinationTaskId
          ? String(activeForm.destinationTaskId)
          : (initialTrafficType === 'outgoing' && nextTask?.id ? String(nextTask.id) : null)
      );
      setHandoverFormsModalOpen(true);
      setHandoverEditorOpen(false);
    } catch (error: any) {
      message.error(error?.message || 'خطا در بارگذاری فرم تحویل');
    } finally {
      setHandoverLoading(false);
    }
  }, [
    recordId,
    isBom,
    productionShelfOptions.length,
    fetchProductionShelves,
    assignees.roles.length,
    assignees.users.length,
    getLineTaskChain,
    getHandoverFromTask,
    buildGroupsFromPreviousStage,
    buildGroupsFromOrder,
    loadStageInventoryRows,
    mergeSavedGroups,
    recalcHandoverGroup,
    resolveCategoryLabel,
    assigneeLabelFromIds,
    buildHandoverFormId,
    toOrderTotals,
    toSourceTotals,
    toGroupTotals,
    toGroupSubTotals,
    tasks,
  ]);

  const setHandoverGroupCollapsed = useCallback((groupIndex: number, collapsed: boolean) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, collapsed };
      return next;
    });
  }, []);

  const addHandoverDeliveryRow = useCallback((groupIndex: number) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = Array.isArray(group.deliveryRows) ? [...group.deliveryRows] : [];
      deliveryRows.push(normalizeHandoverDeliveryRow(group));
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [normalizeHandoverDeliveryRow, recalcHandoverGroup]);

  const deleteHandoverDeliveryRows = useCallback((groupIndex: number, rowKeys: string[]) => {
    if (!rowKeys.length) return;
    const keySet = new Set(rowKeys.map((key) => String(key)));
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = (group.deliveryRows || []).filter((row) => !keySet.has(String(row.key)));
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [recalcHandoverGroup]);

  const transferHandoverDeliveryRows = useCallback((
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => {
    if (!rowKeys.length) return;
    setHandoverGroups((prev) => {
      const next = [...prev];
      const sourceGroup = next[sourceGroupIndex];
      const targetGroup = next[targetGroupIndex];
      if (!sourceGroup || !targetGroup) return prev;
      if (mode === 'move' && sourceGroupIndex === targetGroupIndex) return prev;

      const keySet = new Set(rowKeys.map((key) => String(key)));
      const sourceRows = Array.isArray(sourceGroup.deliveryRows) ? sourceGroup.deliveryRows : [];
      const selectedRows = sourceRows.filter((row) => keySet.has(String(row.key)));
      if (!selectedRows.length) return prev;

      const copiedRows = selectedRows.map((row) =>
        normalizeHandoverDeliveryRow(targetGroup, {
          ...row,
          key: buildHandoverRowKey(),
          pieceKey: undefined,
        })
      );

      const nextTargetRows = [...(targetGroup.deliveryRows || []), ...copiedRows];
      next[targetGroupIndex] = recalcHandoverGroup({
        ...targetGroup,
        deliveryRows: nextTargetRows,
        isConfirmed: false,
      });

      if (mode === 'move') {
        const nextSourceRows = sourceRows.filter((row) => !keySet.has(String(row.key)));
        next[sourceGroupIndex] = recalcHandoverGroup({
          ...sourceGroup,
          deliveryRows: nextSourceRows,
          isConfirmed: false,
        });
      }

      return next;
    });
  }, [buildHandoverRowKey, normalizeHandoverDeliveryRow, recalcHandoverGroup]);

  const updateHandoverDeliveryRowField = useCallback((
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StageHandoverDeliveryRow, 'key'>,
    value: any
  ) => {
    setHandoverGroups((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const deliveryRows = [...(group.deliveryRows || [])];
      const rowIndex = deliveryRows.findIndex((row) => String(row.key) === String(rowKey));
      if (rowIndex < 0) return prev;
      const currentRow = deliveryRows[rowIndex];
      const numericFields: Array<keyof Omit<StageHandoverDeliveryRow, 'key'>> = ['length', 'width', 'quantity', 'mainQuantity', 'subQuantity'];
      const nextValue = numericFields.includes(field)
        ? Math.max(0, toNumber(value))
        : (value == null ? '' : String(value));
      const updatedRow: StageHandoverDeliveryRow = { ...currentRow, [field]: nextValue };
      if (field === 'sourceBundleId') {
        const productId = String(group?.selectedProductId || '').trim();
        const bundleOption = (handoverBundleOptionsByProduct[productId] || [])
          .find((option) => String(option.value) === String(nextValue || ''));
        updatedRow.sourceShelfId = bundleOption?.shelfId || null;
        updatedRow.sourceBundleLabel = bundleOption?.label || null;
      }
      if (['length', 'width', 'quantity'].includes(String(field))) {
        updatedRow.mainQuantity = Math.max(0, toNumber(updatedRow.length) * toNumber(updatedRow.width) * toNumber(updatedRow.quantity));
        const conversion = getUnitQuantityConversion('mainQuantity', {
          availableKeys: ['mainQuantity', 'subQuantity'],
        });
        if (conversion) {
          try {
            updatedRow.subQuantity = calculateUnitQuantity({
              mainQuantity: updatedRow.mainQuantity,
              subQuantity: updatedRow.subQuantity,
              main_unit: updatedRow.mainUnit,
              sub_unit: updatedRow.subUnit,
              widthMm: updatedRow.width,
            }, conversion);
          } catch {
            // اگر واحدها هنوز قابل تبدیل نباشند، مقدار فعلی واحد فرعی حفظ می‌شود.
          }
        }
      }
      deliveryRows[rowIndex] = {
        ...updatedRow,
        deliveredQty: Math.max(0, toNumber((updatedRow as any).mainQuantity ?? updatedRow.deliveredQty)),
      };
      next[groupIndex] = recalcHandoverGroup({ ...group, deliveryRows, isConfirmed: false });
      return next;
    });
  }, [handoverBundleOptionsByProduct, recalcHandoverGroup, toNumber]);

  const confirmHandoverGroup = useCallback((groupIndex: number) => {
    const group = handoverGroups[groupIndex];
    if (!group) return;
    if (!handoverContext?.targetShelfId) {
      message.error('قفسه مرحله انتخاب نشده است.');
      return;
    }
    if (!group.totalHandoverQty || group.totalHandoverQty <= 0) {
      message.error('برای این محصول، مقدار تحویل شده معتبر نیست.');
      return;
    }
    const rowsWithQuantity = (group.deliveryRows || []).filter((row) => toNumber(row.mainQuantity ?? row.deliveredQty) > 0);
    if (rowsWithQuantity.some((row) => !row.sourceBundleId || !row.sourceShelfId)) {
      message.error('برای همه ردیف‌های تحویل، بسته برداشت را مشخص کنید.');
      return;
    }
    if (rowsWithQuantity.some((row) => !hasTargetBundleSelection(row))) {
      message.error('برای همه ردیف‌های تحویل، بسته تحویل مقصد را مشخص کنید.');
      return;
    }
    setHandoverGroups((prev) => {
      const next = [...prev];
      const current = next[groupIndex];
      if (!current) return prev;
      next[groupIndex] = { ...current, isConfirmed: true, collapsed: true };
      return next;
    });
    message.success('این محصول ثبت شد.');
  }, [handoverContext?.targetShelfId, handoverGroups, toNumber]);

  const saveHandover = useCallback(async (confirmSide?: StageHandoverSide) => {
    if (!handoverContext || !handoverTask) return false;

    const currentTaskId = String(handoverContext.taskId);
    const lineId = handoverTask?.production_line_id ? String(handoverTask.production_line_id) : null;
    const stageOptionsForSave: StageHandoverTaskOption[] = getLineTaskChain(lineId, tasks)
      .filter((task: any) => String(task?.id || '') && String(task.id) !== currentTaskId)
      .map((task: any) => {
        const stageName = String(task?.name || task?.title || 'مرحله');
        const stageShelfId = task?.production_shelf_id ? String(task.production_shelf_id) : null;
        return {
          value: String(task.id),
          label: stageName,
          shelfId: stageShelfId,
          shelfLabel: allShelfOptions.find((option) => option.value === stageShelfId)?.label || 'قفسه تعیین نشده',
        };
      });
    const selectedSourceStageId =
      handoverSourceStageValue && handoverSourceStageValue !== '__central__'
        ? String(handoverSourceStageValue)
        : null;
    const selectedSourceStage = selectedSourceStageId
      ? stageOptionsForSave.find((item) => String(item.value) === selectedSourceStageId) || null
      : null;
    const selectedDestinationStage = handoverDestinationStageId
      ? stageOptionsForSave.find((item) => String(item.value) === String(handoverDestinationStageId)) || null
      : null;

    const computedSourceShelfId = handoverTrafficType === 'incoming'
      ? (selectedSourceStageId
        ? (selectedSourceStage?.shelfId || null)
        : (handoverSourceShelfId || null))
      : (handoverContext.targetShelfId || null);
    const computedTargetShelfId = handoverTrafficType === 'incoming'
      ? (handoverContext.targetShelfId || null)
      : (selectedDestinationStage?.shelfId || null);

    const computedSourceTaskId = handoverTrafficType === 'incoming'
      ? selectedSourceStageId
      : currentTaskId;
    const computedDestinationTaskId = handoverTrafficType === 'outgoing'
      ? (handoverDestinationStageId ? String(handoverDestinationStageId) : null)
      : null;
    const computedSourceStageName = handoverTrafficType === 'incoming'
      ? (selectedSourceStageId
        ? String(selectedSourceStage?.label || handoverContext.sourceStageName || 'مرحله')
        : 'انبار مرکزی')
      : String(handoverTask?.name || handoverTask?.title || 'مرحله');

    if (handoverTrafficType === 'incoming' && !handoverContext.targetShelfId) {
      message.error('قفسه این مرحله انتخاب نشده است.');
      return false;
    }
    if (!computedSourceShelfId) {
      message.error('قفسه مبدا مشخص نشده است.');
      return false;
    }
    if (!computedTargetShelfId) {
      message.error('قفسه مقصد مشخص نشده است.');
      return false;
    }
    if (handoverTrafficType === 'outgoing' && !computedDestinationTaskId) {
      message.error('مرحله مقصد برای تحویل خروجی انتخاب نشده است.');
      return false;
    }

    setHandoverLoading(true);
    try {
      const { data: freshTask, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', handoverContext.taskId)
        .maybeSingle();
      if (taskError) throw taskError;

      const recurrence = parseRecurrenceInfo(freshTask?.recurrence_info);
      const existing = recurrence?.production_handover && typeof recurrence.production_handover === 'object'
        ? recurrence.production_handover
        : {};

      const existingFormsRaw = Array.isArray(existing?.forms) ? existing.forms : [];
      const fallbackLegacyForm = Array.isArray(existing?.groups)
        ? [{
            id: existing?.activeFormId || activeHandoverFormId || buildHandoverFormId(),
            groups: existing.groups,
            wasteByProduct: existing?.wasteByProduct || {},
            giverConfirmation: existing?.giverConfirmation || { confirmed: false },
            receiverConfirmation: existing?.receiverConfirmation || { confirmed: false },
            direction: existing?.direction || handoverTrafficType,
            sourceTaskId: existing?.sourceTaskId || computedSourceTaskId,
            destinationTaskId: existing?.destinationTaskId || computedDestinationTaskId,
            sourceStageName: existing?.sourceStageName || computedSourceStageName,
            sourceShelfId: existing?.sourceShelfId || computedSourceShelfId,
            targetShelfId: existing?.targetShelfId || computedTargetShelfId,
            createdAt: existing?.createdAt || existing?.updatedAt || new Date().toISOString(),
            updatedAt: existing?.updatedAt || existing?.createdAt || new Date().toISOString(),
          }]
        : [];
      const existingForms = existingFormsRaw.length > 0 ? existingFormsRaw : fallbackLegacyForm;

      const formId = String(activeHandoverFormId || existing?.activeFormId || existingForms[0]?.id || buildHandoverFormId());
      const existingForm = existingForms.find((item: any) => String(item?.id || '') === formId) || null;

      const previousGroups = Array.isArray(existingForm?.groups) ? existingForm.groups : [];
      const previousWasteByProduct = existingForm?.wasteByProduct && typeof existingForm.wasteByProduct === 'object'
        ? existingForm.wasteByProduct
        : {};
      const hasImmutableConfirmation = Boolean(
        existingForm?.giverConfirmation?.confirmed || existingForm?.receiverConfirmation?.confirmed
      );
      const effectiveGroups = (hasImmutableConfirmation ? previousGroups : handoverGroups) as any[];
      const effectiveDirection: StageHandoverTrafficType = hasImmutableConfirmation
        ? (existingForm?.direction === 'outgoing' ? 'outgoing' : 'incoming')
        : handoverTrafficType;
      const effectiveSourceTaskId = hasImmutableConfirmation
        ? (existingForm?.sourceTaskId ? String(existingForm.sourceTaskId) : null)
        : computedSourceTaskId;
      const effectiveDestinationTaskId = hasImmutableConfirmation
        ? (existingForm?.destinationTaskId ? String(existingForm.destinationTaskId) : null)
        : computedDestinationTaskId;
      const effectiveSourceStageName = hasImmutableConfirmation
        ? String(existingForm?.sourceStageName || computedSourceStageName)
        : computedSourceStageName;
      const effectiveSourceShelfId = hasImmutableConfirmation
        ? (existingForm?.sourceShelfId ? String(existingForm.sourceShelfId) : computedSourceShelfId)
        : computedSourceShelfId;
      const effectiveTargetShelfId = hasImmutableConfirmation
        ? (existingForm?.targetShelfId ? String(existingForm.targetShelfId) : computedTargetShelfId)
        : computedTargetShelfId;
      const hasRowWithoutBundle = effectiveGroups.some((group: any) => {
        const rows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
        return rows.some((row: any) => (
          Math.max(0, toNumber(row?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity)))) > 0
          && !(row?.sourceBundleId || row?.source_bundle_id || row?.bundle_id || group?.sourceBundleId || group?.source_bundle_id || group?.bundle_id)
        ));
      });
      if (hasRowWithoutBundle) {
        throw new Error('برای هر ردیفِ تحویل مرحله‌ای، بسته محصول باید مشخص باشد.');
      }
      const hasRowWithoutTargetBundle = effectiveGroups.some((group: any) => {
        const rows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
        return rows.some((row: any) => (
          Math.max(0, toNumber(row?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity)))) > 0
          && !(row?.targetBundleId || row?.target_bundle_id)
        ));
      });
      if (hasRowWithoutTargetBundle) {
        throw new Error('برای هر ردیفِ تحویل مرحله‌ای، بسته تحویل مقصد باید مشخص باشد.');
      }
      const nextTotalsByProduct = toGroupTotals(effectiveGroups as any);
      const previousBundleTotals = toGroupBundleTotals(previousGroups as any);
      const nextBundleTotals = toGroupBundleTotals(effectiveGroups as any);

      const nextWasteByProduct: Record<string, number> = {};
      effectiveGroups.forEach((group: any) => {
        const productId = (
          group.selectedProductId
          || (group as any)?.selected_product_id
          || (Array.isArray((group as any)?.pieces)
            ? ((group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.selectedProductId
              || (group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.selected_product_id
              || (group as any).pieces.find((piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id)?.product_id)
            : null)
        );
        const normalizedProductId = productId ? String(productId) : '';
        if (!normalizedProductId) return;
        const sourceQty = (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
          (sum: number, piece: any) => sum + toNumber(piece?.sourceQty),
          0
        );
        const deliveryRows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
        const handoverQty = deliveryRows.length > 0
          ? deliveryRows.reduce(
              (sum: number, row: any) => sum + Math.max(0, toNumber(row?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity)))),
              0
            )
          : (Array.isArray(group?.pieces) ? group.pieces : []).reduce(
              (sum: number, piece: any) => sum + toNumber(piece?.handoverQty),
              0
            );
        const waste = Math.max(0, sourceQty - handoverQty);
        if (waste > 0) nextWasteByProduct[normalizedProductId] = (nextWasteByProduct[normalizedProductId] || 0) + waste;
      });

      const finalWasteByProduct = nextWasteByProduct;
      const productUnitById = new Map<string, string>();
      effectiveGroups.forEach((group: any) => {
        const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
        if (!productId || productUnitById.has(productId)) return;
        const unit = String(
          group?.deliveryRows?.find((row: any) => String(row?.mainUnit || '').trim())?.mainUnit
          || group?.pieces?.find((piece: any) => String(piece?.mainUnit || '').trim())?.mainUnit
          || ''
        ).trim();
        if (unit) productUnitById.set(productId, unit);
      });
      const deltas: Array<{ productId: string; shelfId: string; bundleId?: string | null; delta: number; unit?: string | null }> = [];
      const transferLogs: any[] = [];
      const userId = currentUser.id;
      type FlatHandoverRow = {
        key: string;
        groupKey: string;
        rowKey: string;
        productId: string;
        quantity: number;
        sourceShelfId: string;
        sourceBundleId: string;
        targetBundleId: string;
        unit: string | null;
      };
      const flattenRows = (groups: any[]): Map<string, FlatHandoverRow> => {
        const result = new Map<string, FlatHandoverRow>();
        (groups || []).forEach((group: any, groupIndex: number) => {
          const productId = String(group?.selectedProductId || group?.selected_product_id || '').trim();
          if (!productId) return;
          (Array.isArray(group?.deliveryRows) ? group.deliveryRows : []).forEach((row: any, rowIndex: number) => {
            const quantity = Math.max(0, toNumber(row?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity))));
            const groupKey = String(group?.key || `group_${groupIndex}`);
            const rowKey = String(row?.key || `row_${rowIndex}`);
            result.set(`${groupKey}:${rowKey}`, {
              key: `${groupKey}:${rowKey}`,
              groupKey,
              rowKey,
              productId,
              quantity,
              sourceShelfId: String(row?.sourceShelfId || row?.source_shelf_id || effectiveSourceShelfId || ''),
              sourceBundleId: String(row?.sourceBundleId || row?.source_bundle_id || row?.bundle_id || ''),
              targetBundleId: String(row?.targetBundleId || row?.target_bundle_id || USE_SOURCE_BUNDLE_VALUE),
              unit: String(row?.mainUnit || '').trim() || productUnitById.get(productId) || null,
            });
          });
        });
        return result;
      };
      const previousRowsByKey = flattenRows(previousGroups as any[]);
      const nextRowsByKey = flattenRows(effectiveGroups as any[]);
      const previousTargetShelfIdForMoves = String(existingForm?.targetShelfId || effectiveTargetShelfId || '');
      const movementKeys = new Set([...previousRowsByKey.keys(), ...nextRowsByKey.keys()]);
      const productionMoves: ProductionMove[] = [];
      movementKeys.forEach((key) => {
        const previous = previousRowsByKey.get(key);
        const next = nextRowsByKey.get(key);
        const previousResolvedTarget = previous
          ? (isUseSourceBundleValue(previous.targetBundleId) ? previous.sourceBundleId : previous.targetBundleId)
          : '';
        const nextResolvedTarget = next
          ? (isUseSourceBundleValue(next.targetBundleId) ? next.sourceBundleId : next.targetBundleId)
          : '';
        const routeChanged = Boolean(previous && next && (
          previous.productId !== next.productId
          || previous.sourceShelfId !== next.sourceShelfId
          || previous.sourceBundleId !== next.sourceBundleId
          || previousResolvedTarget !== nextResolvedTarget
          || previousTargetShelfIdForMoves !== String(effectiveTargetShelfId)
        ));
        if (routeChanged && previous && previous.quantity > 0) {
          productionMoves.push({
            client_key: `rollback:${key}`,
            product_id: previous.productId,
            from_shelf_id: previousTargetShelfIdForMoves,
            to_shelf_id: previous.sourceShelfId,
            bundle_id: previousResolvedTarget,
            target_bundle_id: previous.sourceBundleId,
            create_new_target_bundle: false,
            quantity: previous.quantity,
            unit: previous.unit,
          });
        }
        if (routeChanged && next && next.quantity > 0) {
          productionMoves.push({
            client_key: key,
            product_id: next.productId,
            from_shelf_id: next.sourceShelfId,
            to_shelf_id: String(effectiveTargetShelfId),
            bundle_id: next.sourceBundleId,
            target_bundle_id: (!isCreateNewBundleValue(next.targetBundleId) && !isUseSourceBundleValue(next.targetBundleId))
              ? next.targetBundleId
              : (isUseSourceBundleValue(next.targetBundleId) ? next.sourceBundleId : null),
            create_new_target_bundle: isCreateNewBundleValue(next.targetBundleId),
            quantity: next.quantity,
            unit: next.unit,
          });
          return;
        }
        const delta = toNumber(next?.quantity) - toNumber(previous?.quantity);
        if (Math.abs(delta) <= 0.000000001) return;
        if (delta > 0 && next) {
          productionMoves.push({
            client_key: key,
            product_id: next.productId,
            from_shelf_id: next.sourceShelfId,
            to_shelf_id: String(effectiveTargetShelfId),
            bundle_id: next.sourceBundleId,
            target_bundle_id: (!isCreateNewBundleValue(next.targetBundleId) && !isUseSourceBundleValue(next.targetBundleId))
              ? next.targetBundleId
              : (isUseSourceBundleValue(next.targetBundleId) ? next.sourceBundleId : null),
            create_new_target_bundle: isCreateNewBundleValue(next.targetBundleId),
            quantity: delta,
            unit: next.unit,
          });
        } else if (delta < 0 && previous) {
          const previousTargetBundleId = isUseSourceBundleValue(previous.targetBundleId)
            ? previous.sourceBundleId
            : previous.targetBundleId;
          productionMoves.push({
            client_key: `rollback:${key}`,
            product_id: previous.productId,
            from_shelf_id: previousTargetShelfIdForMoves,
            to_shelf_id: previous.sourceShelfId,
            bundle_id: previousTargetBundleId,
            target_bundle_id: previous.sourceBundleId,
            create_new_target_bundle: false,
            quantity: Math.abs(delta),
            unit: previous.unit,
          });
        }
      });

      let persistedGroups = (effectiveGroups as any[]).map((group: any) => ({
        ...group,
        deliveryRows: (Array.isArray(group?.deliveryRows) ? group.deliveryRows : []).map((row: any) => ({ ...row })),
      }));
      if (productionMoves.length > 0) {
        const movementResults = await applyProductionMoves(productionMoves);
        const resultByKey = new Map(movementResults.map((result) => [String(result.client_key), result]));
        void loadDestinationBundleOptions(supabase as any)
          .then(setDestinationBundleOptions)
          .catch((error) => console.warn('Could not refresh destination bundles', error));
        persistedGroups = persistedGroups.map((group: any, groupIndex: number) => {
          const groupKey = String(group?.key || `group_${groupIndex}`);
          return {
            ...group,
            deliveryRows: (Array.isArray(group?.deliveryRows) ? group.deliveryRows : []).map((row: any, rowIndex: number) => {
              const rowKey = String(row?.key || `row_${rowIndex}`);
              const result = resultByKey.get(`${groupKey}:${rowKey}`);
              if (!result) return row;
              return {
                ...row,
                targetBundleId: result.target_bundle_id,
                target_bundle_id: result.target_bundle_id,
                targetBundleLabel: result.target_bundle_number || row.targetBundleLabel || null,
                target_bundle_label: result.target_bundle_number || row.target_bundle_label || null,
              };
            }),
          };
        });
        productionMoves.forEach((move) => {
          const result = resultByKey.get(String(move.client_key));
          const targetBundleId = result?.target_bundle_id || move.target_bundle_id || move.bundle_id || null;
          const isRollback = String(move.client_key || '').startsWith('rollback:');
          transferLogs.push({
            transfer_type: 'production_stage',
            product_id: move.product_id,
            required_qty: move.quantity,
            delivered_qty: move.quantity,
            production_order_id: handoverContext.orderId,
            from_shelf_id: move.from_shelf_id,
            to_shelf_id: move.to_shelf_id,
            bundle_id: targetBundleId,
            source_bundle_id: move.bundle_id,
            target_bundle_id: targetBundleId,
            sender_id: userId,
            receiver_id: userId,
            notes: isRollback ? 'اصلاح فرم تحویل مرحله‌ای' : null,
          });
        });
      }

      const wasteProductIds = new Set<string>([
        ...Object.keys(previousWasteByProduct),
        ...Object.keys(finalWasteByProduct),
      ]);
      const bundleIdsByProduct = new Map<string, Set<string | null>>();
      [...previousBundleTotals.values(), ...nextBundleTotals.values()].forEach((item) => {
        if (!bundleIdsByProduct.has(item.productId)) bundleIdsByProduct.set(item.productId, new Set());
        bundleIdsByProduct.get(item.productId)!.add(item.bundleId);
      });
      wasteProductIds.forEach((productId) => {
        const prevWaste = toNumber(previousWasteByProduct[productId]);
        const nextWaste = toNumber(finalWasteByProduct[productId]);
        const wasteDelta = nextWaste - prevWaste;
        if (!wasteDelta || !effectiveSourceShelfId) return;
        const mainUnit = productUnitById.get(productId) || null;
        const bundleIds = Array.from(bundleIdsByProduct.get(productId) || []);
        // ضایعاتِ بسته‌محور باید صراحتاً از همان بسته انتخاب شوند. تا زمانی که
        // انتخاب نشده، موجودی هیچ بسته‌ای را حدسی کم/زیاد نمی‌کنیم.
        if (bundleIds.length > 1) {
          console.warn('Skipping ambiguous multi-bundle waste adjustment', { productId, wasteDelta });
          return;
        }
        const bundleId = bundleIds[0] ?? null;
        if (wasteDelta > 0) {
          deltas.push({ productId, shelfId: String(effectiveSourceShelfId), bundleId, delta: -wasteDelta, unit: mainUnit } as any);
          transferLogs.push({
            transfer_type: 'waste',
            product_id: productId,
            required_qty: wasteDelta,
            delivered_qty: wasteDelta,
            production_order_id: handoverContext.orderId,
            from_shelf_id: String(effectiveSourceShelfId),
            to_shelf_id: null,
            bundle_id: bundleId,
            sender_id: userId,
            receiver_id: userId,
          });
        } else {
          deltas.push({ productId, shelfId: String(effectiveSourceShelfId), bundleId, delta: Math.abs(wasteDelta), unit: mainUnit } as any);
        }
      });

      if (deltas.length > 0) {
        await applyInventoryDeltas(supabase as any, deltas);
        await syncMultipleProductsStock(
          supabase as any,
          Array.from(new Set(deltas.map((item) => item.productId).filter(Boolean)))
        );
      }

      if (transferLogs.length > 0) {
        const { error: transferError } = await supabase.from('stock_transfers').insert(transferLogs);
        if (transferError) throw transferError;
      }

      const nowIso = new Date().toISOString();
      const nextGiverConfirmation: StageHandoverConfirm = existingForm?.giverConfirmation?.confirmed
        ? existingForm.giverConfirmation
        : { confirmed: false };
      const nextReceiverConfirmation: StageHandoverConfirm = existingForm?.receiverConfirmation?.confirmed
        ? existingForm.receiverConfirmation
        : { confirmed: false };
      if (confirmSide === 'giver') {
        nextGiverConfirmation.confirmed = true;
        nextGiverConfirmation.userId = currentUser.id;
        nextGiverConfirmation.userName = currentUser.fullName;
        nextGiverConfirmation.at = nowIso;
      }
      if (confirmSide === 'receiver') {
        nextReceiverConfirmation.confirmed = true;
        nextReceiverConfirmation.userId = currentUser.id;
        nextReceiverConfirmation.userName = currentUser.fullName;
        nextReceiverConfirmation.at = nowIso;
      }

      const nextForm: StageHandoverForm = {
        id: formId,
        direction: effectiveDirection,
        sourceTaskId: effectiveSourceTaskId,
        destinationTaskId: effectiveDestinationTaskId,
        sourceStageName: effectiveSourceStageName,
        sourceShelfId: effectiveSourceShelfId,
        targetShelfId: effectiveTargetShelfId,
        giver: handoverContext.giver,
        receiver: handoverContext.receiver,
        groups: persistedGroups as any,
        wasteByProduct: finalWasteByProduct,
        giverConfirmation: nextGiverConfirmation,
        receiverConfirmation: nextReceiverConfirmation,
        createdAt: existingForm?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      const nextForms = (() => {
        let replaced = false;
        const mapped = existingForms.map((form: any) => {
          if (String(form?.id || '') !== formId) return form;
          replaced = true;
          return nextForm;
        });
        if (!replaced) mapped.push(nextForm);
        return mapped;
      })();

      const nextHandover = {
        direction: effectiveDirection,
        sourceTaskId: effectiveSourceTaskId,
        destinationTaskId: effectiveDestinationTaskId,
        sourceStageName: effectiveSourceStageName,
        sourceShelfId: effectiveSourceShelfId,
        targetShelfId: effectiveTargetShelfId,
        giver: handoverContext.giver,
        receiver: handoverContext.receiver,
        groups: nextForm.groups,
        wasteByProduct: nextForm.wasteByProduct,
        giverConfirmation: nextForm.giverConfirmation,
        receiverConfirmation: nextForm.receiverConfirmation,
        forms: nextForms,
        activeFormId: formId,
        updatedAt: nowIso,
      };

      const nextRecurrence = {
        ...recurrence,
        production_handover: nextHandover,
      };

      const updatePayload: any = {
        recurrence_info: nextRecurrence,
        production_shelf_id: handoverContext.targetShelfId || freshTask?.production_shelf_id || null,
      };
      const { error: updateError } = await supabase
        .from('tasks')
        .update(updatePayload)
        .eq('id', handoverContext.taskId);
      if (updateError) throw updateError;

      const updatedTask = {
        ...freshTask,
        ...updatePayload,
        recurrence_info: nextRecurrence,
      };
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(handoverContext.taskId)
          ? {
              ...item,
              recurrence_info: nextRecurrence,
              production_shelf_id: handoverContext.targetShelfId || item?.production_shelf_id || null,
            }
          : item
      )));
      setHandoverTask(updatedTask);
      setHandoverForms(nextForms as StageHandoverForm[]);
      setHandoverGroups(persistedGroups as StageHandoverGroup[]);
      setActiveHandoverFormId(formId);
      setHandoverContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sourceTaskId: effectiveSourceTaskId,
          sourceStageName: effectiveSourceStageName,
          sourceShelfId: effectiveSourceShelfId,
          targetShelfId: handoverContext.targetShelfId || effectiveTargetShelfId,
          groups: prev.groups,
          previousTotalsByProduct: nextTotalsByProduct,
          previousWasteByProduct: finalWasteByProduct,
          giverConfirmation: nextGiverConfirmation,
          receiverConfirmation: nextReceiverConfirmation,
        };
      });
      message.success(confirmSide ? 'تایید ثبت شد' : 'فرم تحویل ذخیره شد');
      if (handoverDraftKey) clearDurableDraft(handoverDraftKey);
      return true;
    } catch (error: any) {
      message.error(error?.message || 'خطا در ثبت فرم تحویل');
      return false;
    } finally {
      setHandoverLoading(false);
    }
  }, [
    activeHandoverFormId,
    buildHandoverFormId,
    currentUser.fullName,
    currentUser.id,
    handoverContext,
    handoverDestinationStageId,
    handoverGroups,
    handoverSourceShelfId,
    handoverSourceStageValue,
    handoverTask,
    handoverTrafficType,
    handoverDraftKey,
    getLineTaskChain,
    parseRecurrenceInfo,
    tasks,
    toGroupBundleTotals,
    toGroupTotals,
    toNumber,
  ]);

  const maybeOpenHandoverByStatus = useCallback(async (taskId: string, newStatus: string, providedTasks?: any[]) => {
    if (!taskId || !recordId || isBom) return;
    const normalized = String(newStatus || '').toLowerCase();
    if (normalized !== 'in_progress' && normalized !== 'done' && normalized !== 'completed') return;
    const allTasks = (providedTasks && providedTasks.length > 0) ? providedTasks : tasks;
    const currentTask = allTasks.find((item: any) => String(item?.id) === String(taskId));
    if (!currentTask || !currentTask?.production_line_id) return;
    const chain = getLineTaskChain(String(currentTask.production_line_id), allTasks);
    const currentIndex = chain.findIndex((item: any) => String(item?.id) === String(taskId));
    const isFirstStage = currentIndex === 0;
    if (normalized === 'in_progress' && !isFirstStage) return;

    const handover = getHandoverFromTask(currentTask);
    const forms = Array.isArray(handover?.forms) ? handover.forms : [];
    const isComplete = forms.length > 0
      ? forms.every((form: any) => form?.giverConfirmation?.confirmed && form?.receiverConfirmation?.confirmed)
      : (handover?.giverConfirmation?.confirmed && handover?.receiverConfirmation?.confirmed);
    if (isComplete) return;

    await openTaskHandoverModal(currentTask, allTasks);
  }, [recordId, isBom, tasks, getLineTaskChain, getHandoverFromTask, openTaskHandoverModal]);

  const openHandoverEditorForForm = useCallback((formId: string | null) => {
    if (!formId) return;
    const form = handoverForms.find((item) => String(item.id) === String(formId));
    if (!form) return;
    const trafficType: StageHandoverTrafficType = form.direction === 'outgoing' ? 'outgoing' : 'incoming';
    setActiveHandoverFormId(String(form.id));
    setHandoverGroups(Array.isArray(form.groups) ? form.groups : []);
    setHandoverContext((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sourceTaskId: form.sourceTaskId || prev.sourceTaskId,
        sourceStageName: form.sourceStageName || prev.sourceStageName,
        sourceShelfId: form.sourceShelfId || prev.sourceShelfId,
        targetShelfId: form.targetShelfId || prev.targetShelfId,
        giver: form.giver || prev.giver,
        receiver: form.receiver || prev.receiver,
        giverConfirmation: form.giverConfirmation || { confirmed: false },
        receiverConfirmation: form.receiverConfirmation || { confirmed: false },
        previousTotalsByProduct: toGroupTotals((form.groups || []) as any),
        previousWasteByProduct: form.wasteByProduct || {},
      };
    });
    setHandoverTrafficType(trafficType);
    setHandoverTrafficTypeEditable(!(form?.giverConfirmation?.confirmed || form?.receiverConfirmation?.confirmed));
    setHandoverSourceStageValue(
      trafficType === 'incoming'
        ? (form.sourceTaskId ? String(form.sourceTaskId) : '__central__')
        : (form.sourceTaskId ? String(form.sourceTaskId) : (handoverTask?.id ? String(handoverTask.id) : null))
    );
    setHandoverSourceShelfId(
      trafficType === 'incoming' && !form.sourceTaskId
        ? (form.sourceShelfId || null)
        : null
    );
    setHandoverDestinationStageId(form.destinationTaskId ? String(form.destinationTaskId) : null);
    setHandoverEditorOpen(true);
    setHandoverFormsModalOpen(false);
  }, [handoverForms, toGroupTotals, handoverTask?.id]);

  const handleCreateHandoverForm = useCallback(() => {
    if (!handoverContext) return;
    const emptyGroups = (handoverContext.groups || []).map((group) =>
      recalcHandoverGroup({
        ...group,
        pieces: (Array.isArray((group as any)?.pieces) ? (group as any).pieces : []).map((piece: any) => ({
          ...piece,
          handoverQty: 0,
        })),
        deliveryRows: [],
        totalHandoverQty: 0,
        isConfirmed: false,
        collapsed: true,
      })
    );
    const nowIso = new Date().toISOString();
    const newForm: StageHandoverForm = {
      id: buildHandoverFormId(),
      direction: 'incoming',
      sourceTaskId: handoverContext.sourceTaskId,
      destinationTaskId: null,
      sourceStageName: handoverContext.sourceStageName,
      sourceShelfId: handoverContext.sourceShelfId,
      targetShelfId: handoverContext.targetShelfId,
      giver: handoverContext.giver,
      receiver: handoverContext.receiver,
      groups: emptyGroups,
      wasteByProduct: {},
      giverConfirmation: { confirmed: false },
      receiverConfirmation: { confirmed: false },
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setActiveHandoverFormId(newForm.id);
    setHandoverGroups(newForm.groups);
    setHandoverContext((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        targetShelfId: newForm.targetShelfId,
        giverConfirmation: newForm.giverConfirmation,
        receiverConfirmation: newForm.receiverConfirmation,
        previousTotalsByProduct: {},
        previousWasteByProduct: {},
      };
    });
    setHandoverTrafficType('incoming');
    setHandoverTrafficTypeEditable(true);
    setHandoverSourceStageValue(handoverContext.sourceTaskId ? String(handoverContext.sourceTaskId) : '__central__');
    setHandoverSourceShelfId(handoverContext.sourceTaskId ? null : (handoverContext.sourceShelfId || null));
    setHandoverDestinationStageId(null);
    setHandoverEditorOpen(true);
    setHandoverFormsModalOpen(false);
  }, [buildHandoverFormId, handoverContext, recalcHandoverGroup]);

  const openTaskHandoverModalWithOptions = useCallback(async (task: any, providedTasks?: any[], options?: OpenHandoverOptions) => {
    if (!task?.id) return;
    await openTaskHandoverModal(task, providedTasks);
    if (!options) return;
    const openFormId = options.openFormId ? String(options.openFormId) : null;
    const createNewForm = options.createNewForm === true;
    const sourceOverrideTask = options.sourceOverrideTask || null;

    if (sourceOverrideTask) {
      const giverId = sourceOverrideTask?.assignee_id ? String(sourceOverrideTask.assignee_id) : null;
      const giverTypeRaw = String(sourceOverrideTask?.assignee_type || '');
      const giverType = giverTypeRaw === 'role' ? 'role' : (giverTypeRaw === 'user' ? 'user' : null);
      const giverLabel = assigneeLabelFromIds(sourceOverrideTask?.assignee_id, sourceOverrideTask?.assignee_type);
      const giver: StageAssignee = { id: giverId, type: giverType as any, label: giverLabel };
      const giverShelfId = sourceOverrideTask?.production_shelf_id ? String(sourceOverrideTask.production_shelf_id) : null;
      const giverStageName = String(sourceOverrideTask?.name || sourceOverrideTask?.title || 'مرحله');
      if (!giverShelfId) {
        message.error('برای تحویل خروجی، قفسه مرحله مبدا تعیین نشده است.');
        return;
      }
      setHandoverContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sourceTaskId: sourceOverrideTask?.id ? String(sourceOverrideTask.id) : null,
          sourceStageName: giverStageName,
          sourceShelfId: giverShelfId,
          giver,
        };
      });
    }

    if (createNewForm) {
      // Create an unsaved draft form (no list insertion). It will be persisted on "ثبت فرم".
      setTimeout(() => {
        handleCreateHandoverForm();
      }, 0);
      return;
    }

    if (openFormId) {
      setTimeout(() => {
        openHandoverEditorForForm(openFormId);
      }, 0);
      return;
    }

    if (options.openEditor === true) {
      setHandoverEditorOpen(true);
      setHandoverFormsModalOpen(false);
    }
  }, [assigneeLabelFromIds, handleCreateHandoverForm, openHandoverEditorForForm, openTaskHandoverModal]);

  // داشبورد می‌تواند یک مرحله را در صفحهٔ اصلی سفارش هدف بگیرد؛ خودِ نمایش و فرم
  // همچنان توسط همین کامپوننت مرکزی انجام می‌شود تا منطق تحویل و مجوزها تکرار نشود.
  useEffect(() => {
    if (!focusedTaskId || !focusedTaskAction || isBom) return;
    const task = tasks.find((item: any) => String(item?.id) === String(focusedTaskId));
    if (!task) return;

    const actionKey = `${focusedTaskAction}:${String(focusedTaskId)}`;
    if (handledFocusedTaskRef.current === actionKey) return;
    handledFocusedTaskRef.current = actionKey;

    void (async () => {
      await openTaskHandoverModal(task, tasks);
      onFocusedTaskHandled?.();
    })();
  }, [focusedTaskAction, focusedTaskId, isBom, onFocusedTaskHandled, openTaskHandoverModal, tasks]);

  const handleOpenHandoverForm = useCallback((formId: string, ownerTaskId: string) => {
    if (!formId || !ownerTaskId) return;
    if (handoverTask?.id && String(ownerTaskId) === String(handoverTask.id)) {
      openHandoverEditorForForm(formId);
      return;
    }
    const allTasks = tasks;
    const targetTask = allTasks.find((task: any) => String(task?.id || '') === String(ownerTaskId));
    if (!targetTask) {
      message.error('مرحله مقصد یافت نشد.');
      return;
    }
    void openTaskHandoverModalWithOptions(targetTask, allTasks, { openFormId: formId, openEditor: true });
  }, [handoverTask, openHandoverEditorForForm, openTaskHandoverModalWithOptions, tasks]);

  const closeHandoverEditor = useCallback(() => {
    setHandoverEditorOpen(false);
    setHandoverFormsModalOpen(true);
    setActiveHandoverFormId((prevId) => {
      const exists = handoverForms.some((form) => String(form.id) === String(prevId));
      if (exists) return prevId;
      const fallback = handoverForms[0]?.id ? String(handoverForms[0].id) : null;
      if (fallback) {
        const fallbackForm = handoverForms.find((form) => String(form.id) === fallback) || null;
        if (fallbackForm) {
          setHandoverGroups(Array.isArray(fallbackForm.groups) ? fallbackForm.groups : []);
          setHandoverContext((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              targetShelfId: fallbackForm.targetShelfId || prev.targetShelfId,
              giverConfirmation: fallbackForm.giverConfirmation || { confirmed: false },
              receiverConfirmation: fallbackForm.receiverConfirmation || { confirmed: false },
              previousTotalsByProduct: toGroupTotals((fallbackForm.groups || []) as any),
              previousWasteByProduct: fallbackForm.wasteByProduct || {},
            };
          });
        }
      }
      return fallback;
    });
  }, [handoverForms, toGroupTotals]);

  const closeHandoverModal = useCallback(() => {
    setHandoverFormsModalOpen(false);
    setHandoverEditorOpen(false);
    setHandoverTask(null);
    setHandoverOrderTitle(null);
    setHandoverContext(null);
    setHandoverGroups([]);
    setHandoverForms([]);
    setNextStageTotalsByProduct({});
    setNextStageSubTotalsByProduct({});
    setHandoverNextTask(null);
    setActiveHandoverFormId(null);
    setHandoverTrafficType('incoming');
    setHandoverTrafficTypeEditable(true);
    setHandoverSourceStageValue(null);
    setHandoverSourceShelfId(null);
    setHandoverDestinationStageId(null);
    setHandoverStageInventoryRows([]);
  }, []);

  const handleConfirmGiver = useCallback(async () => {
    const ok = await saveHandover('giver');
    if (!ok) return;
  }, [saveHandover]);

  const handleConfirmReceiver = useCallback(async () => {
    const ok = await saveHandover('receiver');
    if (!ok) return;
  }, [saveHandover]);

  const handleAddLine = async (values: any) => {
    if (!recordId) return;
    try {
      let nextNo = values.line_no;
      if (!nextNo) {
        const { data: maxRow, error: maxError } = await supabase
          .from('production_lines')
          .select('line_no')
          .eq('production_order_id', recordId)
          .order('line_no', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxError) throw maxError;
        nextNo = (Number(maxRow?.line_no) || 0) + 1;
      }
      const payload = {
        production_order_id: recordId,
        line_no: nextNo,
        quantity: values.quantity || 0,
      };
      const { error } = await supabase.from('production_lines').insert(payload);
      if (error) throw error;
      message.success('خط تولید جدید اضافه شد');
      setIsLineModalOpen(false);
      lineForm.resetFields();
      fetchLines();
    } catch (error: any) {
      message.error(`خطا: ${error.message}`);
    }
  };

  const startLineQuantityEdit = useCallback((lineId: string, currentQuantity: any) => {
    setLineQuantityDrafts((prev) => ({ ...prev, [String(lineId)]: Math.max(0, toNumber(currentQuantity)) }));
  }, [toNumber]);

  const cancelLineQuantityEdit = useCallback((lineId: string) => {
    setLineQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[String(lineId)];
      return next;
    });
  }, []);

  const changeLineQuantityDraft = useCallback((lineId: string, value: any) => {
    const normalized = Math.max(0, toNumber(value));
    setLineQuantityDrafts((prev) => ({ ...prev, [String(lineId)]: normalized }));
  }, [toNumber]);

  const saveLineQuantityEdit = useCallback(async (lineId: string) => {
    const normalizedLineId = String(lineId);
    const currentLine = lines.find((line) => String(line.id) === normalizedLineId);
    if (!currentLine) return;

    const nextQty = Math.max(0, toNumber(lineQuantityDrafts[normalizedLineId]));
    const prevQty = Math.max(0, toNumber(currentLine.quantity));
    if (nextQty === prevQty) {
      cancelLineQuantityEdit(normalizedLineId);
      return;
    }

    const previousLines = lines;
    const nextLines = lines.map((line) =>
      String(line.id) === normalizedLineId ? { ...line, quantity: nextQty } : line
    );

    setLines(nextLines);
    cancelLineQuantityEdit(normalizedLineId);
    setSavingLineQuantityId(normalizedLineId);

    try {
      const { error } = await supabase
        .from('production_lines')
        .update({ quantity: nextQty })
        .eq('id', normalizedLineId);
      if (error) throw error;
      await syncOrderQuantity(nextLines);
    } catch (err: any) {
      setLines(previousLines);
      message.error(`خطا: ${err.message}`);
    } finally {
      setSavingLineQuantityId((prev) => (prev === normalizedLineId ? null : prev));
    }
  }, [cancelLineQuantityEdit, lineQuantityDrafts, lines, syncOrderQuantity, toNumber]);

  const openTaskModal = (lineId: string, draftStage?: any) => {
    setActiveLineId(lineId);
    setDraftToCreate(draftStage || null);
    const initial = {
      name: draftStage?.name || '',
      sort_order: draftStage?.sort_order || ((tasks.length + 1) * 10),
      wage: draftStage?.wage || 0,
      description: draftStage?.description || '',
      production_shelf_id: null,
    };
    taskForm.setFieldsValue(initial);
    setIsTaskModalOpen(true);
  };

  const handleAddTask = async (values: any) => {
    if (!recordId || !activeLineId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();

      let assigneeId = null;
      let assigneeType = null;

      if (values.assignee_combo) {
        if (values.assignee_combo.includes(':')) {
          const [type, id] = values.assignee_combo.split(':');
          assigneeType = type;
          assigneeId = id;
        } else {
          assigneeType = 'user';
          assigneeId = values.assignee_combo;
        }
      }

      const payload: any = {
        name: values.name,
        status: 'todo',
        produced_qty: 0,
        related_production_order: recordId,
        related_to_module: 'production_orders',
        production_line_id: activeLineId,
        assignee_id: assigneeType === 'user' ? assigneeId : null,
        assignee_role_id: assigneeType === 'role' ? assigneeId : null,
        assignee_type: assigneeType,
        production_shelf_id: values.production_shelf_id || null,
        due_date: values.due_date || null,
        wage: values.wage || null,
        description: values.description?.trim() || null,
        sort_order: values.sort_order || ((tasks.length + 1) * 10),
        created_by: user?.id,
      };

      const { error } = await supabase.from('tasks').insert(payload);
      if (error) throw error;

      message.success('مرحله جدید اضافه شد');
      setIsTaskModalOpen(false);
      taskForm.resetFields();
      setActiveLineId(null);
      setDraftToCreate(null);
      await fetchTasks();
    } catch (error: any) {
      message.error(`خطا: ${error.message}`);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const previousTask = tasks.find((item: any) => String(item?.id) === String(taskId));
    if (!previousTask) return;

    const patch = buildTaskStatusUpdatePayload(newStatus, {
      previousCompletedAt: previousTask?.completed_at || null,
      previousStatus: previousTask?.status ?? null,
      previousStartDate: previousTask?.start_date || null,
    });

    setTasks((prev) => prev.map((item: any) => (
      String(item?.id) === String(taskId)
        ? { ...item, ...patch }
        : item
    )));
    setHandoverTask((prev: any) => String(prev?.id || '') === String(taskId) ? { ...prev, ...patch } : prev);

    try {
      const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
      if (error) throw error;
      message.success('وضعیت بروزرسانی شد');
      const nextTasks = await fetchTasks();
      const refreshedTask = nextTasks.find((item: any) => String(item?.id) === String(taskId));
      if (refreshedTask) setHandoverTask((prev: any) => String(prev?.id || '') === String(taskId) ? refreshedTask : prev);
      await maybeOpenHandoverByStatus(taskId, newStatus, nextTasks);
    } catch (err: any) {
      setTasks((prev) => prev.map((item: any) => (
        String(item?.id) === String(taskId)
          ? previousTask
          : item
      )));
      setHandoverTask((prev: any) => String(prev?.id || '') === String(taskId) ? previousTask : prev);
      message.error(err?.message || 'خطا در بروزرسانی وضعیت');
    }
  };

  const handleProducedQtyChange = async (taskId: string, value: number | null) => {
    const nextProducedQty = Math.max(0, toNumber(value));
    const task = tasks.find((item: any) => String(item?.id) === String(taskId)) || handoverTask;
    await handleTaskFieldChange(task, { produced_qty: nextProducedQty }, { produced_qty: nextProducedQty });
  };

  const handleTaskFieldChange = async (task: any, patch: Record<string, any>, localPatch: Record<string, any> = patch) => {
    if (!task?.id) return;
    const taskId = String(task.id);
    const previousTask = tasks.find((item: any) => String(item?.id) === taskId) || task;
    const applyPatch = (item: any) => String(item?.id) === taskId ? { ...item, ...localPatch } : item;

    setTasks((previous: any[]) => previous.map(applyPatch));
    setHandoverTask((previous: any) => String(previous?.id || '') === taskId ? { ...previous, ...localPatch } : previous);
    try {
      const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
      if (error) throw error;
    } catch (error: any) {
      setTasks((previous: any[]) => previous.map((item: any) => String(item?.id) === taskId ? previousTask : item));
      setHandoverTask((previous: any) => String(previous?.id || '') === taskId ? previousTask : previous);
      message.error(error?.message || 'بروزرسانی اطلاعات فعالیت ناموفق بود.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
      case 'completed':
        return '#10b981';
      case 'review':
        return '#f97316';
      case 'in_progress':
        return '#3b82f6';
      case 'todo':
      case 'pending':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

  const getStatusLabel = useCallback((status: string) => {
    switch (String(status || '').toLowerCase()) {
      case 'done':
      case 'completed':
        return 'تکمیل شده';
      case 'review':
        return 'بازبینی';
      case 'in_progress':
        return 'در حال انجام';
      case 'todo':
      case 'pending':
        return 'انجام نشده';
      default:
        return 'نامشخص';
    }
  }, []);

  const getTaskHandoverIssue = useCallback((task: any): string | null => {
    if (!task || task?.type === 'draft') return null;
    const handover = getHandoverFromTask(task);
    const forms = Array.isArray(handover?.forms)
      ? handover.forms
      : (Array.isArray(handover?.groups) ? [handover] : []);
    if (forms.some((form: any) => !form?.giverConfirmation?.confirmed || !form?.receiverConfirmation?.confirmed)) {
      return 'فرم تحویل این مرحله هنوز توسط هر دو طرف امضا نشده است.';
    }
    const status = String(task?.status || '').toLowerCase();
    if (['done', 'completed'].includes(status) && forms.length === 0) {
      return 'مرحله تکمیل شده، اما فرم تحویل ثبت نشده است.';
    }
    if (status === 'review') return 'این مرحله نیاز به بازبینی دارد.';
    return null;
  }, [getHandoverFromTask]);

  const taskStatusActions = useMemo(() => ([
    {
      value: 'todo',
      label: 'انجام نشده',
      icon: <CloseOutlined />,
    },
    {
      value: 'in_progress',
      label: 'در حال انجام',
      icon: <PlayCircleOutlined />,
    },
    {
      value: 'done',
      label: 'تکمیل شده',
      icon: <CheckOutlined />,
    },
    {
      value: 'review',
      label: 'بازبینی',
      icon: <AuditOutlined />,
    },
  ]), []);

  const getAssigneeLabel = (task: any) => {
    if (task.assignee_role_id && task.assigned_role) {
      return `تیم ${task.assigned_role.title}`;
    }
    if (task.assignee_id && task.assignee) {
      return task.assignee.full_name;
    }
    return 'تعیین نشده';
  };

  const getTaskAssigneeValue = (task: any) => {
    if (task?.assignee_role_id) return `role:${task.assignee_role_id}`;
    if (task?.assignee_id) return `user:${task.assignee_id}`;
    return undefined;
  };

  const isTaskAssignedToCurrentUser = useCallback((task: any) => {
    if (!task || !currentUser.id) return false;
    const assigneeType = String(task?.assignee_type || '');
    const assigneeUserId = task?.assignee_id ? String(task.assignee_id) : null;
    const assigneeRoleId = task?.assignee_role_id ? String(task.assignee_role_id) : (assigneeType === 'role' && assigneeUserId ? assigneeUserId : null);
    if ((assigneeType === 'role' || task?.assignee_role_id) && currentUser.roleId) {
      return Boolean(assigneeRoleId && String(assigneeRoleId) === String(currentUser.roleId));
    }
    return Boolean(assigneeUserId && String(assigneeUserId) === String(currentUser.id));
  }, [currentUser.id, currentUser.roleId]);

  const getShelfLabel = useCallback((shelfId: string | null | undefined) => {
    if (!shelfId) return 'تعیین نشده';
    const option = allShelfOptions.find((item) => String(item.value) === String(shelfId));
    return option?.label || 'اطلاعات قفسه در دسترس نیست';
  }, [allShelfOptions]);

  const renderDate = (dateVal: any) => {
    if (!dateVal) return null;
    try {
      const jsDate = new Date(dateVal);
      if (Number.isNaN(jsDate.getTime())) return null;
      const formatted = new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      })
        .convert(persian, persian_fa)
        .format('YYYY/MM/DD HH:mm');
      return formatted ? toPersianNumber(formatted) : null;
    } catch {
      return null;
    }
  };

  const handoverSummaryRows = useMemo<StageHandoverSummaryRow[]>(() => {
    if (!handoverContext) return [];
    const productMeta = new Map<string, { name: string; code: string; unit: string; subUnit: string }>();
    const orderPiecesByProduct: Record<string, any[]> = {};
    const orderSubTotalsByProduct: Record<string, number> = {};
    (handoverContext.groups || []).forEach((group) => {
      const productId = group?.selectedProductId ? String(group.selectedProductId) : '';
      if (!productId) return;
      const firstPiece = Array.isArray(group?.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
      if (!productMeta.has(productId)) {
        productMeta.set(productId, {
          name: String(group?.selectedProductName || '-'),
          code: String(group?.selectedProductCode || ''),
          unit: String(firstPiece?.mainUnit || ''),
          subUnit: String(firstPiece?.subUnit || ''),
        });
      }

      const orderPieces = Array.isArray(group?.orderPieces) ? group.orderPieces : [];
      orderPiecesByProduct[productId] = orderPieces.map((piece: any, pieceIndex: number) => {
        const mainQty = Math.max(0, toNumber(piece?.sourceQty));
        const subQty = Math.max(0, toNumber(piece?.subQty ?? piece?.subUsage ?? piece?.sub_usage ?? piece?.qty_sub ?? 0));
        return {
          key: String(piece?.key || `${productId}_order_${pieceIndex}`),
          name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
          length: Math.max(0, toNumber(piece?.length)),
          width: Math.max(0, toNumber(piece?.width)),
          quantity: Math.max(0, toNumber(piece?.quantity)),
          mainUnit: String(piece?.mainUnit || piece?.main_unit || ''),
          subUnit: String(piece?.subUnit || piece?.sub_unit || ''),
          mainQty,
          subQty,
        };
      });
      orderSubTotalsByProduct[productId] = (orderPiecesByProduct[productId] || []).reduce(
        (sum: number, piece: any) => sum + Math.max(0, toNumber(piece?.subQty)),
        0
      );
    });

    const incomingTotals: Record<string, number> = {};
    const incomingSubTotals: Record<string, number> = {};
    handoverForms.forEach((form) => {
      if (String(form?.direction || 'incoming') === 'outgoing') return;
      const totals = toGroupTotals((form?.groups || []) as any);
      const subTotals = toGroupSubTotals((form?.groups || []) as any);
      Object.entries(totals).forEach(([productId, qty]) => {
        incomingTotals[productId] = (incomingTotals[productId] || 0) + toNumber(qty);
      });
      Object.entries(subTotals).forEach(([productId, qty]) => {
        incomingSubTotals[productId] = (incomingSubTotals[productId] || 0) + toNumber(qty);
      });
    });

    const allProductIds = new Set<string>([
      ...Object.keys(handoverContext.orderTotalsByProduct || {}),
      ...Object.keys(orderSubTotalsByProduct || {}),
      ...Object.keys(incomingTotals || {}),
      ...Object.keys(incomingSubTotals || {}),
      ...Object.keys(nextStageTotalsByProduct || {}),
      ...Object.keys(nextStageSubTotalsByProduct || {}),
    ]);

    return Array.from(allProductIds).map((productId) => {
      const meta = productMeta.get(productId) || { name: '-', code: '', unit: '', subUnit: '' };
      return {
        orderId: handoverContext.orderId,
        orderTitle: handoverOrderTitle,
        productId,
        productName: meta.name,
        productCode: meta.code,
        unit: meta.unit,
        subUnit: meta.subUnit,
        sourceQty: toNumber(incomingTotals?.[productId]),
        sourceSubQty: toNumber(incomingSubTotals?.[productId]),
        orderQty: toNumber(handoverContext.orderTotalsByProduct?.[productId]),
        orderSubQty: toNumber(orderSubTotalsByProduct?.[productId]),
        deliveredQty: toNumber(nextStageTotalsByProduct?.[productId]),
        deliveredSubQty: toNumber(nextStageSubTotalsByProduct?.[productId]),
        orderPieces: orderPiecesByProduct[productId] || [],
      };
    });
  }, [
    handoverContext,
    handoverForms,
    handoverOrderTitle,
    nextStageSubTotalsByProduct,
    nextStageTotalsByProduct,
    toGroupSubTotals,
    toGroupTotals,
    toNumber,
  ]);

  const handoverStageOptions = useMemo<StageHandoverTaskOption[]>(() => {
    if (!handoverTask?.id) return [];
    const currentTaskId = String(handoverTask.id);
    const lineId = handoverTask?.production_line_id ? String(handoverTask.production_line_id) : null;
    const chain = getLineTaskChain(lineId, tasks);
    return chain
      .filter((task: any) => String(task?.id || '') && String(task.id) !== currentTaskId)
      .map((task: any) => {
        const stageName = String(task?.name || task?.title || 'مرحله');
        const stageShelfId = task?.production_shelf_id ? String(task.production_shelf_id) : null;
        const stageShelfLabel = stageShelfId ? getShelfLabel(stageShelfId) : 'قفسه تعیین نشده';
        const stageAssigneeLabel = task?.assignee_type === 'role'
          ? String(task?.assigned_role?.title || '')
          : String(task?.assignee?.full_name || '');
        const sortOrder = task?.sort_order !== undefined && task?.sort_order !== null
          ? ` (ترتیب: ${toPersianNumber(task.sort_order)})`
          : '';
        return {
          value: String(task.id),
          label: [stageAssigneeLabel, stageName, `قفسه: ${stageShelfLabel}`].filter(Boolean).join(' — ') + sortOrder,
          shelfId: stageShelfId,
          shelfLabel: stageShelfLabel,
        };
      });
  }, [getLineTaskChain, getShelfLabel, handoverTask, tasks]);

  const handoverFormRows = useMemo<StageHandoverFormListRow[]>(() => {
    if (!handoverTask?.id) return [];
    const currentTaskId = String(handoverTask.id);
    const currentStageName = String(handoverTask?.name || handoverTask?.title || 'مرحله');
    const lineId = handoverTask?.production_line_id ? String(handoverTask.production_line_id) : null;
    const chain = getLineTaskChain(lineId, tasks);
    const taskById = new Map<string, any>(chain.map((task: any) => [String(task?.id || ''), task]));
    const buildPiecesByProduct = (groups: any[]): Record<string, any[]> => {
      const result: Record<string, any[]> = {};
      (Array.isArray(groups) ? groups : []).forEach((group: any, groupIndex: number) => {
        const productId = String(group?.selectedProductId || group?.selected_product_id || '').trim();
        if (!productId) return;
        const rows = Array.isArray(group?.deliveryRows) && group.deliveryRows.length > 0
          ? group.deliveryRows
          : (Array.isArray(group?.pieces) ? group.pieces : []);
        const mapped = rows.map((row: any, rowIndex: number) => {
          const length = Math.max(0, toNumber(row?.length));
          const width = Math.max(0, toNumber(row?.width));
          const quantity = Math.max(0, toNumber(row?.quantity));
          const mainQty = row?.deliveredQty !== undefined
            ? Math.max(0, toNumber(row?.deliveredQty))
            : (length * width * quantity);
          const baseSubQty = Math.max(0, toNumber(row?.subQty ?? row?.sub_qty));
          const subUsage = Math.max(0, toNumber(row?.subUsage ?? row?.sub_usage ?? row?.qty_sub));
          const subQty = baseSubQty > 0 ? baseSubQty : (subUsage > 0 ? subUsage * (quantity || 1) : 0);
          return {
            key: String(row?.key || `${productId}_${groupIndex}_${rowIndex}`),
            name: String(row?.name || `قطعه ${rowIndex + 1}`),
            length,
            width,
            quantity,
            mainUnit: String(row?.mainUnit || row?.main_unit || ''),
            subUnit: String(row?.subUnit || row?.sub_unit || ''),
            mainQty,
            subQty,
          };
        });
        result[productId] = [...(result[productId] || []), ...mapped];
      });
      return result;
    };

    const getSubTotalsFromPieces = (piecesByProduct: Record<string, any[]>) => {
      const totals: Record<string, number> = {};
      Object.entries(piecesByProduct || {}).forEach(([productId, rows]) => {
        totals[productId] = (rows || []).reduce(
          (sum: number, row: any) => sum + Math.max(0, toNumber(row?.subQty ?? 0)),
          0
        );
      });
      return totals;
    };

    const incomingRows: StageHandoverFormListRow[] = handoverForms.map((form, index) => {
      const direction: 'incoming' | 'outgoing' = form.direction === 'outgoing' ? 'outgoing' : 'incoming';
      const destinationTask = form.destinationTaskId ? taskById.get(String(form.destinationTaskId)) : null;
      const receiverLabel = direction === 'outgoing'
        ? (form.receiver?.label || assigneeLabelFromIds(destinationTask?.assignee_id, destinationTask?.assignee_type) || null)
        : (form.receiver?.label || assigneeLabelFromIds(handoverTask?.assignee_id, handoverTask?.assignee_type) || null);
      const receiverStage = direction === 'outgoing'
        ? String(destinationTask?.name || destinationTask?.title || 'مرحله بعدی')
        : currentStageName;
      const giverStage = direction === 'outgoing'
        ? currentStageName
        : (form.sourceStageName || 'مرحله قبلی');
      const piecesByProduct = buildPiecesByProduct((form.groups || []) as any);
      return {
        id: String(form.id),
        ownerTaskId: currentTaskId,
        direction,
        title: `فرم ${toPersianNumber(index + 1)}`,
        giverName: form.giver?.label || null,
        giverStage,
        receiverName: receiverLabel,
        receiverStage,
        createdAt: form.createdAt || null,
        updatedAt: form.updatedAt || null,
        giverConfirmed: !!form.giverConfirmation?.confirmed,
        receiverConfirmed: !!form.receiverConfirmation?.confirmed,
        totalsByProduct: toGroupTotals((form.groups || []) as any),
        totalsSubByProduct: getSubTotalsFromPieces(piecesByProduct),
        piecesByProduct,
      };
    });

    const outgoingRows: StageHandoverFormListRow[] = [];
    chain.forEach((task: any) => {
      const ownerTaskId = String(task?.id || '');
      if (!ownerTaskId || ownerTaskId === currentTaskId) return;
      const ownerStageName = String(task?.name || task?.title || 'مرحله');
      const ownerReceiverName = assigneeLabelFromIds(task?.assignee_id, task?.assignee_type);
      const handover = getHandoverFromTask(task);
      if (!handover) return;

      const rawForms = Array.isArray(handover?.forms) ? handover.forms : [];
      const legacyForms =
        rawForms.length === 0 && Array.isArray(handover?.groups)
          ? [{
              id: handover?.activeFormId || `handover_legacy_${ownerTaskId}`,
              sourceTaskId: handover?.sourceTaskId || null,
              sourceStageName: handover?.sourceStageName || null,
              giver: handover?.giver || null,
              receiver: handover?.receiver || null,
              giverConfirmation: handover?.giverConfirmation || null,
              receiverConfirmation: handover?.receiverConfirmation || null,
              createdAt: handover?.updatedAt || null,
              updatedAt: handover?.updatedAt || null,
              groups: handover?.groups || [],
            }]
          : [];

      const seeded = rawForms.length > 0 ? rawForms : legacyForms;
      seeded.forEach((form: any, index: number) => {
        const sourceId = form?.sourceTaskId ? String(form.sourceTaskId) : '';
        if (sourceId !== currentTaskId) return;
        const piecesByProduct = buildPiecesByProduct((form?.groups || []) as any);
        outgoingRows.push({
          id: String(form?.id || `handover_form_${ownerTaskId}_${index}`),
          ownerTaskId,
          direction: 'outgoing',
          title: `فرم ${toPersianNumber(index + 1)}`,
          giverName: form?.giver?.label || assigneeLabelFromIds(handoverTask?.assignee_id, handoverTask?.assignee_type) || null,
          giverStage: String(form?.sourceStageName || currentStageName || ''),
          receiverName: form?.receiver?.label || ownerReceiverName || null,
          receiverStage: ownerStageName,
          createdAt: form?.createdAt || form?.updatedAt || null,
          updatedAt: form?.updatedAt || form?.createdAt || null,
          giverConfirmed: !!form?.giverConfirmation?.confirmed,
          receiverConfirmed: !!form?.receiverConfirmation?.confirmed,
          totalsByProduct: toGroupTotals((form?.groups || []) as any),
          totalsSubByProduct: getSubTotalsFromPieces(piecesByProduct),
          piecesByProduct,
        });
      });
    });

    return [...incomingRows, ...outgoingRows].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [assigneeLabelFromIds, getHandoverFromTask, getLineTaskChain, handoverForms, handoverTask, tasks, toGroupTotals, toNumber]);

  const buildHandoverGroupHistoryKey = useCallback((group: any, fallbackIndex: number) => {
    const categoryLabel = String(group?.categoryLabel || '').trim();
    const productId = String(group?.selectedProductId || '').trim();
    if (categoryLabel || productId) return `${categoryLabel}::${productId}`;
    return String(group?.key || `group_${fallbackIndex}`);
  }, []);

  const handoverPreviousRowsByGroupKey = useMemo<Record<string, StageHandoverDeliveryRow[]>>(() => {
    const map: Record<string, StageHandoverDeliveryRow[]> = {};
    const activeFormId = String(activeHandoverFormId || '').trim();
    (handoverForms || []).forEach((form) => {
      if (activeFormId && String(form?.id || '').trim() === activeFormId) return;
      const groups = Array.isArray(form?.groups) ? form.groups : [];
      groups.forEach((group: any, groupIndex: number) => {
        const groupKey = buildHandoverGroupHistoryKey(group, groupIndex);
        if (!groupKey) return;
        const rows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
        const normalizedRows = rows.map((row: any, rowIndex: number) => ({
          ...normalizeProductionDeliverySnapshot(row, group),
          key: String(row?.key || `${String(form?.id || 'form')}_${groupIndex}_${rowIndex}`),
          pieceKey: row?.pieceKey ? String(row.pieceKey) : undefined,
          name: String(row?.name || ''),
          length: Math.max(0, toNumber(row?.length)),
          width: Math.max(0, toNumber(row?.width)),
          quantity: Math.max(0, toNumber(row?.quantity)),
          mainUnit: String(row?.mainUnit || row?.main_unit || ''),
          subUnit: String(row?.subUnit || row?.sub_unit || ''),
          mainQuantity: Math.max(0, toNumber(row?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity)))),
          subQuantity: Math.max(0, toNumber(row?.subQuantity ?? 0)),
          deliveredQty: Math.max(0, toNumber(row?.mainQuantity ?? row?.deliveredQty ?? (toNumber(row?.length) * toNumber(row?.width) * toNumber(row?.quantity)))),
        }));
        if (!normalizedRows.length) return;
        map[groupKey] = [...(map[groupKey] || []), ...normalizedRows];
      });
    });
    return map;
  }, [activeHandoverFormId, buildHandoverGroupHistoryKey, handoverForms, toNumber]);

  const handoverEditorGroups = useMemo<StageHandoverGroup[]>(() => {
    return (handoverGroups || []).map((group, groupIndex) => {
      const groupKey = buildHandoverGroupHistoryKey(group, groupIndex);
      const previousRows = handoverPreviousRowsByGroupKey[groupKey] || [];
      const previousDeliveredQty = previousRows.reduce((sum, row) => {
        const explicitQty = toNumber((row as any)?.deliveredQty);
        if (explicitQty > 0) return sum + explicitQty;
        return sum + (Math.max(0, toNumber((row as any)?.length)) * Math.max(0, toNumber((row as any)?.width)) * Math.max(0, toNumber((row as any)?.quantity)));
      }, 0);
      return {
        ...group,
        previousDeliveryRows: previousRows,
        previousDeliveredQty,
      };
    });
  }, [buildHandoverGroupHistoryKey, handoverGroups, handoverPreviousRowsByGroupKey, toNumber]);

  const renderStageDetails = (stage: any, lineQuantity = 0) => {
    const wage = Math.max(0, toNumber(stage?.wage));
    const lineWage = wage * Math.max(0, toNumber(lineQuantity));
    const handoverIssue = getTaskHandoverIssue(stage);
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-2 text-[11px] text-gray-600 space-y-1">
        <div className="font-bold text-gray-800 truncate flex items-center gap-1">
          {handoverIssue ? <WarningOutlined className="text-amber-500" title={handoverIssue} /> : null}
          {stage?.title || stage?.name || stage?.label || 'مرحله'}
        </div>
        <div>وضعیت: {stage?.type === 'draft' ? 'پیش‌نویس' : getStatusLabel(stage?.status)}</div>
        {stage?.type !== 'draft' ? <div>مسئول: {getAssigneeLabel(stage)}</div> : null}
        {stage?.type !== 'draft' ? <div>مقدار تولیدشده: {toPersianNumber(toNumber(stage?.produced_qty).toLocaleString('en-US'))}</div> : null}
        <div>دستمزد تکی: {toPersianNumber(wage.toLocaleString('en-US'))} تومان</div>
        <div>دستمزد کل این خط: {toPersianNumber(lineWage.toLocaleString('en-US'))} تومان</div>
        {stage?.due_date ? <div>موعد: {renderDate(stage.due_date)}</div> : null}
      </div>
    );
  };

  const toggleStageBar = (barKey: string) => {
    setExpandedStageBars((prev) => ({ ...prev, [barKey]: !prev[barKey] }));
  };

  const draftList = Array.isArray(draftLocal) ? draftLocal : [];
  const totalWage = lines.reduce((sum, line) => {
    const lineTasks = tasksByLine.get(String(line.id)) || [];
    const lineWage = lineTasks.reduce((acc, t) => acc + (parseFloat(t.wage) || 0), 0);
    const qty = parseFloat(line.quantity) || 0;
    return sum + (lineWage * qty);
  }, 0);
  const visibleLines = useMemo(() => {
    if (!onlyLineId) return lines;
    return lines.filter((line: any) => String(line?.id || '') === String(onlyLineId));
  }, [lines, onlyLineId]);

  const saveDraftStages = async (nextStages: any[]) => {
    const previousStages = draftLocal;
    setDraftLocal(nextStages);
    try {
      if (onDraftStagesChange) await onDraftStagesChange(nextStages);
      const draftStagesTable = moduleId === 'production_boms'
        ? 'production_boms'
        : moduleId === 'production_orders'
          ? 'production_orders'
          : null;
      if (draftStagesTable && recordId && !draftStagesPersistedByParent) {
        const { error } = await supabase
          .from(draftStagesTable)
          .update({ production_stages_draft: nextStages })
          .eq('id', recordId);
        if (error) throw error;
      }
    } catch (error: any) {
      setDraftLocal(previousStages);
      message.error(error?.message || 'ذخیره مراحل پیش‌نویس ناموفق بود.');
      throw error;
    }
  };

  const handleAddDraftStage = async (values: any) => {
    let next = [...draftLocal];
    if (editingDraft?.id) {
      next = next.map((stage: any) =>
        stage.id === editingDraft.id
          ? { ...stage, name: values.name, description: values.description?.trim() || null, sort_order: values.sort_order || stage.sort_order }
          : stage
      );
    } else {
      next.push({
        id: Date.now(),
        name: values.name,
        description: values.description?.trim() || null,
        sort_order: values.sort_order || ((draftLocal.length + 1) * 10),
      });
    }
    await saveDraftStages(next);
    setIsDraftModalOpen(false);
    setEditingDraft(null);
    draftForm.resetFields();
  };

  const handleRemoveDraftStage = async (id: any) => {
    Modal.confirm({
      title: 'حذف مرحله پیش‌نویس',
      content: 'آیا از حذف این مرحله پیش‌نویس مطمئن هستید؟',
      okText: 'حذف',
      okType: 'danger',
      cancelText: 'انصراف',
      onOk: async () => {
        const next = draftLocal.filter((s: any) => String(s?.id ?? '') !== String(id ?? ''));
        await saveDraftStages(next);
      },
    });
  };

  useEffect(() => {
    if (!isDraftModalOpen) return;
    if (editingDraft) {
      draftForm.setFieldsValue({
        name: editingDraft.name,
        description: editingDraft.description || '',
        sort_order: editingDraft.sort_order,
      });
    } else {
      draftForm.resetFields();
    }
  }, [isDraftModalOpen, editingDraft, draftForm]);

  const normalizeStageName = (val: any) => String(val || '').trim().toLowerCase();
  const draftSegments = draftList
    .filter((stage: any) => String(stage?.name || stage?.title || '').trim() !== '')
    .map((stage: any) => ({
    ...stage,
    type: 'draft',
    label: stage.name || stage.title || 'مرحله',
    }));

  const getLineSegments = (lineTasks: any[]) => {
    const normalizedTasks = (lineTasks || []).map((task: any) => ({
      ...task,
      type: 'task',
      _normalizedName: normalizeStageName(task.name || task.title),
    }));

    const lineDrafts = draftSegments.filter((draft: any) => {
      const normalizedDraft = normalizeStageName(draft.label);
      const matched = normalizedTasks.some((t: any) => t._normalizedName && t._normalizedName === normalizedDraft);
      return !matched;
    });

    const merged = [...normalizedTasks, ...lineDrafts].sort((a: any, b: any) => {
      const aOrder = Number(a.sort_order ?? 0);
      const bOrder = Number(b.sort_order ?? 0);
      return aOrder - bOrder;
    });

    return merged;
  };

  const handleCopyLine = async (line: any) => {
    if (!recordId || !line?.id) return;
    try {
      setLoading(true);
      const { data: maxRow, error: maxError } = await supabase
        .from('production_lines')
        .select('line_no')
        .eq('production_order_id', recordId)
        .order('line_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxError) throw maxError;
      const nextLineNo = (Number(maxRow?.line_no) || 0) + 1;

      const { data: newLine, error: lineError } = await supabase
        .from('production_lines')
        .insert({
          production_order_id: recordId,
          line_no: nextLineNo,
          quantity: line.quantity || 0,
        })
        .select('id')
        .single();
      if (lineError) throw lineError;

      const sourceTasks = tasksByLine.get(String(line.id)) || [];
      if (newLine?.id && sourceTasks.length > 0) {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || null;
        const payload = sourceTasks.map((task: any) => ({
          name: task.name || task.title,
          status: 'todo',
          produced_qty: toNumber(task?.produced_qty),
          related_production_order: recordId,
          related_to_module: 'production_orders',
          production_line_id: newLine.id,
          assignee_id: task.assignee_id ?? null,
          assignee_role_id: task.assignee_role_id ?? null,
          assignee_type: task.assignee_type ?? null,
          due_date: task.due_date ?? null,
          wage: task.wage ?? null,
          description: task.description ?? null,
          sort_order: task.sort_order ?? null,
          created_by: userId,
        }));
        const { error: taskError } = await supabase.from('tasks').insert(payload);
        if (taskError) throw taskError;
      }

      message.success('خط تولید کپی شد');
      fetchLines();
      fetchTasks();
    } catch (error: any) {
      message.error(`خطا در کپی خط: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLine = (line: any) => {
    if (!recordId || !line?.id) return;
    if (isLineCreationLocked) {
      message.warning('در وضعیت در حال تولید امکان حذف خط وجود ندارد.');
      return;
    }
    Modal.confirm({
      title: 'حذف خط تولید',
      content: `آیا از حذف خط ${toPersianNumber(line.line_no || '')} و تمام مراحل آن مطمئن هستید؟`,
      okText: 'حذف',
      okType: 'danger',
      cancelText: 'انصراف',
      onOk: async () => {
        try {
          setLoading(true);
          const { data: deleted, error: deleteError } = await supabase.rpc('delete_production_line_cascade', {
            p_line_id: String(line.id),
          });
          if (deleteError) throw deleteError;
          if (!deleted) throw new Error('خط تولید پیدا نشد یا امکان حذف آن وجود ندارد.');
          message.success('خط تولید حذف شد.');
          await fetchLines();
          await fetchTasks();
        } catch (error: any) {
          message.error(`خطا در حذف خط: ${error?.message || 'خطای نامشخص'}`);
        } finally {
          setLoading(false);
        }
      },
    });
  };

  if (!isReadyToLoad && readOnly && compact && !isBom) {
    return (
      <div ref={containerRef} className="w-full select-none" dir="rtl">
        <div className="w-full h-5 rounded-lg border border-gray-200 bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">
          ...
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full flex flex-col gap-4 select-none" dir="rtl">
      {isBom && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500">مراحل پیش‌نویس (BOM)</div>
          <div className={`flex-1 flex bg-gray-100 rounded-lg overflow-hidden border border-gray-200 ${compact ? 'h-5' : 'h-9'}`}>
            {draftSegments.length > 0 ? (
              draftSegments.map((stage: any, index: number) => (
                <Popover
                  key={stage.id || index}
                  content={
                    <div className="space-y-2 text-xs">
                      <div className="font-bold text-gray-700">{stage.label}</div>
                      <div>ترتیب: {toPersianNumber(stage.sort_order || '-')}</div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <Button size="small" onClick={() => { setEditingDraft(stage); setIsDraftModalOpen(true); }}>ویرایش</Button>
                          <Button size="small" danger onClick={() => handleRemoveDraftStage(stage.id)}>حذف</Button>
                        </div>
                      )}
                    </div>
                  }
                  trigger="click"
                  overlayStyle={{ zIndex: 10000 }}
                >
                  <div
                    className={`relative flex items-center justify-center cursor-pointer transition-all group ${index !== 0 ? 'border-r border-white/30' : ''}`}
                    style={{ flex: 1, border: '1px dashed #d1d5db', backgroundColor: 'transparent' }}
                  >
                    <span className={`text-gray-600 font-medium truncate w-full text-center ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                      {stage.label}
                    </span>
                  </div>
                </Popover>
              ))
            ) : (
              <div className="w-full flex items-center justify-center text-gray-400 text-xs bg-gray-50 h-full">
                {compact ? <span className="opacity-50">-</span> : 'بدون مرحله پیش‌نویس'}
              </div>
            )}
          </div>

          {!readOnly && (
            <div className="flex justify-start">
              <Tooltip title="افزودن مرحله پیش‌نویس">
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  size={compact ? 'small' : 'middle'}
                  onClick={() => { setEditingDraft(null); setIsDraftModalOpen(true); }}
                  className="border-leather-300 text-leather-700 hover:!border-leather-600 hover:!text-leather-600 hover:!bg-leather-50"
                >
                  افزودن مرحله
                </Button>
              </Tooltip>
            </div>
          )}

          <div className="flex justify-center">
            <Button
              type="text"
              size="small"
              aria-label={expandedStageBars.draft ? 'بستن اطلاعات مراحل پیش‌نویس' : 'نمایش اطلاعات مراحل پیش‌نویس'}
              icon={<DownOutlined className={`transition-transform ${expandedStageBars.draft ? 'rotate-180' : ''}`} />}
              onClick={() => toggleStageBar('draft')}
              className="!text-gray-500 hover:!text-leather-700"
            />
          </div>
          {expandedStageBars.draft && draftSegments.length > 0 ? (
            <div className={`grid gap-2 ${draftSegments.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              {draftSegments.map((stage: any) => <div key={`draft-detail-${stage.id}`}>{renderStageDetails(stage)}</div>)}
            </div>
          ) : null}
        </div>
      )}

      {!isBom && visibleLines.map((line) => {
        const lineTasks = tasksByLine.get(String(line.id)) || [];
        const canEditQuantity = !readOnly && (!orderStatus || orderStatus === 'pending');
        const showInlineQty = !compact || canEditQuantity;
        const lineId = String(line.id);
        const isEditingQuantity = Object.prototype.hasOwnProperty.call(lineQuantityDrafts, lineId);
        const currentQty = Math.max(0, toNumber(line.quantity));
        const draftQty = isEditingQuantity ? Math.max(0, toNumber(lineQuantityDrafts[lineId])) : currentQty;
        const lineSegments = getLineSegments(lineTasks);
        return (
          <div key={line.id} className="space-y-2">
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="font-bold">
                  خط {toPersianNumber(line.line_no)}{compact ? `: ${toPersianNumber(line.quantity || 0)} عدد` : ''}
                </span>
                {showInlineQty && (
                  <div className="flex items-center gap-2">
                    <span>تعداد تولید:</span>
                    {isEditingQuantity ? (
                      <>
                        <InputNumber
                          min={0}
                          className="w-24"
                          value={draftQty}
                          onChange={(val) => changeLineQuantityDraft(lineId, val)}
                          onPressEnter={() => { void saveLineQuantityEdit(lineId); }}
                          disabled={!canEditQuantity || savingLineQuantityId === lineId}
                        />
                        <Button
                          size="small"
                          type="primary"
                          icon={<CheckOutlined />}
                          className="bg-green-500 hover:!bg-green-600 border-none"
                          loading={savingLineQuantityId === lineId}
                          onClick={() => { void saveLineQuantityEdit(lineId); }}
                        />
                        <Button
                          size="small"
                          icon={<CloseOutlined />}
                          danger
                          disabled={savingLineQuantityId === lineId}
                          onClick={() => cancelLineQuantityEdit(lineId)}
                        />
                      </>
                    ) : (
                      <button
                        type="button"
                        className={`group flex items-center gap-1 rounded px-1 py-0.5 ${canEditQuantity ? 'hover:bg-leather-50 cursor-pointer' : 'cursor-default'}`}
                        onClick={() => canEditQuantity && startLineQuantityEdit(lineId, line.quantity)}
                        disabled={!canEditQuantity}
                      >
                        <span className="font-medium">{toPersianNumber(currentQty.toLocaleString('en-US'))}</span>
                        {canEditQuantity && <EditOutlined className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs" />}
                      </button>
                    )}
                  </div>
                )}
                {!readOnly && (
                  <>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => handleCopyLine(line)}
                      className="text-leather-700 hover:!text-leather-600"
                      disabled={isLineCreationLocked}
                    >
                      کپی خط
                    </Button>
                    <Tooltip title="حذف خط">
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteLine(line)}
                        disabled={isLineCreationLocked}
                        aria-label="حذف خط تولید"
                      />
                    </Tooltip>
                  </>
                )}
              </div>

            <div className="w-full flex items-center gap-2">
              {!readOnly && (
                <Tooltip title="افزودن مرحله جدید">
                  <Button
                    type="dashed"
                    shape="circle"
                    icon={<PlusOutlined />}
                    size={compact ? 'small' : 'middle'}
                    onClick={() => {
                      openTaskModal(line.id);
                    }}
                    className="flex-shrink-0 border-leather-300 text-leather-700 hover:!border-leather-600 hover:!text-leather-600 hover:!bg-leather-50"
                  />
                </Tooltip>
              )}

              <div className={`relative flex-1 flex bg-gray-100 rounded-lg overflow-visible border border-gray-200 ${compact ? 'min-h-16' : 'min-h-24'}`}>
                {lineSegments.map((segment: any, index: number) => (
                  segment.type === 'task' ? (
                    (() => {
                      const isAssignedToCurrent = isTaskAssignedToCurrentUser(segment);
                      const isHighlightedTask = isAssignedToCurrent;
                      const segmentColor = getStatusColor(segment.status);
                      const handoverIssue = getTaskHandoverIssue(segment);
                      const assigneeName = getAssigneeLabel(segment);
                      return (
                      <div
                        key={segment.id}
                        id={String(focusedTaskId) === String(segment.id) ? `production-stage-task-${String(segment.id)}` : undefined}
                        role="button"
                        tabIndex={0}
                        onClick={() => { void openTaskHandoverModal(segment, tasks); }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            void openTaskHandoverModal(segment, tasks);
                          }
                        }}
                        className={`relative flex items-center justify-center cursor-pointer transition-all hover:brightness-110 group ${index !== 0 ? 'border-r border-white/30' : ''} ${index === 0 ? 'rounded-r-lg' : ''} ${index === lineSegments.length - 1 ? 'rounded-l-lg' : ''} ${isHighlightedTask ? 'z-10' : ''}`}
                        style={{
                          flex: 1,
                          backgroundColor: segmentColor,
                          boxShadow: isHighlightedTask
                            ? `0 0 8px ${segmentColor}66, 0 0 16px ${segmentColor}4D, 0 0 24px ${segmentColor}33`
                            : undefined,
                        }}
                      >
                        <div className="relative flex flex-col items-center justify-center w-full h-full px-8 overflow-hidden">
                          <Avatar
                            size={compact ? 22 : 28}
                            src={normalizeStoragePublicUrl(segment?.assignee?.avatar_url) || undefined}
                            icon={segment.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
                            className="!absolute right-1.5 top-1.5 !bg-white/90 !text-leather-700 shadow-sm"
                          />
                          {handoverIssue ? (
                            <Tooltip title={handoverIssue}>
                              <WarningOutlined className="absolute left-1.5 bottom-1.5 text-amber-300 drop-shadow" />
                            </Tooltip>
                          ) : null}
                          <span className={`text-white font-bold truncate w-full text-center drop-shadow-md ${compact ? 'text-[10px]' : 'text-xs'}`}>
                            {segment.title || segment.name}
                          </span>
                          <span className={`mt-0.5 text-white/95 truncate w-full text-center ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
                            {assigneeName}
                          </span>
                          {!compact ? (
                            <span className="mt-0.5 text-[9px] text-white/90 truncate w-full text-center">
                              {getStatusLabel(segment.status)}{segment.due_date ? ` · ${renderDate(segment.due_date)}` : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      );
                    })()
                  ) : (
                    <Popover
                      key={`draft-${segment.id}-${index}`}
                      content={
                        <div className="space-y-2 text-xs">
                          <div className="font-bold text-gray-700">{segment.label}</div>
                          <div>ترتیب: {toPersianNumber(segment.sort_order || '-')}</div>
                          {!readOnly && (
                            <div className="flex items-center gap-2">
                              <Button size="small" type="primary" onClick={() => openTaskModal(line.id, segment)}>ایجاد وظیفه</Button>
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => handleRemoveDraftStage(segment.id)}
                              >
                                حذف
                              </Button>
                            </div>
                          )}
                        </div>
                      }
                      trigger={compact ? 'hover' : 'click'}
                      overlayStyle={{ zIndex: 10000 }}
                      title={null}
                    >
                      <div
                        className={`relative flex items-center justify-center cursor-pointer transition-all group ${index !== 0 ? 'border-r border-white/30' : ''} ${index === 0 ? 'rounded-r-lg' : ''} ${index === lineSegments.length - 1 ? 'rounded-l-lg' : ''}`}
                        style={{ flex: 1, border: '1px dashed #d1d5db', backgroundColor: 'transparent' }}
                      >
                        <div className="relative flex flex-col items-center justify-center w-full h-full px-8 overflow-hidden">
                          <Avatar
                            size={compact ? 22 : 28}
                            icon={<UserOutlined />}
                            className="!absolute right-1.5 top-1.5 !bg-gray-100 !text-gray-400"
                          />
                          <span className={`text-gray-700 font-bold truncate w-full text-center ${compact ? 'text-[10px]' : 'text-xs'}`}>
                            {segment.label}
                          </span>
                          <span className={`mt-0.5 text-gray-500 truncate w-full text-center ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
                            پیش‌نویس · مسئول تعیین نشده
                          </span>
                        </div>
                      </div>
                    </Popover>
                  )
                ))}
                {lineSegments.length === 0 && (
                  <div className="w-full flex items-center justify-center text-gray-400 text-xs bg-gray-50 h-full">
                    {compact ? <span className="opacity-50">-</span> : 'بدون مرحله تولید'}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-center">
              <Button
                type="text"
                size="small"
                aria-label={expandedStageBars[lineId] ? `بستن اطلاعات خط ${line.line_no}` : `نمایش اطلاعات خط ${line.line_no}`}
                icon={<DownOutlined className={`transition-transform ${expandedStageBars[lineId] ? 'rotate-180' : ''}`} />}
                onClick={() => toggleStageBar(lineId)}
                className="!text-gray-500 hover:!text-leather-700"
              />
            </div>
            {expandedStageBars[lineId] && lineSegments.length > 0 ? (
              <div className="space-y-2">
                {lineSegments.map((stage: any, index: number) => (
                  <div key={`stage-detail-${lineId}-${stage.id || index}`} className="relative pr-3 before:absolute before:right-0 before:top-0 before:h-full before:w-0.5 before:bg-leather-300">
                    {renderStageDetails(stage, currentQty)}
                  </div>
                ))}
              </div>
            ) : null}
            {showWageSummary && (
              <div className="text-xs text-gray-500">
                دستمزد این خط: {toPersianNumber(((lineTasks.reduce((acc, t) => acc + (parseFloat(t.wage) || 0), 0)) * (parseFloat(line.quantity) || 0)).toLocaleString('en-US'))} تومان
              </div>
            )}
          </div>
        );
      })}

      {!isBom && visibleLines.length === 0 && (
        <div className="w-full flex items-center justify-center text-gray-400 text-xs bg-gray-50 h-10 rounded">
          {loading ? <Spin size="small" /> : 'بدون خط تولید'}
        </div>
      )}

      {!readOnly && !isBom && (
        <div className="flex justify-start">
          <Tooltip title="افزودن خط تولید جدید">
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              size={compact ? 'small' : 'middle'}
              onClick={() => {
                setIsLineModalOpen(true);
              }}
              className="border-leather-300 text-leather-700 hover:!border-leather-600 hover:!text-leather-600 hover:!bg-leather-50"
            >
              افزودن خط
            </Button>
          </Tooltip>
        </div>
      )}

      {showWageSummary && (
        <div className="text-sm font-bold text-gray-700">
          جمع دستمزد تولید: {toPersianNumber(totalWage.toLocaleString('en-US'))} تومان
        </div>
      )}

      <Modal
        title="افزودن خط تولید"
        open={isLineModalOpen}
        onCancel={() => setIsLineModalOpen(false)}
        footer={null}
        centered
        destroyOnHidden
      >
        <Form form={lineForm} onFinish={handleAddLine} layout="vertical" className="pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <Form.Item name="line_no" label="شماره خط" initialValue={(lines[lines.length - 1]?.line_no || 0) + 1}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>
            <div className="col-span-6">
              <Form.Item name="quantity" label="تعداد تولید" initialValue={0}>
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsLineModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" className="rounded-lg bg-leather-700 hover:!bg-leather-600 border-none">
              ثبت خط
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-leather-800"><div className="bg-leather-50 p-1 rounded text-leather-600"><PlusOutlined /></div> افزودن مرحله تولید</div>}
        open={isTaskModalOpen}
        onCancel={() => setIsTaskModalOpen(false)}
        footer={null}
        zIndex={10001}
        width={480}
        centered
        destroyOnHidden
      >
        <Form form={taskForm} onFinish={handleAddTask} layout="vertical" className="pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-9">
              <Form.Item name="name" label="عنوان مرحله" rules={[{ required: true, message: 'الزامی' }]}> 
                <Input placeholder="مثلا: برشکاری..." />
              </Form.Item>
            </div>
            <div className="col-span-3">
              <Form.Item name="sort_order" label="ترتیب" initialValue={(tasks.length + 1) * 10}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>

            <div className="col-span-6">
              <Form.Item name="wage" label="دستمزد">
                <InputNumber
                  className="w-full persian-number"
                  min={0}
                  controls={false}
                  inputMode="decimal"
                  formatter={formatGroupedNumberInput}
                  parser={parseGroupedNumberInput}
                />
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="assignee_combo" label="مسئول انجام">
                <Select placeholder="انتخاب کنید..." allowClear showSearch optionFilterProp="label">
                  <Select.OptGroup label="کاربران">
                    {assignees.users.map(u => (
                      <Select.Option key={`user-${u.id}`} value={`user:${u.id}`} label={u.full_name}>
                        <Space><UserOutlined /> {u.full_name}</Space>
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                  <Select.OptGroup label="تیم‌ها">
                    {assignees.roles.map(r => (
                      <Select.Option key={`role-${r.id}`} value={`role:${r.id}`} label={r.title}>
                        <Space><TeamOutlined /> {r.title}</Space>
                      </Select.Option>
                    ))}
                  </Select.OptGroup>
                </Select>
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="production_shelf_id" label="قفسه مرحله">
                <SmartFieldRenderer
                  field={{
                    key: 'production_shelf_id',
                    type: FieldType.RELATION,
                    labels: { fa: 'قفسه مرحله' },
                    relationConfig: { targetModule: 'shelves', targetField: 'name' },
                  } as any}
                  value={taskForm.getFieldValue('production_shelf_id')}
                  onChange={(value) => taskForm.setFieldsValue({ production_shelf_id: value || null })}
                  options={productionShelfOptions}
                  forceEditMode
                  compactMode
                  moduleId="production_orders"
                  popupContainer={typeof document !== 'undefined' ? document.body : null}
                  popupZIndex={14000}
                />
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="due_date" label="موعد انجام">
                <PersianDatePicker
                  type="DATETIME"
                  onChange={() => {}}
                  placeholder="تاریخ و ساعت"
                  className="w-full"
                />
              </Form.Item>
            </div>

            <div className="col-span-12">
              <Form.Item name="description" label="توضیحات فعالیت">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="توضیحات این مرحله..." />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsTaskModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" loading={loading} className="rounded-lg bg-leather-700 hover:!bg-leather-600 border-none shadow-md">
              ثبت مرحله
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-leather-800"><div className="bg-leather-50 p-1 rounded text-leather-600"><PlusOutlined /></div> افزودن مرحله پیش‌نویس</div>}
        open={isDraftModalOpen}
        onCancel={() => setIsDraftModalOpen(false)}
        footer={null}
        zIndex={10001}
        width={420}
        centered
        destroyOnHidden
      >
        <Form form={draftForm} onFinish={handleAddDraftStage} layout="vertical" className="pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-9">
              <Form.Item name="name" label="عنوان مرحله" rules={[{ required: true, message: 'الزامی' }]}> 
                <Input placeholder="مثلا: برشکاری..." />
              </Form.Item>
            </div>
            <div className="col-span-3">
              <Form.Item name="sort_order" label="ترتیب" initialValue={(draftLocal.length + 1) * 10}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>
            <div className="col-span-12">
              <Form.Item name="description" label="توضیحات مرحله">
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="توضیحات این مرحله..." />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsDraftModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" className="rounded-lg bg-leather-700 hover:!bg-leather-600 border-none shadow-md">
              ثبت مرحله
            </Button>
          </div>
        </Form>
      </Modal>

      <TaskHandoverFormsModal
        open={handoverFormsModalOpen && !!handoverTask && !!handoverContext}
        loading={handoverLoading}
        taskName={String(handoverTask?.name || handoverTask?.title || 'مرحله')}
        orderTitle={handoverOrderTitle}
        currentStageName={String(handoverTask?.name || handoverTask?.title || 'مرحله')}
        currentStageInventory={handoverStageInventoryRows}
        sourceStageName={String(handoverContext?.sourceStageName || 'شروع تولید')}
        summaries={handoverSummaryRows}
        forms={handoverFormRows}
        nextStageName={handoverNextTask?.name || handoverNextTask?.title || null}
        selectedFormId={activeHandoverFormId}
        onSelectForm={(formId) => setActiveHandoverFormId(formId)}
        onCreateForm={handleCreateHandoverForm}
        onOpenForm={handleOpenHandoverForm}
        onClose={closeHandoverModal}
        activityDetailsHref={handoverTask?.id ? `/tasks/${handoverTask.id}` : null}
        stageActivityPanel={handoverTask ? (
          <div className="space-y-4" dir="rtl">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-base font-black text-[#17372a]">اطلاعات فعالیت</div>
                <div className="mt-1 text-xs text-gray-500">
                  ترتیب اجرا: {toPersianNumber(handoverTask.sort_order ?? '-')} · وضعیت فعلی: {getStatusLabel(handoverTask.status)}
                </div>
                <div className="mt-1 text-sm font-semibold text-[#1f4534]">
                  تعداد تولید مورد نیاز: {toPersianNumber(String(Math.max(0, toNumber(lines.find((line: any) => String(line.id) === String(handoverContext?.lineId))?.quantity || 0))))}
                </div>
                <div className="mt-1 text-xs text-gray-600">قفسه مرحله: {getShelfLabel(handoverTask.production_shelf_id)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {taskStatusActions.map((action) => (
                  <Button
                    key={action.value}
                    size="small"
                    icon={action.icon}
                    type={String(handoverTask.status || '') === action.value ? 'primary' : 'default'}
                    disabled={handoverLoading || readOnly}
                    onClick={() => { void handleStatusChange(String(handoverTask.id), action.value); }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <div className="mb-1 text-xs font-semibold text-gray-600">مسئول فعالیت</div>
                <Select
                  className="w-full"
                  value={getTaskAssigneeValue(handoverTask)}
                  placeholder="تعیین مسئول"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  disabled={handoverLoading || readOnly}
                  onChange={(value) => {
                    const [type, id] = String(value || '').split(':');
                    const selected = type === 'role'
                      ? assignees.roles.find((item: any) => String(item.id) === String(id))
                      : assignees.users.find((item: any) => String(item.id) === String(id));
                    void handleTaskFieldChange(
                      handoverTask,
                      { assignee_id: type === 'user' ? id : null, assignee_role_id: type === 'role' ? id : null, assignee_type: type || null },
                      {
                        assignee_id: type === 'user' ? id : null,
                        assignee_role_id: type === 'role' ? id : null,
                        assignee_type: type || null,
                        assignee: type === 'user' ? { full_name: selected?.full_name || 'تعیین نشده' } : null,
                        assigned_role: type === 'role' ? { title: selected?.title || 'تعیین نشده' } : null,
                      }
                    );
                  }}
                >
                  <Select.OptGroup label="کاربران">
                    {assignees.users.map((user: any) => <Select.Option key={`user-${user.id}`} value={`user:${user.id}`} label={user.full_name}><Space><UserOutlined />{user.full_name}</Space></Select.Option>)}
                  </Select.OptGroup>
                  <Select.OptGroup label="تیم‌ها">
                    {assignees.roles.map((role: any) => <Select.Option key={`role-${role.id}`} value={`role:${role.id}`} label={role.title}><Space><TeamOutlined />{role.title}</Space></Select.Option>)}
                  </Select.OptGroup>
                </Select>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-gray-600">دستمزد</div>
                <InputNumber
                  className="w-full persian-number"
                  min={0}
                  controls={false}
                  inputMode="decimal"
                  formatter={formatGroupedNumberInput}
                  parser={parseGroupedNumberInput}
                  value={handoverTask.wage ?? undefined}
                  disabled={handoverLoading || readOnly}
                  onChange={(value) => { void handleTaskFieldChange(handoverTask, { wage: value == null ? null : toNumber(value) }); }}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-gray-600">موعد انجام</div>
                <PersianDatePicker type="DATETIME" value={handoverTask.due_date || null} disabled={handoverLoading || readOnly} onChange={(value) => { void handleTaskFieldChange(handoverTask, { due_date: value }); }} placeholder="انتخاب موعد" className="w-full" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-gray-600">مقدار تولیدشده</div>
                <InputNumber className="w-full" min={0} value={handoverTask.produced_qty ?? 0} disabled={handoverLoading || readOnly} onChange={(value) => { void handleProducedQtyChange(String(handoverTask.id), value); }} />
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold text-gray-600">توضیحات فعالیت</div>
              <Input.TextArea
                defaultValue={handoverTask.description || ''}
                key={`task-description-${handoverTask.id}-${handoverTask.description || ''}`}
                autoSize={{ minRows: 2, maxRows: 5 }}
                disabled={handoverLoading || readOnly}
                placeholder="توضیحات تحویل‌دهنده یا اجرای این مرحله"
                onBlur={(event) => {
                  const description = event.target.value.trim();
                  if (description !== String(handoverTask.description || '')) {
                    void handleTaskFieldChange(handoverTask, { description: description || null }, { description: description || null });
                  }
                }}
              />
            </div>
          </div>
        ) : null}
      />

      <TaskHandoverModal
        open={handoverEditorOpen && !!handoverTask && !!handoverContext}
        loading={handoverLoading}
        locked={!!(handoverContext?.giverConfirmation?.confirmed || handoverContext?.receiverConfirmation?.confirmed)}
        taskName={String(handoverTask?.name || handoverTask?.title || 'مرحله')}
        sourceStageName={String(handoverContext?.sourceStageName || 'شروع تولید')}
        nextStageName={handoverNextTask?.name || handoverNextTask?.title || null}
        giverName={String(handoverContext?.giver?.label || 'تعیین نشده')}
        receiverName={String(handoverContext?.receiver?.label || 'تعیین نشده')}
        trafficType={handoverTrafficType}
        trafficTypeEditable={handoverTrafficTypeEditable}
        sourceStageValue={handoverSourceStageValue}
        destinationStageId={handoverDestinationStageId}
        stageOptions={handoverStageOptions}
        bundleOptionsByProduct={handoverBundleOptionsByProduct}
        destinationBundleOptions={destinationBundleOptions}
        targetShelfId={handoverTrafficType === 'outgoing'
          ? (handoverStageOptions.find((option) => String(option.value) === String(handoverDestinationStageId || ''))?.shelfId || null)
          : (handoverContext?.targetShelfId || null)}
        groups={handoverEditorGroups}
        giverConfirmation={handoverContext?.giverConfirmation || { confirmed: false }}
        receiverConfirmation={handoverContext?.receiverConfirmation || { confirmed: false }}
        canEditGiverNotes={Boolean(
          handoverContext
          && !handoverContext.giverConfirmation?.confirmed
          && ((handoverContext.giver.type === 'user' && handoverContext.giver.id === currentUser.id)
            || (handoverContext.giver.type === 'role' && handoverContext.giver.id === currentUser.roleId))
        )}
        onCancel={closeHandoverEditor}
        onSave={() => { void saveHandover(); }}
        onTrafficTypeChange={(nextType) => {
          setHandoverTrafficType(nextType);
          if (nextType === 'incoming') {
            setHandoverDestinationStageId(null);
            setHandoverSourceStageValue((prev) => prev || '__central__');
          } else {
            setHandoverSourceStageValue((prev) => prev || (handoverTask?.id ? String(handoverTask.id) : null));
            setHandoverSourceShelfId(null);
            if (!handoverDestinationStageId && handoverNextTask?.id) {
              setHandoverDestinationStageId(String(handoverNextTask.id));
            }
          }
        }}
        onSourceStageChange={(value) => {
          setHandoverSourceStageValue(value);
          if (value && value !== '__central__') {
            setHandoverSourceShelfId(null);
          }
        }}
        onDestinationStageChange={(taskId) => setHandoverDestinationStageId(taskId)}
        onToggleGroup={setHandoverGroupCollapsed}
        onConfirmGroup={confirmHandoverGroup}
        onDeliveryRowAdd={addHandoverDeliveryRow}
        onDeliveryRowsDelete={deleteHandoverDeliveryRows}
        onDeliveryRowsTransfer={transferHandoverDeliveryRows}
        onDeliveryRowFieldChange={updateHandoverDeliveryRowField}
        onConfirmGiver={() => { void handleConfirmGiver(); }}
        onConfirmReceiver={() => { void handleConfirmReceiver(); }}
      />
    </div>
  );
};

export default ProductionStagesField;
