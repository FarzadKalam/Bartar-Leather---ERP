import React from 'react';
import { Button, Tag, Image, Upload, Select, Space } from 'antd';
import {
  UploadOutlined,
  LoadingOutlined,
  AppstoreOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  EditOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { FieldLocation, FieldType } from '../../types';
import { toPersianNumber, safeJalaliFormat } from '../../utils/persianNumberFormatter';
import TagInput from '../TagInput';

interface HeroSectionProps {
  data: any;
  moduleId: string;
  moduleConfig: any;
  currentTags: any[];
  onTagsChange: () => void;
  renderSmartField: (field: any, isHeader?: boolean) => React.ReactNode;
  getOptionLabel: (field: any, value: any) => string;
  getUserName: (uid: string) => string;
  handleAssigneeChange: (value: string) => void;
  getAssigneeOptions: () => any[];
  assigneeIcon: React.ReactNode;
  onImageUpdate: (file: File) => Promise<boolean> | boolean;
  canViewField?: (fieldKey: string) => boolean;
  canEditModule?: boolean;
}

const HeroSection: React.FC<HeroSectionProps> = ({
  data,
  moduleId,
  moduleConfig,
  currentTags,
  onTagsChange,
  renderSmartField,
  getOptionLabel,
  getUserName,
  handleAssigneeChange,
  getAssigneeOptions,
  assigneeIcon,
  onImageUpdate,
  canViewField,
  canEditModule = true,
}) => {
  const imageField = moduleConfig?.fields?.find((f: any) => f.type === FieldType.IMAGE);
  const canShowImage = !!imageField && (canViewField ? canViewField(imageField.key) !== false : true);

  return (
    <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 mb-6 relative overflow-hidden animate-fadeIn">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-leather-500 to-leather-800 opacity-80"></div>

      <div className="flex flex-col lg:flex-row gap-8 items-stretch">
        {/* تصویر */}
        {canShowImage && (
          <div className="w-full lg:w-56 h-48 lg:h-56 shrink-0 rounded-2xl border-4 border-white dark:border-gray-700 shadow-xl relative group overflow-hidden bg-gray-100 dark:bg-black/20 self-center lg:self-start">
            {data.image_url ? (
              <Image
                src={data.image_url}
                className="w-full h-full object-cover"
                wrapperStyle={{ width: '100%', height: '100%' }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <LoadingOutlined className="text-3xl opacity-20" />
                <span className="text-xs">بدون تصویر</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center backdrop-blur-sm">
              <Upload showUploadList={false} beforeUpload={onImageUpdate}>
                <Button type="primary" icon={<UploadOutlined />} className="bg-leather-500 border-none" disabled={!canEditModule}>
                  تغییر تصویر
                </Button>
              </Upload>
            </div>
          </div>
        )}

        {/* محتوا */}
        <div className="flex-1 w-full flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4 mt-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-black m-0 text-gray-800 dark:text-white">{data.name}</h1>
                {(data.system_code || data.custom_code) && (
                  <Tag className="font-mono dir-ltr bg-gray-100 dark:bg-white/10 border-none text-gray-500 px-2 py-1">
                    {data.system_code || data.custom_code}
                  </Tag>
                )}
              </div>

              {/* بخش انتخاب مسئول */}
              {(canViewField ? canViewField('assignee_id') !== false : true) && (
                <div className="flex items-center bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-gray-700 rounded-full pl-1 pr-3 py-1 gap-2">
                  <span className="text-xs text-gray-400">مسئول:</span>
                  <Select
                    bordered={false}
                    value={data.assignee_id ? `${data.assignee_type}_${data.assignee_id}` : null}
                    onChange={handleAssigneeChange}
                    placeholder="انتخاب کنید"
                    className="min-w-[140px] font-bold text-gray-700 dark:text-gray-300"
                    dropdownStyle={{ minWidth: 200 }}
                    options={getAssigneeOptions()}
                    optionRender={(option) => (
                      <Space>
                        <span role="img" aria-label={option.data.label}>{(option.data as any).emoji}</span>
                        {option.data.label}
                      </Space>
                    )}
                    disabled={!canEditModule}
                  />
                  <div className="w-6 h-6 flex items-center justify-center">{assigneeIcon}</div>
                </div>
              )}
            </div>

            {/* --- کامپوننت مدیریت تگ --- */}
            {(canViewField ? canViewField('tags') !== false : true) && (
              <div className="mb-6">
                <TagInput
                  recordId={data.id}
                  moduleId={moduleId}
                  initialTags={currentTags}
                  onChange={onTagsChange}
                />
              </div>
            )}

            {/* فیلدهای هدر */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mt-6">
              {moduleConfig.fields
                .filter((f: any) => f.location === FieldLocation.HEADER && !['name', 'image_url', 'system_code', 'tags'].includes(f.key))
                .filter((f: any) => (canViewField ? canViewField(f.key) !== false : true))
                .map((f: any) => (
                  <div key={f.key} className="flex flex-col gap-1 border-r last:border-0 border-gray-100 dark:border-gray-700 px-4 first:pr-0">
                    <span className="text-xs text-gray-400 uppercase tracking-wider">{f.labels.fa}</span>
                    {renderSmartField(f, true)}
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {/* تگ‌های پایین */}
            <div className="flex gap-2 overflow-x-auto pb-2 border-t border-gray-100 dark:border-gray-800 pt-4">
              {data.category && (
                <Tag
                  icon={<AppstoreOutlined />}
                  className="rounded-full px-3 py-1 bg-gray-50 dark:bg-white/5 border-none text-gray-600 dark:text-gray-300"
                >
                  {getOptionLabel(moduleConfig.fields.find((f: any) => f.key === 'category'), data.category)}
                </Tag>
              )}
              {data.product_type && (
                <Tag className="rounded-full px-3 py-1 bg-leather-50 text-leather-600 border-none">
                  {getOptionLabel(moduleConfig.fields.find((f: any) => f.key === 'product_type'), data.product_type)}
                </Tag>
              )}
            </div>

            {/* --- فیلدهای سیستمی (System Info) --- */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                  <SafetyCertificateOutlined className="text-green-600" />
                </div>
                <div className="flex flex-col">
                  <span className="opacity-70">ایجاد کننده</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300">{getUserName(data.created_by)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                  <ClockCircleOutlined className="text-blue-500" />
                </div>
                <div className="flex flex-col">
                  <span className="opacity-70">زمان ایجاد</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300" dir="ltr">
                    {(() => {
                      if (!data.created_at) return '-';
                      const formatted = safeJalaliFormat(data.created_at, 'YYYY/MM/DD - HH:mm');
                      return formatted ? toPersianNumber(formatted) : '-';
                    })()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                  <EditOutlined className="text-orange-500" />
                </div>
                <div className="flex flex-col">
                  <span className="opacity-70">آخرین ویرایشگر</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300">{getUserName(data.updated_by)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-white dark:bg-white/10 p-1.5 rounded-full">
                  <HistoryOutlined className="text-purple-500" />
                </div>
                <div className="flex flex-col">
                  <span className="opacity-70">زمان ویرایش</span>
                  <span className="font-bold text-gray-700 dark:text-gray-300" dir="ltr">
                    {(() => {
                      if (!data.updated_at) return '-';
                      const formatted = safeJalaliFormat(data.updated_at, 'YYYY/MM/DD - HH:mm');
                      return formatted ? toPersianNumber(formatted) : '-';
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
