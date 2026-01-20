import React, { useEffect } from "react";
import { Refine } from "@refinedev/core";
import { notificationProvider, ErrorComponent } from "@refinedev/antd";
import { dataProvider } from "@refinedev/supabase";
import routerBindings, { NavigateToResource, UnsavedChangesNotifier, DocumentTitleHandler } from "@refinedev/react-router-v6";
import { BrowserRouter, Route, Routes, Outlet } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import faIR from "antd/lib/locale/fa_IR";
import SettingsPage from "./pages/Settings/SettingsPage";
import { JalaliLocaleListener } from "antd-jalali";


// فایل‌های پروژه
import { supabase } from "./supabaseClient";
import { MODULES } from "./moduleRegistry";
import Layout from "./components/Layout";

// صفحات (مدل قدیمی - فعلاً نگه می‌داریم تا سایت بالا بیاد)
//import ModuleList from "./pages/ModuleList";
import { ModuleListRefine } from "./pages/ModuleList_Refine";
import ModuleShow from "./pages/ModuleShow";
import "./App.css";
import { ModuleCreate } from "./pages/ModuleCreate";

function App() {
  useEffect(() => {
    document.body.style.fontFamily = 'Vazirmatn, sans-serif';
  }, []);

  // تبدیل ماژول‌های پروژه به فرمت استاندارد Refine
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
        <AntdApp>
          <Refine
            dataProvider={dataProvider(supabase)} 
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
              {/* لایه اصلی اپلیکیشن */}
              <Route element={<Layout isDarkMode={false} toggleTheme={function (): void {
                throw new Error("Function not implemented.");
              } }><Outlet /></Layout>}>
                
                {/* روت اصلی: هدایت به محصولات */}
                <Route index element={<NavigateToResource resource="products" />} />

                {/* روت‌های داینامیک ماژول‌ها */}
                <Route path="/:moduleId">
                  <Route index element={<ModuleListRefine />} />
                  <Route path="create" element={<ModuleCreate />} />
                  <Route path="create" element={<ModuleShow />} />
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