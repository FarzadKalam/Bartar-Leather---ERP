import React, { useEffect, useMemo, useState } from 'react';
import { App, Modal, Upload, Button, Image, List, Tag } from 'antd';
import {
  UploadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  StarOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  VideoCameraOutlined,
  PictureOutlined,
  FileOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import {
  detectRecordFilesTable,
  getRecordFilesTableAvailabilityCache,
  isMissingRecordFilesError,
  setRecordFilesTableAvailability,
} from '../utils/recordFilesAvailability';

export type RecordFileType = 'image' | 'video' | 'file';

export interface RecordFileItem {
  id: string;
  module_id: string;
  record_id: string;
  file_url: string;
  file_type: RecordFileType;
  file_name: string | null;
  mime_type: string | null;
  sort_order: number;
  created_at?: string;
}

interface RecordFilesManagerProps {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  recordId?: string;
  mainImage?: string | null;
  onMainImageChange?: (url: string | null) => void;
  canEdit?: boolean;
  highlightFileId?: string | null;
}

let recordFilesTableExistsCache: boolean | null = getRecordFilesTableAvailabilityCache();

const guessTypeFromUrl = (url?: string | null): RecordFileType => {
  const value = String(url || '').toLowerCase();
  if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?|$)/i.test(value)) return 'video';
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(\?|$)/i.test(value)) return 'image';
  return 'file';
};

const normalizeType = (rawType: unknown, mimeType?: string | null, fileUrl?: string | null): RecordFileType => {
  const value = String(rawType || '').toLowerCase();
  if (value === 'image' || value === 'video' || value === 'file') return value;
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return guessTypeFromUrl(fileUrl);
};

const getFileType = (file: File): RecordFileType => {
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
};

const safeFileName = (name: string): string => {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.slice(-120);
};

