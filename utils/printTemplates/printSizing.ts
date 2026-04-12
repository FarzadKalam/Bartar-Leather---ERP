export type PrintPaperSize = 'A4' | 'A5' | 'A6' | 'A7';

export const PRINT_PAPER_DIMENSIONS: Record<
  PrintPaperSize,
  { widthMm: number; heightMm: number; label: string }
> = {
  A4: { widthMm: 210, heightMm: 297, label: 'A4' },
  A5: { widthMm: 148, heightMm: 210, label: 'A5' },
  A6: { widthMm: 105, heightMm: 148, label: 'A6' },
  A7: { widthMm: 74, heightMm: 105, label: 'A7' },
};

