import React from "react";
import { Button, Space, Tag, Tooltip } from "antd";
import { DeleteOutlined, EditOutlined, ExportOutlined } from "@ant-design/icons";

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onEdit?: () => void;
}

const BulkActionsBar: React.FC<BulkActionsBarProps> = ({ selectedCount, onClear, onDelete, onExport, onEdit }) => {
  if (!selectedCount) return null;

  return (
    <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 mb-3 shadow-sm">
      <Space size="middle">
        <Tag color="blue">{selectedCount} انتخاب شده</Tag>
        <Button onClick={onClear} size="small">
          پاک کردن انتخاب
        </Button>
      </Space>

      <Space size="small">
        {onEdit && (
          <Tooltip title="ویرایش گروهی">
            <Button type="default" icon={<EditOutlined />} size="small" onClick={onEdit}>
              ویرایش
            </Button>
          </Tooltip>
        )}
        {onExport && (
          <Tooltip title="خروجی">
            <Button type="default" icon={<ExportOutlined />} size="small" onClick={onExport}>
              خروجی
            </Button>
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title="حذف">
            <Button danger icon={<DeleteOutlined />} size="small" onClick={onDelete}>
              حذف
            </Button>
          </Tooltip>
        )}
      </Space>
    </div>
  );
};

export default BulkActionsBar;
