import React, { useState, useEffect } from 'react';
import { 
  Input, 
  Select, 
  DatePicker, 
  Button, 
  Modal, 
  Tag,
  InputNumber,
  Checkbox,
  message
} from 'antd';
import { 
  CheckOutlined, 
  CloseOutlined, 
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { FieldType, SmartFieldProps } from '../types';

// Helper to format numbers to Persian with commas
const formatNumber = (num: number | string) => {
  if (!num && num !== 0) return '';
  return Number(num).toLocaleString('fa-IR');
};

const SmartFieldRenderer: React.FC<SmartFieldProps> = ({ 
  label, 
  value: initialValue, 
  type, 
  options = [], 
  relationModule,
  onSave,
  readonly = false,
  className = '',
  showLabel = true
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSave = () => {
    // Basic validation check (can be expanded based on props)
    if (type === FieldType.NUMBER && isNaN(Number(value))) {
        message.error('لطفا عدد صحیح وارد کنید');
        return;
    }
    onSave(value);
    setIsEditing(false);
  };

  const handleClear = () => {
    if (type === FieldType.MULTI_SELECT || type === FieldType.CHECKLIST) {
      setValue([]);
    } else {
      setValue(null);
    }
  };

  const handleCancel = () => {
    setValue(initialValue);
    setIsEditing(false);
  };

  // Render Logic for View Mode
  const renderViewValue = () => {
    if (type === FieldType.CHECKBOX) {
         return (
             <div className="flex items-center gap-2">
                 <div className={`w-4 h-4 rounded border flex items-center justify-center ${value ? 'bg-leather-500 border-leather-500' : 'border-gray-400 dark:border-gray-600'}`}>
                     {value && <CheckOutlined className="text-white text-[10px]" />}
                 </div>
                 <span className="text-gray-500 dark:text-gray-400 text-xs">{value ? 'بله' : 'خیر'}</span>
             </div>
         )
    }

    if (value === null || value === undefined || value === '') {
      return <span className="text-gray-400 dark:text-gray-600 italic text-xs">خالی</span>;
    }

    switch (type) {
      case FieldType.MULTI_SELECT:
        return (
          <div className="flex flex-wrap gap-1">
            {Array.isArray(value) && value.map((v: string) => (
               <Tag key={v} color="gold" className="mr-0 ml-1 border-none bg-leather-500/20 text-leather-500 text-[10px] px-1">
                 {options.find(o => o.value === v)?.label || v}
               </Tag>
            ))}
          </div>
        );
      case FieldType.SELECT:
      case FieldType.STATUS:
        const selectedOption = options.find(o => o.value === value);
        if (type === FieldType.STATUS && selectedOption?.color) {
            return <Tag color={selectedOption.color} className="mr-0">{selectedOption.label}</Tag>
        }
        return <span className={`text-gray-800 dark:text-gray-200 ${className}`}>{selectedOption ? selectedOption.label : value}</span>;
      case FieldType.RELATION:
        return <span className={`text-leather-500 hover:underline cursor-pointer ${className}`}>{value}</span>;
      case FieldType.DATE:
      case FieldType.DATETIME:
        return <span className={`text-gray-600 dark:text-gray-300 font-mono ${className}`}>{dayjs(value).format('YYYY-MM-DD')}</span>;
      case FieldType.NUMBER:
      case FieldType.STOCK:
         return <span className={`text-gray-800 dark:text-gray-200 font-medium font-sans ${className}`}>{formatNumber(value)}</span>;
      case FieldType.PRICE:
         return <div className="flex items-center gap-1"><span className={`text-gray-900 dark:text-white font-bold font-sans ${className}`}>{formatNumber(value)}</span> <span className="text-[9px] text-gray-500">تومان</span></div>;
      case FieldType.PERCENTAGE:
         return <span className={`text-gray-800 dark:text-gray-200 font-medium font-sans ${className}`}>٪ {formatNumber(value)}</span>;
      case FieldType.CHECKLIST:
        return <span className={className}>{Array.isArray(value) ? `${value.length} مورد` : value}</span>;
      default:
        return <span className={`text-gray-800 dark:text-gray-200 ${className}`}>{value}</span>;
    }
  };

  // Render Logic for Input Component
  const renderInput = () => {
    switch (type) {
      case FieldType.TEXT:
        return <Input value={value} onChange={(e) => setValue(e.target.value)} size="small" className="text-sm" autoFocus />;
      case FieldType.CHECKBOX:
        return <Checkbox checked={value} onChange={(e) => setValue(e.target.checked)} />;
      case FieldType.NUMBER:
      case FieldType.PRICE:
      case FieldType.STOCK:
      case FieldType.PERCENTAGE:
        return (
          <InputNumber 
            value={value} 
            onChange={(val) => setValue(val)} 
            className="w-full text-sm" 
            size="small"
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => value?.replace(/\$\s?|(,*)/g, '') as unknown as number}
            autoFocus 
          />
        );
      case FieldType.MULTI_SELECT:
        return (
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            value={value}
            onChange={setValue}
            options={options}
            size="small"
            autoFocus
            maxTagCount="responsive"
          />
        );
      case FieldType.SELECT:
      case FieldType.STATUS:
          return (
            <Select
              style={{ width: '100%' }}
              value={value}
              onChange={setValue}
              options={options}
              size="small"
              autoFocus
            />
          );
      case FieldType.DATE:
        return <DatePicker className="w-full" size="small" onChange={(d, dateString) => setValue(dateString)} />;
      case FieldType.RELATION:
        return (
          <div className="flex gap-1 w-full">
            <Input value={value} readOnly placeholder="..." size="small" className="text-xs"/>
            <Button 
              size="small"
              icon={<SearchOutlined />} 
              onClick={() => setIsModalOpen(true)}
              className="border-leather-500 text-leather-500" 
            />
            {/* Relation Modal Mockup */}
            <Modal 
              title={`انتخاب ${relationModule}`} 
              open={isModalOpen} 
              onCancel={() => setIsModalOpen(false)}
              footer={null}
              width={400}
            >
               <Input.Search placeholder="جستجو..." className="mb-4" />
               <div className="flex flex-col gap-2">
                 {['تامین کننده الف', 'تامین کننده ب'].map(item => (
                   <div 
                    key={item} 
                    className="p-2 bg-gray-50 dark:bg-dark-surface rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer flex justify-between text-sm transition-colors"
                    onClick={() => { setValue(item); setIsModalOpen(false); }}
                   >
                     <span>{item}</span>
                   </div>
                 ))}
               </div>
            </Modal>
          </div>
        );
      default:
        return <Input value={value} onChange={(e) => setValue(e.target.value)} size="small" />;
    }
  };

  return (
    <div className={`group relative p-2 rounded border border-transparent ${!readonly ? 'hover:border-gray-200 dark:hover:border-gray-800 hover:bg-gray-50 dark:hover:bg-[#262626]' : ''} transition-all duration-200`}>
      {showLabel && label && <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-0.5 flex justify-between">
          {label}
          {readonly && <LockOutlined className="text-gray-400 dark:text-gray-600 text-[9px]"/>}
      </div>}
      
      {!isEditing ? (
        <div className="flex justify-between items-center min-h-[20px]">
          <div className="w-full break-words leading-tight">
            {renderViewValue()}
          </div>
          {!readonly && (
            <button 
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-leather-500 ml-1"
            >
              <EditOutlined className="text-xs" />
            </button>
          )}
        </div>
      ) : (
        <div className="animate-fadeIn">
          <div className="mb-1">
            {renderInput()}
          </div>
          <div className="flex items-center gap-1 justify-end">
              <Button 
                size="small" 
                type="text" 
                className="w-6 h-6 flex items-center justify-center text-green-500 hover:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/20"
                icon={<CheckOutlined className="text-xs" />} 
                onClick={handleSave} 
              />
              <Button 
                size="small" 
                type="text"
                className="w-6 h-6 flex items-center justify-center text-red-500 hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20"
                icon={<DeleteOutlined className="text-xs" />} 
                onClick={handleClear}
              />
              <Button 
                size="small" 
                type="text" 
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-white"
                icon={<CloseOutlined className="text-xs" />} 
                onClick={handleCancel}
              />
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartFieldRenderer;