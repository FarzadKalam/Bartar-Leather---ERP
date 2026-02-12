import React, { useEffect, useState } from 'react';
import { Tree, Checkbox, Button, Input, message, Empty, Divider, Switch, Collapse } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined, LockOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { BlockType } from '../../types';

const { Panel } = Collapse;

const RolesTab: React.FC = () => {
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, any>>({});
  const [newRoleName, setNewRoleName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    if (selectedRoleId) {
      const role = roles.find(r => r.id === selectedRoleId);
      setPermissions(role?.permissions || {});
    }
  }, [selectedRoleId, roles]);

  const fetchRoles = async () => {
    const { data } = await supabase.from('org_roles').select('*').order('created_at');
    if (data) setRoles(data);
  };

  const handleAddRole = async () => {
    if (!newRoleName) return;
    const { error } = await supabase.from('org_roles').insert([{ title: newRoleName }]);
    if (!error) {
      message.success('جایگاه اضافه شد');
      setNewRoleName('');
      fetchRoles();
    }
  };

  const handleDeleteRole = async (id: string) => {
    const { error } = await supabase.from('org_roles').delete().eq('id', id);
    if (!error) {
      message.success('حذف شد');
      if (selectedRoleId === id) setSelectedRoleId(null);
      fetchRoles();
    } else {
        message.error('خطا: ممکن است کاربرانی به این نقش متصل باشند.');
    }
  };

  const handlePermissionChange = (moduleId: string, type: 'view' | 'edit' | 'delete' | 'field', fieldKey?: string, checked?: boolean) => {
    const newPerms = { ...permissions };
    if (!newPerms[moduleId]) newPerms[moduleId] = { view: false, edit: false, delete: false, fields: {} };

    if (type === 'field' && fieldKey) {
        if (!newPerms[moduleId].fields) newPerms[moduleId].fields = {};
        newPerms[moduleId].fields[fieldKey] = checked;
    } else {
        newPerms[moduleId][type] = checked;
        
        // منطق هوشمند:
        // اگر ویرایش فعال شد، مشاهده هم حتما باید فعال شود (چون بدون مشاهده نمیشه ویرایش کرد)
        if (type === 'edit' && checked) {
            newPerms[moduleId].view = true;
        }
        // اگر مشاهده غیرفعال شد، ویرایش و حذف هم باید غیرفعال شوند
        if (type === 'view' && !checked) {
            newPerms[moduleId].edit = false;
            newPerms[moduleId].delete = false;
        }
        // *نکته:* اگر مشاهده فعال شود، ویرایش تغییری نمی‌کند (خواسته شما: جدا باشند)
    }
    setPermissions(newPerms);
  };

  const savePermissions = async () => {
    if (!selectedRoleId) return;
    setLoading(true);
    const { error } = await supabase.from('org_roles').update({ permissions }).eq('id', selectedRoleId);
    if (!error) {
      message.success('دسترسی‌ها بروزرسانی شد');
      setRoles(prev => prev.map(r => r.id === selectedRoleId ? { ...r, permissions } : r));
    }
    setLoading(false);
  };

  const treeData = roles.map(role => ({
    title: (
        <div className="flex justify-between items-center w-full pr-2 text-gray-700 dark:text-gray-300">
            <span>{role.title}</span>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDeleteRole(role.id); }} />
        </div>
    ),
    key: role.id,
  }));

  const getPermissionFields = (module: any) => {
    const fieldMap = new Map<string, any>();

    module.fields.forEach((field: any) => {
      fieldMap.set(field.key, field);
    });

    module.blocks?.forEach((block: any) => {
      if (block.type !== BlockType.TABLE && block.type !== BlockType.GRID_TABLE) return;
      block.tableColumns?.forEach((col: any) => {
        if (!fieldMap.has(col.key)) {
          fieldMap.set(col.key, {
            key: col.key,
            labels: { fa: col.title || col.key }
          });
        }
      });
    });

    const hasTableBlocks = module.blocks?.some((block: any) => block.type === BlockType.TABLE || block.type === BlockType.GRID_TABLE);
    if (hasTableBlocks && !fieldMap.has('grand_total')) {
      fieldMap.set('grand_total', {
        key: 'grand_total',
        labels: { fa: 'جمع کل' }
      });
    }

    if (!fieldMap.has('assignee_id')) {
      fieldMap.set('assignee_id', {
        key: 'assignee_id',
        labels: { fa: 'مسئول' }
      });
    }

    return Array.from(fieldMap.values());
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 h-[70vh]">
      {/* سایدبار لیست نقش‌ها */}
      <div className="w-full md:w-1/3 bg-gray-50 dark:bg-[#202020] border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col">
        <div className="flex gap-2 mb-4">
            <Input placeholder="نام جایگاه جدید..." value={newRoleName} onChange={e => setNewRoleName(e.target.value)} className="dark:bg-[#303030] dark:border-gray-700 dark:text-white" />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRole} className="bg-leather-600 border-none" />
        </div>
        <div className="flex-1 overflow-y-auto">
            {roles.length > 0 ? (
                <Tree
                    className="bg-transparent dark:text-gray-300"
                    treeData={treeData}
                    selectedKeys={selectedRoleId ? [selectedRoleId] : []}
                    onSelect={(keys) => setSelectedRoleId(keys[0] as string)}
                    blockNode
                />
            ) : <Empty description={<span className="text-gray-400">هنوز جایگاهی تعریف نشده</span>} />}
        </div>
      </div>

      {/* پنل مدیریت دسترسی‌ها */}
      <div className="w-full md:w-2/3 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl p-6 flex flex-col">
        {selectedRoleId ? (
            <>
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                    <h3 className="text-lg font-bold m-0 flex items-center gap-2 text-gray-800 dark:text-white">
                        <LockOutlined className="text-leather-600" />
                        دسترسی‌های جایگاه: <span className="text-leather-600">{roles.find(r => r.id === selectedRoleId)?.title}</span>
                    </h3>
                    <Button type="primary" icon={<SaveOutlined />} onClick={savePermissions} loading={loading} className="bg-green-600 border-none">ذخیره دسترسی‌ها</Button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2">
                    <Collapse accordion defaultActiveKey={['products']} className="dark:bg-transparent dark:border-gray-800">
                        {Object.values(MODULES).map((module) => {
                            const modPerms = permissions[module.id] || {};
                            return (
                                <Panel 
                                    key={module.id} 
                                    className="dark:border-gray-800"
                                    header={
                                        <div className="flex items-center justify-between w-full dark:text-gray-200">
                                            <span className="font-bold">{module.titles.fa}</span>
                                            <div className="flex gap-4 text-xs" onClick={e => e.stopPropagation()}>
                                                <Checkbox className="dark:text-gray-400" checked={modPerms.view} onChange={e => handlePermissionChange(module.id, 'view', undefined, e.target.checked)}>مشاهده</Checkbox>
                                                <Checkbox className="dark:text-gray-400" checked={modPerms.edit} disabled={!modPerms.view} onChange={e => handlePermissionChange(module.id, 'edit', undefined, e.target.checked)}>ویرایش/ایجاد</Checkbox>
                                                <Checkbox className="dark:text-gray-400" checked={modPerms.delete} disabled={!modPerms.view} onChange={e => handlePermissionChange(module.id, 'delete', undefined, e.target.checked)}>حذف</Checkbox>
                                            </div>
                                        </div>
                                    }
                                >
                                    <div className="pl-6 pt-2">
                                        <Divider orientation="left" className="text-xs text-gray-400 m-0 mb-3 border-gray-200 dark:border-gray-700">دسترسی به فیلدها</Divider>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                          {getPermissionFields(module).map((field: any) => (
                                                <div key={field.key} className="flex items-center gap-2 text-sm bg-gray-50 dark:bg-white/5 p-2 rounded border border-transparent dark:border-gray-800">
                                                    <Switch 
                                                        size="small" 
                                                        checked={modPerms.fields?.[field.key] !== false} 
                                                        onChange={checked => handlePermissionChange(module.id, 'field', field.key, checked)}
                                                        disabled={!modPerms.view}
                                                        className="bg-gray-300"
                                                    />
                                                    <span className="text-gray-600 dark:text-gray-400">{field.labels.fa}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </Panel>
                            );
                        })}
                    </Collapse>
                </div>
            </>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <TeamOutlined className="text-4xl mb-2 opacity-30" />
                <p>یک جایگاه سازمانی را از لیست سمت راست انتخاب کنید</p>
            </div>
        )}
      </div>
      <style>{`
        .dark .ant-collapse-content { background-color: #1f1f1f; color: #ddd; border-color: #303030; }
        .dark .ant-collapse-header { color: #ddd !important; }
        .dark .ant-tree-node-content-wrapper:hover { background-color: #303030 !important; }
        .dark .ant-tree-node-selected { background-color: #2b1d11 !important; }
      `}</style>
    </div>
  );
};

export default RolesTab;