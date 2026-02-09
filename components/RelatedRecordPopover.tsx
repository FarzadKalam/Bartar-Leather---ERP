import React, { useEffect, useMemo, useState } from 'react';
import { Popover, Spin, Button } from 'antd';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType } from '../types';

interface RelatedRecordPopoverProps {
  moduleId: string;
  recordId: string;
  label?: string;
  children?: React.ReactNode;
}

const RelatedRecordPopover: React.FC<RelatedRecordPopoverProps> = ({ moduleId, recordId, label, children }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [assigneeLabel, setAssigneeLabel] = useState<string | null>(null);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, { label: string; value: string }[]>>({});
  const [relationLabels, setRelationLabels] = useState<Record<string, string>>({});

  const moduleConfig = MODULES[moduleId];

  const fields = useMemo(() => (moduleConfig?.fields || []).filter((f) => f.isTableColumn), [moduleConfig]);

  useEffect(() => {
    const loadRecord = async () => {
      if (!open || !moduleConfig || !recordId) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from(moduleConfig.table || moduleId)
          .select('*')
          .eq('id', recordId)
          .single();
        if (error) throw error;
        setRecord(data || null);

        if (data?.assignee_id) {
          if (data.assignee_type === 'role') {
            const { data: role } = await supabase
              .from('org_roles')
              .select('title')
              .eq('id', data.assignee_id)
              .single();
            setAssigneeLabel(role?.title || null);
          } else {
            const { data: user } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', data.assignee_id)
              .single();
            setAssigneeLabel(user?.full_name || null);
          }
        } else {
          setAssigneeLabel(null);
        }

        const categories = new Set<string>();
        fields.forEach((f: any) => {
          if (f.dynamicOptionsCategory) categories.add(f.dynamicOptionsCategory);
        });

        const dyn: Record<string, { label: string; value: string }[]> = {};
        for (const cat of Array.from(categories)) {
          const { data: options } = await supabase
            .from('dynamic_options')
            .select('label, value')
            .eq('category', cat)
            .eq('is_active', true)
            .order('display_order', { ascending: true });
          dyn[cat] = options || [];
        }
        setDynamicOptions(dyn);

        const relLabels: Record<string, string> = {};
        for (const f of fields) {
          if (f.type !== FieldType.RELATION || !f.relationConfig?.targetModule || !data?.[f.key]) continue;
          const targetField = f.relationConfig.targetField || 'name';
          const { data: rel } = await supabase
            .from(f.relationConfig.targetModule)
            .select(targetField)
            .eq('id', data[f.key])
            .single();
          if (rel && rel[targetField]) relLabels[f.key] = rel[targetField];
        }
        setRelationLabels(relLabels);
      } catch (err) {
        console.error(err);
        setRecord(null);
        setAssigneeLabel(null);
      } finally {
        setLoading(false);
      }
    };

    loadRecord();
  }, [open, moduleConfig, recordId, fields]);

  const renderValue = (field: any, value: any) => {
    if (value === null || value === undefined || value === '') return '-';
    if (field?.type === FieldType.RELATION) {
      return relationLabels[field.key] || '-';
    }
    if ((field?.type === FieldType.SELECT || field?.type === FieldType.MULTI_SELECT) && field.dynamicOptionsCategory) {
      const opts = dynamicOptions[field.dynamicOptionsCategory] || [];
      if (Array.isArray(value)) {
        return value
          .map((v) => opts.find((o) => o.value === v)?.label)
          .filter(Boolean)
          .join('، ') || '-';
      }
      return opts.find((o) => o.value === value)?.label || '-';
    }
    if (field?.options) {
      if (Array.isArray(value)) {
        return value
          .map((v) => field.options?.find((o: any) => o.value === v)?.label)
          .filter(Boolean)
          .join('، ') || '-';
      }
      return field.options?.find((o: any) => o.value === value)?.label || '-';
    }
    if (Array.isArray(value)) return value.join('، ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const content = (
    <div className="min-w-[260px] max-w-[360px]">
      {loading ? (
        <div className="py-6 flex items-center justify-center"><Spin size="small" /></div>
      ) : (
        <div className="space-y-2 text-xs text-gray-700">
          {fields.map((f) => (
            <div key={f.key} className="flex items-start justify-between gap-3">
              <span className="text-gray-500">{f.labels?.fa || f.key}</span>
              <span className="text-gray-800 font-medium text-right">{renderValue(f, record?.[f.key])}</span>
            </div>
          ))}
          {assigneeLabel && (
            <div className="flex items-start justify-between gap-3">
              <span className="text-gray-500">مسئول</span>
              <span className="text-gray-800 font-medium text-right">{assigneeLabel}</span>
            </div>
          )}
          <div className="pt-2 flex justify-end">
            <Button size="small" type="link" onClick={() => window.open(`/${moduleId}/${recordId}`, '_blank')}>
              نمایش کامل
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      getPopupContainer={() => document.body}
      overlayStyle={{ zIndex: 5000 }}
    >
      {children || (
        <span className="text-leather-600 cursor-pointer hover:underline">
          {label || recordId}
        </span>
      )}
    </Popover>
  );
};

export default RelatedRecordPopover;