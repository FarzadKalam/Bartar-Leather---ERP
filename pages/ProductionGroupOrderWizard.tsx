import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { App, Badge, Button, Card, Empty, Input, Select, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LeftOutlined, PlusOutlined, ReloadOutlined, RightOutlined, SaveOutlined } from '@ant-design/icons';
import GridTable from '../components/GridTable';
import ProductionStagesField from '../components/ProductionStagesField';
import StartProductionModal, {
  type StartMaterialDeliveryRow,
  type StartMaterialGroup,
  type StartMaterialPiece,
} from '../components/production/StartProductionModal';
import TaskHandoverModal, {
  type StageHandoverConfirm,
  type StageHandoverDeliveryRow,
  type StageHandoverGroup,
  type StageHandoverTaskOption,
  type StageHandoverTrafficType,
} from '../components/production/TaskHandoverModal';
import { MODULES } from '../moduleRegistry';
import { BlockDefinition } from '../types';
import { supabase } from '../supabaseClient';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import { applyProductionMoves } from '../utils/productionWorkflow';
import {
  buildGroupStartMaterials,
  type GroupStartMaterial,
  splitDeliveredAcrossRequirements,
} from '../utils/productionGroupOrders';

type GroupOrderRecord = {
  id: string;
  name: string;
  status?: string | null;
  system_code?: string | null;
  production_order_ids?: string[] | null;
};

type ProductionOrderRecord = {
  id: string;
  name: string;
  system_code?: string | null;
  status?: string | null;
  quantity?: number | null;
  bom_id?: string | null;
  bom_name?: string | null;
  bom_system_code?: string | null;
  production_line_count?: number;
  production_line_qty?: number;
  grid_materials?: any[] | null;
  production_moves?: any[] | null;
  production_shelf_id?: string | null;
};

type RelationOption = {
  label: string;
  value: string;
  category?: string | null;
};

type StartStageTaskOption = {
  value: string;
  label: string;
  orderId: string;
  orderName: string;
  orderCode: string;
  lineId: string | null;
  stageName: string;
  shelfId: string | null;
  shelfLabel: string | null;
  assigneeId: string | null;
  assigneeType: 'user' | 'role' | null;
};

type StartStageFormRow = {
  id: string;
  ownerTaskId: string;
  orderId: string;
  orderTitle: string;
  stageName: string;
  sourceStageName: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  giverConfirmed?: boolean;
  receiverConfirmed?: boolean;
  totalsByProduct: Record<string, number>;
  groups: any[];
};

type PageLocationState = {
  selectedOrderIds?: string[];
};

const toNumber = (value: any) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calcDeliveredQty = (row?: Partial<StartMaterialDeliveryRow> | null) => {
  const length = Math.max(0, toNumber((row as any)?.length));
  const width = Math.max(0, toNumber((row as any)?.width));
  const quantity = Math.max(0, toNumber((row as any)?.quantity));
  return length * width * quantity;
};

