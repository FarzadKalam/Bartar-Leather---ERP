import React, { useState, useEffect } from 'react';
import { List, Input, Button, Checkbox, Timeline, message, Empty, Spin, Select, Tag } from 'antd';
import { SendOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import dayjs from 'dayjs';

interface ActivityPanelProps {
  moduleId: string;
  recordId: string;
  view: 'notes' | 'tasks' | 'changelogs'; // <--- ورودی جدید برای تعیین نوع نمایش
  recordName?: string; // <--- نام رکورد برای نمایش
  mentionUsers?: any[];
  mentionRoles?: any[];
}

const ActivityPanel: React.FC<ActivityPanelProps> = ({ moduleId, recordId, view, recordName = '', mentionUsers = [], mentionRoles = [] }) => {
  const [items, setItems] = useState<any[]>([]);
  const [newItem, setNewItem] = useState('');
  const [mentionId, setMentionId] = useState<string | null>(null);
  const [mentionOptions, setMentionOptions] = useState<{ label: string; value: string }[]>([]);
  const [mentionMap, setMentionMap] = useState<Record<string, { label: string; type: 'user' | 'team' }>>({});
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [moduleId, recordId, view]);

  // لیست اعضا برای منشن (پروفایل‌ها)
  useEffect(() => {
    const buildMentions = (profiles: any[], roles: any[]) => {
      const profileOptions = (profiles || []).map((p: any) => ({
        label: `عضو: ${p.full_name || p.id}`,
        value: p.id,
      }));
      const roleOptions = (roles || []).map((r: any) => ({
        label: `تیم: ${r.title || r.id}`,
        value: r.id,
      }));

      const map: Record<string, { label: string; type: 'user' | 'team' }> = {};
      (profiles || []).forEach((p: any) => { map[p.id] = { label: p.full_name || p.id, type: 'user' }; });
      (roles || []).forEach((r: any) => { map[r.id] = { label: r.title || r.id, type: 'team' }; });

      setMentionMap(map);
      setMentionOptions([...profileOptions, ...roleOptions]);
    };

    const loadProfiles = async () => {
      setMentionsLoading(true);
      try {
        const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
          supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true }).limit(200),
          supabase.from('org_roles').select('id, title').order('title', { ascending: true }).limit(200),
        ]);

        if (profilesError || rolesError) {
          console.error(profilesError || rolesError);
        }

        buildMentions(profiles || [], roles || []);
      } catch (err) {
        console.error(err);
        message.error('دریافت اعضا/تیم‌ها ناموفق بود');
      } finally {
        setMentionsLoading(false);
      }
    };
    if (view === 'notes') {
      if (mentionUsers.length || mentionRoles.length) {
        buildMentions(mentionUsers, mentionRoles);
      } else {
        loadProfiles();
      }
    }
  }, [view, mentionUsers, mentionRoles]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const prefix = `${view === 'notes' ? 'note' : view === 'changelogs' ? 'log' : 'task'}|${moduleId}|${recordId}`;

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .ilike('task_type', `${prefix}%`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error(err);
      message.error('دریافت اطلاعات با خطا مواجه شد');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!newItem.trim()) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();

      const baseType = view === 'notes' ? 'note' : 'task';
      const taskType = `${baseType}|${moduleId}|${recordId}`;

      const payload = {
        task_type: taskType,
        name: newItem,
        status: 'pending',
        created_at: now,
        assignee_id: mentionId || null,
      } as any;

      const { error } = await supabase.from('tasks').insert([payload]);
      if (error) throw error;

      message.success(view === 'notes' ? 'یادداشت ثبت شد' : 'وظیفه ایجاد شد');
      setNewItem('');
      setMentionId(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('ثبت با خطا مواجه شد');
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (task: any) => {
    try {
      const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
      const { error } = await supabase
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', task.id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('به‌روزرسانی وظیفه ناموفق بود');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) throw error;
      message.success('حذف شد');
      fetchData();
    } catch (err: any) {
      console.error(err);
      message.error('حذف با خطا مواجه شد');
    }
  };

  if (loading && items.length === 0) return <div className="flex justify-center p-10"><Spin /></div>;

  return (
    <div className="h-full flex flex-col">
      {/* عنوان بخش */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 mb-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {view === 'notes' && 'یادداشت‌های'}
          {view === 'tasks' && 'وظایف'}
          {view === 'changelogs' && 'تاریخچه تغییرات'}
        </div>
        {recordName && (
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 truncate">
            {recordName}
          </div>
        )}
      </div>

      {/* فقط برای یادداشت و وظایف ورودی داریم */}
      {view !== 'changelogs' && (
          <div className="flex gap-2 mb-6">
              {view === 'notes' ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <Input.TextArea 
                      placeholder="یادداشت جدید..." 
                      value={newItem} 
                      onChange={e => setNewItem(e.target.value)} 
                      autoSize={{ minRows: 2, maxRows: 4 }} 
                      className="rounded-lg border-gray-300"
                    />
                    <Select
                      allowClear
                      showSearch
                      placeholder="منشن عضو یا تیم (اختیاری)"
                      value={mentionId}
                      onChange={(v) => setMentionId(v)}
                      options={mentionOptions}
                      loading={mentionsLoading}
                      optionFilterProp="label"
                      filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase())}
                      notFoundContent={mentionsLoading ? 'در حال بارگذاری...' : 'موردی یافت نشد'}
                      getPopupContainer={(node) => node.parentElement || document.body}
                      dropdownStyle={{ zIndex: 3000, minWidth: 240 }}
                      className="w-full"
                    />
                  </div>
              ) : (
                  <Input 
                    placeholder="عنوان وظیفه..." 
                    value={newItem} 
                    onChange={e => setNewItem(e.target.value)} 
                    onPressEnter={handleSubmit} 
                    className="rounded-lg border-gray-300 h-10"
                  />
              )}
              <Button type="primary" icon={view === 'notes' ? <SendOutlined /> : <PlusOutlined />} onClick={handleSubmit} className="h-auto rounded-lg" />
          </div>
      )}

      <div className="flex-1 overflow-y-auto pr-1">
          {items.length === 0 && <Empty description="موردی یافت نشد" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          
              {view === 'notes' && (
                <List dataSource={items} renderItem={(item: any) => (
                  <div className="bg-white dark:bg-white/5 p-4 rounded-xl mb-3 border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-2">
                      <span>کاربر سیستم</span>
                      <span>{item.created_at ? dayjs(item.created_at).format('YYYY/MM/DD HH:mm') : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed flex-1">{item.name || item.content}</div>
                      {item.assignee_id && (
                        <Tag color="blue" className="text-xs">
                          منشن: {mentionMap[item.assignee_id]?.label || item.assignee_id}
                        </Tag>
                      )}
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                        onClick={() => handleDelete(item.id)}
                      />
                    </div>
                  </div>
                )} />
              )}

                {view === 'tasks' && (
                  <List dataSource={items} renderItem={(item: any) => (
                    <div className={`flex items-center gap-3 p-4 rounded-xl mb-3 border transition-all ${item.status === 'completed' ? 'bg-green-50 border-green-100 opacity-70' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <Checkbox checked={item.status === 'completed'} onChange={() => toggleTask(item)} />
                      <span className={`flex-1 text-sm ${item.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-700'}`}>{item.name || item.title}</span>
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                        onClick={() => handleDelete(item.id)}
                      />
                    </div>
                  )} />
                )}

            {view === 'changelogs' && (
              <Timeline items={items.map((log: any) => ({
                color: 'gray',
                children: (
                  <div className="text-xs pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-gray-700">{log.action || 'تغییر'}</span>
                      <span className="text-[10px] text-gray-400">{log.created_at ? dayjs(log.created_at).format('HH:mm - YY/MM/DD') : ''}</span>
                    </div>
                    {log.field_name && (
                      <div className="bg-gray-50 p-2 rounded text-gray-600">
                        تغییر <b>{log.field_name}</b>: <br/>
                        <span className="text-red-400 line-through mr-1">{log.old_value || 'خالی'}</span> 
                        <span className="text-gray-400 mx-1">➜</span>
                        <span className="text-green-600 font-bold">{log.new_value}</span>
                      </div>
                    )}
                  </div>
                )
              }))} />
            )}
      </div>
    </div>
  );
};

export default ActivityPanel;