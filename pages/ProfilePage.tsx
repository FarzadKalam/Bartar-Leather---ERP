import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Avatar, Button, Tag, Spin, Tabs, Statistic, Descriptions, message, Badge 
} from 'antd';
import { 
  UserOutlined, ArrowRightOutlined, CheckCircleOutlined, 
  CloseCircleOutlined, IdcardOutlined, SafetyCertificateOutlined, EditOutlined 
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import dayjs from 'dayjs';
import { profilesModule } from '../modules/profilesConfig'; // کانفیگ جدید را ایمپورت کنید
import { FieldType, FieldDef } from '../types';
import { toPersianNumber, safeJalaliFormat, parseDateValue } from '../utils/persianNumberFormatter';

const ProfilePage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, [id]);

  const fetchProfile = async () => {
    setLoading(true);
    let userId = id;
    let userEmail = '';

    // 1. دریافت شناسه و ایمیل کاربر (چه لاگین شده چه از پارامتر)
    if (!userId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            userId = user.id;
            userEmail = user.email || '';
        }
    } else {
        // اگر داریم پروفایل کس دیگری را می‌بینیم، باید ایمیلش را جداگانه بگیریم (اگر ادمین باشیم)
        // فعلا فرض می‌کنیم ایمیل فقط برای خود کاربر در دسترس است یا در پروفایل ذخیره شده
    }

    if (userId) {
        // 2. دریافت اطلاعات از جدول پروفایل + سازمان
        const { data, error } = await supabase
            .from(profilesModule.table)
            .select(`
                *,
                organizations (name)
            `)
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            message.error('خطا در دریافت پروفایل');
        } else {
            // 3. ترکیب داده‌ها (ایمیل را به دیتای پروفایل اضافه می‌کنیم تا ماژولار نمایش داده شود)
            setRecord({
                ...data,
                email: userEmail || data.email, // اولویت با ایمیل جدول Auth
                // هندل کردن رابطه‌ها برای دسترسی راحت‌تر
                organizations: Array.isArray(data.organizations) ? data.organizations[0] : data.organizations
            });
        }
    }
    setLoading(false);
  };

  // --- تابع رندر کننده هوشمند فیلدها ---
  const renderFieldValue = (field: FieldDef, value: any, allData: any) => {
    if (value === null || value === undefined || value === '') return <span className="text-gray-400">---</span>;

    switch (field.type) {
        case FieldType.BOOLEAN:
            return value ? 
                <Tag color="green" icon={<CheckCircleOutlined />}>فعال</Tag> : 
                <Tag color="red" icon={<CloseCircleOutlined />}>غیرفعال</Tag>;
        
        case FieldType.DATE:
            const dayjsValue = parseDateValue(value);
            if (!dayjsValue) return <span dir="ltr">-</span>;
            const formatted = safeJalaliFormat(dayjsValue, 'YYYY/MM/DD');
            return <span dir="ltr">{toPersianNumber(formatted || '-')}</span>;

        case FieldType.RELATION:
            // خواندن نام از جدول جوین شده (مثلاً organizations.name)
            const relData = allData[field.relation?.table || ''];
            const displayVal = relData ? relData[field.relation?.displayKey || 'name'] : value;
            return <span className="font-medium text-leather-600 dark:text-leather-400">{displayVal}</span>;

        case FieldType.SELECT:
            const option = field.options?.find(opt => opt.value === value);
            return option ? <Tag color={option.color}>{option.label}</Tag> : value;

        default: // TEXT, etc.
            return <span className="text-gray-700 dark:text-gray-300">{value}</span>;
    }
  };

  if (loading) return <div className="flex h-screen items-center justify-center"><Spin size="large" /></div>;
  if (!record) return null;

  // جدا کردن فیلدهای اصلی برای نمایش در کارت هدر
  const mainFields = profilesModule.fields.filter(f => ['full_name', 'job_title', 'is_active'].includes(f.key));
  // بقیه فیلدها برای نمایش در تب جزئیات
  const detailFields = profilesModule.fields.filter(f => !['full_name', 'job_title', 'is_active'].includes(f.key));

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 animate-fadeIn">
      {/* هدر و دکمه بازگشت */}
      <div className="flex items-center justify-between mb-6">
        <Button 
            icon={<ArrowRightOutlined />} 
            type="text" 
            className="text-gray-600 dark:text-gray-300" 
            onClick={() => navigate(-1)}
        >
            بازگشت
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* --- ستون سمت چپ: خلاصه پروفایل --- */}
        <div className="lg:col-span-1">
            <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] text-center shadow-sm border border-gray-200 dark:border-gray-800 relative overflow-hidden sticky top-24 pb-8">
                <div className="h-32 bg-gradient-to-br from-leather-600 to-leather-800 relative"></div>

                <div className="px-6 relative -mt-16">
                    <Avatar 
                        size={128} 
                        src={record.avatar_url} 
                        icon={<UserOutlined />} 
                        className="bg-white border-4 border-white dark:border-[#1a1a1a] shadow-xl text-leather-500 text-5xl mb-4"
                    >
                        {record.full_name?.[0]?.toUpperCase()}
                    </Avatar>

                    {/* نمایش فیلدهای اصلی (نام، شغل، وضعیت) */}
                    <h1 className="text-2xl font-black text-gray-800 dark:text-white mb-1">
                        {record.full_name || 'کاربر'}
                    </h1>
                    <p className="text-leather-500 font-medium mb-2">
                        {record.job_title}
                    </p>
                    <div className="mb-6">
                        {renderFieldValue(profilesModule.fields.find(f => f.key === 'is_active')!, record.is_active, record)}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Button type="primary" icon={<EditOutlined />} className="bg-leather-500 rounded-xl">ویرایش</Button>
                        <Button className="rounded-xl dark:bg-white/5 dark:text-gray-300">تغییر رمز</Button>
                    </div>
                </div>
            </div>
        </div>

        {/* --- ستون سمت راست: جزئیات کامل (رندر داینامیک) --- */}
        <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatisticCard title="سابقه فعالیت" value={dayjs().diff(dayjs(record.created_at), 'day')} suffix=" روز" />
                <StatisticCard title="نقش سیستم" value={renderFieldValue(profilesModule.fields.find(f => f.key === 'role')!, record.role, record)} />
            </div>

            <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 shadow-sm border border-gray-200 dark:border-gray-800 min-h-[400px]">
                <Tabs 
                    items={[
                        {
                            key: '1',
                            label: <span><IdcardOutlined /> مشخصات فردی و سازمانی</span>,
                            children: (
                                <div className="mt-6">
                                    <Descriptions 
                                        bordered 
                                        column={1} 
                                        className="custom-descriptions"
                                    >
                                        {/* حلقه روی تمام فیلدها برای ساخت سطرها */}
                                        {detailFields.map(field => (
                                            <Descriptions.Item key={field.key} label={field.label}>
                                                {renderFieldValue(field, record[field.key], record)}
                                            </Descriptions.Item>
                                        ))}
                                    </Descriptions>
                                </div>
                            )
                        },
                        {
                            key: '2',
                            label: <span><SafetyCertificateOutlined /> امنیت</span>,
                            children: <div className="py-10 text-center text-gray-400">اطلاعات امنیتی</div>
                        }
                    ]} 
                />
            </div>
        </div>
      </div>

      <style>{`
        .dark .custom-descriptions .ant-descriptions-item-label { background-color: #262626; color: #aaa; border-color: #303030; }
        .dark .custom-descriptions .ant-descriptions-item-content { background-color: #1a1a1a; color: #ddd; border-color: #303030; }
        .dark .custom-descriptions .ant-descriptions-view { border-color: #303030; }
      `}</style>
    </div>
  );
};

const StatisticCard = ({ title, value, suffix }: any) => (
    <div className="bg-white dark:bg-[#1a1a1a] p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col items-center justify-center">
        <span className="text-gray-500 dark:text-gray-400 text-sm mb-2">{title}</span>
        <div className="text-lg font-bold text-gray-800 dark:text-white">
            {value} <span className="text-sm text-gray-400 font-normal">{suffix}</span>
        </div>
    </div>
);

export default ProfilePage;