import React from 'react';
import { Tabs } from 'antd';
import { BankOutlined, UsergroupAddOutlined, ClusterOutlined, FunctionOutlined } from '@ant-design/icons';
import CompanyTab from './CompanyTab';
import UsersTab from './UsersTab';
import RolesTab from './RolesTab';
import ModuleListRefine from '../ModuleList_Refine';

const SettingsPage: React.FC = () => {
  const items = [
    {
      key: 'company',
      label: <span className="flex items-center gap-2 text-base"><BankOutlined /> مشخصات شرکت</span>,
      children: <CompanyTab />,
    },
    {
      key: 'users',
      label: <span className="flex items-center gap-2 text-base"><UsergroupAddOutlined /> مدیریت کاربران</span>,
      children: <UsersTab />,
    },
    {
      key: 'roles',
      label: <span className="flex items-center gap-2 text-base"><ClusterOutlined /> چارت سازمانی</span>,
      children: <RolesTab />,
    },
    {
      key: 'formulas',
      label: <span className="flex items-center gap-2 text-base"><FunctionOutlined /> فرمول‌های محاسباتی</span>,
      children: <ModuleListRefineWrapper moduleId="calculation_formulas" />,
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-fadeIn">
      {/* هیچ هدر یا تیتری اینجا نباید باشد */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-6 min-h-[70vh] transition-colors">
        <Tabs 
            defaultActiveKey="company" 
            items={items} 
            size="large" 
            className="dark:text-gray-200"
        />
      </div>
      <style>{`
        .dark .ant-tabs-tab { color: #888; }
        .dark .ant-tabs-tab-active .ant-tabs-tab-btn { color: white !important; }
        .dark .ant-tabs-ink-bar { background: #d4a373 !important; }
      `}</style>
    </div>
  );
};

export default SettingsPage;

const ModuleListRefineWrapper: React.FC<{ moduleId: string }> = ({ moduleId }) => {
  return <ModuleListRefine moduleIdOverride={moduleId} />;
};