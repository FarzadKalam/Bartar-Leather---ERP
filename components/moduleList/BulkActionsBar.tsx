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
        <Button onClick={onClear} size="small" type="text" danger>
          لغو انتخاب
        </Button>
      </Space>

      <Space size="small">
        {onEdit && (
          <Tooltip title="ویرایش گروهی">
            <Button type="text" icon={<EditOutlined />} size="small" onClick={onEdit} aria-label="ویرایش گروهی" />
          </Tooltip>
        )}
        {onExport && (
          <Tooltip title="خروجی">
            <Button type="text" icon={<ExportOutlined />} size="small" onClick={onExport} aria-label="خروجی" />
          </Tooltip>
        )}
        {onDelete && (
          <Tooltip title="حذف">
            <Button danger type="text" icon={<DeleteOutlined />} size="small" onClick={onDelete} aria-label="حذف" />
          </Tooltip>
        )}
      </Space>
    </div>
  );
};

export default BulkActionsBar;
