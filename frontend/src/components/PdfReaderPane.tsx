import type { PdfFile } from '../api/types';

type PdfReaderPaneProps = {
  pdf: PdfFile;
  onSendToConvert: (text: string) => void;
};

export default function PdfReaderPane({ pdf }: PdfReaderPaneProps) {
  const fileUrl = `/api/pdfs/${pdf.id}/file`;
  const initialPage = pdf.last_preview_page || 1;

  return (
    <div className="pdf-reader-container flex-1 relative w-full h-full">
      <iframe
        key={pdf.id}
        src={`${fileUrl}#page=${initialPage}`}
        width="100%"
        height="100%"
        className="border-0 bg-transparent w-full h-full"
        title="PDF Reader"
      />
    </div>
  );
}