const parseRecurrenceInfo = (value: any): Record<string, any> => {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getTaskHandover = (task: any): Record<string, any> | null => {
  const recurrence = parseRecurrenceInfo(task?.recurrence_info);
  const handover = recurrence?.production_handover;
  if (!handover || typeof handover !== 'object') return null;
  return handover as Record<string, any>;
};

const resolveGroupProductId = (group: any) => {
  const selectedPiece = (Array.isArray(group?.pieces) ? group.pieces : []).find(
    (piece: any) => piece?.selectedProductId || piece?.selected_product_id || piece?.product_id
  );
  const productId = group?.selectedProductId
    || group?.selected_product_id
    || selectedPiece?.selectedProductId
    || selectedPiece?.selected_product_id
    || selectedPiece?.product_id
    || '';
  return String(productId || '').trim();
};

const toGroupTotals = (groups: any[]) => {
  const totals: Record<string, number> = {};
  (Array.isArray(groups) ? groups : []).forEach((group: any) => {
    const productId = resolveGroupProductId(group);
    if (!productId) return;
    const rows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
    const qty = rows.length > 0
      ? rows.reduce(
          (sum: number, row: any) =>
            sum + (Math.max(0, toNumber(row?.length)) * Math.max(0, toNumber(row?.width)) * Math.max(0, toNumber(row?.quantity))),
          0
        )
      : Math.max(0, toNumber(group?.totalHandoverQty ?? group?.totalDeliveredQty));
    totals[productId] = (totals[productId] || 0) + qty;
  });
  return totals;
};

const buildStartStageFormId = () => `start_stage_form_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const formatDateTime = (raw: string | null | undefined) => {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return toPersianNumber(date.toLocaleString('fa-IR'));
};

const normalizeIds = (value: any): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeGridRowsForWizard = (rows: any[]) => {
  const sourceRows = Array.isArray(rows) ? rows : [];
  return sourceRows.map((row: any) => ({
    ...row,
    collapsed: true,
  }));
};

const createGroupSystemCode = () => {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const timePart = String(now.getTime()).slice(-5);
  return `PGO-${datePart}-${timePart}`;
};

const getStatusTag = (status: string | null | undefined) => {
  const key = String(status || '');
  if (key === 'pending') return <Tag color="orange">در انتظار</Tag>;
  if (key === 'in_progress') return <Tag color="blue">در حال تولید</Tag>;
  if (key === 'completed') return <Tag color="green">تکمیل شده</Tag>;
  return <Tag>پیش‌نویس</Tag>;
};

const ProductionGroupOrderWizard: React.FC = () => {
  const { id: routeGroupId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { message: msg } = App.useApp();
  const locationState = (location.state || {}) as PageLocationState;

  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [isSavingSetup, setIsSavingSetup] = useState(false);
  const [isSavingRows, setIsSavingRows] = useState(false);
  const [isSavingQuantities, setIsSavingQuantities] = useState(false);
  const [isStartingGroup, setIsStartingGroup] = useState(false);
  const [canEditGroup, setCanEditGroup] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [groupId, setGroupId] = useState<string | null>(routeGroupId || null);
  const [groupName, setGroupName] = useState('');
  const [groupStatus, setGroupStatus] = useState<string>('pending');

  const [availableOrders, setAvailableOrders] = useState<ProductionOrderRecord[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<ProductionOrderRecord[]>([]);
  const [orderRowsMap, setOrderRowsMap] = useState<Record<string, any[]>>({});
  const [orderQuantityMap, setOrderQuantityMap] = useState<Record<string, number>>({});

  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});

  const [currentStep, setCurrentStep] = useState(0);
  const [startMaterials, setStartMaterials] = useState<StartMaterialGroup[]>([]);
  const [sourceShelfOptionsByProduct, setSourceShelfOptionsByProduct] = useState<Record<string, { label: string; value: string; stock?: number }[]>>({});
  const [startFormMode, setStartFormMode] = useState<'list' | 'create'>('list');
  const [startStageTaskOptions, setStartStageTaskOptions] = useState<StartStageTaskOption[]>([]);
  const [startStageForms, setStartStageForms] = useState<StartStageFormRow[]>([]);
  const [startFormsLoading, setStartFormsLoading] = useState(false);
  const [startFormEditorOpen, setStartFormEditorOpen] = useState(false);
  const [startFormEditorLoading, setStartFormEditorLoading] = useState(false);
  const [startFormEditorTaskId, setStartFormEditorTaskId] = useState<string | null>(null);
  const [startFormEditorTaskName, setStartFormEditorTaskName] = useState<string>('مرحله');
  const [startFormEditorSourceStageName, setStartFormEditorSourceStageName] = useState<string>('شروع تولید');
  const [startFormEditorFormId, setStartFormEditorFormId] = useState<string | null>(null);
  const [startFormEditorGroups, setStartFormEditorGroups] = useState<StageHandoverGroup[]>([]);
  const [startFormEditorTargetShelfId, setStartFormEditorTargetShelfId] = useState<string | null>(null);
  const [startFormEditorGiverName, setStartFormEditorGiverName] = useState<string>('تحویل‌دهنده');
  const [startFormEditorReceiverName, setStartFormEditorReceiverName] = useState<string>('تحویل‌گیرنده');
  const [startFormEditorTrafficType, setStartFormEditorTrafficType] = useState<StageHandoverTrafficType>('incoming');
  const [startFormEditorGiverConfirmation, setStartFormEditorGiverConfirmation] = useState<StageHandoverConfirm>({ confirmed: false });
  const [startFormEditorReceiverConfirmation, setStartFormEditorReceiverConfirmation] = useState<StageHandoverConfirm>({ confirmed: false });
  const [orderPanelsExpanded, setOrderPanelsExpanded] = useState<Record<string, boolean>>({});
  const [materialOrderLoaded, setMaterialOrderLoaded] = useState<Record<string, boolean>>({});
  const [materialsStepLoading, setMaterialsStepLoading] = useState(false);
  const [startStepPreparing, setStartStepPreparing] = useState(false);
  const [setupBomFilter, setSetupBomFilter] = useState<string | null>(null);

  const steps = useMemo(
    () => [
      { key: 'setup', title: '۱. ایجاد سفارش گروهی' },
      { key: 'materials', title: '۲. تکمیل قطعات' },
      { key: 'lines', title: '۳. خطوط و تعداد' },
      { key: 'start', title: '۴. تحویل مواد اولیه' },
      { key: 'progress', title: '۵. در حال تولید' },
    ],
    []
  );

  const gridBlock = useMemo(() => {
    const moduleConfig = MODULES.production_orders;
    return (moduleConfig?.blocks || []).find((block) => block.id === 'grid_materials') as BlockDefinition | undefined;
  }, []);

  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    const categories = gridBlock?.gridConfig?.categories || [];
    categories.forEach((category: any) => {
      const key = String(category?.value || '');
      if (!key) return;
      map.set(key, String(category?.label || key));
    });
    return map;
  }, [gridBlock]);

  const productMetaMap = useMemo(() => {
    const map = new Map<string, { name: string; system_code: string }>();
    const products = (relationOptions.products || []) as RelationOption[];
    products.forEach((item) => {
      const id = String(item?.value || '');
      if (!id) return;
      const label = String(item?.label || '').trim();
      const separatorIndex = label.indexOf(' - ');
      const systemCode = separatorIndex > -1 ? label.slice(0, separatorIndex).trim() : '';
      const name = separatorIndex > -1 ? label.slice(separatorIndex + 3).trim() : label;
      map.set(id, {
        name: name || id,
        system_code: systemCode || '',
      });
    });
    return map;
  }, [relationOptions]);

  const selectedOrderRows = useMemo(() => {
    const map = new Map(selectedOrders.map((order) => [order.id, order]));
    return selectedOrderIds
      .map((orderId) => map.get(orderId))
      .filter((row): row is ProductionOrderRecord => !!row);
  }, [selectedOrderIds, selectedOrders]);

  const selectedOrderMap = useMemo(
    () => new Map(selectedOrderRows.map((order) => [String(order.id), order])),
    [selectedOrderRows]
  );

  const startStageOptionMap = useMemo(() => {
    const map = new Map<string, StartStageTaskOption>();
    startStageTaskOptions.forEach((option) => {
      map.set(String(option.value), option);
    });
    return map;
  }, [startStageTaskOptions]);

  const stageShelfOptions = useMemo(
    () =>
      ((relationOptions?.shelves || []) as any[])
        .map((item: any) => ({
          value: String(item?.value || ''),
          label: String(item?.label || item?.value || ''),
        }))
        .filter((item) => item.value),
    [relationOptions]
  );

  const startFormEditorStageOptions = useMemo<StageHandoverTaskOption[]>(() => {
    const currentTaskId = String(startFormEditorTaskId || '');
    return startStageTaskOptions
      .filter((option) => String(option.value) !== currentTaskId)
      .map((option) => ({
        value: String(option.value),
        label: String(option.label),
        shelfId: option.shelfId || null,
        shelfLabel: option.shelfLabel || null,
      }));
  }, [startFormEditorTaskId, startStageTaskOptions]);

  const deriveGroupStatusFromOrders = useCallback((rows: ProductionOrderRecord[]) => {
    if (!rows.length) return 'pending';
    const statuses = rows.map((row) => String(row?.status || ''));
    if (statuses.every((status) => status === 'completed')) return 'completed';
    if (statuses.some((status) => status === 'in_progress' || status === 'completed')) return 'in_progress';
    return 'pending';
  }, []);

  const allSelectedPending = useMemo(
    () => selectedOrderRows.length > 0 && selectedOrderRows.every((row) => String(row?.status || '') === 'pending'),
    [selectedOrderRows]
  );

  const orderPanelKey = useCallback((stepKey: 'materials' | 'lines' | 'progress', orderId: string) => {
    return `${stepKey}:${orderId}`;
  }, []);

  const isOrderPanelExpanded = useCallback(
    (stepKey: 'materials' | 'lines' | 'progress', orderId: string) => {
      return orderPanelsExpanded[orderPanelKey(stepKey, orderId)] === true;
    },
    [orderPanelKey, orderPanelsExpanded]
  );

  const setOrderPanelExpanded = useCallback(
    (stepKey: 'materials' | 'lines' | 'progress', orderId: string, expanded: boolean) => {
      const panelKey = orderPanelKey(stepKey, orderId);
      setOrderPanelsExpanded((prev) => ({ ...prev, [panelKey]: expanded }));
      if (stepKey === 'materials' && expanded) {
        setMaterialOrderLoaded((prev) => ({ ...prev, [orderId]: true }));
      }
    },
    [orderPanelKey]
  );

  const loadPermission = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) {
        setCanEditGroup(false);
        return;
      }
      setCurrentUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('role_id').eq('id', user.id).maybeSingle();
      if (!profile?.role_id) {
        setCanEditGroup(true);
        return;
      }
      const { data: role } = await supabase.from('org_roles').select('permissions').eq('id', profile.role_id).maybeSingle();
      const perms = (role?.permissions || {}) as Record<string, any>;
      const orderEdit = perms?.production_orders?.edit !== false;
      const groupEdit = perms?.production_group_orders?.edit !== false;
      setCanEditGroup(orderEdit && groupEdit);
    } catch {
      setCanEditGroup(true);
    }
  }, []);

  const loadGridOptions = useCallback(async () => {
    const [{ data: products }, { data: options }] = await Promise.all([
      supabase.from('products').select('id, name, system_code, category').limit(3000),
      supabase.from('dynamic_options').select('category, label, value').eq('is_active', true).limit(4000),
    ]);

    const productOptions = (products || []).map((product: any) => ({
      value: String(product.id),
      label: `${product.system_code || '-'} - ${product.name || '-'}`,
      category: product.category || null,
    }));

    const nextDynamicOptions: Record<string, any[]> = {};
    (options || []).forEach((item: any) => {
      const category = String(item?.category || '');
      if (!category) return;
      if (!nextDynamicOptions[category]) nextDynamicOptions[category] = [];
      nextDynamicOptions[category].push({
        label: String(item?.label || item?.value || ''),
        value: String(item?.value || item?.label || ''),
      });
    });

    setRelationOptions({ products: productOptions });
    setDynamicOptions(nextDynamicOptions);
  }, []);

  const hydrateOrderRows = useCallback(async (rows: ProductionOrderRecord[]) => {
    const normalizedRows = (rows || []).map((row) => ({ ...row }));
    if (!normalizedRows.length) return [];

    const orderIds = normalizedRows.map((row) => String(row.id)).filter(Boolean);
    const bomIds = Array.from(
      new Set(
        normalizedRows
          .map((row) => String(row?.bom_id || ''))
          .filter((bomId) => bomId.length > 0)
      )
    );

    const [bomResult, lineResult] = await Promise.all([
      bomIds.length > 0
        ? supabase.from('production_boms').select('id, name, system_code').in('id', bomIds)
        : Promise.resolve({ data: [] as any[] }),
      orderIds.length > 0
        ? supabase.from('production_lines').select('production_order_id, quantity').in('production_order_id', orderIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const bomMap = new Map<string, { name: string; system_code: string }>();
    (bomResult.data || []).forEach((row: any) => {
      const id = String(row?.id || '');
      if (!id) return;
      bomMap.set(id, {
        name: String(row?.name || ''),
        system_code: String(row?.system_code || ''),
      });
    });

    const lineMap = new Map<string, { count: number; qty: number }>();
    (lineResult.data || []).forEach((line: any) => {
      const orderId = String(line?.production_order_id || '');
      if (!orderId) return;
      const current = lineMap.get(orderId) || { count: 0, qty: 0 };
      current.count += 1;
      current.qty += toNumber(line?.quantity);
      lineMap.set(orderId, current);
    });

    return normalizedRows.map((row) => {
      const bomId = String(row?.bom_id || '');
      const bomMeta = bomId ? bomMap.get(bomId) : null;
      const lineMeta = lineMap.get(String(row.id)) || { count: 0, qty: 0 };
      return {
        ...row,
        bom_name: bomMeta?.name || null,
        bom_system_code: bomMeta?.system_code || null,
        production_line_count: lineMeta.count,
        production_line_qty: lineMeta.qty,
      };
    });
  }, []);

  const loadSelectableOrders = useCallback(async (currentSelectedIds: string[]) => {
    const selectFields = 'id,name,system_code,status,quantity,bom_id,grid_materials,production_moves,production_shelf_id';
    const { data: pendingRows, error: pendingError } = await supabase
      .from('production_orders')
      .select(selectFields)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (pendingError) throw pendingError;

    const byId = new Map<string, ProductionOrderRecord>();
    (pendingRows || []).forEach((row: any) => byId.set(String(row.id), row as ProductionOrderRecord));

    const selectedIds = currentSelectedIds.map((item) => String(item)).filter(Boolean);
    if (selectedIds.length > 0) {
      const { data: selectedRows, error: selectedError } = await supabase
        .from('production_orders')
        .select(selectFields)
        .in('id', selectedIds);
      if (selectedError) throw selectedError;
      (selectedRows || []).forEach((row: any) => byId.set(String(row.id), row as ProductionOrderRecord));
    }

    const hydratedRows = await hydrateOrderRows(Array.from(byId.values()));
    setAvailableOrders(hydratedRows);
  }, [hydrateOrderRows]);

  const loadSelectedOrders = useCallback(async (orderIds: string[], replaceRows: boolean) => {
    const ids = orderIds.map((item) => String(item)).filter(Boolean);
    if (!ids.length) {
      setSelectedOrders([]);
      if (replaceRows) {
        setOrderRowsMap({});
        setOrderQuantityMap({});
      }
      return;
    }

    const selectFields = 'id,name,system_code,status,quantity,bom_id,grid_materials,production_moves,production_shelf_id';
    const { data: rows, error } = await supabase.from('production_orders').select(selectFields).in('id', ids);
    if (error) throw error;

    const rowMap = new Map<string, ProductionOrderRecord>();
    const hydratedRows = await hydrateOrderRows((rows || []) as ProductionOrderRecord[]);
    hydratedRows.forEach((row: any) => rowMap.set(String(row.id), row as ProductionOrderRecord));
    const orderedRows = ids.map((orderId) => rowMap.get(orderId)).filter((row): row is ProductionOrderRecord => !!row);
    setSelectedOrders(orderedRows);

    setOrderRowsMap((prev) => {
      const next = replaceRows ? {} : { ...prev };
      orderedRows.forEach((row) => {
        if (replaceRows || !next[row.id]) {
          next[row.id] = normalizeGridRowsForWizard(Array.isArray(row.grid_materials) ? row.grid_materials : []);
        }
      });
      return next;
    });

    setOrderQuantityMap((prev) => {
      const next = replaceRows ? {} : { ...prev };
      orderedRows.forEach((row) => {
        if (replaceRows || next[row.id] === undefined) {
          next[row.id] = toNumber(row.quantity);
        }
      });
      return next;
    });
  }, [hydrateOrderRows]);

  const loadStartStageContext = useCallback(async () => {
    const ids = selectedOrderIds.map((item) => String(item)).filter(Boolean);
    if (!ids.length) {
      setStartStageTaskOptions([]);
      setStartStageForms([]);
      return;
    }
    setStartFormsLoading(true);
    try {
      const [taskResult, lineResult] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, related_production_order, production_line_id, sort_order, name, assignee_id, assignee_type, production_shelf_id, recurrence_info')
          .in('related_production_order', ids)
          .order('sort_order', { ascending: true }),
        supabase
          .from('production_lines')
          .select('id, line_no, production_order_id')
          .in('production_order_id', ids),
      ]);
      if (taskResult.error) throw taskResult.error;
      if (lineResult.error) throw lineResult.error;

      const allTasks = Array.isArray(taskResult.data) ? taskResult.data : [];
      const byOrderLine = new Map<string, any>();
      allTasks.forEach((task: any) => {
        const orderId = String(task?.related_production_order || '');
        if (!orderId) return;
        const lineId = String(task?.production_line_id || '__default__');
        const key = `${orderId}:${lineId}`;
        const current = byOrderLine.get(key);
        if (!current) {
          byOrderLine.set(key, task);
          return;
        }
        const currentSort = Number(current?.sort_order ?? 0);
        const nextSort = Number(task?.sort_order ?? 0);
        if (nextSort < currentSort) byOrderLine.set(key, task);
      });

      const firstTasks = Array.from(byOrderLine.values());

      const lineNoMap = new Map<string, number>();
      (lineResult.data || []).forEach((line: any) => {
        const lineId = String(line?.id || '');
        if (!lineId) return;
        lineNoMap.set(lineId, Number(line?.line_no ?? 0));
      });

      const stageOptions: StartStageTaskOption[] = firstTasks
        .map((task: any) => {
          const taskId = String(task?.id || '');
          if (!taskId) return null;
          const orderId = String(task?.related_production_order || '');
          const order = selectedOrderMap.get(orderId);
          const lineId = task?.production_line_id ? String(task.production_line_id) : null;
          const lineNo = lineId ? lineNoMap.get(lineId) : null;
          const orderName = String(order?.name || '-');
          const orderCode = String(order?.system_code || '');
          const stageName = String(task?.name || 'مرحله');
          const lineLabel = lineNo && lineNo > 0 ? `خط ${toPersianNumber(lineNo)}` : 'خط';
          const orderTitle = `${orderName}${orderCode ? ` (${orderCode})` : ''}`;
          return {
            value: taskId,
            label: `${orderTitle} - ${lineLabel} - ${stageName}`,
            orderId,
            orderName,
            orderCode,
            lineId,
            stageName,
            shelfId: task?.production_shelf_id ? String(task.production_shelf_id) : null,
            shelfLabel: task?.production_shelf_id ? String(task.production_shelf_id) : null,
            assigneeId: task?.assignee_id ? String(task.assignee_id) : null,
            assigneeType: task?.assignee_type === 'role' ? 'role' : (task?.assignee_type === 'user' ? 'user' : null),
          } as StartStageTaskOption;
        })
        .filter((item): item is StartStageTaskOption => !!item);
      setStartStageTaskOptions(stageOptions);

      const forms: StartStageFormRow[] = [];
      firstTasks.forEach((task: any) => {
        const ownerTaskId = String(task?.id || '');
        if (!ownerTaskId) return;
        const orderId = String(task?.related_production_order || '');
        const order = selectedOrderMap.get(orderId);
        const stageName = String(task?.name || 'مرحله');
        const orderTitle = `${String(order?.name || '-')}${order?.system_code ? ` (${String(order.system_code)})` : ''}`;
        const handover = getTaskHandover(task);
        if (!handover) return;
        const rawForms = Array.isArray(handover?.forms)
          ? handover.forms
          : (Array.isArray(handover?.groups)
            ? [{
                id: handover?.activeFormId || `handover_legacy_${ownerTaskId}`,
                sourceTaskId: handover?.sourceTaskId || null,
                sourceStageName: handover?.sourceStageName || null,
                giverConfirmation: handover?.giverConfirmation || null,
                receiverConfirmation: handover?.receiverConfirmation || null,
                createdAt: handover?.updatedAt || null,
                updatedAt: handover?.updatedAt || null,
                groups: handover?.groups || [],
              }]
            : []);

        rawForms.forEach((rawForm: any, index: number) => {
          const sourceTaskId = rawForm?.sourceTaskId ? String(rawForm.sourceTaskId) : '';
          const sourceStageName = String(rawForm?.sourceStageName || handover?.sourceStageName || '').trim();
          const isStartForm = sourceStageName === 'شروع تولید' || !sourceTaskId;
          if (!isStartForm) return;
          const groups = Array.isArray(rawForm?.groups) ? rawForm.groups : [];
          forms.push({
            id: String(rawForm?.id || `handover_form_${ownerTaskId}_${index}`),
            ownerTaskId,
            orderId,
            orderTitle,
            stageName,
            sourceStageName: sourceStageName || 'شروع تولید',
            createdAt: rawForm?.createdAt || rawForm?.updatedAt || null,
            updatedAt: rawForm?.updatedAt || rawForm?.createdAt || null,
            giverConfirmed: !!rawForm?.giverConfirmation?.confirmed,
            receiverConfirmed: !!rawForm?.receiverConfirmation?.confirmed,
            totalsByProduct: toGroupTotals(groups),
            groups,
          });
        });
      });

      forms.sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
      setStartStageForms(forms);
    } catch (err: any) {
      msg.error(err?.message || 'خطا در دریافت فرم های تحویل شروع تولید');
    } finally {
      setStartFormsLoading(false);
    }
  }, [msg, selectedOrderIds, selectedOrderMap]);

  const toStageHandoverGroups = useCallback((
    rawGroups: any[],
    fallbackTargetShelfId: string | null
  ): StageHandoverGroup[] => {
    return (Array.isArray(rawGroups) ? rawGroups : []).map((group: any, groupIndex: number) => {
      const piecesRaw = Array.isArray(group?.pieces) ? group.pieces : [];
      const pieces = piecesRaw.map((piece: any, pieceIndex: number) => {
        const sourceQty = Math.max(0, toNumber(piece?.sourceQty ?? piece?.source_qty ?? piece?.totalUsage ?? piece?.total_usage ?? piece?.handoverQty ?? piece?.handover_qty));
        return {
          key: String(piece?.key || `${String(group?.key || groupIndex)}_${pieceIndex}`),
          name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
          length: Math.max(0, toNumber(piece?.length)),
          width: Math.max(0, toNumber(piece?.width)),
          quantity: Math.max(0, toNumber(piece?.quantity)),
          totalQuantity: Math.max(0, toNumber(piece?.totalQuantity ?? piece?.total_quantity ?? piece?.quantity)),
          mainUnit: String(piece?.mainUnit || piece?.main_unit || ''),
          subUnit: String(piece?.subUnit || piece?.sub_unit || ''),
          subUsage: Math.max(0, toNumber(piece?.subUsage ?? piece?.sub_usage ?? piece?.qty_sub)),
          sourceQty,
          handoverQty: Math.max(0, toNumber(piece?.handoverQty ?? piece?.handover_qty ?? sourceQty)),
        };
      });

      const orderPiecesRaw = Array.isArray(group?.orderPieces) ? group.orderPieces : [];
      const orderPieces = orderPiecesRaw.map((piece: any, pieceIndex: number) => {
        const sourceQty = Math.max(0, toNumber(piece?.sourceQty ?? piece?.source_qty ?? piece?.totalUsage ?? piece?.total_usage ?? piece?.handoverQty ?? piece?.handover_qty));
        return {
          key: String(piece?.key || `${String(group?.key || groupIndex)}_order_${pieceIndex}`),
          name: String(piece?.name || `قطعه ${pieceIndex + 1}`),
          length: Math.max(0, toNumber(piece?.length)),
          width: Math.max(0, toNumber(piece?.width)),
          quantity: Math.max(0, toNumber(piece?.quantity)),
          totalQuantity: Math.max(0, toNumber(piece?.totalQuantity ?? piece?.total_quantity ?? piece?.quantity)),
          mainUnit: String(piece?.mainUnit || piece?.main_unit || ''),
          subUnit: String(piece?.subUnit || piece?.sub_unit || ''),
          subUsage: Math.max(0, toNumber(piece?.subUsage ?? piece?.sub_usage ?? piece?.qty_sub)),
          sourceQty,
          handoverQty: Math.max(0, toNumber(piece?.handoverQty ?? piece?.handover_qty ?? sourceQty)),
        };
      });

      const deliveryRowsRaw = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
      const deliveryRows: StageHandoverDeliveryRow[] = deliveryRowsRaw.map((row: any, rowIndex: number) => ({
        key: String(row?.key || `${String(group?.key || groupIndex)}_delivery_${rowIndex}`),
        pieceKey: row?.pieceKey ? String(row.pieceKey) : undefined,
        name: String(row?.name || ''),
        length: Math.max(0, toNumber(row?.length)),
        width: Math.max(0, toNumber(row?.width)),
        quantity: Math.max(0, toNumber(row?.quantity)),
        mainUnit: String(row?.mainUnit || row?.main_unit || ''),
        subUnit: String(row?.subUnit || row?.sub_unit || ''),
        deliveredQty: calcDeliveredQty(row),
      }));
      const totalHandoverQty = deliveryRows.reduce((sum, row) => sum + calcDeliveredQty(row), 0);
      const totalSourceQty = Math.max(
        0,
        toNumber(group?.totalSourceQty ?? group?.total_source_qty ?? pieces.reduce((sum, piece) => sum + toNumber(piece?.sourceQty), 0))
      );
      const totalOrderQty = Math.max(
        0,
        toNumber(group?.totalOrderQty ?? group?.total_order_qty ?? group?.totalUsage ?? group?.total_usage ?? totalSourceQty)
      );

      return {
        key: String(group?.key || `group_${groupIndex}`),
        rowIndex: Number.isFinite(Number(group?.rowIndex)) ? Number(group.rowIndex) : groupIndex,
        categoryLabel: String(group?.categoryLabel || group?.category_label || ''),
        selectedProductId: group?.selectedProductId ? String(group.selectedProductId) : null,
        selectedProductName: String(group?.selectedProductName || group?.selected_product_name || '-'),
        selectedProductCode: String(group?.selectedProductCode || group?.selected_product_code || ''),
        sourceShelfId: group?.sourceShelfId ? String(group.sourceShelfId) : null,
        targetShelfId: group?.targetShelfId ? String(group.targetShelfId) : fallbackTargetShelfId,
        pieces,
        orderPieces,
        deliveryRows,
        totalSourceQty,
        totalOrderQty,
        totalHandoverQty,
        collapsed: true,
        isConfirmed: true,
      };
    });
  }, []);

  const closeStartFormEditor = useCallback(() => {
    setStartFormEditorOpen(false);
    setStartFormEditorTaskId(null);
    setStartFormEditorFormId(null);
    setStartFormEditorGroups([]);
    setStartFormEditorTargetShelfId(null);
    setStartFormEditorGiverConfirmation({ confirmed: false });
    setStartFormEditorReceiverConfirmation({ confirmed: false });
  }, []);

  const openStartFormEditor = useCallback(async (record: StartStageFormRow) => {
    const ownerTaskId = String(record?.ownerTaskId || '').trim();
    const formId = String(record?.id || '').trim();
    if (!ownerTaskId || !formId) return;
    setStartFormEditorLoading(true);
    try {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, name, assignee_id, assignee_type, production_shelf_id, recurrence_info')
        .eq('id', ownerTaskId)
        .maybeSingle();
      if (taskError) throw taskError;

      const recurrence = parseRecurrenceInfo(task?.recurrence_info);
      const handover = recurrence?.production_handover && typeof recurrence.production_handover === 'object'
        ? recurrence.production_handover
        : {};
      const formsRaw = Array.isArray(handover?.forms)
        ? handover.forms
        : (Array.isArray(handover?.groups)
          ? [{
              id: handover?.activeFormId || formId,
              sourceTaskId: handover?.sourceTaskId || null,
              sourceStageName: handover?.sourceStageName || null,
              sourceShelfId: handover?.sourceShelfId || null,
              targetShelfId: handover?.targetShelfId || null,
              giver: handover?.giver || null,
              receiver: handover?.receiver || null,
              giverConfirmation: handover?.giverConfirmation || null,
              receiverConfirmation: handover?.receiverConfirmation || null,
              direction: handover?.direction || 'incoming',
              groups: handover?.groups || [],
            }]
          : []);

      const activeForm = formsRaw.find((item: any) => String(item?.id || '') === formId) || null;
      const sourceStageName = String(
        activeForm?.sourceStageName
        || record?.sourceStageName
        || handover?.sourceStageName
        || 'شروع تولید'
      );
      const targetShelfId = activeForm?.targetShelfId
        ? String(activeForm.targetShelfId)
        : (task?.production_shelf_id ? String(task.production_shelf_id) : null);
      const groups = toStageHandoverGroups(
        Array.isArray(activeForm?.groups) ? activeForm.groups : (Array.isArray(record?.groups) ? record.groups : []),
        targetShelfId
      );

      setStartFormEditorTaskId(ownerTaskId);
      setStartFormEditorTaskName(String(task?.name || record?.stageName || 'مرحله'));
      setStartFormEditorSourceStageName(sourceStageName);
      setStartFormEditorFormId(formId);
      setStartFormEditorGroups(groups);
      setStartFormEditorTargetShelfId(targetShelfId);
      setStartFormEditorTrafficType(
        String(activeForm?.direction || '').toLowerCase() === 'outgoing' ? 'outgoing' : 'incoming'
      );
      setStartFormEditorGiverName(String(activeForm?.giver?.label || 'شروع تولید'));
      setStartFormEditorReceiverName(String(activeForm?.receiver?.label || task?.name || record?.stageName || 'مرحله'));
      setStartFormEditorGiverConfirmation(
        activeForm?.giverConfirmation?.confirmed
          ? activeForm.giverConfirmation
          : { confirmed: false }
      );
      setStartFormEditorReceiverConfirmation(
        activeForm?.receiverConfirmation?.confirmed
          ? activeForm.receiverConfirmation
          : { confirmed: false }
      );
      setStartFormEditorOpen(true);
    } catch (error: any) {
      msg.error(error?.message || 'خطا در بارگذاری فرم تحویل');
    } finally {
      setStartFormEditorLoading(false);
    }
  }, [msg, toStageHandoverGroups]);

  const confirmStartFormSide = useCallback(async (side: 'giver' | 'receiver') => {
    if (!startFormEditorTaskId || !startFormEditorFormId) return;
    setStartFormEditorLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData?.user || null;
      const userId = String(currentUserId || authUser?.id || '').trim() || null;
      const userName = String(authUser?.user_metadata?.full_name || authUser?.email || 'کاربر');

      const { data: freshTask, error: taskError } = await supabase
        .from('tasks')
        .select('id, recurrence_info')
        .eq('id', startFormEditorTaskId)
        .single();
      if (taskError) throw taskError;

      const recurrence = parseRecurrenceInfo(freshTask?.recurrence_info);
      const existingHandover = recurrence?.production_handover && typeof recurrence.production_handover === 'object'
        ? recurrence.production_handover
        : {};
      const existingFormsRaw = Array.isArray(existingHandover?.forms)
        ? existingHandover.forms
        : (Array.isArray(existingHandover?.groups)
          ? [{
              id: existingHandover?.activeFormId || startFormEditorFormId,
              sourceTaskId: existingHandover?.sourceTaskId || null,
              sourceStageName: existingHandover?.sourceStageName || null,
              sourceShelfId: existingHandover?.sourceShelfId || null,
              targetShelfId: existingHandover?.targetShelfId || null,
              direction: existingHandover?.direction || 'incoming',
              giver: existingHandover?.giver || null,
              receiver: existingHandover?.receiver || null,
              giverConfirmation: existingHandover?.giverConfirmation || null,
              receiverConfirmation: existingHandover?.receiverConfirmation || null,
              groups: existingHandover?.groups || [],
              createdAt: existingHandover?.updatedAt || null,
              updatedAt: existingHandover?.updatedAt || null,
            }]
          : []);
      if (!existingFormsRaw.length) {
        msg.error('فرم تحویل برای این مرحله یافت نشد.');
        return;
      }

      const nowIso = new Date().toISOString();
      let updatedForm: any = null;
      const nextForms = existingFormsRaw.map((form: any) => {
        if (String(form?.id || '') !== String(startFormEditorFormId)) return form;
        const nextForm = { ...form };
        const nextConfirm = {
          confirmed: true,
          userId,
          userName,
          at: nowIso,
        };
        if (side === 'giver') nextForm.giverConfirmation = nextConfirm;
        if (side === 'receiver') nextForm.receiverConfirmation = nextConfirm;
        nextForm.updatedAt = nowIso;
        updatedForm = nextForm;
        return nextForm;
      });
      if (!updatedForm) {
        msg.error('فرم انتخاب‌شده در مرحله مقصد یافت نشد.');
        return;
      }

      const nextHandover = {
        ...existingHandover,
        direction: updatedForm?.direction || existingHandover?.direction || 'incoming',
        sourceTaskId: updatedForm?.sourceTaskId || existingHandover?.sourceTaskId || null,
        destinationTaskId: updatedForm?.destinationTaskId || existingHandover?.destinationTaskId || null,
        sourceStageName: updatedForm?.sourceStageName || existingHandover?.sourceStageName || 'شروع تولید',
        sourceShelfId: updatedForm?.sourceShelfId || existingHandover?.sourceShelfId || null,
        targetShelfId: updatedForm?.targetShelfId || existingHandover?.targetShelfId || startFormEditorTargetShelfId || null,
        giver: updatedForm?.giver || existingHandover?.giver || null,
        receiver: updatedForm?.receiver || existingHandover?.receiver || null,
        groups: Array.isArray(updatedForm?.groups) ? updatedForm.groups : (existingHandover?.groups || []),
        wasteByProduct: updatedForm?.wasteByProduct || existingHandover?.wasteByProduct || {},
        giverConfirmation: updatedForm?.giverConfirmation || existingHandover?.giverConfirmation || { confirmed: false },
        receiverConfirmation: updatedForm?.receiverConfirmation || existingHandover?.receiverConfirmation || { confirmed: false },
        forms: nextForms,
        activeFormId: String(updatedForm?.id || startFormEditorFormId),
        updatedAt: nowIso,
      };

      const nextRecurrence = {
        ...recurrence,
        production_handover: nextHandover,
      };
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ recurrence_info: nextRecurrence })
        .eq('id', startFormEditorTaskId);
      if (updateError) throw updateError;

      if (side === 'giver') {
        setStartFormEditorGiverConfirmation(updatedForm?.giverConfirmation || { confirmed: false });
      } else {
        setStartFormEditorReceiverConfirmation(updatedForm?.receiverConfirmation || { confirmed: false });
      }
      await loadStartStageContext();
      msg.success('تایید فرم تحویل ثبت شد.');
    } catch (error: any) {
      msg.error(error?.message || 'خطا در ثبت تایید فرم تحویل');
    } finally {
      setStartFormEditorLoading(false);
    }
  }, [
    currentUserId,
    loadStartStageContext,
    msg,
    startFormEditorFormId,
    startFormEditorTargetShelfId,
    startFormEditorTaskId,
  ]);

  useEffect(() => {
    void loadPermission();
  }, [loadPermission]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      try {
        await loadGridOptions();
        if (routeGroupId) {
          const { data: group, error } = await supabase
            .from('production_group_orders')
            .select('*')
            .eq('id', routeGroupId)
            .single();
          if (error) throw error;
          const groupRow = group as GroupOrderRecord;
          const ids = normalizeIds(groupRow?.production_order_ids);
          if (!mounted) return;
          setGroupId(groupRow.id);
          setGroupName(String(groupRow.name || ''));
          setGroupStatus(String(groupRow.status || 'pending'));
          setSelectedOrderIds(ids);
          await loadSelectableOrders(ids);
          await loadSelectedOrders(ids, true);
          setCurrentStep(groupRow.status === 'in_progress' || groupRow.status === 'completed' ? 4 : 0);
        } else {
          const preselected = (locationState?.selectedOrderIds || []).map((item) => String(item)).filter(Boolean);
          if (!mounted) return;
          setGroupId(null);
          setGroupName('');
          setGroupStatus('pending');
          setSelectedOrderIds(preselected);
          await loadSelectableOrders(preselected);
          if (preselected.length > 0) {
            await loadSelectedOrders(preselected, true);
          }
          setCurrentStep(0);
        }
      } catch (err: any) {
        if (mounted) msg.error(err?.message || 'خطا در بارگذاری اطلاعات سفارش گروهی');
      } finally {
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, [routeGroupId, locationState?.selectedOrderIds, loadGridOptions, loadSelectableOrders, loadSelectedOrders, msg]);

  useEffect(() => {
    if (!initialized) return;
    void loadSelectedOrders(selectedOrderIds, false);
  }, [initialized, selectedOrderIds, loadSelectedOrders]);

  useEffect(() => {
    if (!selectedOrderRows.length) return;
    setOrderPanelsExpanded((prev) => {
      const next = { ...prev };
      selectedOrderRows.forEach((order) => {
        const oid = String(order.id);
        const materialsKey = orderPanelKey('materials', oid);
        const linesKey = orderPanelKey('lines', oid);
        const progressKey = orderPanelKey('progress', oid);
        if (!(materialsKey in next)) next[materialsKey] = false;
        if (!(linesKey in next)) next[linesKey] = false;
        if (!(progressKey in next)) next[progressKey] = false;
      });
      return next;
    });
  }, [orderPanelKey, selectedOrderRows]);

  useEffect(() => {
    if (!groupId) return;
    if (!selectedOrderRows.length) return;
    const nextStatus = deriveGroupStatusFromOrders(selectedOrderRows);
    if (nextStatus === groupStatus) return;

    let cancelled = false;
    const syncStatus = async () => {
      try {
        const nowIso = new Date().toISOString();
        const payload: Record<string, any> = {
          status: nextStatus,
          updated_by: currentUserId,
          updated_at: nowIso,
        };
        if (nextStatus === 'completed') {
          payload.completed_at = nowIso;
        } else if (groupStatus === 'completed') {
          payload.completed_at = null;
        }
        if (nextStatus === 'in_progress' && groupStatus === 'pending') {
          payload.started_at = nowIso;
        }
        const { error } = await supabase
          .from('production_group_orders')
          .update(payload)
          .eq('id', groupId);
        if (error) throw error;
        if (cancelled) return;
        setGroupStatus(nextStatus);
        if (nextStatus === 'in_progress' || nextStatus === 'completed') {
          setCurrentStep(4);
        }
      } catch (err) {
        console.warn('Could not sync group status from orders:', err);
      }
    };

    void syncStatus();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, deriveGroupStatusFromOrders, groupId, groupStatus, selectedOrderRows]);

  const refreshAll = useCallback(async () => {
    const ids = [...selectedOrderIds];
    await Promise.all([loadSelectableOrders(ids), loadSelectedOrders(ids, true)]);
  }, [loadSelectableOrders, loadSelectedOrders, selectedOrderIds]);

  const syncOrdersWithGroup = useCallback(async (targetGroupId: string, orderIds: string[]) => {
    const normalizedIds = Array.from(new Set(orderIds.map((item) => String(item)).filter(Boolean)));
    const { data: linkedRows, error: linkedError } = await supabase
      .from('production_orders')
      .select('id')
      .eq('production_group_order_id', targetGroupId);
    if (linkedError) throw linkedError;
    const linkedIds = (linkedRows || []).map((row: any) => String(row.id));
    const unlinkIds = linkedIds.filter((item) => !normalizedIds.includes(item));

    if (unlinkIds.length > 0) {
      const { error } = await supabase
        .from('production_orders')
        .update({ production_group_order_id: null })
        .in('id', unlinkIds);
      if (error) throw error;
    }

    if (normalizedIds.length > 0) {
      const { error } = await supabase
        .from('production_orders')
        .update({ production_group_order_id: targetGroupId })
        .in('id', normalizedIds);
      if (error) throw error;
    }
  }, []);

  const handleSaveSetup = useCallback(async () => {
    if (!canEditGroup) {
      msg.error('دسترسی ویرایش برای این عملیات ندارید.');
      return;
    }
    if (!groupName.trim()) {
      msg.error('عنوان سفارش گروهی را وارد کنید.');
      return;
    }
    if (!selectedOrderIds.length) {
      msg.error('حداقل یک سفارش تولید انتخاب کنید.');
      return;
    }
    if (!allSelectedPending && !groupId) {
      msg.error('در ایجاد سفارش گروهی جدید، فقط سفارش‌های در وضعیت «در انتظار» قابل انتخاب هستند.');
      return;
    }

    setIsSavingSetup(true);
    try {
      let targetGroupId = groupId;
      if (!targetGroupId) {
        const payload = {
          name: groupName.trim(),
          status: 'pending',
          system_code: createGroupSystemCode(),
          production_order_ids: selectedOrderIds,
          created_by: currentUserId,
          updated_by: currentUserId,
        };
        const { data: inserted, error } = await supabase
          .from('production_group_orders')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        targetGroupId = String(inserted.id);
        setGroupId(targetGroupId);
        setGroupStatus('pending');
      } else {
        const { error } = await supabase
          .from('production_group_orders')
          .update({
            name: groupName.trim(),
            production_order_ids: selectedOrderIds,
            updated_by: currentUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetGroupId);
        if (error) throw error;
      }

      await syncOrdersWithGroup(targetGroupId, selectedOrderIds);
      await refreshAll();

      if (!groupId) {
        navigate(`/production_group_orders/${targetGroupId}`, { replace: true });
      }
      msg.success('تنظیمات سفارش گروهی ذخیره شد.');
    } catch (err: any) {
      msg.error(err?.message || 'خطا در ذخیره سفارش گروهی');
    } finally {
      setIsSavingSetup(false);
    }
  }, [
    allSelectedPending,
    canEditGroup,
    currentUserId,
    groupId,
    groupName,
    msg,
    navigate,
    refreshAll,
    selectedOrderIds,
    syncOrdersWithGroup,
  ]);

  const handleSaveRows = useCallback(async () => {
    if (!canEditGroup) {
      msg.error('دسترسی ویرایش برای این عملیات ندارید.');
      return;
    }
    if (!selectedOrderIds.length) {
      msg.warning('سفارشی برای ذخیره قطعات انتخاب نشده است.');
      return;
    }
    setIsSavingRows(true);
    try {
      for (const orderId of selectedOrderIds) {
        const payloadRows = orderRowsMap[orderId] || [];
        const { error } = await supabase
          .from('production_orders')
          .update({
            grid_materials: payloadRows,
            updated_by: currentUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);
        if (error) throw error;
      }
      msg.success('قطعات سفارش‌های تولید ذخیره شد.');
      await loadSelectedOrders(selectedOrderIds, true);
    } catch (err: any) {
      msg.error(err?.message || 'خطا در ذخیره قطعات');
    } finally {
      setIsSavingRows(false);
    }
  }, [canEditGroup, currentUserId, loadSelectedOrders, msg, orderRowsMap, selectedOrderIds]);

  const handleSaveQuantities = useCallback(async () => {
    if (!canEditGroup) {
      msg.error('دسترسی ویرایش برای این عملیات ندارید.');
      return;
    }
    if (!selectedOrderIds.length) {
      msg.warning('سفارشی برای ثبت تعداد انتخاب نشده است.');
      return;
    }
    setIsSavingQuantities(true);
    try {
      for (const orderId of selectedOrderIds) {
        const qty = toNumber(orderQuantityMap[orderId]);
        const payload: Record<string, any> = {
          updated_by: currentUserId,
          updated_at: new Date().toISOString(),
        };
        if (qty > 0) payload.quantity = qty;
        const { error } = await supabase.from('production_orders').update(payload).eq('id', orderId);
        if (error) throw error;
      }
      msg.success('تعداد سفارش‌های تولید ذخیره شد.');
      await loadSelectedOrders(selectedOrderIds, true);
    } catch (err: any) {
      msg.error(err?.message || 'خطا در ذخیره تعداد سفارش‌ها');
    } finally {
      setIsSavingQuantities(false);
    }
  }, [canEditGroup, currentUserId, loadSelectedOrders, msg, orderQuantityMap, selectedOrderIds]);

  const buildDeliveryRowKey = () => `delivery_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const normalizeDeliveryRow = useCallback((group: StartMaterialGroup, rawRow?: any): StartMaterialDeliveryRow => {
    const firstPiece = Array.isArray(group.pieces) && group.pieces.length > 0 ? group.pieces[0] : null;
    return {
      key: String(rawRow?.key || buildDeliveryRowKey()),
      pieceKey: rawRow?.pieceKey ? String(rawRow.pieceKey) : undefined,
      name: String(rawRow?.name ?? firstPiece?.name ?? ''),
      length: toNumber(rawRow?.length ?? firstPiece?.length ?? 0),
      width: toNumber(rawRow?.width ?? firstPiece?.width ?? 0),
      quantity: Math.max(0, toNumber(rawRow?.quantity ?? firstPiece?.quantity ?? 1)),
      mainUnit: String(rawRow?.mainUnit ?? firstPiece?.mainUnit ?? ''),
      subUnit: String(rawRow?.subUnit ?? firstPiece?.subUnit ?? ''),
      deliveredQty: calcDeliveredQty({
        length: rawRow?.length ?? firstPiece?.length ?? 0,
        width: rawRow?.width ?? firstPiece?.width ?? 0,
        quantity: rawRow?.quantity ?? firstPiece?.quantity ?? 1,
      }),
    };
  }, []);

  const recalcStartGroup = useCallback((group: StartMaterialGroup): StartMaterialGroup => {
    const pieces = Array.isArray(group.pieces) ? group.pieces : [];
    const rows = (Array.isArray(group.deliveryRows) ? group.deliveryRows : []).map((row) => ({
      ...row,
      deliveredQty: calcDeliveredQty(row),
    }));
    return {
      ...group,
      deliveryRows: rows,
      totalPerItemUsage: pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + toNumber(piece.perItemUsage), 0),
      totalUsage: pieces.reduce((sum: number, piece: StartMaterialPiece) => sum + toNumber(piece.totalUsage), 0),
      totalDeliveredQty: rows.reduce((sum, row) => sum + calcDeliveredQty(row), 0),
    };
  }, []);

  const setStartMaterialCollapsed = useCallback((groupIndex: number, collapsed: boolean) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, collapsed };
      return next;
    });
  }, []);

  const addDeliveryRow = useCallback((groupIndex: number) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const rows = Array.isArray(group.deliveryRows) ? [...group.deliveryRows] : [];
      rows.push(normalizeDeliveryRow(group));
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows: rows, isConfirmed: false });
      return next;
    });
  }, [normalizeDeliveryRow, recalcStartGroup]);

  const deleteDeliveryRows = useCallback((groupIndex: number, rowKeys: string[]) => {
    if (!rowKeys.length) return;
    const selected = new Set(rowKeys.map((key) => String(key)));
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const rows = (group.deliveryRows || []).filter((row) => !selected.has(String(row.key)));
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows: rows, isConfirmed: false });
      return next;
    });
  }, [recalcStartGroup]);

  const transferDeliveryRows = useCallback((
    sourceGroupIndex: number,
    rowKeys: string[],
    targetGroupIndex: number,
    mode: 'copy' | 'move'
  ) => {
    if (!rowKeys.length) return;
    setStartMaterials((prev) => {
      const next = [...prev];
      const sourceGroup = next[sourceGroupIndex];
      const targetGroup = next[targetGroupIndex];
      if (!sourceGroup || !targetGroup) return prev;
      if (mode === 'move' && sourceGroupIndex === targetGroupIndex) return prev;

      const selected = new Set(rowKeys.map((key) => String(key)));
      const sourceRows = Array.isArray(sourceGroup.deliveryRows) ? sourceGroup.deliveryRows : [];
      const picked = sourceRows.filter((row) => selected.has(String(row.key)));
      if (!picked.length) return prev;

      const copied = picked.map((row) =>
        normalizeDeliveryRow(targetGroup, {
          ...row,
          key: buildDeliveryRowKey(),
          pieceKey: undefined,
        })
      );

      const nextTargetRows = [...(targetGroup.deliveryRows || []), ...copied];
      next[targetGroupIndex] = recalcStartGroup({
        ...targetGroup,
        deliveryRows: nextTargetRows,
        isConfirmed: false,
      });

      if (mode === 'move') {
        const nextSourceRows = sourceRows.filter((row) => !selected.has(String(row.key)));
        next[sourceGroupIndex] = recalcStartGroup({
          ...sourceGroup,
          deliveryRows: nextSourceRows,
          isConfirmed: false,
        });
      }

      return next;
    });
  }, [normalizeDeliveryRow, recalcStartGroup]);

  const updateDeliveryRowField = useCallback((
    groupIndex: number,
    rowKey: string,
    field: keyof Omit<StartMaterialDeliveryRow, 'key'>,
    value: any
  ) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const rows = [...(group.deliveryRows || [])];
      const targetIndex = rows.findIndex((row) => String(row.key) === String(rowKey));
      if (targetIndex < 0) return prev;
      const row = rows[targetIndex];
      const numericFields: Array<keyof Omit<StartMaterialDeliveryRow, 'key'>> = ['length', 'width', 'quantity'];
      const nextValue = numericFields.includes(field) ? Math.max(0, toNumber(value)) : String(value ?? '');
      const updatedRow = { ...row, [field]: nextValue };
      rows[targetIndex] = { ...updatedRow, deliveredQty: calcDeliveredQty(updatedRow) };
      next[groupIndex] = recalcStartGroup({ ...group, deliveryRows: rows, isConfirmed: false });
      return next;
    });
  }, [recalcStartGroup]);

  const setSourceShelf = useCallback((groupIndex: number, shelfId: string | null) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      next[groupIndex] = { ...group, sourceShelfId: shelfId, isConfirmed: false };
      return next;
    });
  }, []);

  const setTargetStageTask = useCallback((groupIndex: number, taskId: string | null) => {
    setStartMaterials((prev) => {
      const next = [...prev];
      const group = next[groupIndex];
      if (!group) return prev;
      const option = taskId ? startStageOptionMap.get(String(taskId)) : null;
      next[groupIndex] = {
        ...group,
        targetStageTaskId: taskId,
        productionShelfId: option?.shelfId || null,
        isConfirmed: false,
      };
      return next;
    });
  }, [startStageOptionMap]);

  const onSourceShelfScan = useCallback((groupIndex: number, shelfId: string) => {
    const group = startMaterials[groupIndex];
    if (!group) return;
    const productId = group.selectedProductId;
    if (!productId) {
      msg.error('برای این ردیف، محصول انتخاب نشده است.');
      return;
    }
    const options = sourceShelfOptionsByProduct[productId] || [];
    const exists = options.some((option) => option.value === shelfId);
    if (!exists) {
      msg.error('این قفسه برای محصول انتخاب شده موجودی ندارد.');
      return;
    }
    setSourceShelf(groupIndex, shelfId);
  }, [msg, setSourceShelf, sourceShelfOptionsByProduct, startMaterials]);

  const onConfirmGroup = useCallback((groupIndex: number) => {
    const group = startMaterials[groupIndex];
    if (!group) return;
    if (!group.selectedProductId) {
      msg.error('برای این محصول، محصول انتخاب نشده است.');
      return;
    }
    if (!group.sourceShelfId) {
      msg.error('برای این محصول، قفسه برداشت انتخاب نشده است.');
      return;
    }
    if (!group.targetStageTaskId) {
      msg.error('برای این محصول، مرحله تولید مقصد انتخاب نشده است.');
      return;
    }
    const stageOption = startStageOptionMap.get(String(group.targetStageTaskId));
    if (!stageOption?.shelfId) {
      msg.error('برای مرحله انتخاب‌شده قفسه تولید مشخص نشده است.');
      return;
    }
    if (!group.totalDeliveredQty || group.totalDeliveredQty <= 0) {
      msg.error('برای این محصول، مقدار تحویل شده معتبر نیست.');
      return;
    }
    setStartMaterials((prev) => {
      const next = [...prev];
      const target = next[groupIndex];
      if (!target) return prev;
      next[groupIndex] = { ...target, isConfirmed: true };
      return next;
    });
  }, [msg, startMaterials, startStageOptionMap]);

  const loadSourceShelvesByProduct = useCallback(async (productIds: string[]) => {
    const ids = Array.from(new Set(productIds.map((item) => String(item)).filter(Boolean)));
    if (!ids.length) {
      setSourceShelfOptionsByProduct({});
      return {} as Record<string, { label: string; value: string; stock?: number }[]>;
    }
    const productUnits = new Map<string, string>();
    const { data: productRows } = await supabase
      .from('products')
      .select('id, main_unit')
      .in('id', ids);
    (productRows || []).forEach((row: any) => {
      const id = String(row?.id || '');
      if (!id) return;
      const mainUnit = String(row?.main_unit || '').trim();
      if (mainUnit) productUnits.set(id, mainUnit);
    });

    const { data: inventoryRows } = await supabase
      .from('product_inventory')
      .select('product_id, shelf_id, stock')
      .in('product_id', ids)
      .gt('stock', 0);

    const validRows = (inventoryRows || []).filter((row: any) => row?.product_id && row?.shelf_id);
    const shelfIds = Array.from(new Set(validRows.map((row: any) => String(row.shelf_id))));
    let shelfMap = new Map<string, { label: string; isProductionWarehouse: boolean }>();
    if (shelfIds.length > 0) {
      const { data: shelves } = await supabase
        .from('shelves')
        .select('id, shelf_number, name, warehouses(name)')
        .in('id', shelfIds)
        .limit(1000);
      shelfMap = new Map((shelves || []).map((shelf: any) => {
        const warehouseName = String(shelf?.warehouses?.name || '');
        const isProductionWarehouse = warehouseName.includes('تولید') || /production/i.test(warehouseName);
        const label = `${shelf.shelf_number || shelf.name || shelf.id}${warehouseName ? ` - ${warehouseName}` : ''}`;
        return [String(shelf.id), { label, isProductionWarehouse }];
      }));
    }

    const nextOptions: Record<string, { label: string; value: string; stock?: number }[]> = {};
    validRows.forEach((row: any) => {
      const productId = String(row.product_id);
      const shelfId = String(row.shelf_id);
      const stock = toNumber(row.stock);
      const shelfInfo = shelfMap.get(shelfId);
      if (shelfInfo?.isProductionWarehouse) return;
      const productUnit = productUnits.get(productId);
      const unitSuffix = productUnit ? ` ${productUnit}` : '';
      const label = `${shelfInfo?.label || shelfId} (موجودی: ${toPersianNumber(stock)}${unitSuffix})`;
      if (!nextOptions[productId]) nextOptions[productId] = [];
      if (!nextOptions[productId].some((item) => item.value === shelfId)) {
        nextOptions[productId].push({ value: shelfId, label, stock });
      }
    });
    setSourceShelfOptionsByProduct(nextOptions);
    return nextOptions;
  }, []);

  const resolveDefaultSourceShelfForGroup = useCallback((
    group: StartMaterialGroup,
    shelfOptionsMap: Record<string, { label: string; value: string; stock?: number }[]>
  ) => {
    const productId = String(group?.selectedProductId || '').trim();
    if (!productId) return null;
    const options = shelfOptionsMap[productId] || [];
    if (!options.length) return null;

    if (group.sourceShelfId && options.some((item) => item.value === group.sourceShelfId)) {
      return group.sourceShelfId;
    }

    const suggested = new Set<string>();
    (Array.isArray(group.orderRequirements) ? group.orderRequirements : []).forEach((req: any) => {
      const orderId = String(req?.orderId || '').trim();
      if (!orderId) return;
      const rowIndex = Number(req?.rowIndex);
      const row = Number.isFinite(rowIndex) ? (orderRowsMap[orderId] || [])[rowIndex] : null;
      const shelfId = String(row?.selected_shelf_id || '').trim();
      if (shelfId) suggested.add(shelfId);
    });
    const suggestedList = Array.from(suggested);
    if (suggestedList.length === 1 && options.some((item) => item.value === suggestedList[0])) {
      return suggestedList[0];
    }

    const byStock = [...options].sort((a, b) => toNumber(b?.stock) - toNumber(a?.stock));
    return byStock[0]?.value || options[0]?.value || null;
  }, [orderRowsMap]);

  const resolveDefaultTargetTaskForGroup = useCallback((group: StartMaterialGroup) => {
    const requirements = Array.isArray(group.orderRequirements) ? group.orderRequirements : [];
    if (!requirements.length) return null;
    const orderIds = Array.from(new Set(requirements.map((req) => String(req?.orderId || '')).filter(Boolean)));
    if (orderIds.length !== 1) return null;
    const orderId = orderIds[0];
    const option = startStageTaskOptions.find((item) => String(item.orderId) === orderId);
    return option?.value || null;
  }, [startStageTaskOptions]);

  const buildPreviousRowsByGroup = useCallback(() => {
    const map = new Map<string, Array<StartMaterialDeliveryRow & { __readonly: true }>>();
    (startStageForms || []).forEach((form) => {
      const groups = Array.isArray(form?.groups) ? form.groups : [];
      groups.forEach((group: any, groupIndex: number) => {
        const categoryLabel = String(group?.categoryLabel || group?.category_label || '').trim();
        const productId = resolveGroupProductId(group);
        if (!productId) return;
        const key = `${categoryLabel}::${productId}`;
        const rows = Array.isArray(group?.deliveryRows) ? group.deliveryRows : [];
        const normalizedRows = rows.map((row: any, rowIndex: number) => ({
          key: String(row?.key || `${form.id}_${groupIndex}_${rowIndex}`),
          pieceKey: row?.pieceKey ? String(row.pieceKey) : undefined,
          name: String(row?.name || ''),
          length: toNumber(row?.length),
          width: toNumber(row?.width),
          quantity: toNumber(row?.quantity),
          mainUnit: String(row?.mainUnit || row?.main_unit || ''),
          subUnit: String(row?.subUnit || row?.sub_unit || ''),
          deliveredQty: calcDeliveredQty(row),
          __readonly: true as const,
        }));
        if (!normalizedRows.length) return;
        const current = map.get(key) || [];
        map.set(key, [...current, ...normalizedRows]);
      });
    });
    return map;
  }, [startStageForms]);

  const prepareStartMaterials = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!selectedOrderRows.length) {
      if (!silent) msg.error('ابتدا حداقل یک سفارش تولید را انتخاب کنید.');
      setStartMaterials([]);
      return;
    }
    const groups = buildGroupStartMaterials({
      orders: selectedOrderRows,
      orderRowsMap,
      orderQuantityMap,
      categoryLabelMap,
      productMetaMap,
    });
    if (!groups.length) {
      if (!silent) msg.warning('مواد اولیه‌ای برای شروع تولید گروهی یافت نشد.');
      setStartMaterials([]);
      return;
    }

    const productIds = Array.from(
      new Set(
        groups
          .map((group) => group.selectedProductId)
          .filter((value): value is string => !!value)
      )
    );
    const sourceShelves = await loadSourceShelvesByProduct(productIds);
    const previousRowsByGroup = buildPreviousRowsByGroup();
    const normalizedGroups = groups.map((group, index) => {
      const groupKey = `${String(group?.categoryLabel || '').trim()}::${String(group?.selectedProductId || '').trim()}`;
      const previousRows = previousRowsByGroup.get(groupKey) || [];
      const targetTaskId = resolveDefaultTargetTaskForGroup(group);
      const stageOption = targetTaskId ? startStageOptionMap.get(String(targetTaskId)) : null;
      const sourceShelfId = resolveDefaultSourceShelfForGroup(group, sourceShelves || {});
      return {
        ...group,
        rowIndex: index,
        collapsed: true,
        isConfirmed: false,
        sourceShelfId: sourceShelfId || null,
        productionShelfId: stageOption?.shelfId || null,
        targetStageTaskId: targetTaskId || null,
        previousDeliveryRows: previousRows,
        previousDeliveredQty: previousRows.reduce((sum, row) => sum + calcDeliveredQty(row), 0),
        deliveryRows: Array.isArray(group.deliveryRows) ? group.deliveryRows : [],
      };
    });
    setStartMaterials(normalizedGroups);
  }, [
    buildPreviousRowsByGroup,
    categoryLabelMap,
    loadSourceShelvesByProduct,
    msg,
    orderQuantityMap,
    orderRowsMap,
    productMetaMap,
    resolveDefaultSourceShelfForGroup,
    resolveDefaultTargetTaskForGroup,
    selectedOrderRows,
    startStageOptionMap,
  ]);

  useEffect(() => {
    if (currentStep !== 1) return;
    setMaterialsStepLoading(true);
    const timeout = setTimeout(() => setMaterialsStepLoading(false), 220);
    return () => clearTimeout(timeout);
  }, [currentStep, selectedOrderRows.length]);

  useEffect(() => {
    if (currentStep !== 3) return;
    let cancelled = false;
    const run = async () => {
      setStartStepPreparing(true);
      setStartFormMode('list');
      await loadStartStageContext();
      if (!cancelled) setStartStepPreparing(false);
    };
    void run();
    return () => {
      cancelled = true;
      setStartStepPreparing(false);
    };
  }, [currentStep, loadStartStageContext]);

  const openCreateStartForm = useCallback(async () => {
    setStartStepPreparing(true);
    try {
      await prepareStartMaterials({ silent: false });
      setStartFormMode('create');
    } finally {
      setStartStepPreparing(false);
    }
  }, [prepareStartMaterials]);

  const backToStartFormsList = useCallback(async () => {
    setStartStepPreparing(true);
    try {
      await loadStartStageContext();
      setStartFormMode('list');
    } finally {
      setStartStepPreparing(false);
    }
  }, [loadStartStageContext]);

  const handleConfirmStartGroup = useCallback(async () => {
    if (!groupId) {
      msg.error('ابتدا سفارش گروهی را ذخیره کنید.');
      return;
    }
    if (!canEditGroup) {
      msg.error('دسترسی ویرایش برای شروع تولید گروهی ندارید.');
      return;
    }

    const confirmed = startMaterials.filter((group) => group.isConfirmed === true && toNumber(group.totalDeliveredQty) > 0);
    if (!confirmed.length) {
      msg.error('حداقل یک محصول باید تایید و ثبت شود.');
      return;
    }

    const missingSourceShelf = confirmed.some((group) => !group.sourceShelfId);
    if (missingSourceShelf) {
      msg.error('برای همه محصولات تایید شده باید قفسه برداشت معتبر مشخص باشد.');
      return;
    }
    const missingStage = confirmed.some((group) => !group.targetStageTaskId);
    if (missingStage) {
      msg.error('برای همه محصولات تایید شده باید مرحله تولید مقصد انتخاب شود.');
      return;
    }
    const missingStageShelf = confirmed.some((group) => {
      const option = group.targetStageTaskId ? startStageOptionMap.get(String(group.targetStageTaskId)) : null;
      return !option?.shelfId;
    });
    if (missingStageShelf) {
      msg.error('برای برخی مراحل انتخاب‌شده، قفسه تولید ثبت نشده است.');
      return;
    }
    const hasInvalidTargetOrder = confirmed.some((group) => {
      const option = group.targetStageTaskId ? startStageOptionMap.get(String(group.targetStageTaskId)) : null;
      const targetOrderId = String(option?.orderId || '').trim();
      if (!targetOrderId) return false;
      const requirements = Array.isArray((group as any)?.orderRequirements) ? (group as any).orderRequirements : [];
      return requirements.length > 0 && !requirements.some((req: any) => String(req?.orderId || '') === targetOrderId);
    });
    if (hasInvalidTargetOrder) {
      msg.error('مرحله مقصد انتخاب‌شده با سفارش محصول تحویلی هم‌خوانی ندارد.');
      return;
    }

    const destinationTaskIds = Array.from(
      new Set(
        confirmed
          .map((group) => String(group.targetStageTaskId || ''))
          .filter(Boolean)
      )
    );
    const { data: freshTasks, error: freshTasksError } = await supabase
      .from('tasks')
      .select('*')
      .in('id', destinationTaskIds);
    if (freshTasksError) {
      msg.error(freshTasksError.message || 'خطا در دریافت مراحل تولید مقصد');
      return;
    }
    const taskById = new Map<string, any>(
      (freshTasks || []).map((task: any) => [String(task?.id || ''), task])
    );

    const moves = confirmed.map((group) => {
      const option = group.targetStageTaskId ? startStageOptionMap.get(String(group.targetStageTaskId)) : null;
      return {
        product_id: String(group.selectedProductId),
        from_shelf_id: String(group.sourceShelfId),
        to_shelf_id: String(option?.shelfId || group.productionShelfId || ''),
        quantity: toNumber(group.totalDeliveredQty),
        unit: group.deliveryRows?.find((row: any) => String(row?.mainUnit || '').trim())?.mainUnit
          || group.pieces?.find((piece: any) => String(piece?.mainUnit || '').trim())?.mainUnit
          || null,
      };
    }).filter((move) => move.to_shelf_id);

    setIsStartingGroup(true);
    try {
      await applyProductionMoves(moves);

      const nowIso = new Date().toISOString();
      const nextRowsByOrder: Record<string, any[]> = { ...orderRowsMap };
      const orderMovesMap: Record<string, any[]> = {};
      const groupsByDestinationTask: Record<string, StartMaterialGroup[]> = {};

      confirmed.forEach((group) => {
        const targetStageTaskId = String(group.targetStageTaskId || '');
        const stageOption = targetStageTaskId ? startStageOptionMap.get(targetStageTaskId) : null;
        if (targetStageTaskId) {
          if (!groupsByDestinationTask[targetStageTaskId]) groupsByDestinationTask[targetStageTaskId] = [];
          groupsByDestinationTask[targetStageTaskId].push(group);
        }
        const targetOrderId = String(stageOption?.orderId || '').trim();
        const scopedRequirements = targetOrderId
          ? (Array.isArray((group as any)?.orderRequirements)
            ? (group as any).orderRequirements.filter((req: any) => String(req?.orderId || '') === targetOrderId)
            : [])
          : (Array.isArray((group as any)?.orderRequirements) ? (group as any).orderRequirements : []);
        const allocationGroup: GroupStartMaterial = {
          ...(group as GroupStartMaterial),
          orderRequirements: scopedRequirements,
        };
        const allocations = splitDeliveredAcrossRequirements(allocationGroup);
        allocations.forEach((allocation) => {
          if (!allocation.orderId) return;
          const existingRows = Array.isArray(nextRowsByOrder[allocation.orderId]) ? [...nextRowsByOrder[allocation.orderId]] : [];
          const targetRow = existingRows[allocation.rowIndex];
          if (!targetRow) return;

          const existingDeliveryRows = Array.isArray(targetRow?.delivery_rows) ? targetRow.delivery_rows : [];
          const nextRow: any = {
            ...targetRow,
            selected_shelf_id: group.sourceShelfId || targetRow?.selected_shelf_id || null,
            production_shelf_id: stageOption?.shelfId || group.productionShelfId || targetRow?.production_shelf_id || null,
            target_stage_task_id: targetStageTaskId || targetRow?.target_stage_task_id || null,
            delivered_total_qty: toNumber(targetRow?.delivered_total_qty) + toNumber(allocation.deliveredQty),
            delivery_rows: [...existingDeliveryRows, ...(group.deliveryRows || [])],
          };

          if (Array.isArray(targetRow?.pieces)) {
            nextRow.pieces = targetRow.pieces.map((piece: any, pieceIndex: number) => {
              const delivered = allocation.pieceDeliveredByIndex?.[pieceIndex];
              if (delivered === undefined) return piece;
              return {
                ...piece,
                delivered_qty: toNumber(piece?.delivered_qty) + toNumber(delivered),
              };
            });
          }

          existingRows[allocation.rowIndex] = nextRow;
          nextRowsByOrder[allocation.orderId] = existingRows;

          if (!orderMovesMap[allocation.orderId]) orderMovesMap[allocation.orderId] = [];
          if (toNumber(allocation.deliveredQty) > 0) {
            orderMovesMap[allocation.orderId].push({
              product_id: String(group.selectedProductId),
              from_shelf_id: String(group.sourceShelfId),
              to_shelf_id: String(stageOption?.shelfId || group.productionShelfId || ''),
              quantity: toNumber(allocation.deliveredQty),
              unit: group.deliveryRows?.find((row: any) => String(row?.mainUnit || '').trim())?.mainUnit
                || group.pieces?.find((piece: any) => String(piece?.mainUnit || '').trim())?.mainUnit
                || null,
            });
          }
        });
      });

      for (const taskId of Object.keys(groupsByDestinationTask)) {
        const task = taskById.get(String(taskId));
        if (!task) continue;
        const recurrence = parseRecurrenceInfo(task?.recurrence_info);
        const existingHandover = recurrence?.production_handover && typeof recurrence.production_handover === 'object'
          ? recurrence.production_handover
          : {};
        const existingFormsRaw = Array.isArray(existingHandover?.forms) ? existingHandover.forms : [];
        const legacyForms =
          existingFormsRaw.length === 0 && Array.isArray(existingHandover?.groups)
            ? [{
                id: existingHandover?.activeFormId || `handover_legacy_${String(taskId)}`,
                sourceTaskId: existingHandover?.sourceTaskId || null,
                sourceStageName: existingHandover?.sourceStageName || null,
                giver: existingHandover?.giver || null,
                receiver: existingHandover?.receiver || null,
                giverConfirmation: existingHandover?.giverConfirmation || null,
                receiverConfirmation: existingHandover?.receiverConfirmation || null,
                createdAt: existingHandover?.updatedAt || null,
                updatedAt: existingHandover?.updatedAt || null,
                groups: existingHandover?.groups || [],
              }]
            : [];
        const existingForms = existingFormsRaw.length > 0 ? existingFormsRaw : legacyForms;
        const groupsForTask = groupsByDestinationTask[taskId] || [];
        const normalizedGroups = groupsForTask.map((group) => ({
          key: String(group.key),
          rowIndex: Number(group.rowIndex ?? 0),
          categoryLabel: String(group.categoryLabel || ''),
          selectedProductId: group.selectedProductId ? String(group.selectedProductId) : null,
          selectedProductName: String(group.selectedProductName || ''),
          selectedProductCode: String(group.selectedProductCode || ''),
          sourceShelfId: group.sourceShelfId ? String(group.sourceShelfId) : null,
          targetShelfId: task?.production_shelf_id ? String(task.production_shelf_id) : null,
          pieces: Array.isArray(group.pieces) ? group.pieces : [],
          orderPieces: (Array.isArray(group.orderRequirements) ? group.orderRequirements : []).flatMap((req: any) => (
            Array.isArray(req?.pieces) ? req.pieces : []
          )),
          deliveryRows: Array.isArray(group.deliveryRows) ? group.deliveryRows : [],
          totalSourceQty: toNumber(group.totalUsage),
          totalOrderQty: toNumber(group.totalUsage),
          totalHandoverQty: toNumber(group.totalDeliveredQty),
          collapsed: true,
          isConfirmed: true,
        }));
        const formId = buildStartStageFormId();
        const nextForm = {
          id: formId,
          direction: 'incoming',
          sourceTaskId: null,
          destinationTaskId: null,
          sourceStageName: 'شروع تولید',
          sourceShelfId: null,
          targetShelfId: task?.production_shelf_id ? String(task.production_shelf_id) : null,
          giver: {
            id: currentUserId || null,
            type: 'user',
            label: 'شروع تولید',
          },
          receiver: {
            id: task?.assignee_id ? String(task.assignee_id) : null,
            type: task?.assignee_type === 'role' ? 'role' : (task?.assignee_type === 'user' ? 'user' : null),
            label: String(task?.name || '?????'),
          },
          groups: normalizedGroups,
          wasteByProduct: {},
          giverConfirmation: { confirmed: false },
          receiverConfirmation: { confirmed: false },
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        const nextForms = [...existingForms, nextForm];
        const nextHandover = {
          ...existingHandover,
          direction: 'incoming',
          sourceTaskId: null,
          destinationTaskId: null,
          sourceStageName: 'شروع تولید',
          sourceShelfId: null,
          targetShelfId: nextForm.targetShelfId || existingHandover?.targetShelfId || null,
          giver: nextForm.giver,
          receiver: nextForm.receiver,
          groups: nextForm.groups,
          wasteByProduct: {},
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
        const { error: updateTaskError } = await supabase
          .from('tasks')
          .update({
            recurrence_info: nextRecurrence,
            production_shelf_id: task?.production_shelf_id || null,
          })
          .eq('id', taskId);
        if (updateTaskError) throw updateTaskError;
      }

      const transferPayload: any[] = [];
      Object.entries(orderMovesMap).forEach(([orderId, moveRows]) => {
        (moveRows || []).forEach((move: any) => {
          transferPayload.push({
            transfer_type: 'production_stage',
            product_id: move?.product_id || null,
            required_qty: toNumber(move?.quantity),
            delivered_qty: toNumber(move?.quantity),
            production_order_id: orderId || null,
            from_shelf_id: move?.from_shelf_id || null,
            to_shelf_id: move?.to_shelf_id || null,
            sender_id: currentUserId || null,
            receiver_id: currentUserId || null,
          });
        });
      });
      if (transferPayload.length > 0) {
        const { error: transferError } = await supabase.from('stock_transfers').insert(transferPayload);
        if (transferError) throw transferError;
      }

      for (const orderId of selectedOrderIds) {
        const rows = nextRowsByOrder[orderId] || [];
        const movesForOrder = orderMovesMap[orderId] || [];
        const currentOrder = selectedOrderMap.get(String(orderId));
        const existingMoves = Array.isArray(currentOrder?.production_moves) ? currentOrder?.production_moves : [];
        const payload: Record<string, any> = {
          status: 'in_progress',
          grid_materials: rows,
          production_moves: [...existingMoves, ...movesForOrder],
          production_shelf_id: currentOrder?.production_shelf_id || movesForOrder[0]?.to_shelf_id || null,
          production_group_order_id: groupId,
          updated_by: currentUserId,
          updated_at: nowIso,
        };
        if (String(currentOrder?.status || '') !== 'in_progress' && String(currentOrder?.status || '') !== 'completed') {
          payload.production_started_at = nowIso;
        }
        const qty = toNumber(orderQuantityMap[orderId]);
        if (qty > 0) payload.quantity = qty;
        const { error } = await supabase.from('production_orders').update(payload).eq('id', orderId);
        if (error) throw error;
      }

      const { error: groupError } = await supabase
        .from('production_group_orders')
        .update({
          status: 'in_progress',
          ...(groupStatus === 'pending' ? { started_at: nowIso } : {}),
          production_order_ids: selectedOrderIds,
          updated_by: currentUserId,
          updated_at: nowIso,
        })
        .eq('id', groupId);
      if (groupError) throw groupError;

      setGroupStatus('in_progress');
      setOrderRowsMap(nextRowsByOrder);
      setCurrentStep(3);
      await loadSelectedOrders(selectedOrderIds, true);
      await loadStartStageContext();
      setStartFormMode('list');
      msg.success('فرم تحویل مواد اولیه ثبت شد.');
    } catch (err: any) {
      msg.error(err?.message || 'خطا در شروع تولید گروهی');
    } finally {
      setIsStartingGroup(false);
    }
  }, [
    canEditGroup,
    currentUserId,
    groupId,
    groupStatus,
    loadStartStageContext,
    loadSelectedOrders,
    msg,
    orderQuantityMap,
    orderRowsMap,
    selectedOrderIds,
    selectedOrderMap,
    startStageOptionMap,
    startMaterials,
  ]);

  const columns = useMemo<ColumnsType<ProductionOrderRecord>>(
    () => [
      {
        title: 'سفارش تولید',
        dataIndex: 'name',
        key: 'name',
        render: (value: string, record: ProductionOrderRecord) => (
          <div className="flex flex-col">
            <span className="font-semibold">{value || '-'}</span>
            <span className="text-xs text-gray-500">{record.system_code || '-'}</span>
          </div>
        ),
      },
      {
        title: 'BOM',
        dataIndex: 'bom_name',
        key: 'bom_name',
        width: 260,
        render: (_value: string, record: ProductionOrderRecord) => (
          <div className="flex flex-col">
            <span className="font-medium">{record.bom_name || '-'}</span>
            <span className="text-xs text-gray-500">{record.bom_system_code || '-'}</span>
          </div>
        ),
      },
      {
        title: 'خطوط تولید',
        dataIndex: 'production_line_count',
        key: 'production_line_count',
        width: 160,
        render: (_value: number, record: ProductionOrderRecord) => (
          <div className="text-xs leading-5">
            <div>تعداد خط: <span className="font-semibold">{toPersianNumber(toNumber(record.production_line_count || 0))}</span></div>
            <div>جمع تولید: <span className="font-semibold">{toPersianNumber(toNumber(record.production_line_qty || 0))}</span></div>
          </div>
        ),
      },
      {
        title: 'وضعیت',
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (value: string) => getStatusTag(value),
      },
      {
        title: 'تعداد',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 120,
        render: (value: number) => toPersianNumber(toNumber(value)),
      },
    ],
    []
  );

  const bomFilterOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string }>();
    availableOrders.forEach((order) => {
      const bomId = String(order?.bom_id || '').trim();
      if (!bomId) return;
      if (map.has(bomId)) return;
      const bomLabel = String(order?.bom_name || '').trim();
      const bomCode = String(order?.bom_system_code || '').trim();
      const label = bomCode ? `${bomLabel || 'BOM'} (${bomCode})` : (bomLabel || bomId);
      map.set(bomId, { value: bomId, label });
    });
    return Array.from(map.values());
  }, [availableOrders]);

  const filteredAvailableOrders = useMemo(() => {
    if (!setupBomFilter) return availableOrders;
    return availableOrders.filter((row) => String(row?.bom_id || '') === setupBomFilter);
  }, [availableOrders, setupBomFilter]);

  const renderSetupStep = () => (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <Card className="rounded-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">
              عنوان سفارش گروهی <span className="text-red-600">*</span>
            </div>
            <Input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              disabled={!canEditGroup || groupStatus === 'completed'}
              placeholder="مثال: سفارش گروهی هفته سوم"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => void handleSaveSetup()}
              loading={isSavingSetup}
              disabled={!canEditGroup || groupStatus === 'completed'}
              className="bg-leather-600 hover:!bg-leather-500 border-none"
            >
              ذخیره مرحله اول
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void refreshAll()}>
              بروزرسانی
            </Button>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl flex-1 min-h-0" title="انتخاب سفارش‌های تولید (فقط وضعیت در انتظار)">
        <div className="mb-3 flex flex-col md:flex-row md:items-center gap-2">
          <span className="text-xs text-gray-500">فیلتر بر اساس BOM:</span>
          <Select
            allowClear
            value={setupBomFilter || undefined}
            onChange={(value) => setSetupBomFilter(value || null)}
            options={bomFilterOptions}
            placeholder="همه BOMها"
            showSearch
            optionFilterProp="label"
            className="w-full md:w-[360px]"
            getPopupContainer={() => document.body}
          />
        </div>
        <Table<ProductionOrderRecord>
          rowKey="id"
          dataSource={filteredAvailableOrders}
          columns={columns}
          size="small"
          className="custom-erp-table"
          pagination={{ pageSize: 8, showSizeChanger: false }}
          scroll={{ x: true, y: 360 }}
          rowSelection={{
            selectedRowKeys: selectedOrderIds,
            onChange: (keys: React.Key[]) => setSelectedOrderIds(keys.map((key) => String(key))),
            getCheckboxProps: (record: ProductionOrderRecord) => ({
              disabled: String(record.status || '') !== 'pending' && !selectedOrderIds.includes(String(record.id)),
            }),
          }}
        />
      </Card>
    </div>
  );

  const renderMaterialsStep = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#d8c8b8] bg-[#fcf7f1] px-4 py-3 text-sm text-[#6f4a2d]">
        انتخاب کنید که برای هر دسته بندی، از چه محصولی استفاده شود؟
        <div className="text-xs text-[#8b5e3c] mt-1">برای ثبت تغییرات ردیف باز، از میانبر Ctrl+Enter استفاده کنید.</div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => void handleSaveRows()}
          loading={isSavingRows}
          disabled={!canEditGroup || groupStatus === 'completed' || !selectedOrderRows.length}
          className="bg-leather-600 hover:!bg-leather-500 border-none"
        >
          ذخیره قطعات سفارش‌ها
        </Button>
      </div>
      {materialsStepLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 flex items-center justify-center">
          <Spin />
        </div>
      ) : !selectedOrderRows.length || !gridBlock ? (
        <Empty description="سفارشی برای نمایش قطعات انتخاب نشده است." />
      ) : (
        selectedOrderRows.map((order) => (
          <Card key={order.id} className="rounded-2xl overflow-hidden p-0">
            <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">نام سفارش تولید:</span>
                <span className="font-semibold">{order.name || '-'}</span>
                {order.system_code ? <Tag color="default">{order.system_code}</Tag> : null}
              </div>
              <Button
                type="text"
                size="small"
                className="!text-gray-700 hover:!text-gray-900"
                icon={
                  <RightOutlined
                    className={`transition-transform ${
                      isOrderPanelExpanded('materials', order.id) ? 'rotate-90' : ''
                    }`}
                  />
                }
                onClick={() =>
                  setOrderPanelExpanded('materials', order.id, !isOrderPanelExpanded('materials', order.id))
                }
              />
            </div>
            {isOrderPanelExpanded('materials', order.id) ? (
              <div className="p-3">
                {!materialOrderLoaded[order.id] ? (
                  <div className="py-8 flex items-center justify-center">
                    <Spin />
                  </div>
                ) : (
                  <GridTable
                    block={gridBlock}
                    initialData={orderRowsMap[order.id] || []}
                    moduleId="production_orders"
                    mode="db"
                    recordId={order.id}
                    relationOptions={relationOptions}
                    dynamicOptions={dynamicOptions}
                    canEditModule={canEditGroup && groupStatus !== 'completed'}
                    canViewField={() => true}
                    orderQuantity={toNumber(orderQuantityMap[order.id])}
                    onSaveSuccess={(nextRows) => {
                      setOrderRowsMap((prev) => ({
                        ...prev,
                        [order.id]: normalizeGridRowsForWizard(nextRows),
                      }));
                    }}
                  />
                )}
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );

  const renderLinesStep = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={() => void handleSaveQuantities()}
          loading={isSavingQuantities}
          disabled={!canEditGroup || groupStatus === 'completed' || !selectedOrderRows.length}
          className="bg-leather-600 hover:!bg-leather-500 border-none"
        >
          ذخیره تعداد سفارش‌ها
        </Button>
      </div>
      {!selectedOrderRows.length ? (
        <Empty description="سفارشی برای چیدمان خط تولید انتخاب نشده است." />
      ) : (
        selectedOrderRows.map((order) => (
          <Card key={order.id} className="rounded-2xl overflow-hidden p-0">
            <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">نام سفارش تولید:</span>
                <span className="font-semibold">{order.name || '-'}</span>
                {order.system_code ? <Tag color="default">{order.system_code}</Tag> : null}
              </div>
              <Button
                type="text"
                size="small"
                className="!text-gray-700 hover:!text-gray-900"
                icon={
                  <RightOutlined
                    className={`transition-transform ${
                      isOrderPanelExpanded('lines', order.id) ? 'rotate-90' : ''
                    }`}
                  />
                }
                onClick={() => setOrderPanelExpanded('lines', order.id, !isOrderPanelExpanded('lines', order.id))}
              />
            </div>
            {isOrderPanelExpanded('lines', order.id) ? (
              <div className="p-3">
                <ProductionStagesField
                  recordId={order.id}
                  moduleId="production_orders"
                  compact
                  readOnly={!canEditGroup || groupStatus === 'completed'}
                  onQuantityChange={(qty) => {
                    const parsed = toNumber(qty);
                    setOrderQuantityMap((prev) => ({ ...prev, [order.id]: parsed }));
                  }}
                />
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );

  const startFormsListRows = useMemo(() => {
    return (startStageForms || []).map((form) => {
      const totals = form?.totalsByProduct || {};
      const productCount = Object.keys(totals).length;
      const totalQty = Object.values(totals).reduce((sum, qty) => sum + toNumber(qty), 0);
      return {
        ...form,
        key: form.id,
        productCount,
        totalQty,
      };
    });
  }, [startStageForms]);

  const startFormsColumns = useMemo<ColumnsType<any>>(
    () => [
      {
        title: 'سفارش تولید',
        dataIndex: 'orderTitle',
        key: 'orderTitle',
        width: 260,
        render: (value: string) => <span className="font-medium">{value || '-'}</span>,
      },
      {
        title: 'مرحله مقصد',
        dataIndex: 'stageName',
        key: 'stageName',
        width: 180,
      },
      {
        title: 'مرحله تحویل دهنده',
        dataIndex: 'sourceStageName',
        key: 'sourceStageName',
        width: 170,
      },
      {
        title: 'جمع تحویل',
        dataIndex: 'totalQty',
        key: 'totalQty',
        width: 140,
        render: (value: number) => toPersianNumber(toNumber(value)),
      },
      {
        title: 'تعداد محصولات',
        dataIndex: 'productCount',
        key: 'productCount',
        width: 120,
        render: (value: number) => toPersianNumber(toNumber(value)),
      },
      {
        title: 'تاریخ ثبت',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 180,
        render: (value: string, record: any) => formatDateTime(value || record?.createdAt),
      },
      {
        title: 'تایید',
        key: 'confirmation',
        width: 180,
        render: (_: any, record: any) => (
          <div className="flex items-center gap-1">
            <Tag color={record?.giverConfirmed ? 'green' : 'orange'}>
              تحویل‌دهنده: {record?.giverConfirmed ? 'تایید' : 'در انتظار'}
            </Tag>
            <Tag color={record?.receiverConfirmed ? 'green' : 'blue'}>
              تحویل‌گیرنده: {record?.receiverConfirmed ? 'تایید' : 'در انتظار'}
            </Tag>
          </div>
        ),
      },
    ],
    []
  );

  const renderStartStep = () => (
    <Card className="rounded-2xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          تعداد سفارش انتخاب شده: <span className="font-semibold">{toPersianNumber(selectedOrderRows.length)}</span>
        </div>
        {startStepPreparing ? (
          <div className="py-8 flex items-center justify-center">
            <Spin />
          </div>
        ) : null}
        {!startStepPreparing && !selectedOrderRows.length ? (
          <Empty description="برای تحویل مواد اولیه، ابتدا سفارش تولید انتخاب کنید." />
        ) : null}
        {!startStepPreparing && selectedOrderRows.length > 0 && startFormMode === 'list' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-gray-700">
                لیست فرم‌های تحویل کالا (فقط فرم‌هایی که مرحله تحویل‌دهنده آن‌ها «شروع تولید» است)
              </div>
              <div className="flex items-center gap-2">
                <Button icon={<ReloadOutlined />} loading={startFormsLoading} onClick={() => void loadStartStageContext()}>
                  بروزرسانی
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => void openCreateStartForm()}
                  disabled={!canEditGroup || groupStatus === 'completed'}
                  className="bg-leather-600 hover:!bg-leather-500 border-none"
                >
                  افزودن فرم تحویل جدید
                </Button>
              </div>
            </div>
            <Table
              rowKey="id"
              size="small"
              loading={startFormsLoading}
              dataSource={startFormsListRows}
              columns={startFormsColumns}
              className="custom-erp-table"
              pagination={{ pageSize: 8, showSizeChanger: false }}
              locale={{ emptyText: 'هنوز فرم تحویل شروع تولید ثبت نشده است.' }}
              scroll={{ x: true }}
              rowClassName="cursor-pointer"
              onRow={(record: any) => ({
                onClick: () => {
                  void openStartFormEditor(record as StartStageFormRow);
                },
              })}
            />
          </div>
        ) : null}
        {!startStepPreparing && selectedOrderRows.length > 0 && startFormMode === 'create' ? (
          <div className="space-y-3">
            <StartProductionModal
              inline
              open
              loading={isStartingGroup}
              materials={startMaterials}
              orderName={groupName || 'سفارش گروهی'}
              sourceShelfOptionsByProduct={sourceShelfOptionsByProduct}
              productionShelfOptions={[]}
              productionStageOptions={startStageTaskOptions}
              productionTargetType="stage"
              readonlyUnitFields
              onCancel={() => {}}
              onStart={() => void handleConfirmStartGroup()}
              onToggleGroup={setStartMaterialCollapsed}
              onDeliveryRowAdd={addDeliveryRow}
              onDeliveryRowsDelete={deleteDeliveryRows}
              onDeliveryRowsTransfer={transferDeliveryRows}
              onDeliveryRowFieldChange={updateDeliveryRowField}
              onSourceShelfChange={setSourceShelf}
              onSourceShelfScan={onSourceShelfScan}
              onProductionShelfChange={() => {}}
              onProductionStageChange={setTargetStageTask}
              onConfirmGroup={onConfirmGroup}
            />
            <div className="flex items-center justify-end gap-2">
              <Button icon={<RightOutlined />} onClick={() => void backToStartFormsList()}>
                بازگشت به لیست فرم‌ها
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => void prepareStartMaterials({ silent: false })}>
                بروزرسانی فرم تحویل
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={() => void handleConfirmStartGroup()}
                loading={isStartingGroup}
                disabled={!startMaterials.length || !canEditGroup || groupStatus === 'completed'}
                className="bg-leather-600 hover:!bg-leather-500 border-none"
              >
                ثبت فرم تحویل
              </Button>
            </div>
          </div>
        ) : null}
        <TaskHandoverModal
          open={startFormEditorOpen}
          loading={startFormEditorLoading}
          locked
          taskName={startFormEditorTaskName}
          sourceStageName={startFormEditorSourceStageName}
          nextStageName={null}
          giverName={startFormEditorGiverName}
          receiverName={startFormEditorReceiverName}
          trafficType={startFormEditorTrafficType}
          trafficTypeEditable={false}
          sourceStageValue={null}
          sourceShelfId={null}
          destinationStageId={null}
          stageOptions={startFormEditorStageOptions}
          centralSourceShelfOptions={[]}
          groups={startFormEditorGroups}
          shelfOptions={stageShelfOptions}
          targetShelfId={startFormEditorTargetShelfId}
          giverConfirmation={startFormEditorGiverConfirmation}
          receiverConfirmation={startFormEditorReceiverConfirmation}
          onCancel={closeStartFormEditor}
          onSave={closeStartFormEditor}
          onTrafficTypeChange={(nextType) => setStartFormEditorTrafficType(nextType)}
          onSourceStageChange={() => {}}
          onSourceShelfChange={() => {}}
          onDestinationStageChange={() => {}}
          onToggleGroup={(groupIndex, collapsed) => {
            setStartFormEditorGroups((prev) => {
              const next = [...prev];
              const group = next[groupIndex];
              if (!group) return prev;
              next[groupIndex] = { ...group, collapsed };
              return next;
            });
          }}
          onConfirmGroup={() => {}}
          onDeliveryRowAdd={() => {}}
          onDeliveryRowsDelete={() => {}}
          onDeliveryRowsTransfer={() => {}}
          onDeliveryRowFieldChange={() => {}}
          onTargetShelfChange={setStartFormEditorTargetShelfId}
          onTargetShelfScan={(shelfId) => setStartFormEditorTargetShelfId(shelfId)}
          onConfirmGiver={() => { void confirmStartFormSide('giver'); }}
          onConfirmReceiver={() => { void confirmStartFormSide('receiver'); }}
        />
      </div>
    </Card>
  );

  const renderProgressStep = () => (
    <div className="space-y-4">
      {!selectedOrderRows.length ? (
        <Empty description="سفارشی برای پیگیری وجود ندارد." />
      ) : (
        selectedOrderRows.map((order) => (
          <Card key={order.id} className="rounded-2xl overflow-hidden p-0">
            <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">نام سفارش تولید:</span>
                <span className="font-semibold">{order.name || '-'}</span>
                {order.system_code ? <Tag color="default">{order.system_code}</Tag> : null}
              </div>
              <div className="flex items-center gap-2">
                {getStatusTag(order.status)}
                <Button onClick={() => navigate(`/production_orders/${order.id}`)}>نمایش سفارش</Button>
                <Button
                  type="text"
                  size="small"
                  className="!text-gray-700 hover:!text-gray-900"
                  icon={
                    <RightOutlined
                      className={`transition-transform ${
                        isOrderPanelExpanded('progress', order.id) ? 'rotate-90' : ''
                      }`}
                    />
                  }
                  onClick={() =>
                    setOrderPanelExpanded('progress', order.id, !isOrderPanelExpanded('progress', order.id))
                  }
                />
              </div>
            </div>
            {isOrderPanelExpanded('progress', order.id) ? (
              <div className="p-3">
                <ProductionStagesField
                  recordId={order.id}
                  moduleId="production_orders"
                  compact
                  readOnly={!canEditGroup || groupStatus === 'completed'}
                  orderStatus={order.status || null}
                />
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );

  const renderStepContent = () => {
    if (currentStep === 0) return renderSetupStep();
    if (currentStep === 1) return renderMaterialsStep();
    if (currentStep === 2) return renderLinesStep();
    if (currentStep === 3) return renderStartStep();
    return renderProgressStep();
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-96px)] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-4 max-w-[1800px] mx-auto animate-fadeIn h-[calc(100vh-64px)] flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
            <span className="w-2 h-8 bg-leather-500 rounded-full inline-block" />
            سفارش گروهی تولید
          </h1>
          <Badge
            count={selectedOrderIds.length}
            overflowCount={999}
            style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
          />
        </div>
        <div className="flex items-center gap-2">
          {getStatusTag(groupStatus)}
          <Button icon={<ReloadOutlined />} onClick={() => void refreshAll()}>
            بروزرسانی
          </Button>
          <Button onClick={() => navigate('/production_group_orders')}>بازگشت به لیست</Button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max">
          {steps.map((step, index) => {
            const active = index === currentStep;
            const blocked = index > 0 && !groupId;
            const canClick = !blocked && (index <= currentStep || !!groupId);
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => {
                  if (!canClick) return;
                  setCurrentStep(index);
                }}
                className={`relative px-4 py-2 text-sm font-semibold transition-all border ${
                  active
                    ? 'bg-leather-600 text-white border-leather-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-leather-400'
                } ${blocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                style={{
                  clipPath:
                    index === 0
                      ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
                      : 'polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%)',
                  marginLeft: index === 0 ? 0 : -8,
                  minWidth: 180,
                }}
              >
                {step.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-3 md:p-4 flex-1 overflow-auto">
        {renderStepContent()}
      </div>

      <div className="flex items-center justify-between shrink-0">
        <Button
          icon={<RightOutlined />}
          onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
          disabled={currentStep === 0}
        >
          مرحله قبل
        </Button>
        <Button
          type="primary"
          icon={<LeftOutlined />}
          onClick={() => setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1))}
          disabled={currentStep >= steps.length - 1 || (currentStep === 0 && !groupId)}
          className="bg-leather-600 hover:!bg-leather-500 border-none"
        >
          مرحله بعد
        </Button>
      </div>

    </div>
  );
};

export default ProductionGroupOrderWizard;

