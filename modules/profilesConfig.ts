import { ModuleDef, FieldType } from '../types'; // مسیر types را چک کنید

export const profilesModule: ModuleDef = {
  id: 'profiles',
  titles: { fa: 'پروفایل کاربری', en: 'User Profile' },
  table: 'profiles',
  fields: [
    // --- فیلدهای اصلی (هدر) ---
    { 
      key: 'full_name', 
      label: 'نام و نام خانوادگی', 
      type: FieldType.TEXT, 
      isMain: true 
    },
    { 
      key: 'job_title', 
      label: 'عنوان شغلی', 
      type: FieldType.TEXT 
    },
    { 
      key: 'is_active', 
      label: 'وضعیت حساب', 
      type: FieldType.BOOLEAN 
    },
    
    // --- فیلدهای تماس و سازمانی ---
    { 
      key: 'mobile', 
      label: 'شماره موبایل', 
      type: FieldType.TEXT 
    },
    { 
      key: 'email', 
      label: 'ایمیل', 
      type: FieldType.TEXT 
      // نکته: این فیلد مجازی است و از جدول auth پر می‌شود
    },
    { 
      key: 'org_id', 
      label: 'سازمان', 
      type: FieldType.RELATION,
      relation: { 
        table: 'organizations', 
        toKey: 'id', 
        displayKey: 'name' 
      }
    },
    {
      key: 'role',
      label: 'نقش کاربری',
      type: FieldType.SELECT,
      options: [
        { label: 'مدیر کل سیستم', value: 'super_admin', color: 'gold' },
        { label: 'مدیر داخلی', value: 'admin', color: 'blue' },
        { label: 'کارمند', value: 'employee', color: 'cyan' },
        { label: 'بازدیدکننده', value: 'viewer', color: 'default' },
      ]
    },

    // --- اطلاعات تکمیلی ---
    { 
      key: 'bio', 
      label: 'درباره من', 
      type: FieldType.TEXT 
    },
    { 
      key: 'created_at', 
      label: 'تاریخ عضویت', 
      type: FieldType.DATE 
    }
  ]
};