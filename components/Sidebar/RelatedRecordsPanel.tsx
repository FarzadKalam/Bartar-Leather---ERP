import React, { useEffect, useState } from 'react';
import { List, Spin, Empty, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';


interface RelatedRecordsPanelProps {
  targetModule: string;
  foreignKey: string;
  currentRecordId: string;
}

const RelatedRecordsPanel: React.FC<RelatedRecordsPanelProps> = ({ targetModule, foreignKey, currentRecordId }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const targetConfig = MODULES[targetModule];

  useEffect(() => {
    const fetchRelated = async () => {
      setLoading(true);
      const { data } = await supabase
        .from(targetModule)
        .select('*')
        .eq(foreignKey, currentRecordId);
      
      if (data) setItems(data);
      setLoading(false);
    };

    fetchRelated();
  }, [targetModule, foreignKey, currentRecordId]);

  if (loading) return <div className="flex justify-center p-10"><Spin /></div>;
  if (!items.length) return <Empty description="رکوردی یافت نشد" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div className="h-full overflow-y-auto">
        <div className="mb-4 text-xs text-gray-500">لیست {targetConfig?.titles.fa || targetModule} مرتبط:</div>
        <List
            dataSource={items}
            renderItem={(item: any) => (
                <Link to={`/${targetModule}/${item.id}`}>
                    <div className="bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700 p-3 rounded-lg mb-2 hover:border-leather-500 transition-colors cursor-pointer group">
                        <div className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-leather-600">{item.name}</div>
                        <div className="flex gap-2 mt-2">
                            {item.system_code && <Tag className="text-[10px] m-0">{item.system_code}</Tag>}
                            {item.status && <Tag className="text-[10px] m-0" color="blue">{item.status}</Tag>}
                        </div>
                    </div>
                </Link>
            )}
        />
    </div>
  );
};

export default RelatedRecordsPanel;