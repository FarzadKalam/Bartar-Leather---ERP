import { FieldNature, FieldType, ModuleDefinition, ModuleField } from '../types';
import { HARD_CODED_UNIT_OPTIONS } from './unitConversions';

const TEMPLATE_IMPORTABLE_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.LONG_TEXT,
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PERCENTAGE,
  FieldType.CHECKBOX,
  FieldType.STOCK,
  FieldType.SELECT,
  FieldType.MULTI_SELECT,
  FieldType.CHECKLIST,
  FieldType.DATE,
  FieldType.TIME,
  FieldType.DATETIME,
  FieldType.LINK,
  FieldType.RELATION,
  FieldType.USER,
  FieldType.STATUS,
  FieldType.PHONE,
  FieldType.TAGS,
  FieldType.PERCENTAGE_OR_AMOUNT,
]);

export type ExcelTemplateSheet = {
  name: string;
  rows: Array<Record<string, string | number | boolean | null>>;
};

export type ExcelTemplateDefinition = {
  fileName: string;
  sheets: ExcelTemplateSheet[];
};

const cleanSheetName = (name: string): string => {
  const cleaned = String(name || 'Sheet')
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim();
  return (cleaned || 'Sheet').slice(0, 31);
};

const isTemplateFieldImportable = (field: ModuleField): boolean =>
  TEMPLATE_IMPORTABLE_TYPES.has(field.type) &&
  !field.readonly &&
  field.nature !== FieldNature.SYSTEM;

const getImportableFields = (moduleConfig: ModuleDefinition): ModuleField[] =>
  [...moduleConfig.fields]
    .filter(isTemplateFieldImportable)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

const getFieldAllowedValues = (field: ModuleField): string => {
  if (field.options?.length) {
    return field.options.map((option) => `${option.label}=${option.value}`).join(' | ');
  }
  if (field.dynamicOptionsCategory) {
    return `گزینه داینامیک: ${field.dynamicOptionsCategory}`;
  }
  if (field.relationConfig?.targetModule) {
    return `رابطه با ${field.relationConfig.targetModule} (${field.relationConfig.targetField || 'name'})`;
  }
  return '';
};

const getSampleValue = (field: ModuleField): string | number | boolean => {
  if (field.defaultValue !== undefined && field.defaultValue !== null) return String(field.defaultValue);
  if (field.options?.length) return String(field.options[0].label || field.options[0].value);

  switch (field.type) {
    case FieldType.NUMBER:
    case FieldType.STOCK:
    case FieldType.PERCENTAGE:
      return 1;
    case FieldType.PRICE:
    case FieldType.PERCENTAGE_OR_AMOUNT:
      return 100000;
    case FieldType.CHECKBOX:
      return 'بله';
    case FieldType.DATE:
      return '2026-01-01';
    case FieldType.DATETIME:
      return '2026-01-01 10:00';
    case FieldType.TIME:
      return '10:00';
    case FieldType.PHONE:
      return '09120000000';
    case FieldType.MULTI_SELECT:
    case FieldType.CHECKLIST:
    case FieldType.TAGS:
      return 'نمونه 1، نمونه 2';
    case FieldType.RELATION:
      return `نام یا کد ${field.labels.fa}`;
    default:
      return `نمونه ${field.labels.fa}`;
  }
};

const buildGuideRows = (fields: ModuleField[]) =>
  fields.map((field) => ({
    'نام ستون': field.labels.fa,
    'کلید فیلد': field.key,
    'نوع داده': field.type,
    'اجباری': field.validation?.required ? 'بله' : 'خیر',
    'نمونه مقدار': getSampleValue(field),
    'مقادیر مجاز / راهنما': getFieldAllowedValues(field),
  }));

export const buildGenericModuleTemplate = (moduleConfig: ModuleDefinition): ExcelTemplateDefinition => {
  const fields = getImportableFields(moduleConfig);
  const sheetName = cleanSheetName(moduleConfig.titles.fa || moduleConfig.id);
  const sampleRow = fields.reduce<Record<string, string | number | boolean>>((acc, field) => {
    acc[field.labels.fa] = getSampleValue(field);
    return acc;
  }, {});

  return {
    fileName: `نمونه فایل ${moduleConfig.titles.fa || moduleConfig.id}.xlsx`,
    sheets: [
      { name: sheetName, rows: [sampleRow] },
      { name: 'راهنما', rows: buildGuideRows(fields) },
    ],
  };
};

const productsColumns = [
  'کلید محصول',
  'نام محصول',
  'کد دستی',
  'وضعیت',
  'نقش کاتالوگی',
  'نوع محصول',
  'واحد اصلی',
  'واحد فرعی',
  'دسته بندی مواد اولیه',
  'دسته بندی محصول',
  'نام مدل',
  'نوع دوخت',
  'مدت گارانتی (ماه)',
  'مدت خدمات پس از فروش (ماه)',
  'کد سایت',
  'لینک محصول در سایت',
  'نام برند',
  'انتخاب شناسنامه تولید مرجع',
  'تامین‌کننده مرتبط',
  'نرخ پرت',
  'قیمت خرید',
  'قیمت فروش',
  'نوع چرم',
  'رنگ چرم',
  'صفحه چرم',
  'افکت چرم',
  'سورت چرم',
  'جنس آستر',
  'رنگ آستر',
  'عرض آستر',
  'جنس خرجکار',
  'نوع یراق',
  'جنس یراق',
  'رنگ یراق',
  'سایز یراق',
];

