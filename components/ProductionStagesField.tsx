import React, { useEffect, useState } from 'react';
import { Popover, Button, Tooltip, Modal, Form, Input, message, Tag, Spin, Select, InputNumber, Space } from 'antd';
import { DatePicker as JalaliDatePicker } from 'antd-jalali';
import { PlusOutlined, ClockCircleOutlined, UserOutlined, ArrowRightOutlined, OrderedListOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
// ایمپورت توابع فرمت‌کننده شما
import { toPersianNumber, safeJalaliFormat, parseDateValue } from '../utils/persianNumberFormatter';
import { jalaliDatePickerLocale } from '../utils/jalaliLocale';

interface ProductionStagesFieldProps {
  recordId?: string;
  readOnly?: boolean;
  compact?: boolean;
}

const ProductionStagesField: React.FC<ProductionStagesFieldProps> = ({ recordId, readOnly = false, compact = false }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<{users: any[], roles: any[]}>({ users: [], roles: [] });
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  // 1. دریافت کاربران و تیم‌ها
  const fetchAssignees = async () => {
      try {
          const { data: users } = await supabase.from('profiles').select('id, full_name');
          const { data: roles } = await supabase.from('org_roles').select('id, title'); 
          setAssignees({ 
              users: users || [], 
              roles: roles || [] 
          });
      } catch (e) {
          console.error("Error fetching assignees", e);
      }
  };

  const fetchTasks = async () => {
    if (!recordId) return;
    try {
      setLoading(true);
      
      // تلاش برای دریافت با مرتب‌سازی
      try {
          const { data, error } = await supabase
            .from('tasks')
            .select(`
      *, 
      assignee:profiles!tasks_assignee_id_fkey(full_name, avatar_url),
      assigned_role:org_roles(title)  
  `)
            .eq('related_production_order', recordId)
            .order('sort_order', { ascending: true }); // اعداد کمتر سمت راست

          if (error) throw error;
          setTasks(data || []);
      } catch (sortError: any) {
          // فال‌بک اگر هنوز کش رفرش نشده باشد
          console.warn('Sort fallback used');
          const { data } = await supabase
            .from('tasks')
            .select(`*, assignee:profiles!tasks_assignee_id_fkey(full_name, avatar_url)`) 
            .eq('related_production_order', recordId)
            .order('created_at', { ascending: true });
          setTasks(data || []);
      }
      
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    if (isModalOpen) fetchAssignees();
  }, [recordId, isModalOpen]);

  const handleAddTask = async (values: any) => {
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
        related_production_order: recordId,
        related_to_module: 'production_orders',
        assignee_id: assigneeType === 'user' ? assigneeId : null,
        assignee_role_id: assigneeType === 'role' ? assigneeId : null,
        assignee_type: assigneeType,
        // ذخیره تاریخ به فرمت استاندارد میلادی
        due_date: values.due_date ? values.due_date.format('YYYY-MM-DD HH:mm:ss') : null,
        sort_order: values.sort_order || ((tasks.length + 1) * 10),
        created_by: user?.id,
      };

      const { error } = await supabase.from('tasks').insert(payload);

      if (error) throw error;
      message.success('مرحله جدید اضافه شد');
      setIsModalOpen(false);
      form.resetFields();
      fetchTasks();
    } catch (error: any) {
      message.error(`خطا: ${error.message}`);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
        const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId);
        if (error) throw error;
        message.success('وضعیت بروز شد');
        fetchTasks();
    } catch (err: any) {
        message.error('خطا');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': case 'completed': return '#10b981'; 
      case 'review': return '#f97316'; 
      case 'in_progress': return '#3b82f6'; 
      case 'todo': case 'pending': return '#ef4444'; 
      default: return '#9ca3af';
    }
  };

  const getAssigneeLabel = (task: any) => {
    // اگر به نقش اختصاص داده شده
    if (task.assignee_role_id && task.assigned_role) {
        return `تیم ${task.assigned_role.title}`;
    }
    // اگر به کاربر اختصاص داده شده
    if (task.assignee_id && task.assignee) {
        return task.assignee.full_name;
    }
    return 'تعیین نشده';
};

  // 👇 اصلاح شده: تابع نمایش تاریخ
  const renderDate = (dateVal: any) => {
      if (!dateVal) return null;
      // تبدیل به Dayjs ابتدا
      const dayjsValue = parseDateValue(dateVal);
      if (!dayjsValue) return null;
      // فرمت کردن به شمسی
      const formatted = safeJalaliFormat(dayjsValue, 'YYYY/MM/DD HH:mm');
      return formatted ? toPersianNumber(formatted) : null;
  };

  const renderPopupContent = (task: any) => (
    <div className="w-72 p-1 font-['Vazirmatn']">
      <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
        <h4 className="font-bold text-gray-800 m-0 text-sm line-clamp-2">{task.title || task.name}</h4>
      </div>
      
      <div className="space-y-3 mb-3">
        <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">وضعیت:</span>
            <Select 
                size="small"
                value={task.status}
                onChange={(val) => handleStatusChange(task.id, val)}
                className="w-36"
                getPopupContainer={(trigger) => document.body}
                dropdownStyle={{ zIndex: 10050 }} 
                options={[
                    { value: 'todo', label: 'انجام نشده' },
                    { value: 'in_progress', label: 'در حال انجام' },
                    { value: 'review', label: 'بازبینی' },
                    { value: 'done', label: 'تکمیل شده' },
                ]}
            />
        </div>

        <div className="bg-gray-50 p-2 rounded-lg border border-gray-100 space-y-2 text-xs text-gray-600">
            <div className="flex items-center gap-2">
                <OrderedListOutlined className="text-amber-700" />
                <span>ترتیب: {toPersianNumber(task.sort_order || '-')}</span>
            </div>
            <div className="flex items-center gap-2">
                {task.assignee_type === 'role' ? <TeamOutlined className="text-amber-700"/> : <UserOutlined className="text-amber-700" />}
                <span>مسئول: {getAssigneeLabel(task)}</span>
            </div>
            {task.due_date && (
               <div className="flex items-center gap-2">
                 <ClockCircleOutlined className="text-amber-700" />
                 {/* استفاده از تابع اصلاح شده */}
                 <span>موعد: {renderDate(task.due_date)}</span>
               </div>
            )}
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Link to={`/tasks/${task.id}`} target="_blank">
            <Button size="small" type="link" icon={<ArrowRightOutlined />} className="text-xs text-amber-700 hover:text-amber-600">
            جزئیات کامل
            </Button>
        </Link>
      </div>
    </div>
  );

  if (!recordId && !readOnly) return <div className="text-gray-400 text-xs py-2 bg-gray-50 rounded px-2 text-center border border-dashed">برای تعریف مراحل، ابتدا سفارش را ثبت کنید.</div>;
  
  if (loading && tasks.length === 0) return <div className="flex justify-center p-2"><Spin size="small" /></div>;

  return (
    <div className="w-full flex items-center gap-2 select-none" dir="rtl">
      <div className={`flex-1 flex bg-gray-100 rounded-lg overflow-hidden border border-gray-200 ${compact ? 'h-5' : 'h-9'}`}>
        {tasks.map((task, index) => (
          <Popover 
            key={task.id} 
            content={renderPopupContent(task)} 
            trigger={compact ? "hover" : "click"}
            overlayStyle={{ zIndex: 10000 }}
            title={null}
          >
            <div 
              className={`
                relative flex items-center justify-center cursor-pointer transition-all hover:brightness-110 group
                ${index !== 0 ? 'border-r border-white/30' : ''} 
              `}
              style={{ flex: 1, backgroundColor: getStatusColor(task.status) }}
            >
              <div className="flex flex-col items-center justify-center w-full px-1 overflow-hidden">
                 <span className={`text-white font-medium truncate w-full text-center drop-shadow-md ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
                    {task.title || task.name}
                 </span>
                 {!compact && task.sort_order && (
                     <span className="text-[8px] text-white/90 absolute bottom-0.5 right-1 bg-black/10 px-1 rounded-sm">
                        {toPersianNumber(task.sort_order)}
                     </span>
                 )}
              </div>
            </div>
          </Popover>
        ))}
        {tasks.length === 0 && (
            <div className="w-full flex items-center justify-center text-gray-400 text-xs bg-gray-50 h-full">
                {compact ? <span className="opacity-50">-</span> : 'بدون مرحله تولید'}
            </div>
        )}
      </div>

      {!readOnly && (
        <Tooltip title="افزودن مرحله جدید">
          <Button 
            type="dashed" 
            shape="circle" 
            icon={<PlusOutlined />} 
            size={compact ? 'small' : 'middle'}
            onClick={() => setIsModalOpen(true)}
            className="flex-shrink-0 border-amber-300 text-amber-700 hover:!border-amber-600 hover:!text-amber-600 hover:!bg-amber-50"
          />
        </Tooltip>
      )}

      {/* مودال افزودن */}
      <Modal
        title={<div className="flex items-center gap-2 text-amber-800"><div className="bg-amber-50 p-1 rounded text-amber-600"><PlusOutlined /></div> افزودن مرحله تولید</div>}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        zIndex={10001}
        width={480}
        centered
        destroyOnClose 
      >
        <Form form={form} onFinish={handleAddTask} layout="vertical" className="pt-2">
          
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
                <Form.Item name="due_date" label="موعد انجام">
                    <JalaliDatePicker 
                        className="w-full" 
                        locale={jalaliDatePickerLocale} 
                        placeholder="تاریخ و ساعت" 
                        showTime={{ format: 'HH:mm' }} 
                        format="YYYY-MM-DD HH:mm"
                    />
                </Form.Item>
             </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" loading={loading} className="rounded-lg bg-amber-700 hover:!bg-amber-600 border-none shadow-md">
                ثبت مرحله
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductionStagesField;