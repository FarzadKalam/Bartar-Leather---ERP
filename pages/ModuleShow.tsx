import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Tag, Spin, App, Input, InputNumber, Select, Drawer, Avatar, QRCode } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, BlockType, LogicOperator } from '../types';
import SmartForm from '../components/SmartForm';
import RelatedSidebar from '../components/Sidebar/RelatedSidebar';
import DynamicSelectField from '../components/DynamicSelectField';
import { getSingleOptionLabel } from '../utils/optionHelpers';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';
import HeaderActions from '../components/moduleShow/HeaderActions';
import HeroSection from '../components/moduleShow/HeroSection';
import FieldGroupsTabs from '../components/moduleShow/FieldGroupsTabs';
import TablesSection from '../components/moduleShow/TablesSection';
import PrintSection from '../components/moduleShow/PrintSection';

dayjs.extend(jalaliday);

const ModuleShow: React.FC = () => {
  const { moduleId = 'products', id } = useParams();
  const navigate = useNavigate();
  const { message: msg, modal } = App.useApp();
  const moduleConfig = MODULES[moduleId];

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [linkedBomData, setLinkedBomData] = useState<any>(null);
  const [currentTags, setCurrentTags] = useState<any[]>([]); // استیت تگ‌ها

  const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [printMode, setPrintMode] = useState(false);
  const [editingFields, setEditingFields] = useState<Record<string, boolean>>({});
  const [tempValues, setTempValues] = useState<Record<string, any>>({});
  const [, setSavingField] = useState<string | null>(null);
  const [, setUploadingImage] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, any[]>>({});

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
        const { data: record, error } = await supabase
            .from(moduleId)
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

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

  useEffect(() => {
    if (!printMode) return;
    const handleAfterPrint = () => setPrintMode(false);
    window.addEventListener('afterprint', handleAfterPrint);
    document.body.classList.add('print-mode');
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('print-mode');
    };
  }, [printMode]);

  const fetchLinkedBom = useCallback(async (bomId: string) => {
      const { data: bom } = await supabase.from('production_boms').select('*').eq('id', bomId).single();
      if (bom) setLinkedBomData(bom);
  }, []);

  const fetchOptions = useCallback(async (recordData: any = null) => {
    if (!moduleConfig) return;
    
    const dynFields = [...moduleConfig.fields.filter(f => (f as any).dynamicOptionsCategory)];
    moduleConfig.blocks?.forEach(b => {
      if (b.type === BlockType.TABLE && b.tableColumns) {
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

    const relFields = [...moduleConfig.fields.filter(f => f.type === FieldType.RELATION)];
    moduleConfig.blocks?.forEach(b => {
      if (b.type === BlockType.TABLE && b.tableColumns) {
        b.tableColumns.forEach(c => {
          if (c.type === FieldType.RELATION) relFields.push({ ...c, key: `${b.id}_${c.key}` }); 
        });
      }
    });

    const relOpts: Record<string, any[]> = {};
    for (const field of relFields) {
      if (field.relationConfig) {
        if (field.relationConfig.dependsOn && recordData) {
          const dependsOnValue = recordData[field.relationConfig.dependsOn];
          if (dependsOnValue) {
            try {
              const { data: relData } = await supabase.from(dependsOnValue).select('id, name, system_code').limit(200);
              if (relData) {
                const options = relData.map((i: any) => ({ 
                  label: i.system_code ? `${i.name} (${i.system_code})` : i.name, 
                  value: i.id,
                  module: dependsOnValue,
                  name: i.name,
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
            const { data: relData } = await supabase.from(targetModule).select('id, name, system_code').limit(200);
            if (relData) {
              let filteredData = relData;
              if (filter) {
                filteredData = relData.filter((item: any) => {
                  return Object.keys(filter).every(k => item[k] === filter[k]);
                });
              }
                        
              const options = filteredData.map((i: any) => ({ 
                label: i.system_code ? `${i.name} (${i.system_code})` : i.name, 
                value: i.id,
                name: i.name,
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

  const saveEdit = async (key: string) => {
    setSavingField(key);
    let newValue = tempValues[key];
    if (newValue === '' || newValue === undefined) newValue = null;
    try {
      const { error } = await supabase.from(moduleId).update({ [key]: newValue }).eq('id', id);
      if (error) throw error;
      setData((prev: any) => ({ ...prev, [key]: newValue }));
      msg.success('ذخیره شد');
      setTimeout(() => setEditingFields(prev => ({ ...prev, [key]: false })), 100);
    } catch (error: any) { msg.error(error.message); } finally { setSavingField(null); }
  };

  const startEdit = (key: string, value: any) => { setEditingFields(prev => ({ ...prev, [key]: true })); setTempValues(prev => ({ ...prev, [key]: value })); };
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

  const printTemplates = useMemo(() => {
    const templates = [];
    if (moduleId === 'products') {
      templates.push({ id: 'product_specs', title: 'قالب مشخصات کالا', description: 'برچسب A6 برای محصول' });
    }
    if (moduleId === 'invoices') {
      templates.push({ id: 'invoice_proforma', title: 'قالب پیش فاکتور', description: 'نسخه پیش فاکتور' });
      templates.push({ id: 'invoice_final', title: 'قالب فاکتور', description: 'نسخه نهایی فاکتور' });
    }
    if (moduleId === 'production_boms' || moduleId === 'production_orders') {
      templates.push({ id: 'production_passport', title: 'قالب شناسنامه تولید', description: 'برگه شناسنامه تولید' });
    }
    if (templates.length === 0) {
      templates.push({ id: 'default_specs', title: 'قالب مشخصات', description: 'چاپ اطلاعات اصلی' });
    }
    return templates;
  }, [moduleId]);

  useEffect(() => {
    if (printTemplates.length === 0) return;
    if (!selectedTemplateId || !printTemplates.some(t => t.id === selectedTemplateId)) {
      setSelectedTemplateId(printTemplates[0].id);
    }
  }, [printTemplates, selectedTemplateId]);

  const formatPrintValue = (field: any, value: any) => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.join('، ');
    if (field.type === FieldType.CHECKBOX) return value ? 'بله' : 'خیر';
    if (field.type === FieldType.PRICE) return `${Number(value).toLocaleString()} ریال`;
    if (field.type === FieldType.PERCENTAGE) return `${value}%`;
    if (field.type === FieldType.DATE || field.type === FieldType.DATETIME) {
      const date = dayjs(value);
      return date.isValid() ? (date as any).calendar('jalali').format('YYYY/MM/DD') : String(value);
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
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(f => ({ ...f, value: data[f.key] }))
      .filter(f => hasValue(f.value));
  }, [moduleConfig, data, dynamicOptions, relationOptions]);

  const activeTemplate = printTemplates.find(t => t.id === selectedTemplateId) || printTemplates[0];
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const printQrValue = pageUrl;

  const handlePrint = () => {
    if (!activeTemplate) return;
    setIsPrintModalOpen(false);
    setPrintMode(true);
    setTimeout(() => window.print(), 150);
  };

  const renderPrintCard = () => {
    if (!activeTemplate) return null;
    return (
      <div className="print-card">
        <div className="print-header">
          <div className="print-head-text">
            <div className="print-title">{activeTemplate.title}</div>
            <div className="print-subtitle">{moduleConfig.titles.fa}</div>
          </div>
          <div className="print-qr">
            <QRCode value={printQrValue} bordered={false} size={92} />
          </div>
        </div>
        <div className="print-table-wrap">
          <table className="print-table">
            <tbody>
              {printableFields.map(field => (
                <tr key={field.key}>
                  <td className="print-label">{field.labels.fa}</td>
                  <td className="print-value">{formatPrintValue(field, field.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const getUserName = (uid: string) => {
      const user = allUsers.find(u => u.id === uid);
      return user ? user.full_name : 'سیستم/نامشخص';
  };

  const getAssigneeOptions = () => [
      { label: 'پرسنل', title: 'users', options: allUsers.map(u => ({ label: u.full_name, value: `user_${u.id}`, emoji: <UserOutlined /> })) },
      { label: 'تیم‌ها (جایگاه سازمانی)', title: 'roles', options: allRoles.map(r => ({ label: r.title, value: `role_${r.id}`, emoji: <TeamOutlined /> })) }
  ];

  if (!moduleConfig || !data) return loading ? <div className="flex h-screen items-center justify-center"><Spin size="large" /></div> : null;

  const renderSmartField = (field: any, isHeader = false) => {
    const isEditing = editingFields[field.key];
    const value = data[field.key];
    let baseValue = value ?? undefined;
    
    // نرمال‌سازی MULTISELECT برای نمایش اولیه
    if (field.type === FieldType.MULTI_SELECT && typeof baseValue === 'string') {
      try {
        baseValue = JSON.parse(baseValue);
      } catch {
        baseValue = baseValue ? [baseValue] : [];
      }
    }
    
    const tempValue = tempValues[field.key] !== undefined ? tempValues[field.key] : baseValue;

    if (isEditing) {
      let inputNode;
      let options = field.options;
      if ((field as any).dynamicOptionsCategory) options = dynamicOptions[(field as any).dynamicOptionsCategory];
      else if (field.type === FieldType.RELATION) options = relationOptions[field.key];

      if ((field as any).dynamicOptionsCategory) {
          const cat = (field as any).dynamicOptionsCategory;
          const isMultiple = field.type === FieldType.MULTI_SELECT;
          inputNode = (
            <DynamicSelectField
              value={tempValue}
              onChange={(v) => setTempValues(prev => ({ ...prev, [field.key]: v }))}
              options={options || []}
              category={cat}
              placeholder="انتخاب کنید"
              onOptionsUpdate={fetchOptions}
              mode={isMultiple ? 'multiple' : undefined}
            />
          );
      } else if (field.type === FieldType.MULTI_SELECT) {
           inputNode = <Select mode="multiple" value={tempValue} onChange={(v) => setTempValues(prev => ({ ...prev, [field.key]: v }))} className="w-full" options={options} showSearch allowClear />;
      } else if (field.type === FieldType.SELECT || field.type === FieldType.STATUS || field.type === FieldType.RELATION) {
           const handleRelationChange = (v: any) => {
               setTempValues(prev => ({ ...prev, [field.key]: v }));
               // اگر فیلد related_bom باشد، خودکار BOM را بارگذاری کن
               if (field.key === 'related_bom' && v) {
                   setTimeout(() => handleRelatedBomChange(v), 100);
               }
           };
           inputNode = <Select value={tempValue} onChange={handleRelationChange} className="w-full" options={options} showSearch allowClear />;
      } else if (field.type === FieldType.PRICE) {
           inputNode = <InputNumber formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value!.replace(/\$\s?|(,*)/g, '')} value={tempValue} onChange={v => setTempValues(prev => ({ ...prev, [field.key]: v }))} className="w-full" />;
      } else if (field.type === FieldType.NUMBER || field.type === FieldType.STOCK || field.type === FieldType.PERCENTAGE) {
           inputNode = <InputNumber value={tempValue} onChange={v => setTempValues(prev => ({ ...prev, [field.key]: v }))} className="w-full" />;
      } else {
           inputNode = <Input value={tempValue} onChange={e => setTempValues(prev => ({ ...prev, [field.key]: e.target.value }))} />;
      }
      return <div className="flex items-center gap-1 min-w-[150px]"><div className="flex-1">{inputNode}</div><Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => saveEdit(field.key)} className="bg-green-500 hover:!bg-green-600 border-none" /><Button size="small" icon={<CloseOutlined />} onClick={() => cancelEdit(field.key)} danger /></div>;
    }

    let displayContent;
    if (value === null || value === undefined || value === '') displayContent = <span className="text-gray-300 text-xs italic">---</span>;
    else if (field.type === FieldType.PRICE) {
        const persianPrice = formatPersianPrice(value);
        displayContent = <span className="persian-number font-bold text-lg">{persianPrice} <span className="text-[10px] text-gray-500 font-sans font-normal">تومان</span></span>;
    }
    else if (field.type === FieldType.NUMBER || field.type === FieldType.STOCK || field.type === FieldType.PERCENTAGE) {
        const persianNum = toPersianNumber(value);
        displayContent = <span className="persian-number font-bold text-lg">{persianNum}</span>;
    }
    else if (field.type === FieldType.STATUS) {
       const opt = field.options?.find((o: any) => o.value === value);
       displayContent = <Tag color={opt?.color || 'default'} className="px-2 py-0.5 text-sm">{opt?.label || value}</Tag>;
    } else if (field.type === FieldType.RELATION && field.relationConfig) {
       // نمایش RELATION fields به صورت لینک
       const label = getOptionLabel(field, value);
       displayContent = (
           <Link to={`/${field.relationConfig.targetModule}/${value}`} className="text-leather-600 hover:text-leather-700 font-medium underline">
               {label}
           </Link>
       );
    } else if (field.type === FieldType.MULTI_SELECT) {
       // نمایش MULTI_SELECT به صورت tags
       // تبدیل value به آرایه اگر string JSON است
       let normalizedValue = value;
       if (typeof value === 'string') {
         try {
           normalizedValue = JSON.parse(value);
         } catch {
           normalizedValue = value ? [value] : [];
         }
       }
       
       if (Array.isArray(normalizedValue) && normalizedValue.length > 0) {
         displayContent = (
           <div className="flex flex-wrap gap-2">
             {normalizedValue.map((val: any, idx: number) => {
               const label = getSingleOptionLabel(field, val, dynamicOptions, relationOptions);
               return (
                 <Tag key={idx} color="default" className="px-2 py-1 text-xs font-medium" style={{backgroundColor: '#fef3c7', borderColor: '#d97706', color: '#92400e'}} >
                   {label}
                 </Tag>
               );
             })}
           </div>
         );
       } else {
         displayContent = <span className="text-gray-400">-</span>;
       }
    } else if (field.type === FieldType.SELECT) {
       const label = getSingleOptionLabel(field, value, dynamicOptions, relationOptions);
       displayContent = <span className="font-medium">{label}</span>;
    } else if (field.type === FieldType.RELATION && !field.relationConfig) {
       const label = getSingleOptionLabel(field, value, dynamicOptions, relationOptions);
       displayContent = <span className="font-medium">{label}</span>;
    }
    else if (field.type === FieldType.STOCK) displayContent = <span className={`font-mono font-bold ${value < (data.reorder_point || 10) ? 'text-red-500' : 'text-green-600'}`}>{value}</span>;
    else displayContent = <span className="font-medium">{value}</span>;

    if (isHeader) return <div className="group flex items-center gap-2 cursor-pointer" onClick={() => !field.readonly && startEdit(field.key, value)}>{displayContent}{!field.readonly && <EditOutlined className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity text-xs" />}</div>;
    return <div className="group flex items-center justify-between min-h-[32px] hover:bg-gray-50 dark:hover:bg-white/5 px-3 rounded-lg -mx-3 transition-colors cursor-pointer border border-transparent hover:border-gray-100 dark:hover:border-gray-700" onClick={() => !field.readonly && startEdit(field.key, value)}><div className="text-gray-800 dark:text-gray-200">{displayContent}</div>{!field.readonly && <EditOutlined className="text-leather-400 opacity-0 group-hover:opacity-100 transition-opacity" />}</div>;
  };

  const fieldGroups = moduleConfig.blocks?.filter(b => b.type === BlockType.FIELD_GROUP && checkVisibility(b));
  const standardTableBlocks = moduleConfig.blocks?.filter(b => b.type === BlockType.TABLE && checkVisibility(b));

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
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto pb-20 ml-16 transition-all">
      <RelatedSidebar moduleConfig={moduleConfig} recordId={id!} />

      <HeaderActions
        moduleTitle={moduleConfig.titles.fa}
        recordName={data.name}
        shareUrl={pageUrl}
        onBack={() => navigate(`/${moduleId}`)}
        onHome={() => navigate('/')}
        onModule={() => navigate(`/${moduleId}`)}
        onPrint={() => setIsPrintModalOpen(true)}
        onEdit={() => setIsEditDrawerOpen(true)}
        onDelete={handleDelete}
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
      />

      <FieldGroupsTabs
        fieldGroups={fieldGroups}
        moduleConfig={moduleConfig}
        renderSmartField={renderSmartField}
        checkVisibility={checkVisibility}
      />

      <TablesSection
        linkedBomData={linkedBomData}
        standardTableBlocks={standardTableBlocks || []}
        data={data}
        moduleId={moduleId}
        recordId={id!}
        relationOptions={relationOptions}
        dynamicOptions={dynamicOptions}
        onLinkedBomUpdate={fetchLinkedBom}
        onTableSave={(blockId, newData) => setData((prev: any) => ({ ...prev, [blockId]: newData }))}
      />

      <Drawer title={`ویرایش ${data.name}`} width={720} onClose={() => setIsEditDrawerOpen(false)} open={isEditDrawerOpen} styles={{ body: { paddingBottom: 80 } }} destroyOnClose zIndex={5000}>
        {React.createElement(SmartForm as any, { module: moduleConfig, recordId: id, onSuccess: () => { setIsEditDrawerOpen(false); fetchRecord(); }, onCancel: () => setIsEditDrawerOpen(false) })}
      </Drawer>

      <PrintSection
        isPrintModalOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        onPrint={handlePrint}
        printTemplates={printTemplates}
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={setSelectedTemplateId}
        renderPrintCard={renderPrintCard}
        printMode={printMode}
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
        .print-modal { display: grid; grid-template-columns: 200px 1fr; gap: 16px; }
        .print-template-list { display: flex; flex-direction: column; gap: 8px; }
        .print-template-item { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; text-align: right; background: #fff; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .print-template-item:hover { border-color: #c58f60; box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
        .print-template-item.active { border-color: #c58f60; box-shadow: 0 6px 16px rgba(197,143,96,0.25); }
        .print-template-title { font-weight: 700; color: #111827; font-size: 13px; }
        .print-template-desc { color: #6b7280; font-size: 11px; margin-top: 4px; }
        .print-preview { background: #f9fafb; border: 1px dashed #e5e7eb; border-radius: 12px; padding: 12px; overflow: auto; }
        .print-preview-inner { display: flex; justify-content: center; align-items: flex-start; transform: scale(0.9); transform-origin: top center; }
        .print-card { width: 105mm; height: 148mm; background: #fff; color: #111827; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8mm; box-sizing: border-box; display: flex; flex-direction: column; }
        .print-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .print-title { font-size: 14px; font-weight: 800; }
        .print-subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
        .print-table-wrap { margin-top: 8px; overflow: hidden; flex: 1; }
        .print-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .print-table td { border: 1px solid #e5e7eb; padding: 4px 6px; vertical-align: top; }
        .print-label { width: 36%; background: #f8fafc; font-weight: 700; color: #374151; }
        .print-value { color: #111827; word-break: break-word; }
        #print-root { display: none; }
        @media print {
          @page { size: A6; margin: 6mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          #print-root, #print-root * { visibility: visible; }
          #print-root { display: block; position: fixed; left: 0; top: 0; width: 105mm; height: 148mm; }
          .print-card { border: none; box-shadow: none; border-radius: 0; }
        }
      `}</style>
    </div>
  );
};

export default ModuleShow;
