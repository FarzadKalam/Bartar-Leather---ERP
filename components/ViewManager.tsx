import React, { useState, useEffect } from 'react';
import { Button, Modal, Form, Input, Select, Space, Popconfirm, Tooltip, Badge, Dropdown, Menu } from 'antd';
import { SaveOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SettingOutlined, CheckOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { SavedView } from '../types';

interface ViewManagerProps {
  moduleId: string;
  currentView: SavedView | null;
  onViewChange: (view: SavedView | null) => void;
}

const ViewManager: React.FC<ViewManagerProps> = ({ moduleId, currentView, onViewChange }) => {
  const [views, setViews] = useState<SavedView[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();
  
  const moduleConfig = MODULES[moduleId];

  // --- FIX: این خط جلوی کرش کردن و صفحه سفید را می‌گیرد ---
  if (!moduleConfig) {
    return null; 
  }

  // دریافت ویوها از دیتابیس
  useEffect(() => {
    fetchViews();
  }, [moduleId]);

  const fetchViews = async () => {
    const { data } = await supabase.from('saved_views').select('*').eq('module_id', moduleId);
    if (data) setViews(data);
  };

  const handleSaveView = async (values: any) => {
    // اینجا منطق ذخیره فیلترهای فعلی را باید پیاده‌سازی کنی
    // فعلاً فقط نام را ذخیره می‌کنیم
    const payload = {
      module_id: moduleId,
      name: values.name,
      filters: {}, // در آینده: فیلترهای فعلی صفحه را اینجا پاس بده
      sorters: {},
      is_public: false
    };

    const { data, error } = await supabase.from('saved_views').insert([payload]).select().single();
    if (!error && data) {
      setViews([...views, data]);
      setIsModalOpen(false);
      form.resetFields();
      onViewChange(data);
    }
  };

  const handleDeleteView = async (id: string) => {
    await supabase.from('saved_views').delete().eq('id', id);
    setViews(views.filter(v => v.id !== id));
    if (currentView?.id === id) onViewChange(null);
  };

  return (
    <div className="flex items-center gap-2 mb-4 bg-gray-50 dark:bg-white/5 p-2 rounded-xl border border-gray-200 dark:border-gray-800">
      <span className="text-xs text-gray-500 ml-2">نماهای ذخیره شده:</span>
      
      {/* دکمه پیش‌فرض */}
      <Button 
        size="small" 
        type={!currentView ? 'primary' : 'text'} 
        className={!currentView ? 'bg-gray-500' : ''}
        onClick={() => onViewChange(null)}
      >
        همه
      </Button>

      {/* لیست ویوهای ذخیره شده */}
      {views.map(view => (
        <div key={view.id} className="group relative">
           <Button 
             size="small"
             type={currentView?.id === view.id ? 'primary' : 'default'}
             className={currentView?.id === view.id ? 'bg-leather-600' : ''}
             onClick={() => onViewChange(view)}
           >
             {view.name}
           </Button>
           <Popconfirm title="حذف نما؟" onConfirm={() => handleDeleteView(view.id)}>
              <DeleteOutlined className="absolute -top-2 -left-1 text-[10px] text-red-500 opacity-0 group-hover:opacity-100 cursor-pointer bg-white rounded-full p-0.5 shadow-sm" />
           </Popconfirm>
        </div>
      ))}

      <div className="border-r border-gray-300 mx-2 h-4"></div>

      <Tooltip title="ذخیره فیلترهای فعلی به عنوان نمای جدید">
        <Button size="small" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            نمای جدید
        </Button>
      </Tooltip>

      <Modal title="ذخیره نمای جدید" open={isModalOpen} onCancel={() => setIsModalOpen(false)} footer={null}>
        <Form form={form} onFinish={handleSaveView} layout="vertical">
          <Form.Item name="name" label="نام نما" rules={[{ required: true }]}>
            <Input placeholder="مثلاً: مشتریان VIP" />
          </Form.Item>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setIsModalOpen(false)}>انصراف</Button>
            <Button type="primary" htmlType="submit">ذخیره</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ViewManager;