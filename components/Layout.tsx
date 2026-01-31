<<<<<<< HEAD
import React, { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Button, Avatar, Badge, Dropdown, message, Modal } from 'antd';
import { 
  DashboardOutlined, 
  SkinOutlined, 
  ExperimentOutlined, 
  ShopOutlined, 
  TeamOutlined, 
  SettingOutlined,
  SearchOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  BankOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  GoldOutlined,
  SunOutlined,
  ExclamationCircleOutlined,
  MoonOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // 👈 ایمپورت سوپابیس

const { Header, Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, isDarkMode, toggleTheme }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [currentUser, setCurrentUser] = useState<any>(null); // برای نمایش آواتار واقعی
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    getUser();

    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      
      setIsMobile(mobile);
      setIsKeyboardVisible(window.innerHeight < 500);
      
      if (mobile) {
        setCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    Modal.confirm({
      title: 'خروج از حساب کاربری',
      icon: <ExclamationCircleOutlined />,
      content: 'آیا مطمئن هستید که می‌خواهید خارج شوید؟',
      okText: 'بله، خروج',
      cancelText: 'انصراف',
      okType: 'danger',
      onOk: async () => {
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          navigate('/login');
          message.success('با موفقیت خارج شدید');
        } catch (error) {
          message.error('خطا در خروج از سیستم');
        }
      },
    });
  };

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'داشبورد' },
    { key: '/products', icon: <SkinOutlined />, label: 'محصولات' },
    { key: '/warehouses', icon: <GoldOutlined />, label: 'انبارها' },
    { 
        key: 'production', 
        icon: <ExperimentOutlined />, 
        label: 'تولید',
        children: [
            { key: '/production_boms', label: 'شناسنامه‌های تولید (BOM)' },
            { key: '/production_orders', label: 'سفارشات تولید' },
        ] 
    },
    { key: '/suppliers', icon: <BankOutlined />, label: 'تامین کنندگان' },
    { key: '/invoices', icon: <FileTextOutlined />, label: 'فاکتورها' },
    { key: '/tasks', icon: <CheckSquareOutlined />, label: 'وظایف' },
    { key: '/customers', icon: <ShopOutlined />, label: 'مشتریان' },
    { key: '/hr', icon: <TeamOutlined />, label: 'منابع انسانی' },
    { key: '/settings', icon: <SettingOutlined />, label: 'تنظیمات' },
    
  ];

  const userMenu = {
    items: [
      {
        key: 'profile',
        label: 'پروفایل کاربری',
        icon: <UserOutlined />,
        onClick: () => navigate('/profile'), // هدایت به پروفایل
      },
      { type: 'divider' as const },
      { 
        key: 'logout', 
        label: 'خروج', 
        icon: <LogoutOutlined />, 
        danger: true,
        onClick: handleLogout // اتصال تابع خروج
      },
    ],
  };

  type MobileNavItem = {
    key: string;
    icon: React.ReactNode;
    label: string;
    isCenter?: boolean;
    isMenu?: boolean;
  };

  const mobileNavItems: MobileNavItem[] = [
    { key: '/products', icon: <SkinOutlined />, label: 'محصولات' },
    { key: '/production_orders', icon: <CheckSquareOutlined />, label: 'تولید' },
    { key: '/', icon: <HomeOutlined />, label: 'خانه', isCenter: true },
    { key: '/invoices', icon: <FileTextOutlined />, label: 'فاکتورها' },
    { key: 'more', icon: <MenuFoldOutlined />, label: 'بیشتر', isMenu: true },
  ];

  return (
    <AntLayout className="min-h-screen bg-gray-100 dark:bg-[#141414] transition-colors duration-300">
      
      {isMobile && !collapsed && (
        <div 
          className="fixed inset-0 z-[1050] bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setCollapsed(true)}
        />
      )}

      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        collapsedWidth={isMobile ? 0 : 80}
        zeroWidthTriggerStyle={{ display: 'none' }}
        className={`border-l border-gray-200 dark:border-gray-800 shadow-2xl transition-all duration-300 z-[1100] ${isMobile && collapsed ? '!hidden w-0 !min-w-0 !max-w-0 overflow-hidden' : ''}`}
        style={{ 
          height: '100vh', 
          position: 'fixed', 
          right: 0, 
          top: 0,
          bottom: 0,
          zIndex: 1100,
          display: (isMobile && collapsed) ? 'none' : 'block' 
        }}
        theme={isDarkMode ? 'dark' : 'light'}
        width={260}
      >
        <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-gray-800 overflow-hidden px-4 sticky top-0 bg-inherit z-10">
          <div className={`transition-all duration-300 font-black text-lg text-leather-500 tracking-tighter whitespace-nowrap ${collapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
            MEHRBANOO <span className="text-gray-800 dark:text-white">LEATHER</span>
          </div>
          {collapsed && !isMobile && <div className="text-leather-500 font-black text-2xl absolute">B</div>}
        </div>

        <div style={{ height: 'calc(100vh - 128px)', overflowY: 'auto' }}>
            <Menu
            theme={isDarkMode ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => { 
                navigate(key); 
                if (isMobile) setCollapsed(true); 
            }} 
            className="mt-4 border-none bg-transparent font-medium"
            />
        </div>

        {!isMobile && (
            <div className="absolute bottom-0 w-full h-16 border-t border-gray-200 dark:border-gray-800 flex items-center justify-center bg-inherit">
                <Button 
                    type="text"
                    icon={collapsed ? <MenuUnfoldOutlined className="text-xl" /> : <MenuFoldOutlined className="text-xl" />}
                    onClick={() => setCollapsed(!collapsed)}
                    className="w-full h-full text-gray-500 dark:text-gray-400 hover:text-leather-500 hover:bg-gray-50 dark:hover:bg-white/5 rounded-none transition-all"
                />
            </div>
        )}
      </Sider>

      <AntLayout 
        className="bg-gray-100 dark:bg-[#141414] transition-all duration-300 min-h-screen flex flex-col"
        style={{ 
          paddingRight: isMobile ? 0 : 80, 
          width: '100%' 
        }}
      >
        <Header 
          className="sticky top-0 z-[1000] px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 h-16 w-full transition-colors duration-300"
          style={{ 
            backdropFilter: 'blur(20px)', 
            backgroundColor: isDarkMode ? 'rgba(20, 20, 20, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          }}
        >
          <div className="flex items-center gap-4">          
             <div className="flex items-center bg-gray-100 dark:bg-[#1a1a1a] rounded-xl px-3 py-1.5 border border-gray-200 dark:border-gray-800 w-40 sm:w-64 transition-colors">
              <SearchOutlined className="text-gray-400" />
              <input type="text" placeholder="جستجو..." className="bg-transparent border-none outline-none text-xs text-gray-700 dark:text-gray-200 w-full mr-2 placeholder-gray-400" />
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Button 
                type="text" 
                shape="circle" 
                icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />} 
                onClick={toggleTheme}
                className="text-gray-500 dark:text-gray-400 hover:text-leather-500"
            />
            <div className="w-[1px] h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
            <Badge count={5} size="small" color="#c58f60"><Button type="text" shape="circle" icon={<BellOutlined className="text-gray-500 dark:text-gray-400" />} /></Badge>
            {/* اصلاح: قرار دادن آواتار در div برای رفع وارنینگ */}
            <Dropdown menu={userMenu} placement="bottomLeft" trigger={['click']}>
                <div className="cursor-pointer transition-transform hover:scale-105">
                   {/* استفاده از متادیتای کاربر لاگین شده برای آواتار */}
                   <Avatar 
                     size="small" 
                     src={currentUser?.user_metadata?.avatar_url || "https://i.pravatar.cc/150?u=a1"} 
                     className="border border-leather-500 shadow-lg" 
                   >
                     {currentUser?.email?.[0]?.toUpperCase()}
                   </Avatar>
                </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="relative flex-1">
          {children}
        </Content>

        {!isKeyboardVisible && (
          <div className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 w-[92%] h-16 bg-white/90 dark:bg-[#1a1a1a]/95 backdrop-blur-xl border border-gray-200 dark:border-white/5 rounded-2xl flex items-center justify-around z-[1000] shadow-2xl transition-colors">
             {mobileNavItems.map((item) => {
               const isActive = location.pathname === item.key;
               if (item.isCenter) {
                 return (
                   <div key={item.key} onClick={() => navigate(item.key)} className="relative -top-5 bg-leather-500 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl border-4 border-gray-100 dark:border-dark-bg active:scale-90 transition-all">
                      <HomeOutlined className="text-white text-2xl" />
                   </div>
                 );
               }
               return (
                 <div 
                   key={item.key} 
                   onClick={() => item.isMenu ? setCollapsed(!collapsed) : navigate(item.key)} 
                   className={`flex flex-col items-center gap-1 w-12 cursor-pointer ${isActive ? 'text-leather-500' : 'text-gray-400 dark:text-gray-500'}`}
                 >
                    <div className="text-xl">{item.icon}</div>
                    <span className="text-[8px] font-black uppercase">{item.label}</span>
                 </div>
               );
             })}
          </div>
        )}
      </AntLayout>
    </AntLayout>
  );
};

=======
import React, { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Button, Avatar, Badge, Dropdown } from 'antd';
import { 
  DashboardOutlined, 
  SkinOutlined, 
  ExperimentOutlined, 
  ShopOutlined, 
  TeamOutlined, 
  SettingOutlined,
  SearchOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  BankOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  GoldOutlined,
  SunOutlined,
  MoonOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Header, Sider, Content } = AntLayout;

interface LayoutProps {
  children: React.ReactNode;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, isDarkMode, toggleTheme }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const mobile = width < 768;
      
      setIsMobile(mobile);
      setIsKeyboardVisible(window.innerHeight < 500);
      
      if (mobile) {
        setCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'داشبورد' },
    { key: '/products', icon: <SkinOutlined />, label: 'محصولات' },
    { key: '/warehouses', icon: <GoldOutlined />, label: 'انبارها' },
    { 
        key: 'production', 
        icon: <ExperimentOutlined />, 
        label: 'تولید',
        children: [
            { key: '/production_boms', label: 'شناسنامه‌های تولید (BOM)' },
            { key: '/production_orders', label: 'سفارشات تولید' },
        ] 
    },
    { key: '/suppliers', icon: <BankOutlined />, label: 'تامین کنندگان' },
    { key: '/invoices', icon: <FileTextOutlined />, label: 'فاکتورها' },
    { key: '/tasks', icon: <CheckSquareOutlined />, label: 'وظایف' },
    { key: '/customers', icon: <ShopOutlined />, label: 'مشتریان' },
    { key: '/hr', icon: <TeamOutlined />, label: 'منابع انسانی' },
    { key: '/settings', icon: <SettingOutlined />, label: 'تنظیمات' },
    
  ];

  const userMenu = {
    items: [
      {
        key: 'profile',
        label: <span onClick={() => navigate('/profile')}>پروفایل کاربری</span>,
        icon: <UserOutlined />,
      },
      { key: 'logout', label: 'خروج', icon: <LogoutOutlined />, danger: true },
    ],
  };

  type MobileNavItem = {
    key: string;
    icon: React.ReactNode;
    label: string;
    isCenter?: boolean;
    isMenu?: boolean;
  };

  const mobileNavItems: MobileNavItem[] = [
    { key: '/products', icon: <SkinOutlined />, label: 'محصولات' },
    { key: '/production_orders', icon: <CheckSquareOutlined />, label: 'تولید' },
    { key: '/', icon: <HomeOutlined />, label: 'خانه', isCenter: true },
    { key: '/invoices', icon: <FileTextOutlined />, label: 'فاکتورها' },
    { key: 'more', icon: <MenuFoldOutlined />, label: 'بیشتر', isMenu: true },
  ];

  return (
    <AntLayout className="min-h-screen bg-gray-100 dark:bg-[#141414] transition-colors duration-300">
      
      {isMobile && !collapsed && (
        <div 
          className="fixed inset-0 z-[1050] bg-black/50 backdrop-blur-sm transition-opacity duration-300"
          onClick={() => setCollapsed(true)}
        />
      )}

      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        collapsedWidth={isMobile ? 0 : 80}
        zeroWidthTriggerStyle={{ display: 'none' }}
        className={`border-l border-gray-200 dark:border-gray-800 shadow-2xl transition-all duration-300 z-[1100] ${isMobile && collapsed ? '!hidden w-0 !min-w-0 !max-w-0 overflow-hidden' : ''}`}
        style={{ 
          height: '100vh', 
          position: 'fixed', 
          right: 0, 
          top: 0,
          bottom: 0,
          zIndex: 1100,
          display: (isMobile && collapsed) ? 'none' : 'block' 
        }}
        theme={isDarkMode ? 'dark' : 'light'}
        width={260}
      >
        <div className="h-16 flex items-center justify-center border-b border-gray-200 dark:border-gray-800 overflow-hidden px-4 sticky top-0 bg-inherit z-10">
          <div className={`transition-all duration-300 font-black text-lg text-leather-500 tracking-tighter whitespace-nowrap ${collapsed ? 'opacity-0 w-0 hidden' : 'opacity-100'}`}>
            MEHRBANOO <span className="text-gray-800 dark:text-white">LEATHER</span>
          </div>
          {collapsed && !isMobile && <div className="text-leather-500 font-black text-2xl absolute">B</div>}
        </div>

        <div style={{ height: 'calc(100vh - 128px)', overflowY: 'auto' }}>
            <Menu
            theme={isDarkMode ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={({ key }) => { 
                navigate(key); 
                if (isMobile) setCollapsed(true); 
            }} 
            className="mt-4 border-none bg-transparent font-medium"
            />
        </div>

        {!isMobile && (
            <div className="absolute bottom-0 w-full h-16 border-t border-gray-200 dark:border-gray-800 flex items-center justify-center bg-inherit">
                <Button 
                    type="text"
                    icon={collapsed ? <MenuUnfoldOutlined className="text-xl" /> : <MenuFoldOutlined className="text-xl" />}
                    onClick={() => setCollapsed(!collapsed)}
                    className="w-full h-full text-gray-500 dark:text-gray-400 hover:text-leather-500 hover:bg-gray-50 dark:hover:bg-white/5 rounded-none transition-all"
                />
            </div>
        )}
      </Sider>

      <AntLayout 
        className="bg-gray-100 dark:bg-[#141414] transition-all duration-300 min-h-screen flex flex-col"
        style={{ 
          paddingRight: isMobile ? 0 : 80, 
          width: '100%' 
        }}
      >
        <Header 
          className="sticky top-0 z-[1000] px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 h-16 w-full transition-colors duration-300"
          style={{ 
            backdropFilter: 'blur(20px)', 
            backgroundColor: isDarkMode ? 'rgba(20, 20, 20, 0.8)' : 'rgba(255, 255, 255, 0.8)',
          }}
        >
          <div className="flex items-center gap-4">          
             <div className="flex items-center bg-gray-100 dark:bg-[#1a1a1a] rounded-xl px-3 py-1.5 border border-gray-200 dark:border-gray-800 w-40 sm:w-64 transition-colors">
              <SearchOutlined className="text-gray-400" />
              <input type="text" placeholder="جستجو..." className="bg-transparent border-none outline-none text-xs text-gray-700 dark:text-gray-200 w-full mr-2 placeholder-gray-400" />
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <Button 
                type="text" 
                shape="circle" 
                icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />} 
                onClick={toggleTheme}
                className="text-gray-500 dark:text-gray-400 hover:text-leather-500"
            />
            <div className="w-[1px] h-6 bg-gray-300 dark:bg-gray-700 mx-1"></div>
            <Badge count={5} size="small" color="#c58f60"><Button type="text" shape="circle" icon={<BellOutlined className="text-gray-500 dark:text-gray-400" />} /></Badge>
            {/* اصلاح: قرار دادن آواتار در div برای رفع وارنینگ */}
            <Dropdown menu={userMenu} placement="bottomLeft">
                <div>
                   <Avatar size="small" src="https://i.pravatar.cc/150?u=a1" className="border border-leather-500 cursor-pointer shadow-lg" />
                </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="relative flex-1">
          {children}
        </Content>

        {!isKeyboardVisible && (
          <div className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 w-[92%] h-16 bg-white/90 dark:bg-[#1a1a1a]/95 backdrop-blur-xl border border-gray-200 dark:border-white/5 rounded-2xl flex items-center justify-around z-[1000] shadow-2xl transition-colors">
             {mobileNavItems.map((item) => {
               const isActive = location.pathname === item.key;
               if (item.isCenter) {
                 return (
                   <div key={item.key} onClick={() => navigate(item.key)} className="relative -top-5 bg-leather-500 w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl border-4 border-gray-100 dark:border-dark-bg active:scale-90 transition-all">
                      <HomeOutlined className="text-white text-2xl" />
                   </div>
                 );
               }
               return (
                 <div 
                   key={item.key} 
                   onClick={() => item.isMenu ? setCollapsed(!collapsed) : navigate(item.key)} 
                   className={`flex flex-col items-center gap-1 w-12 cursor-pointer ${isActive ? 'text-leather-500' : 'text-gray-400 dark:text-gray-500'}`}
                 >
                    <div className="text-xl">{item.icon}</div>
                    <span className="text-[8px] font-black uppercase">{item.label}</span>
                 </div>
               );
             })}
          </div>
        )}
      </AntLayout>
    </AntLayout>
  );
};

>>>>>>> 0de9c9462de5035ffc3abdf4bc52404abbceee8f
export default Layout;