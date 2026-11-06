export type PdfDoc = {
    internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
    lastAutoTable?: { finalY?: number };
    addImage: (...args: unknown[]) => unknown;
    setFont: (...args: unknown[]) => unknown;
    setFontSize: (...args: unknown[]) => unknown;
    setTextColor: (...args: unknown[]) => unknown;
    text: (...args: unknown[]) => unknown;
    setDrawColor: (...args: unknown[]) => unknown;
    setLineWidth: (width: number) => unknown;
    line: (...args: unknown[]) => unknown;
    setFillColor: (...args: unknown[]) => unknown;
    roundedRect: (...args: unknown[]) => unknown;
    rect: (x: number, y: number, w: number, h: number, style?: string) => unknown;
    circle: (x: number, y: number, r: number, style?: string) => unknown;
    getTextWidth: (text: string) => number;
    addPage: () => unknown;
    getNumberOfPages: () => number;
    setPage: (page: number) => unknown;
    splitTextToSize: (text: string, size: number) => string[];
    output: (type: 'arraybuffer') => ArrayBuffer;
};

export const FINOPS_PDF_TABLE = {
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [17, 17, 17] as [number, number, number], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] as [number, number, number] },
    margin: { left: 14, right: 14 },
};
