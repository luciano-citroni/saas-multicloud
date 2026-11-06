import { translations } from '@/lib/i18n/translations';
import { getLocale } from '@/lib/locale';

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
    save: (fileName: string) => unknown;
    splitTextToSize: (text: string, size: number) => string[];
};

export type PdfAutoTable = (doc: PdfDoc, options: object) => void;

export const FINOPS_PDF_TABLE = {
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [17, 17, 17] as [number, number, number], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] as [number, number, number] },
    margin: { left: 14, right: 14 },
};

function finopsCopy() {
    return translations[getLocale()].finops;
}

export function getTableEndY(doc: PdfDoc, fallback: number): number {
    return doc.lastAutoTable?.finalY ?? fallback;
}

export async function loadBridgeLogoDataUrl(): Promise<string> {
    const response = await fetch('/logo.svg', { cache: 'force-cache' });
    if (!response.ok) {
        throw new Error(finopsCopy().pdfLogoLoadError);
    }

    let svgMarkup = await response.text();
    svgMarkup = svgMarkup.replace(/fill="[^"]+"/gi, 'fill="#111111"');

    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(finopsCopy().pdfLogoDecodeError));
            img.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        const targetWidth = 520;
        const scale = targetWidth / image.naturalWidth;
        canvas.width = targetWidth;
        canvas.height = Math.round(image.naturalHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error(finopsCopy().pdfLogoCanvasError);
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export async function createFinopsPdf(): Promise<{ doc: PdfDoc; autoTable: PdfAutoTable }> {
    const [jspdfModule, autoTableModule] = await Promise.all([
        import('jspdf/dist/jspdf.es.min.js'),
        import('jspdf-autotable/es'),
    ]);

    type JsPdfCtor = new (options: object) => PdfDoc;
    const jspdfAny = jspdfModule as unknown as {
        jsPDF?: JsPdfCtor;
        default?: JsPdfCtor | { jsPDF?: JsPdfCtor };
    };
    const jsPDFCtor: JsPdfCtor | undefined =
        jspdfAny.jsPDF ??
        (typeof jspdfAny.default === 'function' ? jspdfAny.default : jspdfAny.default?.jsPDF);

    if (!jsPDFCtor) {
        throw new Error(finopsCopy().pdfJsPdfLoadError);
    }

    const autoTable = (autoTableModule as unknown as { default: PdfAutoTable }).default;
    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    return { doc, autoTable };
}

export async function drawFinopsPdfHeader(doc: PdfDoc, title: string, generatedLine: string): Promise<void> {
    const pageWidth = doc.internal.pageSize.getWidth();
    const logoDataUrl = await loadBridgeLogoDataUrl();

    doc.addImage(logoDataUrl, 'PNG', 14, 12, 42, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(17);
    doc.text(title, pageWidth - 14, 18, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text('Bridge MultCloud', pageWidth - 14, 24, { align: 'right' });
    doc.text(generatedLine, pageWidth - 14, 29, { align: 'right' });

    doc.setDrawColor(220);
    doc.line(14, 34, pageWidth - 14, 34);
}

export function drawMetaLines(doc: PdfDoc, lines: string[], y = 40): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40);
    let cursor = y;
    for (const line of lines) {
        doc.text(line, 14, cursor);
        cursor += 5;
    }
    return cursor;
}

export function drawKpiRow(doc: PdfDoc, y: number, kpis: Array<{ label: string; value: string; detail?: string }>): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    const gap = 3;
    const boxW = (pageWidth - 28 - gap * (kpis.length - 1)) / kpis.length;
    const boxH = kpis.some((kpi) => kpi.detail) ? 22 : 18;

    kpis.forEach((kpi, index) => {
        const x = 14 + index * (boxW + gap);
        doc.setDrawColor(230);
        doc.setFillColor(248, 248, 248);
        doc.roundedRect(x, y, boxW, boxH, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(110);
        doc.text(kpi.label, x + 2.5, y + 5.5, { maxWidth: boxW - 5 });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(20);
        doc.text(kpi.value, x + 2.5, y + 12, { maxWidth: boxW - 5 });
        if (kpi.detail) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(110);
            doc.text(kpi.detail, x + 2.5, y + 17.5, { maxWidth: boxW - 5 });
        }
    });

    doc.setFont('helvetica', 'normal');
    return y + boxH;
}

export function drawSectionTitle(doc: PdfDoc, title: string, y: number): number {
    const pageHeight = doc.internal.pageSize.getHeight();
    let cursorY = y;
    if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(17);
    doc.text(title, 14, cursorY);
    return cursorY + 4;
}

export function addFinopsPdfFooter(doc: PdfDoc, footerLabel: string): void {
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(footerLabel, 14, pageHeight - 8);
        doc.text(`${page} / ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
    }
}