export const buildProductsTemplate = (): ExcelTemplateDefinition => ({
  fileName: 'نمونه فایل محصولات.xlsx',
  sheets: [
    {
      name: 'محصولات',
      rows: [
        {
          'کلید محصول': 'RAW-LEATHER-001',
          'نام محصول': 'چرم گاوی عسلی',
          'کد دستی': 'RM-LEATHER-001',
          'وضعیت': 'فعال',
          'نقش کاتالوگی': 'محصول عادی',
          'نوع محصول': 'مواد اولیه',
          'واحد اصلی': 'متر مربع',
          'واحد فرعی': 'سانتیمتر مربع',
          'دسته بندی مواد اولیه': 'چرم',
          'دسته بندی محصول': '',
          'نام مدل': '',
          'نوع دوخت': '',
          'مدت گارانتی (ماه)': '',
          'مدت خدمات پس از فروش (ماه)': '',
          'کد سایت': '',
          'لینک محصول در سایت': '',
          'نام برند': '',
          'انتخاب شناسنامه تولید مرجع': '',
          'تامین‌کننده مرتبط': '',
          'نرخ پرت': 5,
          'قیمت خرید': 1200000,
          'قیمت فروش': 1500000,
          'نوع چرم': 'گاوی',
          'رنگ چرم': 'عسلی',
          'صفحه چرم': '',
          'افکت چرم': '',
          'سورت چرم': '',
          'جنس آستر': '',
          'رنگ آستر': '',
          'عرض آستر': '',
          'جنس خرجکار': '',
          'نوع یراق': '',
          'جنس یراق': '',
          'رنگ یراق': '',
          'سایز یراق': '',
        },
        {
          'کلید محصول': 'PARENT-BAG-A',
          'نام محصول': 'کیف اداری مدل A',
          'کد دستی': 'FG-BAG-001',
          'وضعیت': 'فعال',
          'نقش کاتالوگی': 'محصول مادر',
          'نوع محصول': 'محصول نهایی',
          'واحد اصلی': 'عدد',
          'واحد فرعی': '',
          'دسته بندی مواد اولیه': '',
          'دسته بندی محصول': 'کیف اداری',
          'نام مدل': 'مدل A',
          'نوع دوخت': 'دستی',
          'مدت گارانتی (ماه)': 12,
          'مدت خدمات پس از فروش (ماه)': 24,
          'کد سایت': 'BAG-A',
          'لینک محصول در سایت': '',
          'نام برند': 'Bartar',
          'انتخاب شناسنامه تولید مرجع': 'BOM کیف اداری مدل A',
          'تامین‌کننده مرتبط': '',
          'نرخ پرت': '',
          'قیمت خرید': '',
          'قیمت فروش': 8500000,
          'نوع چرم': '',
          'رنگ چرم': '',
          'صفحه چرم': '',
          'افکت چرم': '',
          'سورت چرم': '',
          'جنس آستر': '',
          'رنگ آستر': '',
          'عرض آستر': '',
          'جنس خرجکار': '',
          'نوع یراق': '',
          'جنس یراق': '',
          'رنگ یراق': '',
          'سایز یراق': '',
        },
      ],
    },
    {
      name: 'ویژگی‌ها',
      rows: [
        {
          'کلید محصول مادر': 'PARENT-BAG-A',
          'کلید ویژگی': 'color',
          'عنوان ویژگی': 'رنگ',
          'نوع مقدار': 'select',
          'منبع گزینه': 'custom',
          'کلید فیلد منبع': '',
          'گزینه‌ها': 'عسلی | مشکی | قهوه‌ای',
          'ویژگی متغیر': 'بله',
          'نمایش در سایت': 'بله',
          'ترتیب': 0,
        },
        {
          'کلید محصول مادر': 'PARENT-BAG-A',
          'کلید ویژگی': 'size',
          'عنوان ویژگی': 'سایز',
          'نوع مقدار': 'select',
          'منبع گزینه': 'custom',
          'کلید فیلد منبع': '',
          'گزینه‌ها': 'کوچک | متوسط | بزرگ',
          'ویژگی متغیر': 'بله',
          'نمایش در سایت': 'بله',
          'ترتیب': 1,
        },
      ],
    },
    {
      name: 'متغیرها',
      rows: [
        {
          'کلید محصول مادر': 'PARENT-BAG-A',
          'نام متغیر': '',
          'کد سایت': 'BAG-A-HONEY-M',
          'قیمت فروش': 8500000,
          'وضعیت': 'فعال',
          'فعال‌سازی sync سایت': 'خیر',
          'مقادیر ویژگی': 'color=عسلی; size=متوسط',
        },
        {
          'کلید محصول مادر': 'PARENT-BAG-A',
          'نام متغیر': '',
          'کد سایت': 'BAG-A-BLACK-M',
          'قیمت فروش': 8700000,
          'وضعیت': 'فعال',
          'فعال‌سازی sync سایت': 'خیر',
          'مقادیر ویژگی': 'color=مشکی; size=متوسط',
        },
      ],
    },
    {
      name: 'راهنما',
      rows: [
        { 'موضوع': 'ستون‌ها', 'توضیح': `ستون‌های قابل استفاده: ${productsColumns.join('، ')}` },
        { 'موضوع': 'نوع محصول', 'توضیح': 'مقادیر قابل قبول: مواد اولیه، بسته نیمه آماده، محصول نهایی' },
        { 'موضوع': 'محصول مادر و متغیر', 'توضیح': 'برای محصول مادر در شیت محصولات، «نقش کاتالوگی» را محصول مادر بگذارید و همان «کلید محصول» را در شیت‌های ویژگی‌ها و متغیرها به عنوان «کلید محصول مادر» وارد کنید.' },
        { 'موضوع': 'مقادیر ویژگی متغیر', 'توضیح': 'در شیت متغیرها مقدارها را به شکل key=value و با جداکننده ; یا | بنویسید. مثال: color=عسلی; size=متوسط' },
        { 'موضوع': 'BOM مرجع', 'توضیح': 'برای محصول نهایی/نیمه‌آماده، نام یا کد سیستمی شناسنامه تولید موجود را وارد کنید.' },
        { 'موضوع': 'چندمقداری', 'توضیح': 'برای فیلدهای چندانتخابی مثل رنگ چرم یا رنگ یراق از ویرگول فارسی یا انگلیسی استفاده کنید.' },
      ],
    },
  ],
});

