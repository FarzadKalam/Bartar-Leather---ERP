import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Avatar, Button, Tag, Spin, Tabs, Statistic, Descriptions } from 'antd';
import { UserOutlined, MailOutlined, PhoneOutlined, SafetyCertificateOutlined, CalendarOutlined, ArrowRightOutlined, CheckCircleOutlined } from '@ant-design/icons';
// اصلاح مسیر ایمپورت: فقط یک نقطه چین (../) کافیست
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';

const ProfilePage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [id]);

  const fetchProfile = async () => {
    setLoading(true);
    let userId = id;
    
    // اگر آیدی نبود، فرض می‌کنیم کاربر لاگین شده است
    if (!userId) {
        const { data: currentUser } = await supabase.from('profiles').select('id').limit(1).single();
        if (currentUser) userId = currentUser.id;
    }

    if (userId) {
        const { data } = await supabase.from('profiles').select('*, org_roles(title)').eq('id', userId).single();
        setProfile(data);
    }
    setLoading(false);
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Spin size="large" /></div>;
  if (!profile) return <div className="text-center mt-20 dark:text-gray-400">کاربر یافت نشد</div>;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 animate-fadeIn">
      <Button icon={<ArrowRightOutlined />} type="text" className="mb-4 dark:text-gray-300" onClick={() => navigate(-1)}>بازگشت</Button>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* کارت سمت چپ: اطلاعات اصلی */}
        <div className="md:col-span-1">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 text-center shadow-sm border border-gray-200 dark:border-gray-800 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-leather-500 to-leather-700"></div>
                <div className="relative -mt-10 mb-4">
                    <Avatar 
                        size={120} 
                        src={profile.avatar_url} 
                        icon={<UserOutlined />} 
                        className="bg-white border-4 border-white dark:border-[#1a1a1a] shadow-lg text-leather-500"
                    />
                </div>
                <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0">{profile.full_name}</h1>
                <p className="text-gray-500 dark:text-gray-400 mb-4">{profile.org_roles?.title || 'بدون نقش سازمانی'}</p>
                
                <div className="flex justify-center gap-2 mb-6">
                    <Tag color={profile.is_active ? 'green' : 'red'} icon={profile.is_active ? <CheckCircleOutlined /> : undefined}>
                        {profile.is_active ? 'حساب فعال' : 'حساب غیرفعال'}
                    </Tag>
                </div>

                <div className="text-right space-y-3">
                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-transparent dark:border-gray-800">
                        <MailOutlined className="text-leather-500 text-lg" />
                        <span className="text-sm truncate" title={profile.email}>{profile.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-transparent dark:border-gray-800">
                        <PhoneOutlined className="text-leather-500 text-lg" />
                        <span className="text-sm font-mono">{profile.mobile_1}</span>
                    </div>
                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-white/5 p-3 rounded-xl border border-transparent dark:border-gray-800">
                        <SafetyCertificateOutlined className="text-leather-500 text-lg" />
                        <span className="text-sm">{profile.org_roles?.title || 'دسترسی عادی'}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* محتوای سمت راست: جزئیات */}
        <div className="md:col-span-2">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 shadow-sm border border-gray-200 dark:border-gray-800 min-h-[400px]">
                <Tabs 
                    className="dark:text-gray-200"
                    items={[
                        {
                            key: '1',
                            label: 'عملکرد و آمار',
                            children: (
                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl text-center border border-gray-100 dark:border-gray-800">
                                        <Statistic title={<span className="dark:text-gray-400">تسک‌های تکمیل شده</span>} value={12} valueStyle={{ color: '#d4a373', fontWeight: 'bold' }} />
                                    </div>
                                    <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl text-center border border-gray-100 dark:border-gray-800">
                                        <Statistic title={<span className="dark:text-gray-400">روزهای عضویت</span>} value={dayjs().diff(dayjs(profile.created_at), 'day')} prefix={<CalendarOutlined />} valueStyle={{ color: '#aaa' }} />
                                    </div>
                                </div>
                            )
                        },
                        {
                            key: '2',
                            label: 'اطلاعات تکمیلی',
                            children: (
                                <Descriptions column={1} className="mt-4" bordered>
                                    <Descriptions.Item label="تاریخ ایجاد حساب" labelStyle={{width: '150px'}}>{dayjs(profile.created_at).format('YYYY/MM/DD')}</Descriptions.Item>
                                    <Descriptions.Item label="شماره اضطراری">{profile.mobile_2 || '-'}</Descriptions.Item>
                                    <Descriptions.Item label="بیوگرافی">{profile.bio || '-'}</Descriptions.Item>
                                </Descriptions>
                            )
                        }
                    ]} 
                />
            </div>
        </div>
      </div>
      <style>{`
        .dark .ant-descriptions-item-label { background-color: #262626 !important; color: #aaa !important; border-color: #303030 !important; }
        .dark .ant-descriptions-item-content { background-color: #1a1a1a !important; color: #ddd !important; border-color: #303030 !important; }
        .dark .ant-descriptions-row { border-color: #303030 !important; }
        .dark .ant-descriptions-view { border-color: #303030 !important; }
        .dark .ant-tabs-tab { color: #888; }
        .dark .ant-tabs-tab-active .ant-tabs-tab-btn { color: white !important; }
      `}</style>
    </div>
  );
};

export default ProfilePage;