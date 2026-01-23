import React from 'react';
import { Modal } from 'antd';

interface PrintSectionProps {
  isPrintModalOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
  printTemplates: { id: string; title: string; description: string }[];
  selectedTemplateId: string;
  onSelectTemplate: (id: string) => void;
  renderPrintCard: () => React.ReactNode;
  printMode: boolean;
}

const PrintSection: React.FC<PrintSectionProps> = ({
  isPrintModalOpen,
  onClose,
  onPrint,
  printTemplates,
  selectedTemplateId,
  onSelectTemplate,
  renderPrintCard,
  printMode,
}) => {
  return (
    <>
      <Modal
        title="قالب چاپ"
        open={isPrintModalOpen}
        onCancel={onClose}
        onOk={onPrint}
        okText="چاپ"
        cancelText="انصراف"
        width={760}
        destroyOnClose
      >
        <div className="print-modal">
          <div className="print-template-list">
            {printTemplates.map(t => (
              <button
                key={t.id}
                type="button"
                className={`print-template-item ${selectedTemplateId === t.id ? 'active' : ''}`}
                onClick={() => onSelectTemplate(t.id)}
              >
                <div className="print-template-title">{t.title}</div>
                <div className="print-template-desc">{t.description}</div>
              </button>
            ))}
          </div>
          <div className="print-preview">
            <div className="print-preview-inner">{renderPrintCard()}</div>
          </div>
        </div>
      </Modal>

      <div id="print-root" aria-hidden={!printMode}>
        {renderPrintCard()}
      </div>
    </>
  );
};

export default PrintSection;
