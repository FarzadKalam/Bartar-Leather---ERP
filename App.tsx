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
            colorPrimary: "#c58f60",
            fontFamily: "Vazirmatn, sans-serif",
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