const RecordFilesManager: React.FC<RecordFilesManagerProps> = ({
  open,
  onClose,
  moduleId,
  recordId,
  mainImage,
  onMainImageChange,
  canEdit = true,
  highlightFileId,
}) => {
  const { message: msg } = App.useApp();
  const [items, setItems] = useState<RecordFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recordFilesEnabled, setRecordFilesEnabled] = useState<boolean>(recordFilesTableExistsCache !== false);

  const imageItems = useMemo(
    () => items.filter((it) => it.file_type === 'image').sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const videoItems = useMemo(
    () => items.filter((it) => it.file_type === 'video').sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const documentItems = useMemo(
    () => items.filter((it) => it.file_type === 'file').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [items],
  );

  const loadLegacyProductImages = async (): Promise<RecordFileItem[]> => {
    if (moduleId !== 'products' || !recordId) return [];
    const { data, error } = await supabase
      .from('product_images')
      .select('id, image_url, sort_order, created_at')
      .eq('product_id', recordId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any, idx: number) => ({
      id: String(row.id),
      module_id: moduleId,
      record_id: recordId,
      file_url: String(row.image_url || ''),
      file_type: 'image' as const,
      file_name: null,
      mime_type: null,
      sort_order: Number.isFinite(row.sort_order) ? row.sort_order : idx,
      created_at: row.created_at ? String(row.created_at) : undefined,
    }));
  };

  const loadFiles = async (forceCheck = false) => {
    if (!recordId || !moduleId) return;
    setLoading(true);
    try {
      const tableExists = await detectRecordFilesTable(supabase, forceCheck);
      recordFilesTableExistsCache = tableExists;
      setRecordFilesEnabled(tableExists);

      if (!tableExists) {
        setRecordFilesEnabled(false);
        const legacy = await loadLegacyProductImages();
        setItems(legacy);
        return;
      }

      const { data, error } = await supabase
        .from('record_files')
        .select('id, module_id, record_id, file_url, file_type, file_name, mime_type, sort_order, created_at')
        .eq('module_id', moduleId)
        .eq('record_id', recordId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;

      recordFilesTableExistsCache = true;
      setRecordFilesTableAvailability(true);
      setRecordFilesEnabled(true);
      const normalized = (data || []).map((row: any, idx: number) => ({
        id: String(row.id),
        module_id: String(row.module_id || moduleId),
        record_id: String(row.record_id || recordId),
        file_url: String(row.file_url || ''),
        file_type: normalizeType(row.file_type, row.mime_type, row.file_url),
        file_name: row.file_name ? String(row.file_name) : null,
        mime_type: row.mime_type ? String(row.mime_type) : null,
        sort_order: Number.isFinite(row.sort_order) ? row.sort_order : idx,
        created_at: row.created_at ? String(row.created_at) : undefined,
      }));
      setItems(normalized);
    } catch (error: any) {
      if (isMissingRecordFilesError(error)) {
        recordFilesTableExistsCache = false;
        setRecordFilesTableAvailability(false);
        setRecordFilesEnabled(false);
        const legacy = await loadLegacyProductImages().catch(() => []);
        setItems(legacy);
        msg.warning('\u062c\u062f\u0648\u0644 record_files \u0647\u0646\u0648\u0632 \u0631\u0648\u06cc \u062f\u06cc\u062a\u0627\u0628\u06cc\u0633 \u0627\u06cc\u062c\u0627\u062f \u0646\u0634\u062f\u0647 \u0627\u0633\u062a. \u0644\u0637\u0641\u0627 migration \u0631\u0627 \u0627\u062c\u0631\u0627 \u06a9\u0646\u06cc\u062f.');
      } else {
        console.warn('Could not load record files', error);
        msg.error('\u0628\u0627\u0631\u06af\u0630\u0627\u0631\u06cc \u0641\u0627\u06cc\u0644\u200c\u0647\u0627 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadFiles(false);
  }, [open, moduleId, recordId]);

  const uploadToStorage = async (file: File): Promise<string> => {
    if (!recordId) throw new Error('Record id is required');
    const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
    const suffix = ext ? `.${ext}` : '';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeFileName(file.name || `file${suffix}`)}`;
    const filePath = `record_files/${moduleId}/${recordId}/${fileName}`;
    const { error } = await supabase.storage.from('images').upload(filePath, file);
    if (error) throw error;
    return supabase.storage.from('images').getPublicUrl(filePath).data.publicUrl;
  };

  const handleAddFile = async (file: File) => {
    if (!recordId) {
      msg.warning('\u0627\u0628\u062a\u062f\u0627 \u0631\u06a9\u0648\u0631\u062f \u0631\u0627 \u0630\u062e\u06cc\u0631\u0647 \u06a9\u0646\u06cc\u062f');
      return false;
    }
    const type = getFileType(file);
    try {
      setUploading(true);

      let useLegacy = !recordFilesEnabled || recordFilesTableExistsCache === false;
      if (useLegacy) {
        const tableExists = await detectRecordFilesTable(supabase, true);
        recordFilesTableExistsCache = tableExists;
        setRecordFilesEnabled(tableExists);
        useLegacy = !tableExists;
      }

      if (useLegacy && !(moduleId === 'products' && type === 'image')) {
        msg.error('\u0628\u0631\u0627\u06cc \u0622\u067e\u0644\u0648\u062f \u0641\u06cc\u0644\u0645 \u0648 \u0641\u0627\u06cc\u0644\u060c \u0627\u0628\u062a\u062f\u0627 migration \u062c\u062f\u0648\u0644 record_files \u0631\u0627 \u0627\u062c\u0631\u0627 \u06a9\u0646\u06cc\u062f.');
        return false;
      }

      const url = await uploadToStorage(file);

      if (useLegacy) {
        if (moduleId === 'products' && type === 'image') {
          const nextOrder = imageItems.length;
          const { data, error } = await supabase
            .from('product_images')
            .insert([{ product_id: recordId, image_url: url, sort_order: nextOrder }])
            .select('id, image_url, sort_order, created_at')
            .single();
          if (error) throw error;
          setItems((prev) => [
            ...prev,
            {
              id: String(data.id),
              module_id: moduleId,
              record_id: recordId,
              file_url: String(data.image_url || ''),
              file_type: 'image',
              file_name: file.name || null,
              mime_type: file.type || null,
              sort_order: Number.isFinite(data.sort_order) ? data.sort_order : nextOrder,
              created_at: data.created_at ? String(data.created_at) : undefined,
            },
          ]);
          if (!mainImage && onMainImageChange) onMainImageChange(url);
          msg.success('\u0641\u0627\u06cc\u0644 \u0627\u0636\u0627\u0641\u0647 \u0634\u062f');
          return false;
        }
        return false;
      }

      const nextOrder = type === 'image' ? imageItems.length : type === 'video' ? videoItems.length : 0;
      const { data, error } = await supabase
        .from('record_files')
        .insert([{
          module_id: moduleId,
          record_id: recordId,
          file_url: url,
          file_type: type,
          file_name: file.name || null,
          mime_type: file.type || null,
          sort_order: nextOrder,
        }])
        .select('id, module_id, record_id, file_url, file_type, file_name, mime_type, sort_order, created_at')
        .single();
      if (error) throw error;

      setItems((prev) => [
        ...prev,
        {
          id: String(data.id),
          module_id: String(data.module_id),
          record_id: String(data.record_id),
          file_url: String(data.file_url),
          file_type: normalizeType(data.file_type, data.mime_type, data.file_url),
          file_name: data.file_name ? String(data.file_name) : null,
          mime_type: data.mime_type ? String(data.mime_type) : null,
          sort_order: Number.isFinite(data.sort_order) ? data.sort_order : nextOrder,
          created_at: data.created_at ? String(data.created_at) : undefined,
        },
      ]);
      if (type === 'image' && !mainImage && onMainImageChange) onMainImageChange(url);
      msg.success('\u0641\u0627\u06cc\u0644 \u0627\u0636\u0627\u0641\u0647 \u0634\u062f');
    } catch (error: any) {
      if (isMissingRecordFilesError(error)) {
        recordFilesTableExistsCache = false;
        setRecordFilesTableAvailability(false);
        setRecordFilesEnabled(false);
        msg.error('\u062c\u062f\u0648\u0644 record_files \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f. migration \u0631\u0627 \u0627\u062c\u0631\u0627 \u06a9\u0646\u06cc\u062f.');
      } else {
        msg.error('\u062e\u0637\u0627 \u062f\u0631 \u062b\u0628\u062a \u0641\u0627\u06cc\u0644: ' + (error?.message || '\u0646\u0627\u0645\u0634\u062e\u0635'));
      }
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleDelete = async (fileId: string) => {
    try {
      const target = items.find((it) => it.id === fileId);
      if (!recordFilesEnabled || recordFilesTableExistsCache === false) {
        if (moduleId !== 'products') return;
        const { error } = await supabase.from('product_images').delete().eq('id', fileId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('record_files').delete().eq('id', fileId);
        if (error) throw error;
      }
      const nextItems = items.filter((it) => it.id !== fileId);
      setItems(nextItems);
      if (target?.file_type === 'image' && target.file_url === mainImage) {
        onMainImageChange?.(nextItems.find((it) => it.file_type === 'image')?.file_url || null);
      }
      msg.success('\u0641\u0627\u06cc\u0644 \u062d\u0630\u0641 \u0634\u062f');
    } catch (error) {
      console.warn('Delete file failed', error);
      msg.error('\u062d\u0630\u0641 \u0641\u0627\u06cc\u0644 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f');
    }
  };

  const moveWithinType = async (fileType: 'image' | 'video', index: number, direction: -1 | 1) => {
    const typedItems = fileType === 'image' ? imageItems : videoItems;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= typedItems.length) return;

    const current = typedItems[index];
    const target = typedItems[nextIndex];
    const swappedA = { ...current, sort_order: target.sort_order };
    const swappedB = { ...target, sort_order: current.sort_order };
    const previous = items;
    setItems(previous.map((it) => (it.id === swappedA.id ? swappedA : it.id === swappedB.id ? swappedB : it)));

    try {
      if (!recordFilesEnabled || recordFilesTableExistsCache === false) {
        if (moduleId !== 'products' || fileType !== 'image') return;
        await Promise.all([
          supabase.from('product_images').update({ sort_order: swappedA.sort_order }).eq('id', swappedA.id),
          supabase.from('product_images').update({ sort_order: swappedB.sort_order }).eq('id', swappedB.id),
        ]);
      } else {
        await Promise.all([
          supabase.from('record_files').update({ sort_order: swappedA.sort_order }).eq('id', swappedA.id),
          supabase.from('record_files').update({ sort_order: swappedB.sort_order }).eq('id', swappedB.id),
        ]);
      }
    } catch {
      setItems(previous);
      msg.error('\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u062a\u0631\u062a\u06cc\u0628 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062f');
    }
  };

  const renderMediaCard = (item: RecordFileItem, index: number, fileType: 'image' | 'video', total: number) => {
    const isMain = item.file_type === 'image' && mainImage === item.file_url;
    const isHighlighted = highlightFileId && highlightFileId === item.id;
    return (
      <div key={item.id} className={`relative group border rounded-lg p-1 ${isHighlighted ? 'border-leather-500 ring-2 ring-leather-200' : 'border-gray-100'}`}>
        <div className="h-40 overflow-hidden rounded">
          {item.file_type === 'video'
            ? <video src={item.file_url} controls className="w-full h-full object-cover rounded" preload="metadata" />
            : <Image src={item.file_url} preview={false} className="rounded" />}
        </div>
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveWithinType(fileType, index, -1)} disabled={!canEdit || index === 0} />
          <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveWithinType(fileType, index, 1)} disabled={!canEdit || index === total - 1} />
        </div>
        <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          {item.file_type === 'image' && (
            <Button size="small" icon={<StarOutlined />} onClick={() => onMainImageChange?.(item.file_url)} disabled={!canEdit}>تصویر اصلی</Button>
          )}
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} disabled={!canEdit}>حذف</Button>
        </div>
        <div className="absolute top-1 left-1 flex items-center gap-1">
          {isMain && <Tag color="gold">اصلی</Tag>}
          {item.file_type === 'video' ? <Tag icon={<VideoCameraOutlined />}>فیلم</Tag> : <Tag icon={<PictureOutlined />}>عکس</Tag>}
        </div>
      </div>
    );
  };

  return (
    <Modal title="مدیریت فایل‌ها" open={open} onCancel={onClose} footer={null} destroyOnHidden zIndex={1600} width={950}>
      {!recordFilesEnabled && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-center justify-between gap-2">
          <span>حالت سازگاری فعال است: جدول `record_files` روی دیتابیس ایجاد نشده. فعلا فقط عکس‌های محصول از `product_images` خوانده می‌شود.</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadFiles(true)}>بررسی مجدد</Button>
        </div>
      )}

      <div className="mt-2">
        <div className="mb-2 text-sm font-bold text-gray-700">عکس‌ها ({imageItems.length})</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {imageItems.map((item, idx) => renderMediaCard(item, idx, 'image', imageItems.length))}
          {imageItems.length === 0 && <div className="text-xs text-gray-400 col-span-full py-4">عکسی ثبت نشده است.</div>}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-sm font-bold text-gray-700">فیلم‌ها ({videoItems.length})</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {videoItems.map((item, idx) => renderMediaCard(item, idx, 'video', videoItems.length))}
          {videoItems.length === 0 && <div className="text-xs text-gray-400 col-span-full py-4">فیلمی ثبت نشده است.</div>}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-sm font-bold text-gray-700">فایل‌ها ({documentItems.length})</div>
        <List
          locale={{ emptyText: 'فایلی ثبت نشده است.' }}
          dataSource={documentItems}
          renderItem={(item) => {
            const fileLabel = item.file_name || item.file_url.split('/').pop() || 'file';
            const isHighlighted = highlightFileId && highlightFileId === item.id;
            return (
              <List.Item
                className={`rounded-lg px-3 ${isHighlighted ? 'bg-leather-50 border border-leather-200' : ''}`}
                actions={[
                  <Button key={`open-${item.id}`} size="small" icon={<EyeOutlined />} onClick={() => window.open(item.file_url, '_blank', 'noopener,noreferrer')}>نمایش</Button>,
                  <Button key={`delete-${item.id}`} size="small" danger icon={<DeleteOutlined />} disabled={!canEdit} onClick={() => handleDelete(item.id)}>حذف</Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<FileOutlined className="text-gray-500" />}
                  title={<span className="text-sm">{fileLabel}</span>}
                  description={<span className="text-xs text-gray-500">{item.mime_type || 'فایل ضمیمه'}</span>}
                />
              </List.Item>
            );
          }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Upload showUploadList={false} beforeUpload={handleAddFile} disabled={uploading || !recordId || !canEdit} fileList={[]}>
          <Button icon={<UploadOutlined />} loading={uploading}>افزودن فایل (عکس، فیلم، فایل)</Button>
        </Upload>
        <div className="text-xs text-gray-400 flex items-center gap-2">
          <PaperClipOutlined />
          <span>{items.length} فایل</span>
        </div>
      </div>

      {loading && <div className="text-xs text-gray-500 mt-2">در حال بارگذاری...</div>}
    </Modal>
  );
};

export default RecordFilesManager;
