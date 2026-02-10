import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, App, Avatar, Checkbox, Modal, Select } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, BlockType, LogicOperator } from '../types';
import SmartForm from '../components/SmartForm';
import RelatedSidebar from '../components/Sidebar/RelatedSidebar';
import SmartFieldRenderer from '../components/SmartFieldRenderer';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import HeaderActions from '../components/moduleShow/HeaderActions';
import HeroSection from '../components/moduleShow/HeroSection';
import FieldGroupsTabs from '../components/moduleShow/FieldGroupsTabs';
import TablesSection from '../components/moduleShow/TablesSection';
import PrintSection from '../components/moduleShow/PrintSection';
import { printStyles } from '../utils/printTemplates';
import { usePrintManager } from '../utils/printTemplates/usePrintManager';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import QrScanPopover from '../components/QrScanPopover';
import { PRODUCTION_MESSAGES } from '../utils/productionMessages';
import {
  collectProductionMoves,
  applyProductionMoves,
  rollbackProductionMoves,
  consumeProductionMaterials,
  addFinishedGoods,
  syncProductStock,
} from '../utils/productionWorkflow';

const ModuleShow: React.FC = () => {
  const { moduleId = 'products', id } = useParams();
  const navigate = useNavigate();
  const { message: msg, modal } = App.useApp();
  const moduleConfig = MODULES[moduleId];

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [, setLinkedBomData] = useState<any>(null);
  const [currentTags, setCurrentTags] = useState<any[]>([]); // استیت تگ‌ها

  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({});
  const [tempValues, setTempValues] = useState<Record<string, any>>({});
  const [, setSavingField] = useState<string | null>(null);
  const [, setUploadingImage] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, boolean>>({});
  const [modulePermissions, setModulePermissions] = useState<{ view?: boolean; edit?: boolean; delete?: boolean }>({});
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [productionModal, setProductionModal] = useState<'start' | 'stop' | 'complete' | null>(null);
  const [productionShelfOptions, setProductionShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [productionShelfId, setProductionShelfId] = useState<string | null>(null);
  const [outputProductOptions, setOutputProductOptions] = useState<{ label: string; value: string }[]>([]);
  const [outputShelfOptions, setOutputShelfOptions] = useState<{ label: string; value: string }[]>([]);
  const [outputProductId, setOutputProductId] = useState<string | null>(null);
  const [outputShelfId, setOutputShelfId] = useState<string | null>(null);
  const [isCreateProductOpen, setIsCreateProductOpen] = useState(false);
  const [outputProductType, setOutputProductType] = useState<'semi' | 'final' | null>(null);
  const [productionQuantityPreview, setProductionQuantityPreview] = useState<number | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
    const fetchProductionQuantity = useCallback(async () => {
      if (moduleId !== 'production_orders' || !id) return null;
      const { data: lines } = await supabase
        .from('production_lines')
        .select('quantity, qty, count')
        .eq('production_order_id', id);
      const total = (lines || []).reduce((sum: number, row: any) => {
        const raw = row?.quantity ?? row?.qty ?? row?.count ?? 0;
        return sum + (parseFloat(raw) || 0);
      }, 0);
      return total;
    }, [moduleId, id]);

  const getOrderQuantity = useCallback((override?: number | null) => {
    const raw = override ?? data?.quantity ?? data?.production_qty ?? data?.production_quantity ?? data?.qty ?? data?.count ?? 0;
    const parsed = parseFloat(raw as any);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [data]);

  const buildConsumptionMoves = useCallback((order: any, quantity: number, productionShelfId: string) => {
    const tables = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'];
    const moves: Array<{ product_id: string; from_shelf_id: string; to_shelf_id: string; quantity: number }> = [];
    tables.forEach((table) => {
      const rows = Array.isArray(order?.[table]) ? order[table] : [];
      rows.forEach((row: any) => {
        const usage = parseFloat(row?.usage ?? row?.quantity ?? row?.qty ?? row?.count ?? 0) || 0;
        if (usage <= 0) return;
        const productId = row?.selected_product_id || row?.product_id;
        if (!productId) return;
        moves.push({
          product_id: productId,
          from_shelf_id: productionShelfId,
          to_shelf_id: productionShelfId,
          quantity: usage * quantity,
        });
      });
    });
    return moves;
  }, []);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRoleId, setCurrentUserRoleId] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);

  const fetchBaseInfo = useCallback(async () => {
      const { data: users } = await supabase.from('profiles').select('id, full_name, avatar_url');
      const { data: roles } = await supabase.from('org_roles').select('id, title');
      if (users) setAllUsers(users);
      if (roles) setAllRoles(roles);
  }, []);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return;
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from('profiles')
          .select('role_id')
          .eq('id', user.id)
          .single();
        setCurrentUserRoleId(profile?.role_id || null);
      } catch (err) {
        console.warn('Could not fetch current user role:', err);
      }
    };
    fetchCurrentUser();
  }, []);

  const fetchRecord = useCallback(async () => {
    if (!id || !moduleConfig) return;
    setLoading(true);
    
    try {
        // 👇 تغییر مهم: اضافه کردن صریح فیلدهای سیستمی به select
        const { data: record, error } = await supabase
            .from(moduleId)
            .select(`
                *,
                created_at,
                updated_at,
                created_by,
                updated_by
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        
        // لاگ برای اطمینان از اینکه دیتا واقعا از دیتابیس میاد
        console.log('Record Data:', record); 

        const { data: tagsData } = await supabase
            .from('record_tags')
            .select('tags(id, title, color)')
            .eq('record_id', id);

        const tags = tagsData?.map((item: any) => item.tags).filter(Boolean) || [];
        
        const hasAccess = !record?.assignee_id
          || !currentUserId
          || (record?.created_by && record.created_by === currentUserId)
          || (record?.assignee_type === 'user' && record.assignee_id === currentUserId)
          || (record?.assignee_type === 'role' && record.assignee_id === currentUserRoleId);

        if (!hasAccess && currentUserId) {
          setAccessDenied(true);
          setData(null);
          return;
        }

        setAccessDenied(false);
        setCurrentTags(tags);
        setData(record);
    } catch (err: any) {
        console.error(err);
        msg.error('خطا در دریافت اطلاعات: ' + err.message);
    } finally {
        setLoading(false);
    }
  }, [id, moduleConfig, moduleId, msg, currentUserId, currentUserRoleId]);

  useEffect(() => {
    fetchBaseInfo();
  }, [fetchBaseInfo]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [id, moduleId]);

  const loadProductionShelves = useCallback(async () => {
    const { data: shelves } = await supabase
      .from('shelves')
      .select('id, shelf_number, name, warehouses(name)')
      .limit(500);
    const filtered = (shelves || []).filter((row: any) => {
      const name = row?.warehouses?.name || '';
      return name.includes('تولید') || /production/i.test(name);
    });
    const options = (filtered.length ? filtered : (shelves || [])).map((row: any) => ({
      value: row.id,
      label: `${row.shelf_number || row.name || row.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`
    }));
    setProductionShelfOptions(options);
  }, []);

  const loadOutputShelves = useCallback(async () => {
    const { data: shelves } = await supabase
      .from('shelves')
      .select('id, shelf_number, name, warehouses(name)')
      .limit(500);
    const options = (shelves || []).map((row: any) => ({
      value: row.id,
      label: `${row.shelf_number || row.name || row.id}${row?.warehouses?.name ? ` - ${row.warehouses.name}` : ''}`
    }));
    setOutputShelfOptions(options);
  }, []);

  const loadOutputProducts = useCallback(async () => {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, system_code')
      .limit(500);
    const options = (products || []).map((row: any) => ({
      value: row.id,
      label: row.system_code ? `${row.name} (${row.system_code})` : row.name
    }));
    setOutputProductOptions(options);
  }, []);

  const openProductionModal = async (type: 'start' | 'stop' | 'complete') => {
    setProductionModal(type);
    if (type === 'start') {
      const qtyFromLines = await fetchProductionQuantity();
      const fallbackQty = getOrderQuantity();
      const resolvedQty = (typeof qtyFromLines === 'number' && qtyFromLines > 0) ? qtyFromLines : fallbackQty;
      if (resolvedQty > 0) {
        setProductionQuantityPreview(resolvedQty);
        if (typeof qtyFromLines === 'number' && qtyFromLines > 0 && data?.quantity !== qtyFromLines) {
          await finalizeStatusUpdate({ quantity: qtyFromLines });
        }
      } else {
        setProductionQuantityPreview(null);
      }
      await loadProductionShelves();
    }
    if (type === 'complete') {
      await loadOutputShelves();
      await loadOutputProducts();
    }
  };

  const finalizeStatusUpdate = async (payload: any) => {
    if (!id) return;
    const { error } = await supabase.from(moduleId).update(payload).eq('id', id);
    if (error) throw error;
    setData((prev: any) => ({ ...prev, ...payload }));
  };

  const handleProductionStatusChange = async (nextStatus: string) => {
    if (moduleId !== 'production_orders') return;
    if (data?.status === nextStatus) return;
    if (nextStatus === 'in_progress') {
      await openProductionModal('start');
      return;
    }
    if (nextStatus === 'pending') {
      await openProductionModal('stop');
      return;
    }
    if (nextStatus === 'completed') {
      await openProductionModal('complete');
    }
  };

  const fetchFieldPermissions = useCallback(async () => {
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role_id')
        .eq('id', user.id)
        .single();

      if (!profile?.role_id) return;

      const { data: role } = await supabase
        .from('org_roles')
        .select('permissions')
        .eq('id', profile.role_id)
        .single();

      const modulePerms = role?.permissions?.[moduleId] || {};
      const perms = modulePerms.fields || {};
      setFieldPermissions(perms);
      setModulePermissions({
        view: modulePerms.view,
        edit: modulePerms.edit,
        delete: modulePerms.delete
      });
    } catch (err) {
      console.warn('Could not fetch field permissions:', err);
    }
  }, [moduleId]);

  useEffect(() => {
    fetchFieldPermissions();
  }, [fetchFieldPermissions]);

  const canViewField = useCallback(
    (fieldKey: string) => {
      if (Object.prototype.hasOwnProperty.call(fieldPermissions, fieldKey)) {
        return fieldPermissions[fieldKey] !== false;
      }
      return true;
    },
    [fieldPermissions]
  );

  const canViewModule = modulePermissions.view !== false;
  const canEditModule = modulePermissions.edit !== false;
  const canDeleteModule = modulePermissions.delete !== false;



  const fetchLinkedBom = useCallback(async (bomId: string) => {
      const { data: bom } = await supabase.from('production_boms').select('*').eq('id', bomId).single();
      if (bom) setLinkedBomData(bom);
  }, []);

  const fetchOptions = useCallback(async (recordData: any = null) => {
    if (!moduleConfig) return;
    
    const dynFields: any[] = [...moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory)];
    moduleConfig.blocks?.forEach(b => {
      if (b.tableColumns) {
        b.tableColumns.forEach(c => {
          if ((c.type === FieldType.SELECT || c.type === FieldType.MULTI_SELECT) && (c as any).dynamicOptionsCategory) {
            dynFields.push(c);
          }
        });
      }
    });
    
    const dynOpts: Record<string, any[]> = {};
    for (const field of dynFields) {
      const cat = (field as any).dynamicOptionsCategory;
      if (cat && !dynOpts[cat]) {
        const { data } = await supabase.from('dynamic_options').select('label, value').eq('category', cat).eq('is_active', true);
        if (data) dynOpts[cat] = data.filter(i => i.value !== null);
      }
    }
    setDynamicOptions(dynOpts);

        const relFields: any[] = [...moduleConfig.fields.filter(f => f.type === FieldType.RELATION)];
    moduleConfig.blocks?.forEach(b => {
      if (b.tableColumns) {
        b.tableColumns.forEach(c => {
          if (c.type === FieldType.RELATION) relFields.push({ ...c, key: `${b.id}_${c.key}` }); 
        });
      }
    });

    const relOpts: Record<string, any[]> = {};
    for (const field of relFields) {
      if (field.relationConfig) {
        const targetField = field.relationConfig.targetField || 'name';
        if (field.relationConfig.dependsOn && recordData) {
          const dependsOnValue = recordData[field.relationConfig.dependsOn];
          if (dependsOnValue) {
            try {
              const { data: relData } = await supabase
                .from(dependsOnValue)
                .select(`id, ${targetField}, system_code`)
                .limit(200);
              if (relData) {
                const options = relData.map((i: any) => ({ 
                  label: i.system_code ? `${i[targetField]} (${i.system_code})` : i[targetField], 
                  value: i.id,
                  module: dependsOnValue,
                  name: i[targetField],
                  system_code: i.system_code
                }));
                relOpts[field.key] = options;
              }
            } catch (err) {
              console.warn(`Could not fetch options for ${field.key}:`, err);
            }
          }
        } else {
          const { targetModule, filter } = field.relationConfig;
          try {
            const filterKeys = filter ? Object.keys(filter) : [];
            const filterSelect = filterKeys.length > 0 ? `, ${filterKeys.join(', ')}` : '';
            let query = supabase
              .from(targetModule)
              .select(`id, ${targetField}, system_code${filterSelect}`)
              .limit(200);
            if (filter) query = query.match(filter);
            const { data: relData } = await query;
            if (relData) {
              const options = relData.map((i: any) => ({ 
                label: i.system_code ? `${i[targetField]} (${i.system_code})` : i[targetField], 
                value: i.id,
                name: i[targetField],
                system_code: i.system_code
              }));
              relOpts[field.key] = options;
              if (field.key.includes('_')) relOpts[field.key.split('_').pop()!] = options;
            }
          } catch (err) {
            console.warn(`Could not fetch options for ${field.key}:`, err);
          }
        }
      }
    }
    setRelationOptions(relOpts);
    }, [moduleConfig]);

  useEffect(() => {
    if (data) {
      fetchOptions(data);
      if (moduleId === 'products' && data.production_bom_id) {
        fetchLinkedBom(data.production_bom_id);
      } else if (moduleId === 'production_boms') {
        setLinkedBomData(data); 
      } else {
        setLinkedBomData(null);
      }
    }
  }, [data, moduleId, fetchOptions, fetchLinkedBom]);

  useEffect(() => {
    if (!moduleConfig) return;
    const recordName = data?.name || data?.title || data?.system_code || id || '';
    window.dispatchEvent(new CustomEvent('erp:breadcrumb', {
      detail: {
        moduleTitle: moduleConfig.titles?.fa || moduleId,
        moduleId,
        recordName,
      }
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [moduleConfig, moduleId, data, id]);

    const handleAssigneeChange = useCallback(async (value: string) => {
      const [type, assignId] = value.split('_');
      try {
        const { error } = await supabase.from(moduleId).update({ assignee_id: assignId, assignee_type: type }).eq('id', id);
        if (error) throw error;

        const prevAssignee = data?.assignee_id ? `${data?.assignee_type || 'user'}:${data?.assignee_id}` : null;
        const nextAssignee = assignId ? `${type}:${assignId}` : null;

        const resolveAssigneeLabel = async (val: string | null) => {
          if (!val) return 'خالی';
          const [t, uid] = val.split(':');
          if (t === 'user') {
            const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle();
            return profile?.full_name || uid;
          }
          if (t === 'role') {
            const { data: role } = await supabase.from('org_roles').select('title').eq('id', uid).maybeSingle();
            return role?.title || uid;
          }
          return uid;
        };

        const oldLabel = await resolveAssigneeLabel(prevAssignee);
        const newLabel = await resolveAssigneeLabel(nextAssignee);

        setData((prev: any) => ({ ...prev, assignee_id: assignId, assignee_type: type }));

        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || null;
        const recordTitle = (data as any)?.name || (data as any)?.title || (data as any)?.system_code || null;
        await supabase.from('changelogs').insert([
          {
            module_id: moduleId,
            record_id: id,
            action: 'update',
            field_name: 'assignee_id',
            field_label: 'مسئول',
            old_value: oldLabel,
            new_value: newLabel,
            user_id: userId,
            record_title: recordTitle,
          },
        ]);

        msg.success('مسئول رکورد تغییر کرد');
      } catch (e: any) { msg.error('خطا: ' + e.message); }
    }, [data?.assignee_id, data?.assignee_type, data, id, moduleId, msg]);

  // تابع برای کپی اقلام BOM به جداول مواد اولیه (با تایید کاربر)
    const handleRelatedBomChange = useCallback(async (bomId: string) => {
      modal.confirm({
        title: 'کپی از شناسنامه تولید',
        content: 'جداول سفارش تولید ریست شوند و مقادیر از روی BOM کپی شوند؟',
        okText: 'بله، کپی کن',
        cancelText: 'خیر',
        onOk: async () => {
          try {
            const { data: bom, error: bomError } = await supabase
              .from('production_boms')
              .select('*')
              .eq('id', bomId)
              .single();

            if (bomError) throw bomError;
              
            const calculateBomTotal = () => {
              let total = 0;
              const tables = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory', 'items_labor'];
              tables.forEach(tableName => {
                const rows = bom[tableName];
                if (Array.isArray(rows)) {
                  rows.forEach(row => {
                    const rowTotal = (row.total_price || ((row.usage || 0) * (row.buy_price || 0)));
                    total += rowTotal;
                  });
                }
              });
              return total;
            };

            const bomTotal = calculateBomTotal();

            const updateData: any = {};
            const tables = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'];
              
            tables.forEach(tableName => {
              if (bom[tableName]) {
                updateData[tableName] = bom[tableName];
              }
            });

            updateData['production_cost'] = bomTotal;
            updateData['related_bom'] = bomId;
            updateData['product_category'] = bom?.product_category ?? null;

            const { error: updateError } = await supabase
              .from(moduleId)
              .update(updateData)
              .eq('id', id);

            if (updateError) throw updateError;

            setData((prev: any) => ({ 
              ...prev, 
              ...updateData 
            }));
              
            setLinkedBomData(bom);
            msg.success('اقلام شناسنامه تولید بارگذاری شد و بهای تمام شده محاسبه شد');
          } catch (e: any) {
            msg.error('خطا در بارگذاری اقلام: ' + e.message);
          }
        }
      });
    }, [id, moduleId, msg, modal]);

  const handleDelete = () => {
    modal.confirm({ title: 'حذف رکورد', okType: 'danger', onOk: async () => { await supabase.from(moduleId).delete().eq('id', id); navigate(`/${moduleId}`); } });
  };

  const handleHeaderAction = (actionId: string) => {
    if (actionId === 'create_production_order') {
      if (!MODULES['production_orders']) {
        msg.error('ماژول سفارش تولید یافت نشد');
        return;
      }
      setIsCreateOrderOpen(true);
      return;
    }
    if (actionId === 'auto_name' && moduleId === 'products') {
      if (!canEditModule) return;
      let enableAuto = !!data?.auto_name_enabled;
      modal.confirm({
        title: 'نامگذاری خودکار محصول',
        content: (
          <div className="space-y-3">
            <div>نام محصول براساس مشخصات فعلی ساخته شود؟</div>
            <Checkbox defaultChecked={enableAuto} onChange={(e) => { enableAuto = e.target.checked; }}>
              بروزرسانی خودکار هنگام تغییر مشخصات
            </Checkbox>
          </div>
        ),
        okText: 'اعمال',
        cancelText: 'انصراف',
        onOk: async () => {
          const nextName = buildAutoProductName(data);
          if (!nextName) {
            msg.warning('اطلاعات کافی برای نامگذاری وجود ندارد');
            return;
          }
          try {
            const { error } = await supabase
              .from(moduleId)
              .update({ name: nextName, auto_name_enabled: enableAuto })
              .eq('id', id);
            if (error) throw error;
            setData((prev: any) => ({ ...prev, name: nextName, auto_name_enabled: enableAuto }));
            await insertChangelog({
              action: 'update',
              fieldName: 'name',
              fieldLabel: getFieldLabel('name'),
              oldValue: data?.name ?? null,
              newValue: nextName
            });
            msg.success('نام محصول بروزرسانی شد');
          } catch (e: any) {
            msg.error('خطا در بروزرسانی نام: ' + e.message);
          }
        }
      });
      return;
    }
    msg.info('این عملیات هنوز پیاده‌سازی نشده است');
  };

  const handleImageUpdate = useCallback(async (file: File) => {
    setUploadingImage(true);
    try {
      const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
      const { error: upErr } = await supabase.storage.from('images').upload(fileName, file);
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
      await supabase.from(moduleId).update({ image_url: urlData.publicUrl }).eq('id', id);
      setData((prev: any) => ({ ...prev, image_url: urlData.publicUrl }));
      msg.success('تصویر بروزرسانی شد');
    } catch (e: any) { msg.error('خطا: ' + e.message); } finally { setUploadingImage(false); }
    return false;
  }, [id, moduleId, msg]);


  const getFieldLabel = useCallback(
    (fieldKey: string) => moduleConfig?.fields?.find(f => f.key === fieldKey)?.labels?.fa || fieldKey,
    [moduleConfig]
  );

  const insertChangelog = useCallback(
    async (payload: { action: string; fieldName?: string; fieldLabel?: string; oldValue?: any; newValue?: any }) => {
      try {
        if (!moduleId || !id) return;
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData?.user?.id || null;
        const recordTitle = (data as any)?.name || (data as any)?.title || (data as any)?.system_code || null;

        const { error } = await supabase.from('changelogs').insert([
          {
            module_id: moduleId,
            record_id: id,
            action: payload.action,
            field_name: payload.fieldName || null,
            field_label: payload.fieldLabel || null,
            old_value: payload.oldValue ?? null,
            new_value: payload.newValue ?? null,
            user_id: userId,
            record_title: recordTitle,
          },
        ]);
        if (error) throw error;
      } catch (err) {
        console.warn('Changelog insert failed:', err);
      }
    },
    [moduleId, id, data]
  );

  const logFieldChange = useCallback(
    async (fieldKey: string, oldValue: any, newValue: any) => {
      await insertChangelog({
        action: 'update',
        fieldName: fieldKey,
        fieldLabel: getFieldLabel(fieldKey),
        oldValue,
        newValue,
      });
    },
    [getFieldLabel, insertChangelog]
  );

  const handleMainImageChange = useCallback(async (url: string | null) => {
    if (!canEditModule || !url) return;
    try {
      const { error } = await supabase.from(moduleId).update({ image_url: url }).eq('id', id);
      if (error) throw error;
      setData((prev: any) => ({ ...prev, image_url: url }));
      await insertChangelog({
        action: 'update',
        fieldName: 'image_url',
        fieldLabel: getFieldLabel('image_url'),
        oldValue: data?.image_url ?? null,
        newValue: url,
      });
      msg.success('تصویر اصلی بروزرسانی شد');
    } catch (e: any) {
      msg.error('خطا در بروزرسانی تصویر: ' + e.message);
    }
  }, [canEditModule, data?.image_url, getFieldLabel, id, insertChangelog, moduleId, msg]);

  const handleCreateOrderFromBom = useCallback(async (values: any) => {
    try {
      const { data: inserted, error } = await supabase
        .from('production_orders')
        .insert(values)
        .select('id')
        .single();
      if (error) throw error;
      setIsCreateOrderOpen(false);
      msg.success('سفارش تولید ایجاد شد');
      if (inserted?.id) {
        navigate(`/production_orders/${inserted.id}`);
      }
    } catch (e: any) {
      msg.error(e.message || 'خطا در ایجاد سفارش تولید');
    }
  }, [msg, navigate]);

  const saveEdit = async (key: string) => {
    if (!canEditModule) return;
    if (moduleId === 'production_orders' && key === 'status') {
      const newStatus = tempValues[key];
      await handleProductionStatusChange(String(newStatus));
      setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
      return;
    }
    setSavingField(key);
    let newValue = tempValues[key];
    if (newValue === '' || newValue === undefined) newValue = null;
    try {
      const { error } = await supabase.from(moduleId).update({ [key]: newValue }).eq('id', id);
      if (error) throw error;
      setData((prev: any) => ({ ...prev, [key]: newValue }));
      await insertChangelog({
        action: 'update',
        fieldName: key,
        fieldLabel: getFieldLabel(key),
        oldValue: data?.[key],
        newValue,
      });
      msg.success('ذخیره شد');
      setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
    } catch (error: any) { msg.error(error.message); } finally { setSavingField(null); }
  };

  const areValuesEqual = (a: any, b: any) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      try {
        return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      } catch {
        return a === b;
      }
    }
    return a === b;
  };

  const handleSmartFormSave = useCallback(async (values: any) => {
    try {
      if (!id) return;
      const previous = data || {};

      const changedKeys = Object.keys(values).filter((k) => !areValuesEqual(values[k], previous[k]));

      await supabase.from(moduleId).update(values).eq('id', id);

      for (const key of changedKeys) {
        await logFieldChange(key, previous[key], values[key]);
      }

      msg.success('ذخیره شد');
      setIsEditDrawerOpen(false);
      fetchRecord();
    } catch (err: any) {
      msg.error(err.message);
    }
  }, [data, fetchRecord, id, logFieldChange, moduleId, msg]);

  const startEdit = (key: string, value: any) => {
    if (!canEditModule) return;
    setEditingFields(prev => ({ ...prev, [key]: true }));
    setTempValues(prev => ({ ...prev, [key]: value }));
  };
  const cancelEdit = (key: string) => { setEditingFields(prev => ({ ...prev, [key]: false })); };

  const checkVisibility = (logicOrRule: any) => {
    if (!logicOrRule) return true;
    const rule = logicOrRule.visibleIf || logicOrRule;
    if (!rule || !rule.field) return true;
    const { field, operator, value } = rule;
    const currentValue = data?.[field];
    if (currentValue === undefined || currentValue === null) {
      if (operator === LogicOperator.NOT_EQUALS) return false;
    }
    if (operator === LogicOperator.EQUALS) return currentValue === value;
    if (operator === LogicOperator.NOT_EQUALS) return currentValue !== value;
    if (operator === LogicOperator.CONTAINS) return Array.isArray(currentValue) ? currentValue.includes(value) : false;
    if (operator === LogicOperator.GREATER_THAN) return Number(currentValue) > Number(value);
    if (operator === LogicOperator.LESS_THAN) return Number(currentValue) < Number(value);
    return true;
  };

    const getOptionLabel = (field: any, value: any) => {
      if (!field) return value;
      // اگر MULTI_SELECT است و آرایه است
      if (field.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
          return value.map(v => {
              let opt = field.options?.find((o: any) => o.value === v);
              if (opt) return opt.label;
              if ((field as any).dynamicOptionsCategory) {
                  const cat = (field as any).dynamicOptionsCategory;
                  opt = dynamicOptions[cat]?.find((o: any) => o.value === v);
                  if (opt) return opt.label;
              }
              return v;
          }).join(', ');
      }
      
      let opt = field.options?.find((o: any) => o.value === value);
      if (opt) return opt.label;
      if ((field as any).dynamicOptionsCategory) {
          const cat = (field as any).dynamicOptionsCategory;
          opt = dynamicOptions[cat]?.find((o: any) => o.value === value);
          if (opt) return opt.label;
      }
      if (field.type === FieldType.RELATION) {
          for (const key in relationOptions) {
              const found = relationOptions[key]?.find((o: any) => o.value === value);
              if (found) return found.label;
          }
      }
      return value;
  };

  const getFieldValueLabel = (fieldKey: string, value: any) => {
    if (value === undefined || value === null) return '';
    const field = moduleConfig?.fields?.find(f => f.key === fieldKey);
    if (!field) return String(value);
    return String(getOptionLabel(field, value));
  };

  const buildAutoProductName = (record: any) => {
    if (!record) return '';
    const parts: string[] = [];
    const addPart = (part?: string) => {
      if (!part) return;
      const trimmed = String(part).trim();
      if (trimmed) parts.push(trimmed);
    };

    const productType = record?.product_type;
    if (productType === 'raw') {
      addPart(getFieldValueLabel('category', record?.category));
      const category = record?.category;
      const specKeys = category === 'leather'
        ? ['leather_type', 'leather_colors', 'leather_finish_1', 'leather_effect', 'leather_sort']
        : category === 'lining'
          ? ['lining_material', 'lining_color', 'lining_width']
          : category === 'accessory'
            ? ['acc_material']
            : category === 'fitting'
              ? ['fitting_type', 'fitting_colors', 'fitting_size']
              : [];
      specKeys.forEach(key => addPart(getFieldValueLabel(key, record?.[key])));
    } else {
      addPart(getFieldValueLabel('product_category', record?.product_category));
      if (record?.related_bom) {
        addPart(getFieldValueLabel('related_bom', record?.related_bom));
      }
    }

    return parts.join(' ');
  };

  const formatPersian = (val: any, kind: 'DATE' | 'TIME' | 'DATETIME') => {
    if (!val) return '';
    try {
      let dateObj: DateObject;

      if (kind === 'TIME') {
        dateObj = new DateObject({
          date: `1970-01-01 ${val}`,
          format: 'YYYY-MM-DD HH:mm',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else if (kind === 'DATE') {
        dateObj = new DateObject({
          date: val,
          format: 'YYYY-MM-DD',
          calendar: gregorian,
          locale: gregorian_en,
        });
      } else {
        const jsDate = new Date(val);
        if (Number.isNaN(jsDate.getTime())) return '';
        dateObj = new DateObject({
          date: jsDate,
          calendar: gregorian,
          locale: gregorian_en,
        });
      }

      const format = kind === 'DATE' ? 'YYYY/MM/DD' : kind === 'TIME' ? 'HH:mm' : 'YYYY/MM/DD HH:mm';
      return dateObj.convert(persian, persian_fa).format(format);
    } catch {
      return '';
    }
  };
  
  const formatPrintValue = (field: any, value: any) => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join('، ');
    if (field.type === FieldType.CHECKBOX) return value ? 'بله' : 'خیر';
    if (field.type === FieldType.PRICE) return `${Number(value).toLocaleString()} ریال`;
    if (field.type === FieldType.PERCENTAGE) return `${value}%`;
    if (field.type === FieldType.DATE) {
      return formatPersian(value, 'DATE') || String(value);
    }
    if (field.type === FieldType.TIME) {
      return formatPersian(value, 'TIME') || String(value);
    }
    if (field.type === FieldType.DATETIME) {
      return formatPersian(value, 'DATETIME') || String(value);
    }
    if (field.type === FieldType.STATUS || field.type === FieldType.SELECT || field.type === FieldType.MULTI_SELECT || field.type === FieldType.RELATION) {
      return String(getOptionLabel(field, value));
    }
    return String(value);
  };

  const printableFields = useMemo(() => {
    if (!moduleConfig || !data) return [];
    const hasValue = (val: any) => {
      if (val === null || val === undefined) return false;
      if (typeof val === 'string') return val.trim() !== '';
      if (Array.isArray(val)) return val.length > 0;
      return true;
    };
    return moduleConfig.fields
      .filter(f => f.type !== FieldType.IMAGE && f.type !== FieldType.JSON && f.type !== FieldType.READONLY_LOOKUP)
      .filter(f => !f.logic || checkVisibility(f.logic))
      .filter(f => canViewField(f.key))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(f => ({ ...f, value: data[f.key] }))
      .filter(f => hasValue(f.value));
  }, [moduleConfig, data, dynamicOptions, relationOptions]);

  // ✅ استفاده از custom hook برای مدیریت print
  const printManager = usePrintManager({
    moduleId,
    data,
    moduleConfig,
    printableFields,
    formatPrintValue,
    relationOptions,
  });

  const getUserName = (uid: string) => {
      const user = allUsers.find(u => u.id === uid);
      return user ? user.full_name : 'سیستم/نامشخص';
  };

  const getAssigneeOptions = () => [
      { label: 'پرسنل', title: 'users', options: allUsers.map(u => ({ label: u.full_name, value: `user_${u.id}`, emoji: <UserOutlined /> })) },
      { label: 'تیم‌ها (جایگاه سازمانی)', title: 'roles', options: allRoles.map(r => ({ label: r.title, value: `role_${r.id}`, emoji: <TeamOutlined /> })) }
  ];

  const handleConfirmStartProduction = async () => {
    try {
      if (!productionShelfId) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      const latestQty = getOrderQuantity(productionQuantityPreview ?? (await fetchProductionQuantity()));
      const { moves, missingProduct, missingShelf, quantity } = collectProductionMoves({ ...data, quantity: latestQty }, productionShelfId);
      if (!quantity || quantity <= 0) {
        msg.error(PRODUCTION_MESSAGES.requireQuantity);
        return;
      }
      if (missingProduct.length) {
        msg.error(PRODUCTION_MESSAGES.requireSelectedProduct);
        return;
      }
      if (missingShelf.length) {
        msg.error(PRODUCTION_MESSAGES.requireSourceShelf);
        return;
      }

      setStatusLoading(true);
      await applyProductionMoves(moves);
      await finalizeStatusUpdate({
        status: 'in_progress',
        production_shelf_id: productionShelfId,
        production_moves: moves,
      });
      msg.success('تولید آغاز شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(e.message || 'خطا در شروع تولید');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleConfirmStopProduction = async () => {
    try {
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      if (moves.length === 0) {
        msg.warning('حرکتی برای بازگشت موجودی ثبت نشده است');
        await finalizeStatusUpdate({ status: 'pending', production_shelf_id: null, production_moves: null });
        setProductionModal(null);
        return;
      }
      setStatusLoading(true);
      await rollbackProductionMoves(moves);
      await finalizeStatusUpdate({ status: 'pending', production_shelf_id: null, production_moves: null });
      msg.success('تولید متوقف شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(e.message || 'خطا در توقف تولید');
    } finally {
      setStatusLoading(false);
    }
  };

  const handleConfirmCompleteProduction = async () => {
    try {
      if (!outputProductId) {
        msg.error(PRODUCTION_MESSAGES.requireOutputProduct);
        return;
      }
      if (!outputShelfId) {
        msg.error(PRODUCTION_MESSAGES.requireOutputShelf);
        return;
      }
      const latestQty = getOrderQuantity(productionQuantityPreview ?? (await fetchProductionQuantity()));
      const normalizedQty = Number.isFinite(latestQty) ? latestQty : 0;
      if (!normalizedQty || normalizedQty <= 0) {
        msg.error(PRODUCTION_MESSAGES.requireQuantity);
        return;
      }
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      const productionShelfId = data?.production_shelf_id;
      if (!productionShelfId) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      setStatusLoading(true);
      const consumptionMoves = moves.length ? moves : buildConsumptionMoves(data, normalizedQty, productionShelfId);
      if (consumptionMoves.length) {
        await consumeProductionMaterials(consumptionMoves, productionShelfId);
      }
      await addFinishedGoods(outputProductId, outputShelfId, normalizedQty);
      await syncProductStock(outputProductId);
      await finalizeStatusUpdate({
        status: 'completed',
        production_output_product_id: outputProductId,
        production_output_shelf_id: outputShelfId,
        production_output_qty: normalizedQty,
      });
      msg.success('تولید تکمیل شد');
      setProductionModal(null);
    } catch (e: any) {
      msg.error(e.message || 'خطا در تکمیل تولید');
    } finally {
      setStatusLoading(false);
    }
  };

  const buildNewProductInitialValues = () => {
    const quantity = getOrderQuantity(productionQuantityPreview);
    const inventoryRow = {
      shelf_id: null,
      stock: quantity,
      _lockedFields: ['stock']
    };
    return {
      product_type: outputProductType || 'final',
      product_category: data?.product_category || null,
      related_bom: data?.bom_id || null,
      items_leather: data?.items_leather || [],
      items_lining: data?.items_lining || [],
      items_fitting: data?.items_fitting || [],
      items_accessory: data?.items_accessory || [],
      items_labor: data?.items_labor || [],
      product_inventory: [inventoryRow],
      __requireInventoryShelf: true,
    } as any;
  };

  const getProductionSummary = (quantityOverride?: number | null) => {
    const quantity = getOrderQuantity(typeof quantityOverride === 'number' ? quantityOverride : null);
    const tables = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'];
    const map = new Map<string, { name: string; qty: number }>();
    tables.forEach((table) => {
      const rows = Array.isArray(data?.[table]) ? data[table] : [];
      rows.forEach((row: any) => {
        const usage = parseFloat(row?.usage ?? row?.quantity ?? row?.qty ?? row?.count ?? 0) || 0;
        if (usage <= 0) return;
        const productId = row?.selected_product_id || row?.product_id || 'unknown';
        const name = row?.selected_product_name || row?.product_name || row?.name || row?.title || productId;
        const key = String(productId);
        const prev = map.get(key);
        const nextQty = usage * quantity;
        if (prev) {
          prev.qty += nextQty;
        } else {
          map.set(key, { name, qty: nextQty });
        }
      });
    });
    return Array.from(map.values());
  };

  const handleCreateProductSave = async (values: any, meta?: { productInventory?: any[] }) => {
    try {
      setStatusLoading(true);
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(values)
        .select('id')
        .single();
      if (error) throw error;
      const productId = inserted?.id;
      if (!productId) throw new Error('ثبت محصول ناموفق بود');

      const inventoryRows = meta?.productInventory || [];
      const payload = inventoryRows
        .filter((row: any) => row?.shelf_id)
        .map((row: any) => ({
          product_id: productId,
          shelf_id: row.shelf_id,
          warehouse_id: row.warehouse_id ?? null,
          stock: parseFloat(row.stock) || 0,
        }));

      if (payload.length === 0) {
        msg.error(PRODUCTION_MESSAGES.requireInventoryShelf);
        return;
      }

      const { error: inventoryError } = await supabase
        .from('product_inventory')
        .upsert(payload, { onConflict: 'product_id,shelf_id' });
      if (inventoryError) throw inventoryError;

      await syncProductStock(productId);
      setOutputProductId(productId);
      const outputShelf = payload[0]?.shelf_id || null;
      setOutputShelfId(outputShelf);

      const latestQty = getOrderQuantity(productionQuantityPreview ?? (await fetchProductionQuantity()));
      const normalizedQty = Number.isFinite(latestQty) ? latestQty : 0;
      const moves = Array.isArray(data?.production_moves) ? data.production_moves : [];
      const productionShelfId = data?.production_shelf_id;
      if (!productionShelfId) {
        msg.error(PRODUCTION_MESSAGES.requireProductionShelf);
        return;
      }
      if (!normalizedQty || normalizedQty <= 0) {
        msg.error(PRODUCTION_MESSAGES.requireQuantity);
        return;
      }
      const consumptionMoves = moves.length ? moves : buildConsumptionMoves(data, normalizedQty, productionShelfId);
      if (consumptionMoves.length) {
        await consumeProductionMaterials(consumptionMoves, productionShelfId);
      }
      await finalizeStatusUpdate({
        status: 'completed',
        production_output_product_id: productId,
        production_output_shelf_id: outputShelf,
        production_output_qty: normalizedQty,
      });

      msg.success('محصول جدید ایجاد شد و سفارش تکمیل شد');
      setIsCreateProductOpen(false);
    } catch (e: any) {
      msg.error(e.message || 'خطا در ایجاد محصول');
    } finally {
      setStatusLoading(false);
    }
  };

  if (accessDenied) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        دسترسی مشاهده برای این رکورد ندارید.
      </div>
    );
  }
  if (!moduleConfig || !data) return loading ? <div className="flex h-screen items-center justify-center"><Spin size="large" /></div> : null;
  if (!canViewModule) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        دسترسی مشاهده برای این ماژول ندارید.
      </div>
    );
  }

  const renderSmartField = (field: any, isHeader = false) => {
    if (!canViewField(field.key)) return null;
    const isEditing = editingFields[field.key];
    const value = data[field.key];
    const compactMode = field.type === FieldType.PROGRESS_STAGES ? false : true;

    if (field.type === FieldType.PROGRESS_STAGES) {
      let options = field.options;
      if ((field as any).dynamicOptionsCategory) options = dynamicOptions[(field as any).dynamicOptionsCategory];
      else if (field.type === FieldType.RELATION) options = relationOptions[field.key];

      return (
        <div className="w-full">
          <SmartFieldRenderer
            field={field}
            value={value}
            onChange={() => undefined}
            forceEditMode={true}
            compactMode={false}
            options={options}
            recordId={id}
            moduleId={moduleId}
            allValues={data}
          />
        </div>
      );
    }
    let baseValue = value ?? undefined;

    if (field.type === FieldType.MULTI_SELECT && typeof baseValue === 'string') {
      try {
        baseValue = JSON.parse(baseValue);
      } catch {
        baseValue = baseValue ? [baseValue] : [];
      }
    }

    const tempValue = tempValues[field.key] !== undefined ? tempValues[field.key] : baseValue;
    let options = field.options;
    if ((field as any).dynamicOptionsCategory) options = dynamicOptions[(field as any).dynamicOptionsCategory];
    else if (field.type === FieldType.RELATION) options = relationOptions[field.key];

    if (isEditing) {
      return (
        <div className="flex items-center gap-1 min-w-[150px]">
          <div className="flex-1">
            <SmartFieldRenderer
              field={field}
              value={tempValue}
              onChange={(val) => {
                setTempValues(prev => ({ ...prev, [field.key]: val }));
                if (field.key === 'related_bom' && val) {
                  setTimeout(() => handleRelatedBomChange(val), 100);
                }
              }}
              forceEditMode={true}
              compactMode={compactMode}
              options={options}
              onOptionsUpdate={fetchOptions}
              recordId={id}
              moduleId={moduleId}
              allValues={data}
            />
          </div>
          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => saveEdit(field.key)} className="bg-green-500 hover:!bg-green-600 border-none" />
          <Button size="small" icon={<CloseOutlined />} onClick={() => cancelEdit(field.key)} danger />
        </div>
      );
    }

    const displayNode = (
      <SmartFieldRenderer
        field={field}
        value={baseValue}
        onChange={() => undefined}
        forceEditMode={false}
        compactMode={compactMode}
        options={options}
        recordId={id}
        moduleId={moduleId}
        allValues={data}
      />
    );

    if (isHeader) {
      return (
        <div className="group flex items-center gap-2 cursor-pointer" onClick={() => !field.readonly && canEditModule && startEdit(field.key, value)}>
          {displayNode}
          {!field.readonly && canEditModule && <EditOutlined className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs" />}
        </div>
      );
    }

    return (
      <div
        className="group flex items-center justify-between min-h-[32px] hover:bg-gray-50 dark:hover:bg-white/5 px-3 rounded-lg -mx-3 transition-colors cursor-pointer border border-transparent hover:border-gray-100 dark:hover:border-gray-700"
        onClick={() => !field.readonly && canEditModule && startEdit(field.key, value)}
      >
        <div className="text-gray-800 dark:text-gray-200">{displayNode}</div>
        {!field.readonly && canEditModule && <EditOutlined className="text-leather-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
    );
  };

  const fieldGroups = moduleConfig.blocks?.filter(b => b.type === BlockType.FIELD_GROUP && checkVisibility(b));
  const headerActions = (moduleConfig.actionButtons || [])
    .filter((b: any) => b.placement === 'header')
    .map((b: any) => ({
      id: b.id,
      label: b.label,
      variant: b.variant,
      onClick: () => handleHeaderAction(b.id)
    }));
  if (moduleId === 'products') {
    headerActions.push({
      id: 'auto_name',
      label: 'نامگذاری خودکار',
      variant: 'primary',
      onClick: () => handleHeaderAction('auto_name')
    });
  }
  if (moduleId === 'production_orders') {
    if (data?.status === 'in_progress') {
      headerActions.push({
        id: 'stop_production',
        label: 'توقف تولید',
        variant: 'default',
        onClick: () => handleProductionStatusChange('pending')
      });
      headerActions.push({
        id: 'complete_production',
        label: 'تکمیل تولید',
        variant: 'primary',
        onClick: () => handleProductionStatusChange('completed')
      });
    } else if (data?.status === 'pending') {
      headerActions.push({
        id: 'start_production',
        label: 'شروع تولید',
        variant: 'primary',
        onClick: () => handleProductionStatusChange('in_progress')
      });
    }
  }

  const currentAssigneeId = data.assignee_id;
  const currentAssigneeType = data.assignee_type;
  let assigneeIcon = <UserOutlined />;
  if (currentAssigneeId) {
      if (currentAssigneeType === 'user') {
          const u = allUsers.find(u => u.id === currentAssigneeId);
          if (u) { assigneeIcon = u.avatar_url ? <Avatar src={u.avatar_url} size="small" /> : <Avatar icon={<UserOutlined />} size="small" />; }
      } else {
          const r = allRoles.find(r => r.id === currentAssigneeId);
          if (r) { assigneeIcon = <Avatar icon={<TeamOutlined />} size="small" className="bg-blue-100 text-blue-600" />; }
      }
  }
  return (
    <div className="p-4 pt-1 md:p-6 md:pt-1 max-w-[1600px] mx-auto pb-20 transition-all overflow-hidden pl-0 md:pl-16">
      <div className="mb-4 md:mb-0">
        <RelatedSidebar
          moduleConfig={moduleConfig}
          recordId={id!}
          recordName={data?.name || data?.system_code || id}
          mentionUsers={allUsers}
          mentionRoles={allRoles}
        />
      </div>

      <HeaderActions
        moduleTitle={moduleConfig.titles.fa}
        recordName={data.name}
        shareUrl={printManager.printQrValue}
        onBack={() => navigate(`/${moduleId}`)}
        onHome={() => navigate('/')}
        onModule={() => navigate(`/${moduleId}`)}
        onPrint={() => printManager.setIsPrintModalOpen(true)}
        onEdit={() => setIsEditDrawerOpen(true)}
        onDelete={handleDelete}
        canEdit={canEditModule}
        canDelete={canDeleteModule}
        extraActions={headerActions}
      />

      <HeroSection
        data={{ ...data, id }}
        moduleId={moduleId}
        moduleConfig={moduleConfig}
        currentTags={currentTags}
        onTagsChange={fetchRecord}
        renderSmartField={renderSmartField}
        getOptionLabel={getOptionLabel}
        getUserName={getUserName}
        handleAssigneeChange={handleAssigneeChange}
        getAssigneeOptions={getAssigneeOptions}
        assigneeIcon={assigneeIcon}
        onImageUpdate={handleImageUpdate}
        onMainImageChange={handleMainImageChange}
        canViewField={canViewField}
        canEditModule={canEditModule}
        checkVisibility={checkVisibility}
      />

      {moduleId === 'customers' && (
        <div className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-bold text-gray-700">توضیحات</div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
            {data?.notes || '-'}
          </div>
        </div>
      )}

      <FieldGroupsTabs
        fieldGroups={fieldGroups}
        moduleConfig={moduleConfig}
        data={data}
        moduleId={moduleId}
        recordId={id!}
        relationOptions={relationOptions}
        dynamicOptions={dynamicOptions}
        renderSmartField={renderSmartField}
        checkVisibility={checkVisibility}
        canViewField={canViewField}
      />

      <TablesSection
        module={moduleConfig}
        data={data}
        relationOptions={relationOptions}
        dynamicOptions={dynamicOptions}
        checkVisibility={checkVisibility}
        canViewField={canViewField}
        canEditModule={canEditModule}
        onDataUpdate={(patch) => setData((prev: any) => ({ ...prev, ...patch }))}
      />

      {isEditDrawerOpen && (
        <SmartForm
          module={moduleConfig}
          visible={isEditDrawerOpen}
          recordId={id}
          onSave={handleSmartFormSave}
          onCancel={() => {
            setIsEditDrawerOpen(false);
            fetchRecord();
          }}
        />
      )}

      {isCreateOrderOpen && MODULES['production_orders'] && (
        <SmartForm
          module={MODULES['production_orders']}
          visible={isCreateOrderOpen}
          title="ایجاد سفارش تولید"
          initialValues={{ bom_id: id, product_category: data?.product_category || null, __skipBomConfirm: true }}
          onCancel={() => setIsCreateOrderOpen(false)}
          onSave={handleCreateOrderFromBom}
        />
      )}

      {moduleId === 'production_orders' && (
        <>
          <Modal
            title={PRODUCTION_MESSAGES.startTitle}
            open={productionModal === 'start'}
            onOk={handleConfirmStartProduction}
            onCancel={() => setProductionModal(null)}
            okText="شروع تولید"
            cancelText="انصراف"
            confirmLoading={statusLoading}
            destroyOnClose
          >
            <div className="space-y-4">
              <div className="text-sm text-gray-600 whitespace-pre-line">
                {PRODUCTION_MESSAGES.startNotice(toPersianNumber(productionQuantityPreview ?? data?.quantity ?? 0))}
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="text-xs text-gray-500 mb-2">خلاصه مواد مصرفی</div>
                <div className="space-y-1">
                  {getProductionSummary(productionQuantityPreview).length === 0 ? (
                    <div className="text-xs text-gray-400">موردی ثبت نشده است.</div>
                  ) : (
                    getProductionSummary(productionQuantityPreview).map((item, idx) => (
                      <div key={`${item.name}-${idx}`} className="flex items-center justify-between text-xs text-gray-600">
                        <span>{item.name}</span>
                        <span>{toPersianNumber(item.qty)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  placeholder="انتخاب قفسه تولید"
                  value={productionShelfId}
                  onChange={(val) => setProductionShelfId(val)}
                  options={productionShelfOptions}
                  showSearch
                  optionFilterProp="label"
                  className="w-full"
                  getPopupContainer={() => document.body}
                />
                <QrScanPopover
                  label=""
                  buttonProps={{ type: 'default', shape: 'circle' }}
                  onScan={({ moduleId: scannedModule, recordId }) => {
                    if (scannedModule === 'shelves' && recordId) {
                      setProductionShelfId(recordId);
                    }
                  }}
                />
              </div>
            </div>
          </Modal>

          <Modal
            title={PRODUCTION_MESSAGES.stopTitle}
            open={productionModal === 'stop'}
            onOk={handleConfirmStopProduction}
            onCancel={() => setProductionModal(null)}
            okText="توقف تولید"
            cancelText="انصراف"
            confirmLoading={statusLoading}
            destroyOnClose
          >
            <div className="text-sm text-gray-600 whitespace-pre-line">
              {PRODUCTION_MESSAGES.stopNotice}
            </div>
          </Modal>

          <Modal
            title={PRODUCTION_MESSAGES.completeTitle}
            open={productionModal === 'complete'}
            onOk={handleConfirmCompleteProduction}
            onCancel={() => setProductionModal(null)}
            okText="ثبت تکمیل"
            cancelText="انصراف"
            confirmLoading={statusLoading}
            destroyOnClose
          >
            <div className="space-y-4">
              <div className="text-sm text-gray-700 whitespace-pre-line">
                تعداد "{toPersianNumber(getOrderQuantity(productionQuantityPreview))}" عدد از محصول بر اساس شناسنامه تولید "{getFieldValueLabel('bom_id', data?.bom_id) || '-'}" تولید شد.
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="text-xs text-gray-500">نوع محصول تولید شده:</div>
                <Select
                  placeholder="انتخاب نوع محصول"
                  value={outputProductType}
                  onChange={(val) => setOutputProductType(val)}
                  options={[
                    { label: 'بسته نیمه آماده', value: 'semi' },
                    { label: 'محصول نهایی', value: 'final' },
                  ]}
                  className="w-full"
                  getPopupContainer={() => document.body}
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                <div className="text-xs text-gray-500">به موجودی یکی از محصولات فعلی اضافه کنید:</div>
                <div className="flex items-center gap-2">
                  <Select
                    placeholder="انتخاب محصول"
                    value={outputProductId}
                    onChange={(val) => setOutputProductId(val)}
                    options={outputProductOptions}
                    showSearch
                    optionFilterProp="label"
                    className="w-full"
                    getPopupContainer={() => document.body}
                  />
                  <QrScanPopover
                    label=""
                    buttonProps={{ type: 'default', shape: 'circle' }}
                    onScan={({ moduleId: scannedModule, recordId }) => {
                      if (scannedModule === 'products' && recordId) {
                        setOutputProductId(recordId);
                      }
                    }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-2">محصول تولید شده را کجا نگه داری میکنید؟</div>
                <div className="flex items-center gap-2">
                  <Select
                    placeholder="انتخاب قفسه مقصد"
                    value={outputShelfId}
                    onChange={(val) => setOutputShelfId(val)}
                    options={outputShelfOptions}
                    showSearch
                    optionFilterProp="label"
                    className="w-full"
                    getPopupContainer={() => document.body}
                  />
                  <QrScanPopover
                    label=""
                    buttonProps={{ type: 'default', shape: 'circle' }}
                    onScan={({ moduleId: scannedModule, recordId }) => {
                      if (scannedModule === 'shelves' && recordId) {
                        setOutputShelfId(recordId);
                      }
                    }}
                  />
                </div>
              </div>

              <div className="text-center text-xs text-gray-400">------- یا --------</div>

              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">محصول جدید بسازید:</div>
                <Button
                  onClick={() => {
                    setProductionModal(null);
                    setIsCreateProductOpen(true);
                  }}
                  type="dashed"
                >
                  تعریف محصول جدید
                </Button>
              </div>
            </div>
          </Modal>

          {isCreateProductOpen && MODULES['products'] && (
            <SmartForm
              module={MODULES['products']}
              visible={isCreateProductOpen}
              title="ایجاد محصول جدید از سفارش تولید"
              initialValues={buildNewProductInitialValues()}
              onCancel={() => setIsCreateProductOpen(false)}
              onSave={handleCreateProductSave}
            />
          )}
        </>
      )}

      <PrintSection
        isPrintModalOpen={printManager.isPrintModalOpen}
        onClose={() => printManager.setIsPrintModalOpen(false)}
        onPrint={printManager.handlePrint}
        printTemplates={printManager.printTemplates}
        selectedTemplateId={printManager.selectedTemplateId}
        onSelectTemplate={printManager.setSelectedTemplateId}
        renderPrintCard={printManager.renderPrintCard}
        printMode={printManager.printMode}
        printableFields={printableFields}
        selectedPrintFields={printManager.selectedPrintFields}
        onTogglePrintField={printManager.handleTogglePrintField}
      />

      <style>{`
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .custom-erp-table .ant-table-thead > tr > th { background: #f9fafb !important; color: #6b7280 !important; font-size: 12px !important; }
        .dark .custom-erp-table .ant-table-thead > tr > th { background: #262626 !important; color: #bbb; border-bottom: 1px solid #303030 !important; }
        .dark .ant-tabs-tab { color: #888; }
        .dark .ant-tabs-tab-active .ant-tabs-tab-btn { color: white !important; }
        .dark .ant-table-cell { background: #1a1a1a !important; color: #ddd !important; border-bottom: 1px solid #303030 !important; }
        .dark .ant-table-tbody > tr:hover > td { background: #222 !important; }
      `}</style>
      <style>{printStyles}</style>
    </div>
  );
};

export default ModuleShow;