export const buildProductionBomTemplate = (): ExcelTemplateDefinition => ({
  fileName: 'نمونه فایل شناسنامه‌های تولید BOM.xlsx',
  sheets: [
    {
      name: 'BOM',
      rows: [
        {
          'کلید BOM': 'BOM-A',
          'عنوان مدل': 'BOM کیف اداری مدل A',
          'وضعیت': 'فعال',
          'دسته بندی محصول': 'کیف اداری',
          'نام مدل': 'مدل A',
        },
      ],
    },
    {
      name: 'مواد اولیه',
      rows: [
        {
          'کلید BOM': 'BOM-A',
          'دسته ماده': 'چرم',
          'نوع چرم': 'گاوی',
          'رنگ چرم': 'عسلی',
          'صفحه چرم': '',
          'افکت چرم': '',
          'سورت چرم': '',
          'جنس آستر': '',
          'رنگ آستر': '',
          'عرض آستر': '',
          'جنس خرجکار': '',
          'نوع یراق': '',
          'جنس یراق': '',
          'رنگ یراق': '',
          'سایز یراق': '',
          'نام تکه': 'بدنه اصلی',
          'طول': 30,
          'عرض': 20,
          'تعداد': 2,
          'نرخ پرت': 5,
          'واحد اصلی': 'سانتیمتر مربع',
          'واحد فرعی': '',
          'قیمت خرید': 1200000,
        },
        {
          'کلید BOM': 'BOM-A',
          'دسته ماده': 'یراق',
          'نوع چرم': '',
          'رنگ چرم': '',
          'صفحه چرم': '',
          'افکت چرم': '',
          'سورت چرم': '',
          'جنس آستر': '',
          'رنگ آستر': '',
          'عرض آستر': '',
          'جنس خرجکار': '',
          'نوع یراق': 'زیپ',
          'جنس یراق': 'فلزی',
          'رنگ یراق': 'طلایی',
          'سایز یراق': '20cm',
          'نام تکه': 'زیپ اصلی',
          'طول': '',
          'عرض': '',
          'تعداد': 1,
          'نرخ پرت': 0,
          'واحد اصلی': 'عدد',
          'واحد فرعی': '',
          'قیمت خرید': 50000,
        },
      ],
    },
    {
      name: 'راهنما',
      rows: [
        { 'موضوع': 'اتصال شیت‌ها', 'توضیح': 'ستون «کلید BOM» در هر دو شیت باید یکسان باشد.' },
        { 'موضوع': 'دسته ماده', 'توضیح': 'مقادیر قابل قبول: چرم، آستر، خرجکار، یراق' },
        { 'موضوع': 'روش اتصال مواد', 'توضیح': 'مواد اولیه با فیلتر مشخصات ذخیره می‌شوند و نیاز به کد محصول ندارند.' },
        { 'موضوع': 'واحدها', 'توضیح': HARD_CODED_UNIT_OPTIONS.map((item) => item.label).join('، ') },
      ],
    },
  ],
});

export const buildModuleExcelTemplate = (moduleConfig: ModuleDefinition): ExcelTemplateDefinition => {
  if (moduleConfig.id === 'products') return buildProductsTemplate();
  if (moduleConfig.id === 'production_boms') return buildProductionBomTemplate();
  return buildGenericModuleTemplate(moduleConfig);
};
