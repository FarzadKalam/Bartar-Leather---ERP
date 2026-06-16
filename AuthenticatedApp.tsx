import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, Outlet } from "react-router-dom";
import { Refine, Authenticated } from "@refinedev/core";
import { useNotificationProvider, ErrorComponent } from "@refinedev/antd";
import { dataProvider } from "@refinedev/supabase";
import routerBindings, {
  UnsavedChangesNotifier,
  DocumentTitleHandler,
  CatchAllNavigate,
} from "@refinedev/react-router-v6";
import { Spin } from "antd";
import { authProvider } from "./authProvider";
import { supabase } from "./supabaseClient";
import { MODULES } from "./moduleRegistry";

const Layout = lazy(() => import("./components/Layout"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SettingsPage = lazy(() => import("./pages/Settings/SettingsPage"));
const ModuleShow = lazy(() => import("./pages/ModuleShow"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ProductionGroupOrdersList = lazy(() => import("./pages/ProductionGroupOrdersList"));
const ProductionGroupOrderWizard = lazy(() => import("./pages/ProductionGroupOrderWizard"));
const HRPage = lazy(() => import("./pages/HRPage"));
const FilesGalleryPage = lazy(() => import("./pages/FilesGalleryPage"));
const ModuleListRefine = lazy(() =>
  import("./pages/ModuleList_Refine").then((module) => ({ default: module.ModuleListRefine }))
);
const ModuleCreate = lazy(() =>
  import("./pages/ModuleCreate").then((module) => ({ default: module.ModuleCreate }))
);

const APP_TITLE = "مهربانو اتوماسیون";

const FullScreenLoader = () => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center">
    <Spin size="large" />
  </div>
);

function AuthenticatedApp() {
  const baseNotificationProvider = useNotificationProvider();

  useEffect(() => {
    const publicPaths = ["/inquiry", "/login"];

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      const eventName = String(event);
      const pathname = window.location.pathname;
      const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

      if (eventName === "SIGNED_OUT" && !isPublic) {
        window.location.replace("/login");
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

  const getStandalonePageTitle = (pathname?: string) => {
    if (!pathname) return null;
    if (pathname === "/") return "داشبورد";
    if (pathname.startsWith("/login")) return "ورود";
    if (pathname.startsWith("/inquiry")) return "فرم استعلام";
    if (pathname.startsWith("/settings")) return "تنظیمات";
    if (pathname.startsWith("/profile")) return "پروفایل";
    if (pathname.startsWith("/hr")) return "منابع انسانی";
    if (pathname.startsWith("/gallery")) return "گالری فایل‌ها";
    return null;
  };

  const getActionLabel = (action?: string) => {
    if (action === "list") return "لیست";
    if (action === "create") return "ایجاد";
    if (action === "edit") return "ویرایش";
    if (action === "show") return "جزئیات";
    return "";
  };

  const getResourceFaLabel = (identifier?: string) => {
    const key = String(identifier || "").trim();
    if (!key) return "";
    return MODULES?.[key]?.titles?.fa || key;
  };

  const translateNotificationTitle = (title?: string) => {
    const value = String(title || "").trim();
    if (!value) return title;
    if (value === "Success") return "موفق";
    if (value === "Error") return "خطا";
    return value;
  };

  const translateNotificationMessage = (message?: string): string => {
    const value = String(message || "").trim();
    if (!value) return "";

    const deleteMatch = value.match(/^Successfully deleted(?: a)? (.+)$/i);
    if (deleteMatch?.[1]) {
      const resourceLabel = getResourceFaLabel(deleteMatch[1]);
      return resourceLabel ? `${resourceLabel} با موفقیت حذف شد` : "با موفقیت حذف شد";
    }

    const createMatch = value.match(/^Successfully created(?: a)? (.+)$/i);
    if (createMatch?.[1]) {
      const resourceLabel = getResourceFaLabel(createMatch[1]);
      return resourceLabel ? `${resourceLabel} با موفقیت ایجاد شد` : "با موفقیت ایجاد شد";
    }

    const updateMatch = value.match(/^Successfully updated(?: a)? (.+)$/i);
    if (updateMatch?.[1]) {
      const resourceLabel = getResourceFaLabel(updateMatch[1]);
      return resourceLabel ? `${resourceLabel} با موفقیت بروزرسانی شد` : "با موفقیت بروزرسانی شد";
    }

    if (/^An error occurred while deleting the record\.?$/i.test(value)) {
      return "در حذف رکورد خطا رخ داد.";
    }
    if (/^An error occurred while creating the record\.?$/i.test(value)) {
      return "در ایجاد رکورد خطا رخ داد.";
    }
    if (/^An error occurred while updating the record\.?$/i.test(value)) {
      return "در بروزرسانی رکورد خطا رخ داد.";
    }

    return value;
  };

  const notificationProvider = {
    ...baseNotificationProvider,
    open: (params: Parameters<typeof baseNotificationProvider.open>[0]) => {
      baseNotificationProvider.open({
        ...params,
        description: translateNotificationTitle(params.description),
        message: translateNotificationMessage(params.message),
      });
    },
  };

  const titleHandler = ({
    resource,
    action,
    pathname,
  }: {
    resource?: any;
    action?: string;
    pathname?: string;
    autoGeneratedTitle: string;
  }) => {
    const standalone = getStandalonePageTitle(pathname);
    if (standalone) return `${standalone} | ${APP_TITLE}`;

    const resourceLabel =
      resource?.meta?.label || resource?.label || MODULES?.[resource?.name]?.titles?.fa || resource?.name || "";

    if (resourceLabel) {
      if (action === "show" || action === "edit") {
        return `${resourceLabel} | ${APP_TITLE}`;
      }
      const actionLabel = getActionLabel(action);
      return actionLabel ? `${actionLabel} ${resourceLabel} | ${APP_TITLE}` : `${resourceLabel} | ${APP_TITLE}`;
    }

    return APP_TITLE;
  };

  return (
    <Refine
      dataProvider={dataProvider(supabase)}
      authProvider={authProvider}
      notificationProvider={notificationProvider}
      routerProvider={routerBindings}
      resources={resources}
      options={{
        syncWithLocation: true,
        warnWhenUnsavedChanges: true,
        disableTelemetry: true,
      }}
    >
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route
            element={
              <Authenticated key="authenticated-inner" fallback={<CatchAllNavigate to="/login" />}>
                <Layout isDarkMode={false} toggleTheme={() => {}}>
                  <Outlet />
                </Layout>
              </Authenticated>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/production_group_orders" element={<ProductionGroupOrdersList />} />
            <Route path="/production_group_orders/create" element={<ProductionGroupOrderWizard />} />
            <Route path="/production_group_orders/:id" element={<ProductionGroupOrderWizard />} />
            <Route path="/hr" element={<HRPage />} />
            <Route path="/hr/:employeeId" element={<HRPage />} />
            <Route path="/gallery" element={<FilesGalleryPage />} />

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
      </Suspense>

      <UnsavedChangesNotifier />
      <DocumentTitleHandler handler={titleHandler} />
    </Refine>
  );
}

export default AuthenticatedApp;
