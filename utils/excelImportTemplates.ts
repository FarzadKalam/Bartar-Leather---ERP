import { FieldNature, FieldType, ModuleDefinition, ModuleField } from '../types';

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
  'قیمت خرید واحد اصلی',
  'قیمت خرید واحد فرعی',
  'قیمت فروش',
  'نوع چرم',
  'رنگ چرم',
  'صفحه چرم',
  'افکت چرم',
  'سورت چرم',
  'جنس آستر',
  'نوع آستر',
  'رنگ آستر',
  'عرض آستر (میلیمتر)',
  'جنس خرجکار',
  'نوع خرجکار',
  'عرض چرم (میلیمتر)',
  'عرض خرجکار (میلیمتر)',
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
          'قیمت خرید واحد اصلی': 1200000,
          'قیمت خرید واحد فرعی': 12000,
          'قیمت فروش': 1500000,
          'نوع چرم': 'گاوی',
          'رنگ چرم': 'عسلی',
          'صفحه چرم': '',
          'افکت چرم': '',
          'سورت چرم': '',
          'جنس آستر': '',
          'نوع آستر': '',
          'رنگ آستر': '',
          'عرض آستر (میلیمتر)': '',
          'جنس خرجکار': '',
          'نوع خرجکار': '',
          'عرض خرجکار (میلیمتر)': '',
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
          'قیمت خرید واحد اصلی': '',
          'قیمت خرید واحد فرعی': '',
          'قیمت فروش': 8500000,
          'نوع چرم': '',
          'رنگ چرم': '',
          'صفحه چرم': '',
          'افکت چرم': '',
          'سورت چرم': '',
          'جنس آستر': '',
          'نوع آستر': '',
          'رنگ آستر': '',
          'عرض آستر (میلیمتر)': '',
          'جنس خرجکار': '',
          'نوع خرجکار': '',
          'عرض خرجکار (میلیمتر)': '',
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

