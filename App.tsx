import { useEffect } from "react";
import { Refine, Authenticated } from "@refinedev/core";
import { notificationProvider, ErrorComponent } from "@refinedev/antd";
import { dataProvider } from "@refinedev/supabase";
import { authProvider } from "./authProvider";
import routerBindings, { UnsavedChangesNotifier, DocumentTitleHandler, CatchAllNavigate } from "@refinedev/react-router-v6";
import { BrowserRouter, Route, Routes, Outlet } from "react-router-dom";
import { ConfigProvider, App as AntdApp } from "antd";
import faIR from "antd/locale/fa_IR";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/Settings/SettingsPage";
import { JalaliLocaleListener } from "antd-jalali";

// ❌ تمام ایمپورت‌ها و تنظیمات dayjs را از اینجا حذف کردیم
// چون الان در initDayjs.ts و index.tsx مدیریت می‌شوند.

import { supabase } from "./supabaseClient";
import { MODULES } from "./moduleRegistry";
import Layout from "./components/Layout";
import { ModuleListRefine } from "./pages/ModuleList_Refine";
import ModuleShow from "./pages/ModuleShow";
import "./App.css";
import { ModuleCreate } from "./pages/ModuleCreate";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

function App() {
  useEffect(() => {
    document.body.style.fontFamily = 'Vazirmatn, sans-serif';
  }, []);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      const eventName = String(event);
      if (eventName === 'SIGNED_OUT' || eventName === 'TOKEN_REFRESH_FAILED') {
        window.location.replace('/login');
      }
    });

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, []);

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
              <Route path="/login" element={<Login />} />

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
                <Route index element={<Dashboard />} />
                <Route path="/profile" element={<ProfilePage />} />
                
                <Route path="/:moduleId">
                  <Route index element={<ModuleListRefine />} />
                  <Route path="create" element={<ModuleCreate />} />
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