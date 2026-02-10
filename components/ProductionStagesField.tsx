import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Popover, Button, Tooltip, Modal, Form, Input, message, Spin, Select, InputNumber, Space } from 'antd';
import { PlusOutlined, ClockCircleOutlined, UserOutlined, ArrowRightOutlined, OrderedListOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import PersianDatePicker from './PersianDatePicker';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';

interface ProductionStagesFieldProps {
  recordId?: string;
  readOnly?: boolean;
  compact?: boolean;
  onQuantityChange?: (qty: number) => void;
  orderStatus?: string | null;
}

const ProductionStagesField: React.FC<ProductionStagesFieldProps> = ({ recordId, readOnly = false, compact = false, onQuantityChange, orderStatus }) => {
  const [lines, setLines] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assignees, setAssignees] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [loading, setLoading] = useState(false);
  const [isLineModalOpen, setIsLineModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [lineForm] = Form.useForm();
  const [taskForm] = Form.useForm();

  const onQuantityChangeRef = useRef<((qty: number) => void) | undefined>();

  useEffect(() => {
    onQuantityChangeRef.current = onQuantityChange;
  }, [onQuantityChange]);

  const fetchAssignees = async () => {
    try {
      const { data: users } = await supabase.from('profiles').select('id, full_name');
      const { data: roles } = await supabase.from('org_roles').select('id, title');
      setAssignees({ users: users || [], roles: roles || [] });
    } catch (e) {
      console.error('Error fetching assignees', e);
    }
  };

  const fetchLines = async () => {
    if (!recordId) return;
    try {
      const { data, error } = await supabase
        .from('production_lines')
        .select('*')
        .eq('production_order_id', recordId)
        .order('line_no', { ascending: true });
      if (error) throw error;
      setLines(data || []);
    } catch (error) {
      console.error('Error fetching lines:', error);
    }
  };

  const fetchTasks = async () => {
    if (!recordId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assignee_id_fkey(full_name, avatar_url),
          assigned_role:org_roles(title)
        `)
        .eq('related_production_order', recordId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setTasks(data || []);
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLines();
    fetchTasks();
    if (isTaskModalOpen) fetchAssignees();
  }, [recordId, isTaskModalOpen]);

  const syncOrderQuantity = useCallback(async (nextLines: any[]) => {
    if (!recordId) return;
    const nextTotal = nextLines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0), 0);
    onQuantityChangeRef.current?.(nextTotal);
    const { error } = await supabase
      .from('production_orders')
      .update({ quantity: nextTotal })
      .eq('id', recordId);
    if (error) {
      message.error(`خطا در بروزرسانی تعداد تولید: ${error.message}`);
    }
  }, [recordId]);

  useEffect(() => {
    if (!recordId) return;
    syncOrderQuantity(lines);
  }, [lines, recordId, syncOrderQuantity]);

  const tasksByLine = useMemo(() => {
    const map = new Map<string, any[]>();
    lines.forEach(line => map.set(String(line.id), []));
    tasks.forEach(task => {
      const lineId = task.production_line_id ? String(task.production_line_id) : null;
      if (lineId && map.has(lineId)) {
        map.get(lineId)!.push(task);
      }
    });
    return map;
  }, [lines, tasks]);

  const handleAddLine = async (values: any) => {
    if (!recordId) return;
    try {
      const nextNo = values.line_no || ((lines[lines.length - 1]?.line_no || 0) + 1);
      const payload = {
        production_order_id: recordId,
        line_no: nextNo,
        quantity: values.quantity || 0,
      };
      const { error } = await supabase.from('production_lines').insert(payload);
      if (error) throw error;
      message.success('خط تولید جدید اضافه شد');
      setIsLineModalOpen(false);
      lineForm.resetFields();
      fetchLines();
    } catch (error: any) {
      message.error(`خطا: ${error.message}`);
    }
  };

  const handleLineQuantityChange = async (lineId: string, quantity: number) => {
    try {
      const { error } = await supabase.from('production_lines').update({ quantity }).eq('id', lineId);
      if (error) throw error;
      setLines(prev => prev.map(line => (line.id === lineId ? { ...line, quantity } : line)));
    } catch (err: any) {
      message.error(`خطا: ${err.message}`);
    }
  };

  const handleAddTask = async (values: any) => {
    if (!recordId || !activeLineId) return;
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
        production_line_id: activeLineId,
        assignee_id: assigneeType === 'user' ? assigneeId : null,
        assignee_role_id: assigneeType === 'role' ? assigneeId : null,
        assignee_type: assigneeType,
        due_date: values.due_date || null,
        sort_order: values.sort_order || ((tasks.length + 1) * 10),
        created_by: user?.id,
      };

      const { error } = await supabase.from('tasks').insert(payload);
      if (error) throw error;

      message.success('مرحله جدید اضافه شد');
      setIsTaskModalOpen(false);
      taskForm.resetFields();
      setActiveLineId(null);
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
      case 'done':
      case 'completed':
        return '#10b981';
      case 'review':
        return '#f97316';
      case 'in_progress':
        return '#3b82f6';
      case 'todo':
      case 'pending':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

  const getAssigneeLabel = (task: any) => {
    if (task.assignee_role_id && task.assigned_role) {
      return `تیم ${task.assigned_role.title}`;
    }
    if (task.assignee_id && task.assignee) {
      return task.assignee.full_name;
    }
    return 'تعیین نشده';
  };

  const renderDate = (dateVal: any) => {
    if (!dateVal) return null;
    try {
      const jsDate = new Date(dateVal);
      if (Number.isNaN(jsDate.getTime())) return null;
      const formatted = new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      })
        .convert(persian, persian_fa)
        .format('YYYY/MM/DD HH:mm');
      return formatted ? toPersianNumber(formatted) : null;
    } catch {
      return null;
    }
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
            getPopupContainer={() => document.body}
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
            {task.assignee_type === 'role' ? <TeamOutlined className="text-amber-700" /> : <UserOutlined className="text-amber-700" />}
            <span>مسئول: {getAssigneeLabel(task)}</span>
          </div>
          {task.due_date && (
            <div className="flex items-center gap-2">
              <ClockCircleOutlined className="text-amber-700" />
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

  if (!recordId && !readOnly) {
    return (
      <div className="text-gray-400 text-xs py-2 bg-gray-50 rounded px-2 text-center border border-dashed">
        برای تعریف مراحل، ابتدا سفارش را ثبت کنید.
      </div>
    );
  }

  if (loading && tasks.length === 0) return <div className="flex justify-center p-2"><Spin size="small" /></div>;

  return (
    <div className="w-full flex flex-col gap-4 select-none" dir="rtl">
      {lines.map((line) => {
        const lineTasks = tasksByLine.get(String(line.id)) || [];
        const canEditQuantity = !readOnly && (!orderStatus || orderStatus === 'pending');
        const showInlineQty = !compact || canEditQuantity;
        return (
          <div key={line.id} className="space-y-2">
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span className="font-bold">
                  خط {toPersianNumber(line.line_no)}{compact ? `: ${toPersianNumber(line.quantity || 0)} عدد` : ''}
                </span>
                {showInlineQty && (
                  <div className="flex items-center gap-2">
                    <span>تعداد تولید:</span>
                    <InputNumber
                      min={0}
                      className="w-24"
                      value={line.quantity}
                      onChange={(val) => handleLineQuantityChange(line.id, Number(val) || 0)}
                      disabled={!canEditQuantity}
                    />
                  </div>
                )}
              </div>

            <div className="w-full flex items-center gap-2">
              {!readOnly && (
                <Tooltip title="افزودن مرحله جدید">
                  <Button
                    type="dashed"
                    shape="circle"
                    icon={<PlusOutlined />}
                    size={compact ? 'small' : 'middle'}
                    onClick={() => {
                      setActiveLineId(line.id);
                      setIsTaskModalOpen(true);
                    }}
                    className="flex-shrink-0 border-amber-300 text-amber-700 hover:!border-amber-600 hover:!text-amber-600 hover:!bg-amber-50"
                  />
                </Tooltip>
              )}

              <div className={`flex-1 flex bg-gray-100 rounded-lg overflow-hidden border border-gray-200 ${compact ? 'h-5' : 'h-9'}`}>
                {lineTasks.map((task, index) => (
                  <Popover
                    key={task.id}
                    content={renderPopupContent(task)}
                    trigger={compact ? 'hover' : 'click'}
                    overlayStyle={{ zIndex: 10000 }}
                    title={null}
                  >
                    <div
                      className={`relative flex items-center justify-center cursor-pointer transition-all hover:brightness-110 group ${index !== 0 ? 'border-r border-white/30' : ''}`}
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
                {lineTasks.length === 0 && (
                  <div className="w-full flex items-center justify-center text-gray-400 text-xs bg-gray-50 h-full">
                    {compact ? <span className="opacity-50">-</span> : 'بدون مرحله تولید'}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {lines.length === 0 && (
        <div className="w-full flex items-center justify-center text-gray-400 text-xs bg-gray-50 h-10 rounded">
          بدون خط تولید
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-start">
          <Tooltip title="افزودن خط تولید جدید">
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              size={compact ? 'small' : 'middle'}
              onClick={() => setIsLineModalOpen(true)}
              className="border-amber-300 text-amber-700 hover:!border-amber-600 hover:!text-amber-600 hover:!bg-amber-50"
            >
              افزودن خط
            </Button>
          </Tooltip>
        </div>
      )}

      <Modal
        title="افزودن خط تولید"
        open={isLineModalOpen}
        onCancel={() => setIsLineModalOpen(false)}
        footer={null}
        centered
        destroyOnClose
      >
        <Form form={lineForm} onFinish={handleAddLine} layout="vertical" className="pt-2">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <Form.Item name="line_no" label="شماره خط" initialValue={(lines[lines.length - 1]?.line_no || 0) + 1}>
                <InputNumber className="w-full" min={1} />
              </Form.Item>
            </div>
            <div className="col-span-6">
              <Form.Item name="quantity" label="تعداد تولید" initialValue={0}>
                <InputNumber className="w-full" min={0} />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsLineModalOpen(false)} className="rounded-lg">انصراف</Button>
            <Button type="primary" htmlType="submit" className="rounded-lg bg-amber-700 hover:!bg-amber-600 border-none">
              ثبت خط
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={<div className="flex items-center gap-2 text-amber-800"><div className="bg-amber-50 p-1 rounded text-amber-600"><PlusOutlined /></div> افزودن مرحله تولید</div>}
        open={isTaskModalOpen}
        onCancel={() => setIsTaskModalOpen(false)}
        footer={null}
        zIndex={10001}
        width={480}
        centered
        destroyOnClose
      >
        <Form form={taskForm} onFinish={handleAddTask} layout="vertical" className="pt-2">
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
                <PersianDatePicker
                  type="DATETIME"
                  value={taskForm.getFieldValue('due_date')}
                  onChange={(val) => taskForm.setFieldValue('due_date', val)}
                  placeholder="تاریخ و ساعت"
                  className="w-full"
                />
              </Form.Item>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <Button onClick={() => setIsTaskModalOpen(false)} className="rounded-lg">انصراف</Button>
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
