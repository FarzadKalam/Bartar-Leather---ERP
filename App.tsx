import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ConfigProvider, App as AntdApp, Spin } from "antd";
import faIR from "antd/locale/fa_IR";
import { JalaliLocaleListener } from "antd-jalali";
import "./App.css";

const Login = lazy(() => import("./pages/Login"));
const InquiryForm = lazy(() => import("./pages/InquiryForm"));
const AuthenticatedApp = lazy(() => import("./AuthenticatedApp"));

const FullScreenLoader = () => (
  <div className="min-h-screen bg-gray-100 flex items-center justify-center">
    <Spin size="large" />
  </div>
);

function App() {
  useEffect(() => {
    document.body.style.fontFamily = "Vazirmatn, sans-serif";
  }, []);

  return (
    <BrowserRouter>
      <ConfigProvider
        direction="rtl"
        locale={faIR}
        theme={{
          token: {
            colorPrimary: "#356d52",
            colorInfo: "#356d52",
            colorSuccess: "#2f614a",
            colorLink: "#285641",
            colorTextBase: "#163126",
            colorBgLayout: "#f4f8f5",
            colorBorderSecondary: "#d6e2da",
            borderRadius: 14,
            fontFamily: "Vazirmatn, sans-serif",
          },
          components: {
            Button: {
              primaryShadow: "0 10px 24px rgba(53, 109, 82, 0.24)",
              defaultBorderColor: "#b9d2c1",
              defaultColor: "#1f4534",
            },
            Menu: {
              itemSelectedBg: "#e8f1eb",
              itemSelectedColor: "#1f4534",
              itemHoverColor: "#285641",
            },
            Card: {
              borderRadiusLG: 24,
            },
          },
        }}
      >
        <JalaliLocaleListener />
        <AntdApp>
          <Suspense fallback={<FullScreenLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/inquiry/*" element={<InquiryForm />} />
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </Suspense>
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  );
}

export default App;
