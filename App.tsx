import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme } from 'antd'; // <--- `theme` اینجا اضافه شد
import Layout from './components/Layout';
import ModuleList from './pages/ModuleList';
import ModuleShow from './pages/ModuleShow';

function App() {
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <ConfigProvider
      direction="rtl"
      theme={{
        token: { fontFamily: 'Vazirmatn' },
        // اصلاح خطای require: استفاده مستقیم از آبجکت theme
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      {/* اضافه کردن کامپوننت App برای مدیریت مسیج‌ها و مودال‌ها */}
      <AntApp> 
        <BrowserRouter>
          <Layout isDarkMode={isDarkMode} toggleTheme={toggleTheme}>
            <Routes>
              <Route path="/" element={<div className="p-10">داشبورد (به زودی)</div>} />
              
              {/* مسیریابی داینامیک */}
              <Route path="/:moduleId" element={<ModuleList />} />
              <Route path="/:moduleId/:id" element={<ModuleShow />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;