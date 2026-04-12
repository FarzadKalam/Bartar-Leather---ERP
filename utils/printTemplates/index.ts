export interface PrintTemplate {
  id: string;
  title: string;
  description: string;
}

export const getAvailableTemplates = (moduleId: string): PrintTemplate[] => {
  const templates: PrintTemplate[] = [];

  if (moduleId === 'products') {
    templates.push(
      {
        id: 'product_label',
        title: 'مشخصات کالا',
        description: 'برچسب A6 برای محصول',
      },
      {
        id: 'product_passport',
        title: 'شناسنامه کالا',
        description: 'طرح گرافیکی مناسب برچسب محصول',
      }
    );
  }

  if (moduleId === 'invoices') {
    templates.push(
      {
        id: 'invoice_sales_official',
        title: 'فاکتور فروش (رسمی)',
        description: 'نمایش کامل مشخصات خریدار و فروشنده',
      },
      {
        id: 'invoice_sales_simple',
        title: 'فاکتور فروش (غیررسمی)',
        description: 'فقط نام و شماره فروشنده',
      }
    );
  }

  if (moduleId === 'production_boms' || moduleId === 'production_orders') {
    templates.push({
      id: 'production_passport',
      title: 'شناسنامه تولید',
      description: 'برگه شناسنامه تولید',
    });
  }

  return templates;
};

export { printStyles } from './styles';
