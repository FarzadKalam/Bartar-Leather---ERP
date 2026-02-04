import React, { useState } from 'react';
import { Drawer, Tooltip } from 'antd';
import { 
  FileTextOutlined, CheckSquareOutlined, HistoryOutlined, 
  LeftOutlined, RightOutlined, SkinOutlined, AppstoreOutlined,
  BgColorsOutlined, ScissorOutlined, ToolOutlined, ExperimentOutlined,
  DropboxOutlined, UsergroupAddOutlined
} from '@ant-design/icons';
import ActivityPanel from './ActivityPanel';
import RelatedRecordsPanel from './RelatedRecordsPanel';
import { ModuleDefinition } from '../../types';

// نقشه آیکون‌ها: نام متنی را به کامپوننت واقعی وصل می‌کند
const iconMap: Record<string, React.ReactNode> = {
  'SkinOutlined': <SkinOutlined />,
  'AppstoreOutlined': <AppstoreOutlined />,
  'BgColorsOutlined': <BgColorsOutlined />,
  'ScissorOutlined': <ScissorOutlined />,
  'ToolOutlined': <ToolOutlined />,
  'ExperimentOutlined': <ExperimentOutlined />,
  'DropboxOutlined': <DropboxOutlined />,
  'UsergroupAddOutlined': <UsergroupAddOutlined />,
  // آیکون پیش‌فرض
  'default': <AppstoreOutlined />
};

interface RelatedSidebarProps {
  moduleConfig: ModuleDefinition;
  recordId: string;
  recordName?: string; // ✅ اضافه شده
    mentionUsers?: any[];
    mentionRoles?: any[];
}

const RelatedSidebar: React.FC<RelatedSidebarProps> = ({ moduleConfig, recordId, recordName = '', mentionUsers = [], mentionRoles = [] }) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fixedTabs = [
      { key: 'notes', icon: <FileTextOutlined />, label: 'یادداشت‌ها', color: 'text-blue-500' },
      { key: 'tasks', icon: <CheckSquareOutlined />, label: 'وظایف', color: 'text-green-500' },
      { key: 'changelogs', icon: <HistoryOutlined />, label: 'تغییرات', color: 'text-orange-500' }
  ];

  const relatedTabs = moduleConfig.relatedTabs?.map(tab => ({
      key: `related_${tab.targetModule}`,
      icon: iconMap[tab.icon] || iconMap['default'], // تبدیل متن به آیکون
      label: tab.title,
      ...tab
  })) || [];

  const allTabs = [...fixedTabs, ...relatedTabs];

  const toggleTab = (key: string) => {
      setActiveKey(prev => prev === key ? null : key);
  };

  return (
    <>
        <div className="hidden md:flex fixed top-24 left-0 bottom-6 w-14 bg-white dark:bg-[#1a1a1a] border-r border-gray-200 dark:border-gray-800 flex-col items-center py-5 gap-5 z-40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] rounded-r-3xl transition-all">
            {allTabs.map(tab => {
                const isActive = activeKey === tab.key;
                return (
                    <Tooltip key={tab.key} title={tab.label} placement="right">
                        <div 
                            onClick={() => toggleTab(tab.key)}
                            className={`
                                w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300 relative
                                ${isActive 
                                    ? 'bg-leather-500 text-white shadow-lg shadow-leather-500/40 scale-110' 
                                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-leather-500'
                                }
                            `}
                        >
                            <span className="text-xl flex items-center justify-center">{tab.icon}</span>
                            {isActive && <div className="absolute -right-1 w-1 h-5 bg-leather-500 rounded-l-full" />}
                        </div>
                    </Tooltip>
                );
            })}
        </div>

                {/* دکمه موبایل برای باز کردن سایدبار */}
                <button
                    type="button"
                    className="md:hidden fixed left-2 top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-r-full bg-leather-500 text-white shadow-lg shadow-leather-500/40 flex items-center justify-center"
                    onClick={() => setIsMobileMenuOpen(true)}
                >
                    <RightOutlined className="text-sm" />
                </button>

                {/* منوی کشویی موبایل برای انتخاب تب‌ها */}
                <Drawer
                    title="سایدبار"
                    placement="left"
                    width={170}
                    open={isMobileMenuOpen}
                    onClose={() => setIsMobileMenuOpen(false)}
                    maskClosable
                    bodyStyle={{ padding: '12px' }}
                    style={{ left: -16 }}
                    rootStyle={{ zIndex: 2100 }}
                >
                    <div className="flex flex-col gap-2">
                        {allTabs.map(tab => {
                            const isActive = activeKey === tab.key;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => {
                                        toggleTab(tab.key);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isActive ? 'border-leather-500 bg-leather-50 text-leather-700' : 'border-gray-100 hover:border-leather-300 hover:bg-leather-50/60'}`}
                                >
                                    <span className="text-lg flex items-center justify-center w-8 h-8 rounded-lg bg-white shadow-sm">{tab.icon}</span>
                                    <span className="text-sm leading-tight">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </Drawer>

        <Drawer
            title={allTabs.find(t => t.key === activeKey)?.label}
            placement="left"
            width={360}
            onClose={() => setActiveKey(null)}
            open={!!activeKey}
            mask={false}
            styles={{ body: { padding: 0 }, header: { padding: '16px 24px' } }}
            className="shadow-2xl md:ml-14"
            rootStyle={{ zIndex: 2000 }}
        >
            <div className="h-full p-4 bg-gray-50 dark:bg-[#121212]">
                {(activeKey === 'notes' || activeKey === 'tasks' || activeKey === 'changelogs') && (
                    <ActivityPanel
                        moduleId={moduleConfig.id}
                        recordId={recordId}
                        view={activeKey as any}
                        recordName={recordName}
                        mentionUsers={mentionUsers}
                        mentionRoles={mentionRoles}
                    />
                )}
                {relatedTabs.map(tab => (
                    activeKey === `related_${tab.targetModule}` && (
                        <RelatedRecordsPanel key={tab.key} targetModule={tab.targetModule} foreignKey={tab.foreignKey} currentRecordId={recordId} />
                    )
                ))}
            </div>
        </Drawer>
    </>
  );
};

export default RelatedSidebar;