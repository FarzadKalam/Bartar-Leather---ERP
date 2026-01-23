import React, { useState, useEffect } from 'react';
import { List, Input, Button, Checkbox, Timeline, message, Empty, Spin } from 'antd';
import { SendOutlined, PlusOutlined } from '@ant-design/icons'; // <--- فیکس ارور ایمپورت
import { supabase } from '../../supabaseClient';
import dayjs from 'dayjs';

interface ActivityPanelProps {
  moduleId: string;
  recordId: string;
  view: 'notes' | 'tasks' | 'changelogs'; // <--- ورودی جدید برای تعیین نوع نمایش
}

const ActivityPanel: React.FC<ActivityPanelProps> = ({ moduleId, recordId, view }) => {
  const [items, setItems] = useState<any[]>([]);
  const [newItem, setNewItem] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [moduleId, recordId, view]);

  const fetchData = async () => {
    setLoading(true);
    const table = view === 'notes' ? 'notes' : view === 'tasks' ? 'tasks' : 'changelogs';
    const { data } = await supabase
        .from(table)
        .select('*')
        .eq('module_id', moduleId)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false });
    
    if (data) setItems(data);
    setLoading(false);
  };

  const handleSubmit = async () => {
      if (!newItem.trim()) return;
      
      if (view === 'notes') {
          await supabase.from('notes').insert([{ module_id: moduleId, record_id: recordId, content: newItem }]);
          message.success('یادداشت ثبت شد');
      } else if (view === 'tasks') {
          await supabase.from('tasks').insert([{ module_id: moduleId, record_id: recordId, title: newItem }]);
          message.success('وظیفه ایجاد شد');
      }
      setNewItem('');
      fetchData();
  };

  const toggleTask = async (task: any) => {
      await supabase.from('tasks').update({ is_completed: !task.is_completed }).eq('id', task.id);
      fetchData();
  };

  if (loading && items.length === 0) return <div className="flex justify-center p-10"><Spin /></div>;

  return (
    <div className="h-full flex flex-col">
      {/* فقط برای یادداشت و وظایف ورودی داریم */}
      {view !== 'changelogs' && (
          <div className="flex gap-2 mb-6">
              {view === 'notes' ? (
                  <Input.TextArea 
                    placeholder="یادداشت جدید..." 
                    value={newItem} 
                    onChange={e => setNewItem(e.target.value)} 
                    autoSize={{ minRows: 2, maxRows: 4 }} 
                    className="rounded-lg border-gray-300"
                  />
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
                          <span>{dayjs(item.created_at).format('YYYY/MM/DD HH:mm')}</span>
                      </div>
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{item.content}</div>
                  </div>
              )} />
          )}

          {view === 'tasks' && (
              <List dataSource={items} renderItem={(item: any) => (
                  <div className={`flex items-center gap-3 p-4 rounded-xl mb-3 border transition-all ${item.is_completed ? 'bg-green-50 border-green-100 opacity-60' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <Checkbox checked={item.is_completed} onChange={() => toggleTask(item)} />
                      <span className={`flex-1 text-sm ${item.is_completed ? 'line-through text-gray-500' : 'text-gray-700'}`}>{item.title}</span>
                  </div>
              )} />
          )}

          {view === 'changelogs' && (
              <Timeline items={items.map((log: any) => ({
                  color: 'gray',
                  children: (
                      <div className="text-xs pb-4">
                          <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-gray-700">{log.action === 'create' ? 'ایجاد رکورد' : log.action === 'update' ? 'ویرایش' : 'حذف'}</span>
                              <span className="text-[10px] text-gray-400">{dayjs(log.created_at).format('HH:mm - YY/MM/DD')}</span>
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