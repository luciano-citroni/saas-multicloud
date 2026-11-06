import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

import type { PdfDoc } from './pdf-doc';

let logoDataUrl: string | null = null;

function logoSvgPath(): string {
    const candidates = [
        path.join(__dirname, 'logo.svg'),
        path.join(process.cwd(), 'src', 'finops', 'pdf', 'logo.svg'),
        path.join(process.cwd(), 'dist', 'finops', 'pdf', 'logo.svg'),
    ];
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) throw new Error('Logo do PDF não encontrado');
    return found;
}

export function loadBridgeLogoDataUrl(): string {
    if (logoDataUrl) return logoDataUrl;
    const svg = readFileSync(logoSvgPath(), 'utf8').replace(/fill="[^"]+"/gi, 'fill="#111111"');
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 520 } }).render().asPng();
    logoDataUrl = `data:image/png;base64,${png.toString('base64')}`;
    return logoDataUrl;
}

export function drawFinopsPdfHeader(doc: PdfDoc, title: string, generatedLine: string): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.addImage(loadBridgeLogoDataUrl(), 'PNG', 14, 12, 42, 17);
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
    const boxH = 22;

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
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const lines = doc.splitTextToSize(title, pageWidth - 28);
    const block = lines.length * 6 + 6;
    let cursorY = y + 8;
    if (cursorY + block > pageHeight - 46) {
        doc.addPage();
        cursorY = 20;
    }
    doc.setTextColor(17);
    for (const line of lines) {
        doc.text(line, 14, cursorY);
        cursorY += 6;
    }
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

export function getTableEndY(doc: PdfDoc, fallback: number): number {
    return doc.lastAutoTable?.finalY ?? fallback;
}
