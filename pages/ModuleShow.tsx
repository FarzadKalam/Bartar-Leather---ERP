import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Spin, App, Avatar, QRCode, } from 'antd';
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

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);

  const fetchBaseInfo = useCallback(async () => {
      const { data: users } = await supabase.from('profiles').select('id, full_name, avatar_url');
      const { data: roles } = await supabase.from('org_roles').select('id, title');
      if (users) setAllUsers(users);
      if (roles) setAllRoles(roles);
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
        
        setCurrentTags(tags);
        setData(record);
    } catch (err: any) {
        console.error(err);
        msg.error('خطا در دریافت اطلاعات: ' + err.message);
    } finally {
        setLoading(false);
    }
  }, [id, moduleConfig, moduleId, msg]);

  useEffect(() => {
    fetchBaseInfo();
  }, [fetchBaseInfo]);

  useEffect(() => {
    fetchRecord();
  }, [fetchRecord]);

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

    const handleAssigneeChange = useCallback(async (value: string) => {
      const [type, assignId] = value.split('_');
      try {
        const { error } = await supabase.from(moduleId).update({ assignee_id: assignId, assignee_type: type }).eq('id', id);
        if (error) throw error;
        setData((prev: any) => ({ ...prev, assignee_id: assignId, assignee_type: type }));
        msg.success('مسئول رکورد تغییر کرد');
      } catch (e: any) { msg.error('خطا: ' + e.message); }
    }, [id, moduleId, msg]);

  // تابع برای کپی خودکار اقلام BOM به جداول مواد اولیه
    const handleRelatedBomChange = useCallback(async (bomId: string) => {
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
    }, [id, moduleId, msg]);

  const handleDelete = () => {
    modal.confirm({ title: 'حذف رکورد', okType: 'danger', onOk: async () => { await supabase.from(moduleId).delete().eq('id', id); navigate(`/${moduleId}`); } });
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

        await supabase.from('changelogs').insert([
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
      } catch (err) {
        console.warn('Changelog insert failed:', err);
      }
    },
    [moduleId, id, data]
  );

  const saveEdit = async (key: string) => {
    if (!canEditModule) return;
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

  const startEdit = (key: string, value: any) => {
    if (!canEditModule) return;
    setEditingFields(prev => ({ ...prev, [key]: true }));
    setTempValues(prev => ({ ...prev, [key]: value }));
  };
  const cancelEdit = (key: string) => { setEditingFields(prev => ({ ...prev, [key]: false })); };

  const checkVisibility = (logic: any) => {
    if (!logic || !logic.visibleIf) return true;
    const { field, operator, value } = logic.visibleIf;
    const currentValue = data[field];
    if (operator === LogicOperator.EQUALS) return currentValue === value;
    if (operator === LogicOperator.NOT_EQUALS) return currentValue !== value;
    return true;
  };

  const getOptionLabel = (field: any, value: any) => {
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
  });

  const getUserName = (uid: string) => {
      const user = allUsers.find(u => u.id === uid);
      return user ? user.full_name : 'سیستم/نامشخص';
  };

  const getAssigneeOptions = () => [
      { label: 'پرسنل', title: 'users', options: allUsers.map(u => ({ label: u.full_name, value: `user_${u.id}`, emoji: <UserOutlined /> })) },
      { label: 'تیم‌ها (جایگاه سازمانی)', title: 'roles', options: allRoles.map(r => ({ label: r.title, value: `role_${r.id}`, emoji: <TeamOutlined /> })) }
  ];

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
              compactMode={true}
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
        compactMode={true}
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
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto pb-20 transition-all overflow-hidden pl-0 md:pl-16">
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
        canViewField={canViewField}
        canEditModule={canEditModule}
      />

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
      />

      {isEditDrawerOpen && (
        <SmartForm
          module={moduleConfig}
          visible={isEditDrawerOpen}
          recordId={id}
          onCancel={() => {
            setIsEditDrawerOpen(false);
            fetchRecord();
          }}
        />
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
