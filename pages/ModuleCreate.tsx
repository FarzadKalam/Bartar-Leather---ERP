import { useForm } from "@refinedev/antd";
import { useParams, useNavigate } from "react-router-dom";
import { MODULES } from "../moduleRegistry";
import SmartForm from "../components/SmartForm";
import { Button, Result } from "antd";
import { ArrowRightOutlined, SaveOutlined } from "@ant-design/icons";
import { supabase } from "../supabaseClient";
import { applyInvoiceFinalizationInventory } from "../utils/invoiceInventoryWorkflow";

export const ModuleCreate = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const moduleConfig = moduleId ? MODULES[moduleId] : null;

  // --- اصلاح مهم: تنظیمات useForm ---
    const { formProps, saveButtonProps, form } = useForm({
    action: "create",
    resource: moduleId,
    redirect: "list",
    // این خط حیاتی است: جلوی لودینگ بیخودی برای دیتای اولیه را می‌گیرد
    queryOptions: { 
        enabled: false 
    },
    // این خط هم جلوی وارنینگ‌های اضافه را می‌گیرد
    warnWhenUnsavedChanges: true, 
  });

  if (!moduleConfig) {
      return <Result status="404" title="ماژول یافت نشد" />;
  }

  // اگر واقعاً در حال ذخیره هستیم (نه لود اولیه)
  const isSubmitting = saveButtonProps.loading;

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto animate-fadeIn">
        {/* هدر */}
        <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
                <Button 
                    icon={<ArrowRightOutlined />} 
                    onClick={() => navigate(-1)} 
                    type="text" 
                    className="text-gray-500"
                />
                <div>
                    <h1 className="text-xl font-black text-gray-800 dark:text-white m-0">
                        افزودن {moduleConfig.titles.fa}
                    </h1>
                </div>
            </div>

            <Button 
                type="primary" 
                icon={<SaveOutlined />} 
                loading={isSubmitting}
                onClick={() => form.submit()} // تریگر کردن فرم از بیرون
                className="bg-leather-600 hover:!bg-leather-500"
            >
                ذخیره
            </Button>
        </div>

        {/* بدنه فرم */}
        <div className="bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            <SmartForm 
                module={moduleConfig}
                visible={true}
                onCancel={() => navigate(-1)} 
                
                // این تابع فقط وقتی اجرا میشه که فرم ولیدیت شده باشه
                onSave={async (values) => {
                    console.log("📤 Submitting to Refine:", values);
                    try {
                        if (moduleId === "invoices" || moduleId === "purchase_invoices") {
                            const { data: inserted, error } = await supabase
                                .from(moduleConfig.table)
                                .insert(values)
                                .select("id")
                                .single();
                            if (error) throw error;
                            if (!inserted?.id) throw new Error("ثبت فاکتور ناموفق بود");

                            const { data: authData } = await supabase.auth.getUser();
                            const userId = authData?.user?.id || null;
                            await applyInvoiceFinalizationInventory({
                                supabase: supabase as any,
                                moduleId,
                                recordId: inserted.id,
                                previousStatus: null,
                                nextStatus: values?.status ?? null,
                                invoiceItems: values?.invoiceItems ?? [],
                                userId,
                            });

                            navigate(`/${moduleId}/${inserted.id}`);
                            return;
                        }

                        // استفاده از onFinish که Refine فراهم کرده
                        await formProps.onFinish?.(values);
                        console.log("✅ Submit successful!");
                    } catch (err: any) {
                        console.error("❌ Submit failed:", err);
                        throw err; // پرتاب مجدد برای نمایش خطا
                    }
                }}
            />
        </div>
    </div>
  );
};
