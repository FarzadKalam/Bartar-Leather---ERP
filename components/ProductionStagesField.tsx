import React, { useEffect, useState } from 'react';
import { Popover, Button, Avatar, Tooltip, Modal, Form, Input, Select, DatePicker, message, Tag } from 'antd';
import { PlusOutlined, CheckCircleOutlined, SyncOutlined, ClockCircleOutlined, UserOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { toPersianNumber } from '../utils/persianNumberFormatter';

interface ProductionStagesFieldProps {
  recordId?: string; // شناسه سفارش تولید
  readOnly?: boolean; // برای حالت لیست یا نمایش فقط خواندنی
  compact?: boolean; // برای حالت لیست (کوچک‌تر)
}

const ProductionStagesField: React.FC<ProductionStagesFieldProps> = ({ recordId, readOnly = false, compact = false }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  // دریافت لیست وظایف مرتبط با این سفارش
  const fetchTasks = async () => {
    if (!recordId) return;
    try {
      setLoading(true);
      // فرض بر این است که در جدول tasks ستونی به نام related_record_id دارید
      // و ستون related_module برابر 'production_orders' است
      const { data, error } = await supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(full_name, avatar_url)')        .eq('related_production_order', recordId)
        .order('created_at', { ascending: true }); // ترتیب بر اساس زمان ایجاد

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [recordId]);

  // افزودن مرحله جدید (تسک جدید)
  const handleAddTask = async (values: any) => {
    try {
      const { error } = await supabase.from('tasks').insert({
        name: values.title,
        status: 'todo', // پیش‌فرض
        related_production_order: recordId,
        related_to_module: 'production_orders',
        // سایر فیلدها...
      });

      if (error) throw error;
      message.success('مرحله جدید اضافه شد');
      setIsModalOpen(false);
      form.resetFields();
      fetchTasks();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // تعیین رنگ وضعیت
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981'; // سبز
      case 'in_progress': return '#3b82f6'; // آبی
      case 'pending': return '#e5e7eb'; // خاکستری
      case 'blocked': return '#ef4444'; // قرمز
      default: return '#e5e7eb';
    }
  };

  // تعیین آیکون وضعیت
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined />;
      case 'in_progress': return <SyncOutlined spin />;
      default: return <ClockCircleOutlined />;
    }
  };

  // محتوای پاپ‌آپ برای هر مرحله
  const renderPopupContent = (task: any) => (
    <div className="w-64 p-1">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-gray-800 m-0">{task.title}</h4>
        <Tag color={getStatusColor(task.status)} className="mr-2">
          {task.status === 'completed' ? 'تکمیل' : task.status === 'in_progress' ? 'در حال انجام' : 'منتظر'}
        </Tag>
      </div>
      
      <div className="text-sm text-gray-500 mb-3 space-y-1">
        <div className="flex items-center gap-2">
          <UserOutlined />
          <span>مسئول: {task.assignee?.full_name || 'تعیین نشده'}</span>
        </div>
        {task.due_date && (
           <div className="flex items-center gap-2">
             <ClockCircleOutlined />
             <span>موعد: {toPersianNumber(dayjs(task.due_date).format('YYYY/MM/DD'))}</span>
           </div>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-gray-100">
        <Link to={`/modules/tasks/${task.id}`}>
            <Button size="small" type="link" icon={<ArrowRightOutlined />}>
            مشاهده کامل وظیفه
            </Button>
        </Link>
      </div>
    </div>
  );

  if (!recordId) return <div className="text-gray-400 text-xs">برای مشاهده مراحل، ابتدا رکورد را ذخیره کنید.</div>;

  return (
    <div className="w-full flex items-center gap-1 select-none">
      {/* نوار مراحل */}
      <div className={`flex-1 flex bg-gray-100 rounded-full overflow-hidden ${compact ? 'h-2' : 'h-8'}`}>
        {tasks.map((task, index) => (
          <Popover 
            key={task.id} 
            content={renderPopupContent(task)} 
            trigger="click"
            overlayStyle={{ zIndex: 10000 }} // بالاتر از همه
          >
            <div 
              className={`
                relative flex items-center justify-center cursor-pointer transition-all hover:opacity-90 group
                ${compact ? '' : 'border-l border-white/20'}
              `}
              style={{ 
                flex: 1, 
                backgroundColor: getStatusColor(task.status),
                color: task.status === 'انجام نشده' ? '#6b7280' : 'white'
              }}
            >
              {!compact && (
                <span className="text-xs font-medium truncate px-2">
                  {task.title}
                </span>
              )}
            </div>
          </Popover>
        ))}
        
        {/* اگر تسکی نباشد */}
        {tasks.length === 0 && (
            <div className="w-full flex items-center justify-center text-gray-400 text-xs">
                هنوز مرحله‌ای تعریف نشده
            </div>
        )}
      </div>

      {/* دکمه افزودن (+) */}
      {!readOnly && (
        <Tooltip title="افزودن مرحله جدید">
          <Button 
            type="dashed" 
            shape="circle" 
            icon={<PlusOutlined />} 
            size={compact ? 'small' : 'middle'}
            onClick={() => setIsModalOpen(true)}
            className="border-leather-300 text-leather-600 hover:!border-leather-500 hover:!text-leather-500"
          />
        </Tooltip>
      )}

      {/* مودال ایجاد سریع مرحله */}
      <Modal
        title="افزودن مرحله تولید (وظیفه)"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        zIndex={10001}
      >
        <Form form={form} onFinish={handleAddTask} layout="vertical">
          <Form.Item name="title" label="عنوان مرحله" rules={[{ required: true }]}>
            <Input placeholder="مثلا: برشکاری چرم" autoFocus />
          </Form.Item>
          {/* اینجا می‌توانید فیلدهای بیشتری مثل مسئول و تاریخ اضافه کنید */}
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={() => setIsModalOpen(false)}>انصراف</Button>
            <Button type="primary" htmlType="submit">ایجاد</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductionStagesField;