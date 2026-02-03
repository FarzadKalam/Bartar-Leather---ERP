import React from 'react';
import { Button, Breadcrumb, Tooltip, Popover, QRCode } from 'antd';
import { ArrowRightOutlined, HomeOutlined, PrinterOutlined, ShareAltOutlined, QrcodeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

interface HeaderActionsProps {
  moduleTitle: string;
  recordName: string;
  shareUrl: string;
  onBack: () => void;
  onHome: () => void;
  onModule: () => void;
  onPrint: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const HeaderActions: React.FC<HeaderActionsProps> = ({
  moduleTitle,
  recordName,
  shareUrl,
  onBack,
  onHome,
  onModule,
  onPrint,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = true,
}) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-2 md:gap-4">
      <div className="flex items-center gap-2 md:gap-4 w-full md:w-auto overflow-hidden">
        <Button
          icon={<ArrowRightOutlined />}
          onClick={onBack}
          shape="circle"
          size="large"
          className="border-none shadow-sm shrink-0"
        />
        <Breadcrumb
          className="whitespace-nowrap overflow-x-auto no-scrollbar text-xs md:text-sm"
          items={[
            { title: <HomeOutlined />, onClick: onHome },
            { title: moduleTitle, onClick: onModule },
            { title: recordName },
          ]}
        />
      </div>
      <div className="flex gap-2 md:gap-3 w-full md:w-auto justify-end flex-wrap">
        <Tooltip title="چاپ">
          <Button
            icon={<PrinterOutlined />}
            onClick={onPrint}
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600 min-w-[40px]"
          />
        </Tooltip>
        <Tooltip title="اشتراک گذاری">
          <Button 
            icon={<ShareAltOutlined />} 
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600 min-w-[40px]" 
          />
        </Tooltip>
        <Popover content={<QRCode value={shareUrl} bordered={false} />} trigger="click">
          <Button 
            icon={<QrcodeOutlined />} 
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600 px-3"
          >
            QR
          </Button>
        </Popover>
        {canEdit && (
          <Button
            icon={<EditOutlined />}
            onClick={onEdit}
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600 inline-flex"
          >
            ویرایش
          </Button>
        )}
        {canDelete && (
          <Button
            icon={<DeleteOutlined />}
            danger
            onClick={onDelete}
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600 inline-flex"
          >
            حذف
          </Button>
        )}
      </div>
    </div>
  );
};

export default HeaderActions;
