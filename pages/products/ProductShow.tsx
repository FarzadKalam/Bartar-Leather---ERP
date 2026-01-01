import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import * as Icons from '@ant-design/icons'; 
import { 
  ArrowRightOutlined, 
  PrinterOutlined, 
  ShareAltOutlined,
  CheckSquareOutlined,
  HistoryOutlined,
  PlusOutlined,
  MessageOutlined,
  CameraOutlined,
  GoldOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { Button, Timeline, Checkbox, Tag, List, Avatar, Input, Breadcrumb } from 'antd';
import { MOCK_PRODUCTS } from '../../mockData';
import { MODULES } from '../../moduleRegistry';
import SmartFieldRenderer from '../../components/SmartFieldRenderer';
import { FieldType, FieldLocation, FieldDefinition, UserRole, LogicOperator } from '../../src/types';

const CURRENT_USER = { name: 'علی رضایی', role: UserRole.ADMIN };

const MOCK_TOOL_DATA = {
  notes: [
    { id: 1, user: 'محمدی', text: 'ارسال شد.', date: '۱۴۰۲/۰۹/۱۲', avatar: 'https://i.pravatar.cc/150?u=1' },
    { id: 2, user: 'علی رضایی', text: 'تاییدیه کیفی.', date: '۱۴۰۲/۰۹/۱۵', avatar: 'https://i.pravatar.cc/150?u=a1' },
  ],
  tasks: [{ id: 1, text: 'بررسی قیمت گذاری', done: false }, { id: 2, text: 'عکاسی مجدد', done: true }],
  history: [
    { time: '۱۴۰۲/۰۹/۱۰', action: 'تغییر موجودی', user: 'انباردار', detail: '۸۵ -> ۹۰' },
    { time: '۱۴۰۲/۰۴/۰۴', action: 'ایجاد محصول', user: 'سیستم', detail: 'ثبت اولیه' },
  ]
};

const ProductShow: React.FC = () => {
  const { id } = useParams();
  const moduleConfig = MODULES['products'];
  const productRaw = MOCK_PRODUCTS.find(p => p.id === id) || MOCK_PRODUCTS[0];
  const [product, setProduct] = useState<any>(productRaw);
  const [activeSidebar, setActiveSidebar] = useState<string | null>(null);

  const getIcon = (iconName: string) => {
    const IconComp = (Icons as any)[iconName];
    return IconComp ? <IconComp className="text-leather-500" /> : <Icons.AppstoreOutlined className="text-leather-500" />;
  };

  const handleDataChange = (fieldKey: string, val: any) => {
    let newData = { ...product };
    if (Object.keys(newData.specs || {}).includes(fieldKey) || ['warrantyMonths', 'hasWarranty'].includes(fieldKey)) {
        newData.specs = { ...(newData.specs || {}), [fieldKey]: val };
    } else {
        newData[fieldKey] = val;
    }
    setProduct(newData);
  };

  const checkVisibility = (field: FieldDefinition, data: any): boolean => {
      if (field.access?.viewRoles && !field.access.viewRoles.includes(CURRENT_USER.role)) return false;
      if (field.logic?.visibleIf) {
          const rule = field.logic.visibleIf;
          const val = data[rule.field] !== undefined ? data[rule.field] : (data.specs?.[rule.field]);
          if (rule.operator === LogicOperator.IS_TRUE) return !!val;
          if (rule.operator === LogicOperator.IS_FALSE) return !val;
          return val === rule.value;
      }
      return true;
  };

  const getValue = (key: string) => product[key] !== undefined ? product[key] : (product.specs ? product.specs[key] : undefined);

  const { headerFields, blockFields } = useMemo(() => ({
      headerFields: moduleConfig.fields.filter(f => f.location === FieldLocation.HEADER).sort((a, b) => a.order - b.order),
      blockFields: moduleConfig.fields.filter(f => f.location === FieldLocation.BLOCK),
  }), [moduleConfig]);

  const renderSidebarContent = () => {
    const sidebarConfigs: Record<string, { title: string, icon: React.ReactNode, content: React.ReactNode }> = {
      notes: { title: 'یادداشت‌ها', icon: <MessageOutlined />, content: (
        <List dataSource={MOCK_TOOL_DATA.notes} renderItem={note => (
            <div className="p-4 bg-dark-surface border border-gray-800 rounded-2xl mb-3">
               <div className="flex items-center gap-2 mb-2 text-[9px]">
                  <Avatar size="small" src={note.avatar} />
                  <span className="text-white font-black">{note.user}</span>
               </div>
               <p className="text-[11px] text-gray-400 font-medium leading-relaxed">{note.text}</p>
            </div>
          )} />
      )},
      tasks: { title: 'وظایف کالا', icon: <CheckSquareOutlined />, content: (
        <List dataSource={MOCK_TOOL_DATA.tasks} renderItem={task => (
            <div className={`p-4 border border-gray-800 rounded-2xl mb-3 flex items-center gap-4 ${task.done ? 'bg-gray-800/10 opacity-50' : 'bg-dark-surface'}`}>
               <Checkbox checked={task.done} />
               <span className="text-xs font-bold text-gray-300">{task.text}</span>
            </div>
          )} />
      )},
      history: { title: 'تاریخچه', icon: <HistoryOutlined />, content: (
        <Timeline mode="right" className="custom-timeline mt-4 pr-6" items={MOCK_TOOL_DATA.history.map(h => ({
            children: <div className="text-right pb-4"><span className="text-[10px] text-leather-500 font-black">{h.action}</span><div className="text-[9px] text-gray-600">{h.time}</div></div>,
            color: '#c58f60'
          }))} />
      )},
    };

    const current = sidebarConfigs[activeSidebar || ''];
    if (!current) return null;

    return (
      <div className="flex flex-col h-full bg-[#111] relative">
        {/* Header of Sidebar Panel */}
        <div className="p-5 flex items-center gap-3 border-b border-gray-800 bg-[#161616] sticky top-0 z-[120]">
           <div className="w-8 h-8 rounded-xl bg-leather-500/10 flex items-center justify-center text-leather-500">{current.icon}</div>
           <span className="text-white font-black text-xs uppercase tracking-tighter">{current.title}</span>
        </div>
        
        {/* Content Area */}
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar pb-32 md:pb-10">
           {current.content}
        </div>

        {/* --- FLOATING CLOSE BUTTON (Mobile - Move up to clear Bottom Nav) --- */}
        <div className="md:hidden fixed bottom-28 right-6 z-[130]">
           <Button 
            type="primary" 
            shape="circle" 
            size="large"
            icon={<CloseOutlined />} 
            onClick={() => setActiveSidebar(null)}
            className="bg-leather-500 shadow-[0_10px_25px_rgba(197,143,96,0.6)] h-14 w-14 flex items-center justify-center border-none scale-110"
           />
        </div>
      </div>
    );
  };

  const SidebarItem = ({ icon, label, id }: any) => (
    <div onClick={() => setActiveSidebar(activeSidebar === id ? null : id)} className={`w-full py-5 flex flex-col items-center gap-1 cursor-pointer transition-all border-r-2 ${activeSidebar === id ? 'bg-leather-500/10 border-leather-500 text-leather-500' : 'border-transparent text-gray-700 hover:text-gray-300'}`}>
      <div className="text-xl">{icon}</div><span className="text-[8px] font-black uppercase mt-1">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-dark-bg">
      
      {/* --- STICKY BREADCRUMBS (CLEAN ATTACHMENT TO HEADER) --- */}
      <div className="sticky top-16 z-[95] bg-[#141414] border-b border-gray-800 h-10 flex items-center px-4 md:px-10 max-w-[1600px] w-full mx-auto">
        <Breadcrumb
          separator={<span className="text-gray-800 text-[8px] mx-1">/</span>}
          items={[
            { title: <Link to="/products" className="text-gray-600 hover:text-leather-500"><span className="text-[9px] font-bold">محصولات</span></Link> },
            { title: <span className="text-leather-500 text-[9px] font-black truncate max-w-[180px] md:max-w-none">{product.name}</span> },
          ]}
        />
        <div className="mr-auto flex items-center gap-3">
             <Button size="small" type="text" icon={<PrinterOutlined className="text-gray-700" />} />
             <Button size="small" type="text" icon={<ShareAltOutlined className="text-gray-700" />} />
        </div>
      </div>

      {/* Main Container - No Gap */}
      <div className="flex flex-1 max-w-[1600px] w-full mx-auto relative items-start">
        
        {/* --- DYNAMIC TOOLS BAR (Sticky with Sidebar Offset) --- */}
        <div className="flex h-full shrink-0 sticky top-[104px] z-[90]">
           {/* Sidebar Icons (Stay Visible even when drawer is open) */}
           <div className="bg-[#111] border-l border-gray-800 flex flex-col w-[60px] md:w-[64px] h-[calc(100vh-104px)] relative shadow-2xl">
              <SidebarItem id="notes" icon={<MessageOutlined />} label="یادداشت" />
              <SidebarItem id="tasks" icon={<CheckSquareOutlined />} label="وظایف" />
              <SidebarItem id="history" icon={<HistoryOutlined />} label="تاریخچه" />
              <div className="mt-auto mb-6">
                <SidebarItem id="inv" icon={<GoldOutlined />} label="انبار" />
              </div>
           </div>

           {/* TOOL PANEL (Starts BELOW Breadcrumbs: top-104px) */}
           <div className={`
              bg-[#111] transition-all duration-300 ease-in-out overflow-hidden flex flex-col border-l border-gray-800
              ${activeSidebar ? 'w-full fixed right-[60px] left-0 bottom-0 top-[104px] z-[110] md:relative md:top-0 md:inset-auto md:w-[320px] md:right-0 shadow-2xl' : 'w-0'}
              md:h-[calc(100vh-104px)]
           `}>
              {activeSidebar && renderSidebarContent()}
           </div>
        </div>

        {/* --- MAIN CONTENT SCROLL AREA --- */}
        <div className={`flex-1 px-4 md:px-10 py-6 md:py-8 pb-32 transition-all duration-300`}>
          
          {/* Hero Section */}
          <div className="bg-dark-surface rounded-[1.5rem] md:rounded-[2.5rem] p-5 md:p-12 border border-gray-800/60 flex flex-col lg:flex-row gap-6 md:gap-14 mb-8 shadow-2xl overflow-hidden relative">
             <div className="w-full lg:w-56 h-44 md:h-56 rounded-2xl overflow-hidden border border-gray-800 shrink-0 mx-auto lg:mx-0 relative z-10">
               <img src={product.image} className="w-full h-full object-cover" alt="" />
               <div className="absolute bottom-3 right-3"><Button size="small" shape="circle" icon={<CameraOutlined className="text-white"/>} className="bg-black/40 border-none backdrop-blur-md" /></div>
             </div>
             
             <div className="flex-1 flex flex-col justify-center relative z-10 text-center lg:text-right">
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-3">
                      <SmartFieldRenderer showLabel={false} value={getValue('status')} type={FieldType.STATUS} options={headerFields.find(f => f.key === 'status')?.options} onSave={(v) => handleDataChange('status', v)} />
                      <Tag className="bg-black/40 border-gray-800 text-gray-500 font-mono text-[9px] m-0 px-2 uppercase">{product.sku}</Tag>
                  </div>
                  <SmartFieldRenderer showLabel={false} value={getValue('name')} type={FieldType.TEXT} onSave={(v) => handleDataChange('name', v)} className="text-xl md:text-4xl font-black text-white p-0 tracking-tight leading-tight mb-6 md:mb-10" />
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                      {headerFields.filter(f => !['name', 'status'].includes(f.key)).map(field => checkVisibility(field, product) && (
                          <div key={field.key} className="flex flex-col gap-0.5 border-r border-gray-800/40 pr-3 first:pr-0 first:border-none">
                              <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest">{field.labels.fa}</span>
                              <SmartFieldRenderer showLabel={false} value={getValue(field.key)} type={field.type} options={field.options} onSave={(v) => handleDataChange(field.key, v)} className="text-[11px] md:text-sm text-gray-200 font-bold" />
                          </div>
                      ))}
                  </div>
             </div>
          </div>

          {/* Blocks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
             {moduleConfig.blocks.sort((a,b) => a.order - b.order).map(block => {
               const fields = blockFields.filter(f => f.blockId === block.id).filter(f => checkVisibility(f, product));
               if (fields.length === 0) return null;
               return (
                  <div key={block.id} className="bg-dark-surface rounded-[1.5rem] border border-gray-800/60 p-6 md:p-8 shadow-xl">
                      <div className="flex items-center gap-3 mb-6 md:mb-8 border-b border-gray-800/50 pb-4">
                         <div className="w-8 h-8 rounded-xl bg-leather-500/10 flex items-center justify-center text-leather-500">{getIcon(block.icon)}</div>
                         <h3 className="text-[10px] font-black text-white uppercase m-0 tracking-tighter">{block.titles.fa}</h3>
                      </div>
                      <div className="space-y-4 md:space-y-6">
                          {fields.map(field => (
                              <SmartFieldRenderer key={field.key} label={field.labels.fa} value={getValue(field.key)} type={field.type} options={field.options} onSave={(v) => handleDataChange(field.key, v)} />
                          ))}
                      </div>
                  </div>
               );
             })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductShow;