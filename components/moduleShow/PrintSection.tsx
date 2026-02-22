import React, { useState, useEffect } from 'react';
import { Modal, Tabs } from 'antd';
import { createPortal } from 'react-dom';
import { PrintPaperSize } from '../../utils/printTemplates/printSizing';

interface PrintSectionProps {
  isPrintModalOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
  printTemplates: { id: string; title: string; description: string }[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  printSize: PrintPaperSize;
  onPrintSizeChange: (size: PrintPaperSize) => void;
  renderPrintCard: () => React.ReactNode;
  printMode: boolean;
  printableFields?: any[];
  selectedPrintFields?: Record<string, string[]>;
  onTogglePrintField?: (templateId: string, fieldName: string) => void;
}

const PrintSection: React.FC<PrintSectionProps> = ({
  isPrintModalOpen,
  onClose,
  onPrint,
  printTemplates,
  selectedTemplateId,
  onSelectTemplate,
  printSize,
  onPrintSizeChange,
  renderPrintCard,
  printMode,
  printableFields = [],
  selectedPrintFields = {},
  onTogglePrintField = () => {},
}) => {
  const [activeTab, setActiveTab] = useState('preview');
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  // مدیریت حالت پرینت
  useEffect(() => {
    if (!printMode) return;
    const handleAfterPrint = () => {
      // بعد از پرینت، printMode رو از hook مدیریت کنید
      document.body.classList.remove('print-mode');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    document.body.classList.add('print-mode');
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('print-mode');
    };
  }, [printMode]);
  
  const isFieldSelectionAvailable = selectedTemplateId && (selectedTemplateId === 'product_label' || selectedTemplateId === 'production_passport') && printableFields.length > 0;
  const previewScaleMap: Record<PrintPaperSize, number> = {
    A4: isMobile ? 0.35 : 0.46,
    A5: isMobile ? 0.5 : 0.68,
    A6: isMobile ? 0.7 : 0.88,
  };
  const previewScale = previewScaleMap[printSize];

  const selectedFieldCount = (selectedPrintFields[selectedTemplateId] || []).length;

  return (
    <>
      <Modal
        title="انتخاب قالب چاپ"
        open={isPrintModalOpen}
        onCancel={onClose}
        onOk={onPrint}
        okText="چاپ"
        cancelText="انصراف"
        width={isMobile ? '95vw' : '1000px'}
        destroyOnHidden
        centered={true}
        zIndex={1000}
        styles={{
          body: {
            padding: '0',
            maxHeight: '85vh',
            overflow: 'hidden'
          }
        }}
        style={{ maxWidth: isMobile ? '95vw' : '1000px' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '160px 1fr', height: '70vh', gap: 0, background: 'white' }}>
          
          {/* ستون سمت چپ: انتخاب قالب */}
          <div 
            style={{ 
              borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
              borderBottom: isMobile ? '1px solid #e5e7eb' : 'none',
              display: 'flex',
              flexDirection: isMobile ? 'row' : 'column',
              gap: '6px',
              padding: '12px',
              overflow: 'auto',
              background: '#fafafa'
            }}
          >
            {printTemplates.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onSelectTemplate(t.id);
                  setActiveTab('preview');
                }}
                style={{
                  border: selectedTemplateId === t.id ? '2px solid #c58f60' : '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '10px 10px',
                  background: selectedTemplateId === t.id ? '#fff8f3' : '#fff',
                  cursor: 'pointer',
                  textAlign: 'right',
                  transition: 'all 0.2s ease',
                  fontSize: '12px',
                  flexShrink: 0,
                  minWidth: isMobile ? '140px' : 'auto'
                }}
              >
                <div style={{ fontWeight: 700, color: '#111827', fontSize: '12px' }}>
                  {t.title}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '2px', lineHeight: '1.2' }}>
                  {t.description}
                </div>
              </button>
            ))}

            <div
              style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', textAlign: 'right' }}>
                سایز چاپ
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['A4', 'A5', 'A6'] as PrintPaperSize[]).map((size) => {
                  const selected = printSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onPrintSizeChange(size)}
                      style={{
                        flex: 1,
                        border: selected ? '2px solid #c58f60' : '1px solid #d1d5db',
                        borderRadius: '8px',
                        background: selected ? '#fff8f3' : '#fff',
                        color: selected ? '#92400e' : '#374151',
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '8px 0',
                        cursor: 'pointer',
                      }}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ستون سمت راست: Tabs برای پیش‌نمایش و فیلدها */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              tabPosition="top"
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
              tabBarStyle={{ margin: 0, padding: '0 12px', borderBottom: '1px solid #e5e7eb' }}
              items={[
                {
                  key: 'preview',
                  label: '📋 پیش‌نمایش',
                  children: (
                    <div style={{
                      background: '#f9fafb',
                      border: '1px dashed #e5e7eb',
                      borderRadius: '8px',
                      padding: '12px',
                      overflow: 'auto',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'flex-start',
                      flex: 1
                    }}>
                      <div 
                        style={{ 
                          transform: `scale(${previewScale})`,
                          transformOrigin: 'top center',
                          transformBox: 'border-box'
                        }}
                      >
                        {renderPrintCard()}
                      </div>
                    </div>
                  ),
                },
                ...(isFieldSelectionAvailable ? [{
                  key: 'fields',
                  label: `🔍 انتخاب فیلدها ${selectedFieldCount > 0 ? `(${selectedFieldCount})` : '(تمام)'}`,
                  children: (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '10px',
                      padding: '12px',
                      overflow: 'auto',
                      flex: 1
                    }}>
                      {printableFields.map(field => {
                        const isSelected = (selectedPrintFields[selectedTemplateId] || []).includes(field.key);
                        return (
                          <div
                            key={field.key}
                            onClick={() => onTogglePrintField(selectedTemplateId, field.key)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              cursor: 'pointer',
                              padding: '12px',
                              borderRadius: '8px',
                              border: isSelected ? '2px solid #c58f60' : '1px solid #e5e7eb',
                              background: isSelected ? '#fff8f3' : '#fff',
                              transition: 'all 0.2s ease',
                              userSelect: 'none',
                              boxShadow: isSelected ? '0 2px 8px rgba(197, 143, 96, 0.15)' : 'none'
                            }}
                          >
                            <div style={{
                              width: '20px',
                              height: '20px',
                              border: `2px solid ${isSelected ? '#c58f60' : '#d1d5db'}`,
                              borderRadius: '4px',
                              background: isSelected ? '#c58f60' : '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              flexShrink: 0
                            }}>
                              {isSelected && '✓'}
                            </div>
                            <span style={{
                              fontSize: '13px',
                              color: isSelected ? '#c58f60' : '#374151',
                              fontWeight: isSelected ? 600 : 500
                            }}>
                              {field.labels.fa}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ),
                }] : []),
              ]}
            />
          </div>
        </div>
      </Modal>

      {/* print-root - کاملاً پنهان */}
      {typeof document !== 'undefined'
        ? createPortal(
            <div id="print-root" aria-hidden={!printMode} data-print-size={printSize}>
              {renderPrintCard()}
            </div>,
            document.body
          )
        : null}
    </>
  );
};

export default PrintSection;
