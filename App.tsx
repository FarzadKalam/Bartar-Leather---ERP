import { useEffect } from "react";
<<<<<<< HEAD
import { Refine, Authenticated } from "@refinedev/core"; // Authenticated اضافه شد
=======
import { Refine } from "@refinedev/core";
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
import { notificationProvider, ErrorComponent } from "@refinedev/antd";
import { dataProvider } from "@refinedev/supabase";
import { authProvider } from "./authProvider";
import routerBindings, { NavigateToResource, UnsavedChangesNotifier, DocumentTitleHandler, CatchAllNavigate } from "@refinedev/react-router-v6";
import { BrowserRouter, Route, Routes, Outlet } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import faIR from "antd/locale/fa_IR";
<<<<<<< HEAD
import ProfilePage from "./pages/ProfilePage";
=======
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
import SettingsPage from "./pages/Settings/SettingsPage";
import { JalaliLocaleListener } from "antd-jalali";
import dayjs from "dayjs";
import jalaliday from "jalaliday";
import "dayjs/locale/fa";
<<<<<<< HEAD
=======

// Configure Jalali calendar with Persian locale
dayjs.extend(jalaliday);

// Set Persian locale with custom Jalali month names
const faLocale = {
  name: 'fa',
  weekdays: 'شنبه_یک‌شنبه_دوشنبه_سه‌شنبه_چهارشنبه_پنج‌شنبه_جمعه'.split('_'),
  weekdaysShort: 'ش_ی_د_س_چ_پ_ج'.split('_'),
  weekdaysMin: 'ش_ی_د_س_چ_پ_ج'.split('_'),
  weekStart: 6,
  months: 'فروردین_اردیبهشت_خرداد_تیر_مرداد_شهریور_مهر_آبان_آذر_دی_بهمن_اسفند'.split('_'),
  monthsShort: 'فرو_ارد_خرد_تیر_مرد_شهر_مهر_آبا_آذر_دی_بهم_اسف'.split('_'),
  ordinal: (n: number) => n,
  formats: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'YYYY/MM/DD',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'dddd, D MMMM YYYY HH:mm'
  },
  relativeTime: {
    future: 'در %s',
    past: '%s پیش',
    s: 'چند ثانیه',
    m: 'یک دقیقه',
    mm: '%d دقیقه',
    h: 'یک ساعت',
    hh: '%d ساعت',
    d: 'یک روز',
    dd: '%d روز',
    M: 'یک ماه',
    MM: '%d ماه',
    y: 'یک سال',
    yy: '%d سال'
  }
};

dayjs.locale('fa', faLocale as any);
dayjs.calendar('jalali');
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f

// 1. ایمپورت کردن صفحه لاگین (مسیر فایل را چک کن)
import Login from "./pages/Login"; // اگر فایل را در پوشه pages گذاشتی بنویس: "./pages/Login"

// ... (تنظیمات تقویم جلالی که داشتی - بدون تغییر) ...
dayjs.extend(jalaliday);
const faLocale = {
  name: 'fa',
  weekdays: 'شنبه_یک‌شنبه_دوشنبه_سه‌شنبه_چهارشنبه_پنج‌شنبه_جمعه'.split('_'),
  weekdaysShort: 'ش_ی_د_س_چ_پ_ج'.split('_'),
  weekdaysMin: 'ش_ی_د_س_چ_پ_ج'.split('_'),
  weekStart: 6,
  months: 'فروردین_اردیبهشت_خرداد_تیر_مرداد_شهریور_مهر_آبان_آذر_دی_بهمن_اسفند'.split('_'),
  monthsShort: 'فرو_ارد_خرد_تیر_مرد_شهر_مهر_آبا_آذر_دی_بهم_اسف'.split('_'),
  ordinal: (n: number) => n,
  formats: {
    LT: 'HH:mm',
    LTS: 'HH:mm:ss',
    L: 'YYYY/MM/DD',
    LL: 'D MMMM YYYY',
    LLL: 'D MMMM YYYY HH:mm',
    LLLL: 'dddd, D MMMM YYYY HH:mm'
  },
  relativeTime: {
    future: 'در %s',
    past: '%s پیش',
    s: 'چند ثانیه',
    m: 'یک دقیقه',
    mm: '%d دقیقه',
    h: 'یک ساعت',
    hh: '%d ساعت',
    d: 'یک روز',
    dd: '%d روز',
    M: 'یک ماه',
    MM: '%d ماه',
    y: 'یک سال',
    yy: '%d سال'
  }
};
dayjs.locale('fa', faLocale as any);
dayjs.calendar('jalali');

