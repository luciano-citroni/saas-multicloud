import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';

import type { PdfDoc } from './pdf-doc';

/** Bridge magenta accent — reserved for section bars and primary chart series. */
export const PDF_ACCENT: [number, number, number] = [192, 38, 211];
export const PDF_INK: [number, number, number] = [24, 24, 27];
export const PDF_MUTED: [number, number, number] = [113, 113, 122];
export const PDF_BORDER: [number, number, number] = [228, 228, 231];
export const PDF_SURFACE: [number, number, number] = [250, 250, 250];
export const PDF_SUCCESS: [number, number, number] = [22, 163, 74];
export const PDF_DANGER: [number, number, number] = [220, 38, 38];

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
    const svg = readFileSync(logoSvgPath(), 'utf8').replace(/fill="[^"]+"/gi, 'fill="#18181b"');
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 520 } }).render().asPng();
    logoDataUrl = `data:image/png;base64,${png.toString('base64')}`;
    return logoDataUrl;
}

export function drawFinopsPdfHeader(doc: PdfDoc, title: string, generatedLine: string): void {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.addImage(loadBridgeLogoDataUrl(), 'PNG', 14, 11, 40, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...PDF_INK);
    doc.text(title, pageWidth - 14, 17, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_MUTED);
    doc.text('Bridge MultCloud', pageWidth - 14, 23, { align: 'right' });
    doc.text(generatedLine, pageWidth - 14, 28, { align: 'right' });
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.35);
    doc.line(14, 33, pageWidth - 14, 33);
    doc.setDrawColor(...PDF_ACCENT);
    doc.setLineWidth(1.1);
    doc.line(14, 33.7, 42, 33.7);
    doc.setLineWidth(0.2);
}

export type MetaStripItem = { label: string; value: string };

export function drawMetaStrip(doc: PdfDoc, items: MetaStripItem[], y = 38): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentW = pageWidth - 28;
    const cols = 2;
    const gap = 4;
    const colW = (contentW - gap) / cols;
    const rows = Math.ceil(items.length / cols);
    const rowH = 10;
    const boxH = rows * rowH + 6;

    doc.setFillColor(...PDF_SURFACE);
    doc.setDrawColor(...PDF_BORDER);
    doc.setLineWidth(0.25);
    doc.roundedRect(14, y, contentW, boxH, 2, 2, 'FD');

    items.forEach((item, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = 14 + col * (colW + gap) + 3;
        const baseline = y + 5.5 + row * rowH;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...PDF_MUTED);
        doc.text(item.label, x, baseline);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...PDF_INK);
        doc.text(item.value, x, baseline + 4, { maxWidth: colW - 6 });
    });

    doc.setFont('helvetica', 'normal');
    return y + boxH;
}

/** @deprecated Prefer drawMetaStrip for commercial reports. */
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

export type KpiTone = 'neutral' | 'up' | 'down';
export type KpiEmphasis = 'default' | 'hero';

export type KpiItem = {
    label: string;
    value: string;
    detail?: string;
    tone?: KpiTone;
    emphasis?: KpiEmphasis;
};

function toneColor(tone: KpiTone | undefined): [number, number, number] {
    if (tone === 'down') return PDF_SUCCESS;
    if (tone === 'up') return PDF_DANGER;
    return PDF_INK;
}

export function drawKpiRow(doc: PdfDoc, y: number, kpis: KpiItem[]): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const gap = 3;
    const hasHero = kpis.some((kpi) => kpi.emphasis === 'hero');
    const boxH = hasHero ? 28 : 22;
    let cursor = y;
    if (cursor + boxH > pageHeight - 18) {
        doc.addPage();
        cursor = 16;
    }
    const boxW = (pageWidth - 28 - gap * (kpis.length - 1)) / kpis.length;

    kpis.forEach((kpi, index) => {
        const x = 14 + index * (boxW + gap);
        const isHero = kpi.emphasis === 'hero';
        doc.setDrawColor(...PDF_BORDER);
        doc.setFillColor(...(isHero ? ([255, 255, 255] as [number, number, number]) : PDF_SURFACE));
        doc.roundedRect(x, cursor, boxW, boxH, 2, 2, 'FD');
        if (isHero) {
            doc.setFillColor(...PDF_ACCENT);
            doc.rect(x, cursor, 1.2, boxH, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...PDF_MUTED);
        doc.text(kpi.label, x + (isHero ? 4 : 2.5), cursor + 5.5, { maxWidth: boxW - (isHero ? 7 : 5) });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(isHero ? 12 : 9);
        doc.setTextColor(...toneColor(kpi.tone));
        doc.text(kpi.value, x + (isHero ? 4 : 2.5), cursor + (isHero ? 14.5 : 12), {
            maxWidth: boxW - (isHero ? 7 : 5),
        });
        if (kpi.detail) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...(kpi.tone && kpi.tone !== 'neutral' ? toneColor(kpi.tone) : PDF_MUTED));
            doc.text(kpi.detail, x + (isHero ? 4 : 2.5), cursor + (isHero ? 21.5 : 17.5), {
                maxWidth: boxW - (isHero ? 7 : 5),
            });
        }
    });

    doc.setFont('helvetica', 'normal');
    return cursor + boxH;
}

export function drawSectionTitle(doc: PdfDoc, title: string, y: number, options?: { forcePageBreak?: boolean }): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(title, pageWidth - 34);
    const block = lines.length * 5.5 + 8;
    let cursorY = y + 8;
    if (options?.forcePageBreak || cursorY + block > pageHeight - 46) {
        doc.addPage();
        cursorY = 18;
    }
    doc.setFillColor(...PDF_ACCENT);
    doc.roundedRect(14, cursorY - 3.5, 1.4, lines.length * 5.5 + 1, 0.4, 0.4, 'F');
    doc.setTextColor(...PDF_INK);
    for (const line of lines) {
        doc.text(line, 18.5, cursorY);
        cursorY += 5.5;
    }
    return cursorY + 3;
}

export function addFinopsPdfFooter(doc: PdfDoc, footerLabel: string): void {
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setDrawColor(...PDF_BORDER);
        doc.setLineWidth(0.3);
        doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...PDF_MUTED);
        doc.text(footerLabel, 14, pageHeight - 7);
        doc.text(`${page} / ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
    }
}

export function getTableEndY(doc: PdfDoc, fallback: number): number {
    return doc.lastAutoTable?.finalY ?? fallback;
}
