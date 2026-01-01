
import React, { useState } from 'react';
import { Table, Button, Tag, Progress, Tooltip, Checkbox, Dropdown, Menu, Input, Space } from 'antd';
import { 
  PlusOutlined, 
  AppstoreOutlined, 
  BarsOutlined, 
  MoreOutlined,
  ExportOutlined,
  ImportOutlined,
  DeploymentUnitOutlined,
  BarChartOutlined,
  EditOutlined,
  MergeCellsOutlined,
  DeleteOutlined,
  RobotOutlined,
  SearchOutlined,
  FilterOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { MOCK_PRODUCTS } from '../../mockData';
import { Product } from '../../types';

const getStockStatus = (stock: number, reorderPoint: number) => {
  const max = reorderPoint * 5;
  const percent = Math.min((stock / max) * 100, 100);
  let color = '#52c41a';
  if (stock <= reorderPoint) color = '#ff4d4f';
  else if (stock <= reorderPoint * 2) color = '#faad14';
  return { percent, color };
};

const ProductList: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const columns = [
    {
      title: 'نام و کد کالا',
      dataIndex: 'name',
      key: 'name',
      fixed: 'left' as const,
      width: 180,
      sorter: (a: any, b: any) => a.name.localeCompare(b.name),
      render: (text: string, record: Product) => (
        <div className="flex items-center gap-2 py-0.5">
          <img src={record.image} className="w-8 h-8 rounded-md object-cover border border-gray-800 hidden md:block" alt="" />
          <div className="flex flex-col leading-tight overflow-hidden">
            <span className="font-bold text-gray-200 text-[11px] md:text-sm cursor-pointer hover:text-leather-500 transition-colors truncate" onClick={() => navigate(`/products/${record.id}`)}>{text}</span>
            <span className="text-[9px] text-gray-600 font-mono tracking-tighter uppercase">{record.sku}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'دسته‌بندی',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (tag: string) => <Tag className="bg-leather-500/10 border-none text-leather-500 text-[9px] px-2 font-bold">{tag}</Tag>,
    },
    {
      title: 'انبار',
      dataIndex: 'stock',
      key: 'stock',
      width: 120,
      sorter: (a: any, b: any) => a.stock - b.stock,
      render: (val: number, record: Product) => {
        const { percent, color } = getStockStatus(val, record.reorder_point);
        return (
          <div className="flex flex-col w-20 md:w-28 gap-0.5">
            <div className="flex justify-between text-[9px] font-black">
              <span style={{ color }}>{val.toLocaleString('fa-IR')}</span>
              <span className="text-gray-700 hidden md:inline">{(record.reorder_point * 3).toLocaleString('fa-IR')}</span>
            </div>
            <Progress percent={percent} strokeColor={color} showInfo={false} size={2} trailColor="#262626" />
          </div>
        );
      },
    },
    {
        title: 'قیمت فروش',
        dataIndex: 'sell_price',
        key: 'sell_price',
        width: 140,
        sorter: (a: any, b: any) => a.sell_price - b.sell_price,
        render: (val: number) => (
          <div className="flex items-center gap-1">
            <span className="font-black text-gray-200 text-[11px] md:text-sm">{val.toLocaleString('fa-IR')}</span>
            <span className="text-[8px] text-gray-600">تومان</span>
          </div>
        ),
      },
  ];

  const toolsMenu = (
    <Menu theme="dark" items={[
      { key: 'export', label: 'خروجی اکسل', icon: <ExportOutlined /> },
      { key: 'import', label: 'وارد کردن داده‌ها', icon: <ImportOutlined /> },
      { key: 'workflow', label: 'گردش کار', icon: <DeploymentUnitOutlined /> },
      { key: 'reports', label: 'گزارشات آماری', icon: <BarChartOutlined /> },
    ]} />
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4 space-y-4">
      {/* --- CONTROL HUB --- */}
      <div className="flex justify-between items-center bg-dark-surface/40 backdrop-blur-xl p-4 md:p-6 rounded-[2rem] border border-gray-800/60 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-3 md:gap-5">
          <div className="w-10 h-10 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-leather-500 to-leather-800 flex items-center justify-center text-white text-lg md:text-2xl shadow-lg">
             <AppstoreOutlined />
          </div>
          <h1 className="text-base md:text-2xl font-black text-white m-0 tracking-tighter">محصولات</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* GLASS CONTROL POD */}
          <div className="flex items-center bg-black/40 border border-gray-800 p-1 rounded-2xl backdrop-blur-md shadow-inner">
             <Button type="text" icon={<SearchOutlined className="text-gray-400 text-sm" />} className="hover:text-leather-500" />
             <div className="w-[1px] h-4 bg-gray-800 mx-1"></div>
             <Button type="text" icon={<FilterOutlined className="text-gray-400 text-sm" />} className="hover:text-leather-500" />
             <div className="w-[1px] h-4 bg-gray-800 mx-1"></div>
             <div className="flex items-center p-0.5 bg-gray-800/50 rounded-xl">
                <Button size="small" type={viewMode === 'table' ? 'primary' : 'text'} icon={<BarsOutlined />} onClick={() => setViewMode('table')} className={viewMode === 'table' ? 'bg-leather-500' : 'text-gray-500'} />
                <Button size="small" type={viewMode === 'grid' ? 'primary' : 'text'} icon={<AppstoreOutlined />} onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? 'bg-leather-500' : 'text-gray-500'} />
             </div>
          </div>
          <Dropdown overlay={toolsMenu} trigger={['click']}>
             <Button shape="circle" icon={<MoreOutlined rotate={90} />} className="bg-gray-800 border-none text-gray-400" />
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} className="bg-leather-500 border-none font-black rounded-2xl px-4 md:px-6 h-10 md:h-12 hidden md:flex items-center">جدید</Button>
        </div>
      </div>

      {/* Grid/Table Container */}
      <div className="min-h-[60vh]">
        {viewMode === 'table' ? (
          <div className="bg-dark-surface rounded-[2rem] border border-gray-800 overflow-hidden shadow-2xl">
            <Table 
              rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
              columns={columns} 
              dataSource={MOCK_PRODUCTS} 
              rowKey="id"
              pagination={{ pageSize: 12, position: ['bottomCenter'], size: 'small' }}
              className="custom-erp-table-compact"
              scroll={{ x: 'max-content' }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-8">
            {MOCK_PRODUCTS.map(item => {
              const isSelected = selectedRowKeys.includes(item.id);
              const { color } = getStockStatus(item.stock, item.reorder_point);
              return (
                <div key={item.id} className={`bg-dark-surface border rounded-[1.5rem] p-3 md:p-5 relative group transition-all duration-300 hover:shadow-2xl ${isSelected ? 'border-leather-500 bg-leather-500/5' : 'border-gray-800'}`}>
                  <div className="absolute top-3 left-3 z-10">
                     <Checkbox 
                        checked={isSelected} 
                        onChange={(e) => e.target.checked ? setSelectedRowKeys([...selectedRowKeys, item.id]) : setSelectedRowKeys(selectedRowKeys.filter(k => k !== item.id))}
                        className="custom-check-leather"
                     />
                  </div>
                  <div className="cursor-pointer" onClick={() => navigate(`/products/${item.id}`)}>
                    <div className="aspect-[4/3] rounded-xl overflow-hidden mb-3 border border-gray-800 bg-black/20">
                      <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="" />
                    </div>
                    <div className="px-1">
                        <Tag className="bg-gray-800/50 border-none text-gray-600 text-[8px] font-black mb-1 uppercase tracking-tighter">{item.category}</Tag>
                        <h3 className="text-gray-200 font-bold text-[11px] md:text-sm mb-3 line-clamp-1 group-hover:text-leather-500 transition-colors">{item.name}</h3>
                        <div className="flex justify-between items-center border-t border-gray-800/50 pt-3">
                            <span className="text-[10px] md:text-xs font-black" style={{ color }}>{item.stock.toLocaleString('fa-IR')}</span>
                            <span className="text-leather-500 font-black text-[11px] md:text-sm">{item.sell_price.toLocaleString('fa-IR')}</span>
                        </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .custom-erp-table-compact .ant-table-thead > tr > th { 
          background: #1a1a1a !important; 
          color: #555 !important; 
          font-size: 9px !important; 
          font-weight: 900 !important; 
          padding: 12px 14px !important;
          border-bottom: 1px solid #262626 !important;
        }
        .custom-erp-table-compact .ant-table-tbody > tr > td { 
          padding: 8px 14px !important; 
          border-bottom: 1px solid #222 !important; 
        }
        .custom-erp-table-compact .ant-table-tbody > tr:hover > td { background: #222 !important; }
        .custom-check-leather .ant-checkbox-inner { border-radius: 6px; background: #111; border-color: #333; }
        .custom-check-leather .ant-checkbox-checked .ant-checkbox-inner { background: #c58f60; border-color: #c58f60; }
      `}</style>
    </div>
  );
};

export default ProductList;
