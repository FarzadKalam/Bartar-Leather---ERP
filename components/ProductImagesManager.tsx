import React from 'react';
import RecordFilesManager from './RecordFilesManager';

interface ProductImagesManagerProps {
  open: boolean;
  onClose: () => void;
  productId?: string;
  mainImage?: string | null;
  onMainImageChange?: (url: string | null) => void;
  canEdit?: boolean;
  highlightFileId?: string | null;
}

const ProductImagesManager: React.FC<ProductImagesManagerProps> = ({
  open,
  onClose,
  productId,
  mainImage,
  onMainImageChange,
  canEdit = true,
  highlightFileId,
}) => {
  return (
    <RecordFilesManager
      open={open}
      onClose={onClose}
      moduleId="products"
      recordId={productId}
      mainImage={mainImage}
      onMainImageChange={onMainImageChange}
      canEdit={canEdit}
      highlightFileId={highlightFileId}
    />
  );
};

export default ProductImagesManager;