export const buildProductionBomTemplate = (): ExcelTemplateDefinition => {
  const bom = 'BAYGAN-SAMPLE';
  const route = (code: string, kind: string, reference: string, name: string, from: string, to: string, quantity: number | string = '', unit = '') => ({
    'کلید BOM': bom, 'کد مسیر': code, 'نوع': kind, 'مرجع شناسنامه': reference,
    'نام خروجی': name, 'مبدأ': from, 'مقصد': to, 'مقدار برای یک محصول': quantity, 'واحد': unit,
  });
  return {
    fileName: 'نمونه شناسنامه و گردش تولید.xlsx',
    sheets: [
      { name: 'گردش قطعات', rows: [
        route('RAW-CH', 'مصرف ماده', 'G-CH', '', 'انبار', 'برش اول'),
        route('CUT', 'خروجی مرحله', 'G-CH', 'تکه‌های برش اول', 'برش اول', 'برش لیزر', 10, 'عدد'),
        route('CH1', 'قطعه شناسنامه', 'CH1', '', 'برش لیزر', 'لویس'),
        route('CH2', 'قطعه شناسنامه', 'CH2', '', 'برش لیزر', 'لویس'),
        route('CH1-L', 'قطعه شناسنامه', 'CH1', '', 'لویس', 'بسته‌بندی'),
        route('CH2-L', 'قطعه شناسنامه', 'CH2', '', 'لویس', 'بسته‌بندی'),
        route('RAW-LI', 'مصرف ماده', 'G-LI', '', 'انبار', 'برش آستر و خرجکار'),
        route('LI1', 'قطعه شناسنامه', 'LI1', '', 'برش آستر و خرجکار', 'بسته‌بندی'),
        route('ZIP', 'مصرف ماده', 'G-ZIP', '', 'انبار', 'بسته‌بندی'),
        route('PACK', 'خروجی مرحله', '', 'پک نیمه‌آماده بایگان', 'بسته‌بندی', 'قفسهٔ خروجی', 1, 'عدد'),
      ] },
      { name: 'مواد اولیه', rows: [
        { 'کلید BOM': bom, 'کد گروه': 'G-CH', 'کد قطعه': 'CH1', 'دسته ماده': 'چرم', 'نوع چرم': 'گاوی', 'رنگ چرم': 'عسلی',
          'نام تکه': 'CH1 بدنه', 'طول': 20, 'عرض': 15, 'تعداد': 2, 'نرخ پرت': 5, 'واحد اصلی': 'سانتیمتر مربع', 'واحد فرعی': 'فوت مربع', 'قیمت خرید': 0 },
        { 'کلید BOM': bom, 'کد گروه': 'G-CH', 'کد قطعه': 'CH2', 'دسته ماده': 'چرم', 'نوع چرم': 'گاوی', 'رنگ چرم': 'عسلی',
          'نام تکه': 'CH2 جیب', 'طول': 10, 'عرض': 5, 'تعداد': 12, 'نرخ پرت': 5, 'واحد اصلی': 'سانتیمتر مربع', 'واحد فرعی': 'فوت مربع', 'قیمت خرید': 0 },
        { 'کلید BOM': bom, 'کد گروه': 'G-LI', 'کد قطعه': 'LI1', 'دسته ماده': 'آستر', 'نوع چرم': '', 'رنگ چرم': '',
          'نام تکه': 'LI1 آستر', 'طول': 20, 'عرض': 15, 'تعداد': 2, 'نرخ پرت': 5, 'واحد اصلی': 'سانتیمتر مربع', 'واحد فرعی': '', 'قیمت خرید': 0 },
        { 'کلید BOM': bom, 'کد گروه': 'G-ZIP', 'کد قطعه': 'ZIP1', 'دسته ماده': 'یراق', 'نوع چرم': '', 'رنگ چرم': '',
          'نام تکه': 'زیپ', 'طول': '', 'عرض': '', 'تعداد': 1, 'نرخ پرت': 0, 'واحد اصلی': 'عدد', 'واحد فرعی': '', 'قیمت خرید': 0 },
      ] },
      { name: 'مراحل پیش نویس تولید', rows: ['انبار', 'برش اول', 'برش لیزر', 'برش آستر و خرجکار', 'لویس', 'بسته‌بندی', 'قفسهٔ خروجی'].map((name, index) => ({
        'کلید BOM': bom, 'شناسه مرحله': 'stage-' + index, 'عنوان مرحله': name, 'ترتیب': index * 10, 'دستمزد': 0,
      })) },
      { name: 'BOM', rows: [{ 'کلید BOM': bom, 'عنوان مدل': 'نمونه آموزشی بایگان', 'وضعیت': 'فعال', 'دسته بندی محصول': 'کیف', 'نام مدل': 'بایگان' }] },
      { name: 'راهنما', rows: [
        { 'موضوع': 'مبنای نمونه', 'توضیح': 'اعداد آموزشی‌اند. همهٔ مقدارها برای یک محصول هستند. قیمت خرید صفر یعنی قیمت نمونه وارد نشده است. پیش از ورود اطلاعات، نام و اندازه‌ها و قیمت‌ها را اصلاح کنید.' },
        { 'موضوع': 'خروجی کلی برش اول', 'توضیح': 'در گردش قطعات، ردیف CUT تعداد کل تکه‌های برش اول را مشخص می‌کند. ۱۰ تکه وارد لیزر می‌شود و لیزر طبق مواد اولیه ۲ قطعه CH1 و ۱۲ قطعه CH2 تحویل می‌دهد. تطبیق تک‌تک تکه‌های اولیه لازم نیست.' },
        { 'موضوع': 'تعداد قطعات و مصرف', 'توضیح': 'در نوع قطعه شناسنامه، مرجع را کد قطعه و در نوع مصرف ماده، مرجع را کد گروه بگذارید. تعداد قطعات نمونه در اکسل فرمول دارد. ERP تعداد قطعه و مصرف ماده را از مواد اولیه می‌خواند. مقدار و واحد مصرف ماده در اکسل خالی می‌ماند.' },
        { 'موضوع': 'خروجی مرحله', 'توضیح': 'برای CUT یا PACK نوع خروجی مرحله را انتخاب کنید و نام، مقدار و واحد را بنویسید. برای اتصال خروجی کلی برش اول به گروه چرم، مرجع را G-CH بگذارید. برای پک نهایی مرجع خالی است.' },
        { 'موضوع': 'جلوگیری از مصرف تکراری', 'توضیح': 'تکه‌های اولیه و پک نیمه‌آماده فقط در گردش قطعات تعریف می‌شوند. مصرف چرم فقط در مواد اولیه ثبت می‌شود. جمع‌زدن تعداد تمام مسیرها معنا ندارد چون یک قطعه از چند مرحله عبور می‌کند.' },
        { 'موضوع': 'مراحل قابل ویرایش', 'توضیح': 'نام‌ها را در ستون عنوان مرحله در شیت مراحل پیش نویس تولید ویرایش یا اضافه کنید. ردیف‌ها را با همان کلید BOM و بدون فاصلهٔ خالی تا ردیف ۱۰۱ ادامه دهید. فهرست مبدأ و مقصد از همین ستون خوانده می‌شود. نام انبار و قفسهٔ خروجی را حفظ کنید.' },
        { 'موضوع': 'تغییر نام مرحله', 'توضیح': 'بعد از تغییر نام یا حذف مرحله، مبدأ و مقصد ردیف‌های قبلی را هم اصلاح کنید. انتخاب‌های قبلی اکسل خودکار تغییر نام نمی‌دهند.' },
        { 'موضوع': 'قطعات زیاد', 'توضیح': 'برای قطعات با مسیر مشترک، سلول مبدأ و مقصد را انتخاب و به ردیف‌های بعد کپی کنید. فقط مقصد قطعات استثنا را تغییر دهید. فهرست‌های کشویی تا ردیف ۱۰۰۱ آماده‌اند.' },
        { 'موضوع': 'کلیدها', 'توضیح': 'کلید BOM در همهٔ شیت‌ها یکسان باشد. کد مسیر در همان BOM یکتا است. کد گروه بین ردیف‌های یک ماده یکسان و کد هر قطعه یکتا است. برای مادهٔ دیگری با رنگ یا مشخصات متفاوت کد گروه جدا بدهید.' },
        { 'موضوع': 'واردسازی', 'توضیح': 'در فهرست شناسنامه‌های تولید، ورود اکسل و سپس ورود قالب BOM را انتخاب کنید. ورود با عنوان مدل موجود، شناسنامهٔ همان عنوان را به‌روزرسانی می‌کند. برای نمونه نام تازه استفاده کنید.' },
        { 'موضوع': 'دامنهٔ گردش', 'توضیح': 'این فایل برنامهٔ ورودی و خروجی مراحل را تعریف می‌کند. ثبت نتیجهٔ واقعی برش و تأیید دریافت به گردش عملیاتی جدا نیاز دارد.' },
      ] },
    ],
  };
};

export const buildModuleExcelTemplate = (moduleConfig: ModuleDefinition): ExcelTemplateDefinition => {
  if (moduleConfig.id === 'products') return buildProductsTemplate();
  if (moduleConfig.id === 'production_boms') return buildProductionBomTemplate();
  return buildGenericModuleTemplate(moduleConfig);
};
