import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme } from 'antd';
import Layout from './components/Layout';
import ModuleList from './pages/ModuleList';
import ModuleShow from './pages/ModuleShow';
import SettingsPage from './pages/Settings/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import dayjs from 'dayjs';
import jalaliday from 'jalaliday';

// تنظیمات پلاگین تاریخ شمسی
dayjs.extend(jalaliday);
dayjs.calendar('jalali');

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
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <AntApp> 
        <BrowserRouter>
          {/* این Layout اصلی است و شامل هدر می‌شود */}
          <Layout isDarkMode={isDarkMode} toggleTheme={toggleTheme}>
            <Routes>
              <Route path="/" element={<div className="p-10">داشبورد (به زودی)</div>} />
              
              {/* مسیریابی داینامیک */}
              <Route path="/:moduleId" element={<ModuleList />} />
              <Route path="/:moduleId/:id" element={<ModuleShow />} />
              
              {/* --- اصلاح شد: حذف Layout اضافه از اینجا --- */}
              <Route path="/settings" element={<SettingsPage />} />
              
              {/* --- اصلاح شد: حذف Layout اضافه از اینجا --- */}
              <Route path="/profile/:id?" element={<ProfilePage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;