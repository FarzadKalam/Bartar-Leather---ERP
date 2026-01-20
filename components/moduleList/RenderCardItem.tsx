import React from "react";
import { Avatar, Checkbox, Popover, Tag } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { FieldType } from "../../types";
import { formatPersianPrice } from "../../utils/persianNumberFormatter";

export interface RenderCardItemProps {
  item: any;
  moduleId: string;
  moduleConfig: any;
  imageField?: string;
  tagsField?: string;
  statusField?: string;
  categoryField?: string;
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: (keys: React.Key[]) => void;
  navigate: (path: string) => void;
  minimal?: boolean;
}

const RenderCardItem: React.FC<RenderCardItemProps> = ({
  item,
  moduleId,
  moduleConfig,
  imageField,
  tagsField,
  statusField,
  categoryField,
  selectedRowKeys,
  setSelectedRowKeys,
  navigate,
  minimal = false,
}) => {
  const isSelected = selectedRowKeys.includes(item.id);
  const imageUrl = imageField ? item[imageField] : null;
  const title = item.name || item.business_name || item.title || item.last_name || "بدون نام";

  const statusFieldConfig = moduleConfig?.fields.find(
    (f: any) => f.type === FieldType.STATUS || f.key === statusField,
  );
  const status = statusField ? item[statusField] : null;
  const statusOption = statusFieldConfig?.options?.find((o: any) => o.value === status);

  const categoryFieldConfig = moduleConfig?.fields.find((f: any) => f.key === categoryField);
  const category = categoryField ? item[categoryField] : null;
  const categoryLabel = categoryFieldConfig?.options?.find((o: any) => o.value === category)?.label || category;

  const toggleSelect = (e: any) => {
    e.stopPropagation();
    const newSelected = isSelected
      ? selectedRowKeys.filter((k: any) => k !== item.id)
      : [...selectedRowKeys, item.id];
    setSelectedRowKeys(newSelected);
  };

  return (
    <div
      onClick={() => navigate(`/${moduleId}/${item.id}`)}
      className={`
        bg-white dark:bg-[#1e1e1e] rounded-xl border shadow-sm cursor-pointer transition-all flex flex-col group relative
        ${isSelected ? "border-leather-500 ring-1 ring-leather-500 bg-leather-50 dark:bg-leather-900/20" : "border-gray-200 dark:border-gray-700 hover:border-leather-400 hover:shadow-md"}
        ${minimal ? "p-3 mb-2" : "p-3 h-full"}
      `}
    >
      <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isSelected} onChange={toggleSelect} />
      </div>

      <div className="flex gap-2 mb-2">
        <Avatar
          shape="square"
          size={minimal ? 40 : 54}
          src={imageUrl}
          icon={<AppstoreOutlined />}
          className="rounded-lg bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 shrink-0 object-cover"
        />
        <div className="min-w-0 flex-1 pr-6">
          <h4
            className={`font-bold text-gray-800 dark:text-white truncate mb-0.5 ${minimal ? "text-xs" : "text-sm"}`}
            title={title}
          >
            {title}
          </h4>
          <div className="text-[10px] text-gray-400 font-mono mb-1">
            {item.system_code || item.manual_code || "---"}
          </div>
        </div>
      </div>

      {!minimal && (
        <>
          <div className="flex justify-between gap-2 mb-2 px-0">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {statusOption && (
                <Tag color={statusOption.color || "default"} style={{ fontSize: "10px", lineHeight: "16px", margin: 0 }}>
                  {statusOption.label}
                </Tag>
              )}

              {category && (
                <Tag
                  color="default"
                  style={{
                    fontSize: "10px",
                    lineHeight: "16px",
                    margin: 0,
                    backgroundColor: "#f0f0f0",
                    color: "#262626",
                  }}
                >
                  {categoryLabel}
                </Tag>
              )}
            </div>

            {tagsField && item[tagsField] && (
              <div className="flex flex-wrap gap-1 justify-end flex-1">
                {(Array.isArray(item[tagsField]) ? item[tagsField] : [item[tagsField]]).slice(0, 1).map((t: any, idx: number) => {
                  const tagTitle = typeof t === "string" ? t : t.title || t.label;
                  const tagColor = typeof t === "string" ? "blue" : t.color || "blue";
                  return (
                    <Tag key={idx} color={tagColor} style={{ fontSize: "9px", lineHeight: "14px", margin: 0, padding: "1px 4px" }}>
                      {tagTitle}
                    </Tag>
                  );
                })}
                {Array.isArray(item[tagsField]) && item[tagsField].length > 1 && (
                  <Popover
                    content={
                      <div className="flex flex-wrap gap-1">
                        {item[tagsField].slice(1).map((t: any, idx: number) => {
                          const tagTitle = typeof t === "string" ? t : t.title || t.label;
                          const tagColor = typeof t === "string" ? "blue" : t.color || "blue";
                          return (
                            <Tag key={idx} color={tagColor} style={{ fontSize: "9px", lineHeight: "14px", margin: 0, padding: "1px 4px" }}>
                              {tagTitle}
                            </Tag>
                          );
                        })}
                      </div>
                    }
                    title={`${item[tagsField].length - 1} برچسب بیشتر`}
                    trigger="click"
                  >
                    <span className="text-[9px] text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 font-medium">
                      +{item[tagsField].length - 1}
                    </span>
                  </Popover>
                )}
              </div>
            )}
          </div>

          <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center gap-2 text-xs">
            {item.buy_price && (
              <div className="flex flex-col gap-0">
                <span className="text-gray-500 dark:text-gray-400 text-[8px]">خرید</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                  {formatPersianPrice(item.buy_price, true)}
                </span>
              </div>
            )}
            {item.sell_price && (
              <div className="flex flex-col gap-0">
                <span className="text-gray-500 dark:text-gray-400 text-[8px]">فروش</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                  {formatPersianPrice(item.sell_price, true)}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default RenderCardItem;