// فایل‌های پروژه
import { supabase } from "./supabaseClient";
import { MODULES } from "./moduleRegistry";
import Layout from "./components/Layout";
import { ModuleListRefine } from "./pages/ModuleList_Refine";
import ModuleShow from "./pages/ModuleShow";
import "./App.css";
import { ModuleCreate } from "./pages/ModuleCreate";

function App() {
  useEffect(() => {
    document.body.style.fontFamily = 'Vazirmatn, sans-serif';
  }, []);

<<<<<<< HEAD
=======

  // تبدیل ماژول‌های پروژه به فرمت استاندارد Refine
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
  const resources = Object.values(MODULES).map((mod) => ({
    name: mod.id, 
    list: `/${mod.id}`,
    show: `/${mod.id}/:id`,
    create: `/${mod.id}/create`,
    edit: `/${mod.id}/:id`,
    meta: {
      label: mod.titles.fa,
    },
  }));

  return (
    <BrowserRouter>
      <ConfigProvider 
        direction="rtl" 
        locale={faIR} 
        theme={{
          token: {
            colorPrimary: '#c58f60', 
            fontFamily: 'Vazirmatn, sans-serif',
          }
        }}
      >
        <JalaliLocaleListener />
        <AntdApp>
          <Refine
            dataProvider={dataProvider(supabase)}
            authProvider={authProvider}
            notificationProvider={notificationProvider}
            routerProvider={routerBindings}
            resources={resources} 
            options={{
              syncWithLocation: true, 
              warnWhenUnsavedChanges: true, 
              projectId: "bartar-leather-erp",
            }}
          >
            <Routes>
<<<<<<< HEAD
              {/* 3. روت لاگین باید بیرون از Layout باشد (بدون سایدبار) */}
              <Route path="/login" element={<Login />} />

              {/* 4. روت‌های محافظت شده (داخل Layout) */}
              <Route
                element={
                  <Authenticated
                    key="authenticated-inner"
                    fallback={<CatchAllNavigate to="/login" />}
                  >
                    <Layout isDarkMode={false} toggleTheme={() => {}}>
                      <Outlet />
                    </Layout>
                  </Authenticated>
                }
              >
=======
              {/* لایه اصلی اپلیکیشن */}
              <Route element={<Layout isDarkMode={false} toggleTheme={function (): void {
                throw new Error("Function not implemented.");
              } }><Outlet /></Layout>}>
                
>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
                {/* روت اصلی: هدایت به محصولات */}
                <Route index element={<NavigateToResource resource="products" />} />

                <Route path="/profile" element={<ProfilePage />} />
                {/* روت‌های داینامیک ماژول‌ها */}
                <Route path="/:moduleId">
                  <Route index element={<ModuleListRefine />} />
                  <Route path="create" element={<ModuleCreate />} />
                  {/* نکته: اینجا قبلاً دوتا create داشتی، دومی رو کامنت کردم چون تکراری بود */}
                  {/* <Route path="create" element={<ModuleShow />} /> */}
                  <Route path=":id" element={<ModuleShow />} />
                  <Route path=":id/edit" element={<ModuleShow />} />
                </Route>

                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<ErrorComponent />} />
              </Route>
            </Routes>
            
            <UnsavedChangesNotifier />
            <DocumentTitleHandler />
          </Refine>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;