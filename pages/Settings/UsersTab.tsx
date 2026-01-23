import React, { useEffect, useState } from 'react';
import { Table, Button, Select, message, Switch, Avatar, Drawer, Form, Input, Upload } from 'antd';
import { UserOutlined, PlusOutlined, SaveOutlined, UploadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: usersData } = await supabase.from('profiles').select('*, org_roles(title)');
    const { data: rolesData } = await supabase.from('org_roles').select('*');
    if (usersData) setUsers(usersData);
    if (rolesData) setRoles(rolesData);
    setLoading(false);
  };

  const handleRoleChange = async (userId: string, roleId: string) => {
      const { error } = await supabase.from('profiles').update({ role_id: roleId }).eq('id', userId);
      if (!error) { message.success('نقش کاربر تغییر کرد'); fetchData(); }
  };

  const handleStatusChange = async (userId: string, isActive: boolean) => {
      const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId);
      if (!error) { message.success('وضعیت کاربر تغییر کرد'); fetchData(); }
  };

  const handleAvatarUpload = async (file: File) => {
      try {
          const fileName = `avatar-${Date.now()}.${file.name.split('.').pop()}`;
          const { error } = await supabase.storage.from('images').upload(fileName, file);
          if (error) throw error;
          const { data } = supabase.storage.from('images').getPublicUrl(fileName);
          setAvatarUrl(data.publicUrl);
          return false;
      } catch(e) { message.error('خطا در آپلود عکس'); return false; }
  };

  const handleAddUser = async (values: any) => {
      setSubmitting(true);
      const { error } = await supabase.from('profiles').insert([{
          full_name: values.full_name,
          email: values.email,
          mobile_1: values.mobile,
          role_id: values.role_id,
          avatar_url: avatarUrl,
          is_active: true
      }]);

      if (error) { message.error('خطا: ' + error.message); } 
      else { message.success('کاربر اضافه شد'); setIsDrawerOpen(false); form.resetFields(); setAvatarUrl(null); fetchData(); }
      setSubmitting(false);
  };

  const columns = [
      {
          title: 'کاربر',
          dataIndex: 'full_name',
          key: 'full_name',
          render: (text: string, record: any) => (
              <Link to={`/profile/${record.id}`} className="flex items-center gap-3 group">
                  <Avatar src={record.avatar_url} icon={<UserOutlined />} className="bg-leather-100 text-leather-600 border border-leather-200" size={40} />
                  <div className="flex flex-col">
                      <span className="font-bold text-gray-700 dark:text-gray-200 group-hover:text-leather-600 transition-colors">{text || 'بدون نام'}</span>
                      <span className="text-xs text-gray-400">{record.email}</span>
                  </div>
              </Link>
          )
      },
      {
          title: 'موبایل',
          dataIndex: 'mobile_1',
          key: 'mobile',
          className: 'text-gray-600 dark:text-gray-400 font-mono',
      },
      {
          title: 'جایگاه سازمانی',
          key: 'role',
          render: (_: any, record: any) => (
              <Select
                value={record.role_id}
                style={{ width: 180 }}
                placeholder="انتخاب نقش"
                onChange={(val) => handleRoleChange(record.id, val)}
                options={roles.map(r => ({ label: r.title, value: r.id }))}
                className="custom-select"
              />
          )
      },
      {
          title: 'وضعیت',
          key: 'status',
          render: (_: any, record: any) => (
              <Switch 
                checked={record.is_active} 
                checkedChildren="فعال" 
                unCheckedChildren="غیرفعال"
                onChange={(checked) => handleStatusChange(record.id, checked)}
                className="bg-gray-300"
              />
          )
      }
  ];

  return (
    <div className="py-4">
        <div className="flex justify-end mb-4">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsDrawerOpen(true)} className="bg-leather-600 hover:!bg-leather-500 border-none h-10 px-6">کاربر جدید</Button>
        </div>

        <Table 
            dataSource={users} 
            columns={columns} 
            rowKey="id" 
            loading={loading}
            pagination={{ pageSize: 10 }}
            className="custom-erp-table"
        />

        <Drawer
            title="افزودن کاربر جدید"
            width={500}
            onClose={() => setIsDrawerOpen(false)}
            open={isDrawerOpen}
            zIndex={99999} /* فیکس: اولویت بسیار بالا برای نمایش روی سایدبار */
            styles={{ body: { paddingBottom: 80 } }}
            className="dark:bg-[#141414]"
        >
            <Form form={form} layout="vertical" onFinish={handleAddUser}>
                <div className="flex justify-center mb-6">
                    <div className="text-center">
                        <Avatar size={80} src={avatarUrl} icon={<UserOutlined />} className="mb-2 bg-gray-100" />
                        <Upload showUploadList={false} beforeUpload={handleAvatarUpload}>
                            <Button size="small" icon={<UploadOutlined />}>آپلود عکس</Button>
                        </Upload>
                    </div>
                </div>

                <Form.Item label="نام و نام خانوادگی" name="full_name" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item label="ایمیل" name="email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
                <Form.Item label="شماره موبایل" name="mobile" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item label="جایگاه سازمانی" name="role_id" rules={[{ required: true }]}>
                    <Select placeholder="انتخاب کنید" options={roles.map(r => ({ label: r.title, value: r.id }))} />
                </Form.Item>
                
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-white dark:bg-[#1a1a1a] border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
                    <Button onClick={() => setIsDrawerOpen(false)}>انصراف</Button>
                    <Button type="primary" htmlType="submit" loading={submitting} icon={<SaveOutlined />} className="bg-leather-600 border-none">ثبت کاربر</Button>
                </div>
            </Form>
        </Drawer>

        <style>{`
            .custom-erp-table .ant-table-thead > tr > th { background: #f9fafb !important; color: #6b7280 !important; font-size: 12px !important; }
            .dark .custom-erp-table .ant-table-thead > tr > th { background: #262626 !important; color: #bbb; border-bottom: 1px solid #303030 !important; }
            .dark .ant-table-cell { background: #1a1a1a !important; color: #ddd !important; border-bottom: 1px solid #303030 !important; }
            .dark .ant-table-tbody > tr:hover > td { background: #222 !important; }
            .dark .ant-drawer-content { background-color: #1a1a1a; }
            .dark .ant-drawer-header { border-bottom: 1px solid #303030; color: white; }
            .dark .ant-drawer-title { color: white; }
            .dark .ant-form-item-label > label { color: #ccc; }
            .dark .ant-input, .dark .ant-select-selector { background-color: #262626 !important; border-color: #444 !important; color: white !important; }
        `}</style>
    </div>
  );
};

export default UsersTab;