import type { PdfDoc } from './pdf-doc';

export type Rgb = [number, number, number];

export type ChartPalette = {
    card: Rgb;
    foreground: Rgb;
    muted: Rgb;
    border: Rgb;
    grid: Rgb;
    series: Rgb[];
};

type ChartBase = {
    title: string;
    description?: string;
    currency: string;
    locale: string;
};

export type ColumnChartSpec = ChartBase & {
    kind: 'column';
    labels: string[];
    values: number[];
};

export type LineChartSpec = ChartBase & {
    kind: 'line';
    points: Array<{ label: string; value: number }>;
};

export type RankChartSpec = ChartBase & {
    kind: 'rank';
    rows: Array<{ name: string; value: number }>;
    empty: string;
};

export type GroupedChartSpec = ChartBase & {
    kind: 'grouped';
    categories: string[];
    series: Array<{ name: string; values: number[] }>;
};

export type StackedChartSpec = ChartBase & {
    kind: 'stacked';
    categories: string[];
    series: Array<{ name: string; values: number[] }>;
};

export type CommercialChartSpec = ColumnChartSpec | LineChartSpec | RankChartSpec | GroupedChartSpec | StackedChartSpec;

const FALLBACK_SERIES: Rgb[] = [
    [192, 38, 211],
    [232, 177, 90],
    [224, 122, 61],
    [180, 83, 42],
    [138, 61, 34],
    [42, 164, 196],
    [124, 92, 191],
    [59, 111, 216],
];

export function readChartPalette(): ChartPalette {
    return {
        card: [255, 255, 255],
        foreground: [24, 24, 27],
        muted: [113, 113, 122],
        border: [228, 228, 231],
        grid: [228, 228, 231],
        series: FALLBACK_SERIES,
    };
}

function compact(value: number, currency: string, locale: string): string {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

function axisMax(values: number[]): number {
    const max = Math.max(0, ...values);
    if (max <= 0) return 1;
    const pow = 10 ** Math.floor(Math.log10(max));
    const normalized = max / pow;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
    return nice * pow;
}

function fitText(doc: PdfDoc, text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let cut = text;
    while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > maxWidth) {
        cut = cut.slice(0, -1);
    }
    return `${cut}...`;
}

function legendNames(chart: CommercialChartSpec): string[] {
    if (chart.kind === 'grouped' || chart.kind === 'stacked') return chart.series.map((item) => item.name);
    return [];
}

function plotHeight(chart: CommercialChartSpec): number {
    if (chart.kind === 'column') return 86;
    if (chart.kind === 'line') return 74;
    if (chart.kind === 'rank') return chart.rows.length === 0 ? 28 : Math.min(118, Math.max(46, chart.rows.length * 10));
    const band = chart.kind === 'grouped' ? Math.max(12, chart.series.length * 6) : 12;
    return Math.min(124, Math.max(48, chart.categories.length * band));
}

type CardLayout = {
    height: number;
    titleLines: string[];
    descLines: string[];
    legendLines: string[][];
    plotH: number;
};

function layoutCard(doc: PdfDoc, chart: CommercialChartSpec, width: number): CardLayout {
    const innerW = width - 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const titleLines = doc.splitTextToSize(chart.title, innerW);
    let descLines: string[] = [];
    if (chart.description) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        descLines = doc.splitTextToSize(chart.description, innerW);
    }
    const names = legendNames(chart);
    const legendLines: string[][] = [];
    if (names.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        let row: string[] = [];
        let used = 0;
        for (const name of names) {
            const itemW = Math.min(innerW, doc.getTextWidth(name) + 7);
            if (row.length > 0 && used + itemW > innerW) {
                legendLines.push(row);
                row = [];
                used = 0;
            }
            row.push(name);
            used += itemW;
        }
        if (row.length > 0) legendLines.push(row);
    }
    const plotH = plotHeight(chart);
    const height = 7 + titleLines.length * 4.6 + (descLines.length > 0 ? descLines.length * 3.6 + 1 : 0) + 3 + plotH + (legendLines.length > 0 ? legendLines.length * 5 + 3 : 0) + 5;
    return { height, titleLines, descLines, legendLines, plotH };
}

function drawLegend(doc: PdfDoc, lines: string[][], x: number, y: number, palette: ChartPalette): number {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    let cursor = y;
    let seen = 0;
    for (const row of lines) {
        let left = x;
        for (const name of row) {
            const color = palette.series[seen % palette.series.length];
            doc.setFillColor(...color);
            doc.roundedRect(left, cursor - 2.2, 2.6, 2.6, 0.4, 0.4, 'F');
            doc.setTextColor(...palette.muted);
            doc.text(name, left + 3.6, cursor);
            left += doc.getTextWidth(name) + 7;
            seen += 1;
        }
        cursor += 5;
    }
    return cursor;
}

function drawColumn(doc: PdfDoc, chart: ColumnChartSpec, plotX: number, plotY: number, plotW: number, plotH: number, palette: ChartPalette): void {
    const labelH = 9;
    const font = plotW >= 110 ? 9 : 7.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(font);
    const gutter = Math.min(plotW * 0.34, Math.max(14, doc.getTextWidth(compact(axisMax(chart.values), chart.currency, chart.locale)) + 1.4));
    const left = plotX + gutter;
    const bottom = plotY + plotH - labelH;
    const top = plotY + 5;
    const height = Math.max(8, bottom - top);
    const max = axisMax(chart.values);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(font);
    doc.setTextColor(...palette.muted);
    doc.setDrawColor(...palette.grid);
    doc.setLineWidth(0.1);
    for (let step = 0; step <= 4; step += 1) {
        const y = bottom - (height * step) / 4;
        doc.line(left, y, plotX + plotW, y);
        doc.text(compact((max * step) / 4, chart.currency, chart.locale), left - 1.2, y + 1, { align: 'right' });
    }
    const count = Math.max(chart.labels.length, 1);
    const slot = (plotW - gutter) / count;
    chart.values.forEach((value, index) => {
        const barW = Math.min(plotW >= 110 ? 28 : 14, slot * 0.46);
        const barH = Math.max(0, (value / max) * height);
        const x = left + slot * index + (slot - barW) / 2;
        const y = bottom - barH;
        doc.setFillColor(...palette.series[0]);
        const radius = Math.min(0.8, barW / 2, Math.max(barH, 0.2) / 2);
        doc.roundedRect(x, y, barW, Math.max(barH, 0.3), radius, radius, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(font);
        doc.setTextColor(...palette.foreground);
        doc.text(compact(value, chart.currency, chart.locale), x + barW / 2, Math.max(plotY + 3, y - 1.4), { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...palette.muted);
        doc.setFontSize(font);
        const label = fitText(doc, chart.labels[index] ?? '', slot - 1);
        doc.text(label, left + slot * index + slot / 2, bottom + 4, { align: 'center' });
    });
}

function drawLine(doc: PdfDoc, chart: LineChartSpec, plotX: number, plotY: number, plotW: number, plotH: number, palette: ChartPalette): void {
    const labelH = 8;
    const font = plotW >= 110 ? 8 : 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(font);
    const max = axisMax(chart.points.map((point) => point.value));
    const gutter = Math.min(plotW * 0.34, Math.max(14, doc.getTextWidth(compact(max, chart.currency, chart.locale)) + 1.4));
    const left = plotX + gutter;
    const bottom = plotY + plotH - labelH;
    const height = Math.max(8, bottom - (plotY + 4));
    const width = Math.max(4, plotW - gutter);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(font);
    doc.setTextColor(...palette.muted);
    doc.setDrawColor(...palette.grid);
    doc.setLineWidth(0.1);
    for (let step = 0; step <= 4; step += 1) {
        const y = bottom - (height * step) / 4;
        doc.line(left, y, left + width, y);
        doc.text(compact((max * step) / 4, chart.currency, chart.locale), left - 1.2, y + 1, { align: 'right' });
    }
    if (chart.points.length === 0) return;
    const stepX = chart.points.length === 1 ? 0 : width / (chart.points.length - 1);
    const coords = chart.points.map((point, index) => ({
        x: left + stepX * index,
        y: bottom - (point.value / max) * height,
    }));
    doc.setDrawColor(...palette.series[0]);
    doc.setLineWidth(0.8);
    for (let index = 1; index < coords.length; index += 1) {
        doc.line(coords[index - 1].x, coords[index - 1].y, coords[index].x, coords[index].y);
    }
    doc.setTextColor(...palette.muted);
    doc.setFontSize(font);
    const stride = Math.max(1, Math.ceil(chart.points.length / 6));
    let lastLabel = -stride;
    chart.points.forEach((point, index) => {
        const last = index === chart.points.length - 1;
        if (index % stride !== 0 && !last) return;
        if (last && index - lastLabel < 2) return;
        doc.text(point.label, coords[index].x, bottom + 4, { align: 'center' });
        lastLabel = index;
    });
}

function drawRank(doc: PdfDoc, chart: RankChartSpec, plotX: number, plotY: number, plotW: number, plotH: number, palette: ChartPalette): void {
    if (chart.rows.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...palette.muted);
        const lines = doc.splitTextToSize(chart.empty, plotW - 4);
        lines.forEach((line, index) => {
            doc.text(line, plotX + plotW / 2, plotY + plotH / 2 + index * 4, { align: 'center' });
        });
        return;
    }
    const font = plotW >= 110 ? 9 : 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(font);
    const valueW = Math.min(plotW * 0.36, Math.max(16, ...chart.rows.map((row) => doc.getTextWidth(compact(row.value, chart.currency, chart.locale)))) + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(font);
    const max = axisMax(chart.rows.map((row) => row.value));
    const labelW = Math.min(plotW * 0.4, Math.max(16, ...chart.rows.map((row) => Math.min(doc.getTextWidth(row.name), plotW * 0.4))));
    const left = plotX + labelW + 1.5;
    const width = Math.max(8, plotW - labelW - valueW);
    const bottom = plotY + plotH - 11;
    const rowH = Math.max(6, (bottom - plotY) / chart.rows.length);
    doc.setDrawColor(...palette.grid);
    doc.setLineWidth(0.1);
    doc.setTextColor(...palette.muted);
    for (let step = 0; step <= 4; step += 1) {
        const x = left + (width * step) / 4;
        doc.line(x, plotY, x, bottom);
        if (step % 2 === 0) doc.text(compact((max * step) / 4, chart.currency, chart.locale), x, bottom + 3.5, { align: 'center' });
    }
    chart.rows.forEach((row, index) => {
        const y = plotY + rowH * index + rowH / 2;
        doc.setTextColor(...palette.muted);
        doc.text(fitText(doc, row.name, labelW), plotX, y + 1);
        const barH = Math.min(plotW >= 110 ? 7 : 4.6, Math.max(2.2, rowH * 0.48));
        const barW = Math.max(0.3, (row.value / max) * width);
        doc.setFillColor(...palette.series[0]);
        doc.roundedRect(left, y - barH / 2, barW, barH, Math.min(0.6, barH / 2), Math.min(0.6, barH / 2), 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(font);
        doc.setTextColor(...palette.foreground);
        doc.text(compact(row.value, chart.currency, chart.locale), left + barW + 1.2, y + 1);
    });
}

function drawGrouped(doc: PdfDoc, chart: GroupedChartSpec, plotX: number, plotY: number, plotW: number, plotH: number, palette: ChartPalette): void {
    const font = plotW >= 110 ? 8 : 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(font);
    const valueW = Math.min(plotW * 0.28, Math.max(16, ...chart.series.flatMap((item) => item.values).map((value) => doc.getTextWidth(compact(value, chart.currency, chart.locale)))) + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(font);
    const max = axisMax(chart.series.flatMap((item) => item.values));
    const labelW = Math.min(plotW * 0.34, 48);
    const left = plotX + labelW + 1.5;
    const width = Math.max(8, plotW - labelW - valueW);
    const count = Math.max(chart.categories.length, 1);
    const bottom = plotY + plotH - 11;
    const rowH = Math.max(8, (bottom - plotY) / count);
    const seriesCount = Math.max(chart.series.length, 1);
    const barH = Math.min(5, Math.max(2.8, (rowH * 0.72) / seriesCount));
    doc.setDrawColor(...palette.grid);
    doc.setLineWidth(0.1);
    doc.setTextColor(...palette.muted);
    for (let step = 0; step <= 4; step += 1) {
        const x = left + (width * step) / 4;
        doc.line(x, plotY, x, bottom);
        if (step % 2 === 0) doc.text(compact((max * step) / 4, chart.currency, chart.locale), x, bottom + 3.5, { align: 'center' });
    }
    chart.categories.forEach((category, index) => {
        const mid = plotY + rowH * index + rowH / 2;
        doc.setTextColor(...palette.muted);
        doc.text(fitText(doc, category, labelW), plotX, mid + 1);
        const stackH = barH * chart.series.length;
        chart.series.forEach((series, seriesIndex) => {
            const value = series.values[index] ?? 0;
            const y = mid - stackH / 2 + barH * seriesIndex;
            const barW = Math.max(0.3, (value / max) * width);
            doc.setFillColor(...palette.series[seriesIndex % palette.series.length]);
            doc.roundedRect(left, y, barW, Math.max(barH - 0.4, 0.8), 0.4, 0.4, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(font);
            doc.setTextColor(...palette.foreground);
            doc.text(compact(value, chart.currency, chart.locale), left + barW + 1.2, y + Math.min(barH * 0.72, 3.4));
        });
    });
}

function drawStacked(doc: PdfDoc, chart: StackedChartSpec, plotX: number, plotY: number, plotW: number, plotH: number, palette: ChartPalette): void {
    const font = plotW >= 110 ? 8 : 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(font);
    const totals = chart.categories.map((_, index) => chart.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0));
    const valueW = Math.min(plotW * 0.28, Math.max(16, ...totals.map((value) => doc.getTextWidth(compact(value, chart.currency, chart.locale)))) + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(font);
    const max = axisMax(totals);
    const labelW = Math.min(plotW * 0.34, 48);
    const left = plotX + labelW + 1.5;
    const width = Math.max(8, plotW - labelW - valueW);
    const count = Math.max(chart.categories.length, 1);
    const bottom = plotY + plotH - 11;
    const rowH = Math.max(8, (bottom - plotY) / count);
    const barH = Math.min(5, Math.max(2.4, rowH * 0.42));
    doc.setDrawColor(...palette.grid);
    doc.setLineWidth(0.1);
    doc.setTextColor(...palette.muted);
    for (let step = 0; step <= 4; step += 1) {
        const x = left + (width * step) / 4;
        doc.line(x, plotY, x, bottom);
        if (step % 2 === 0) doc.text(compact((max * step) / 4, chart.currency, chart.locale), x, bottom + 3.5, { align: 'center' });
    }
    chart.categories.forEach((category, index) => {
        const y = plotY + rowH * index + rowH / 2;
        doc.setTextColor(...palette.muted);
        doc.text(fitText(doc, category, labelW), plotX, y + 1);
        let cursor = left;
        chart.series.forEach((series, seriesIndex) => {
            const value = series.values[index] ?? 0;
            const barW = (value / max) * width;
            if (barW <= 0.05) return;
            doc.setFillColor(...palette.series[seriesIndex % palette.series.length]);
            doc.rect(cursor, y - barH / 2, barW, barH, 'F');
            cursor += barW;
        });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(font);
        doc.setTextColor(...palette.foreground);
        doc.text(compact(totals[index] ?? 0, chart.currency, chart.locale), cursor + 1.2, y + 1);
    });
}

function drawChart(doc: PdfDoc, chart: CommercialChartSpec, x: number, y: number, width: number, height: number, layout: CardLayout, palette: ChartPalette): void {
    doc.setFillColor(...palette.card);
    doc.setDrawColor(...palette.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, width, height, 2, 2, 'FD');
    let cursor = y + 5.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...palette.foreground);
    for (const line of layout.titleLines) {
        doc.text(line, x + 4, cursor);
        cursor += 4.6;
    }
    if (layout.descLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...palette.muted);
        for (const line of layout.descLines) {
            doc.text(line, x + 4, cursor);
            cursor += 3.6;
        }
    }
    cursor += 2;
    const plotX = x + 4;
    const plotW = width - 8;
    const legendBlock = layout.legendLines.length > 0 ? layout.legendLines.length * 5 + 6 : 4;
    const plotH = Math.max(24, height - (cursor - y) - legendBlock);
    if (chart.kind === 'column') drawColumn(doc, chart, plotX, cursor, plotW, plotH, palette);
    if (chart.kind === 'line') drawLine(doc, chart, plotX, cursor, plotW, plotH, palette);
    if (chart.kind === 'rank') drawRank(doc, chart, plotX, cursor, plotW, plotH, palette);
    if (chart.kind === 'grouped') drawGrouped(doc, chart, plotX, cursor, plotW, plotH, palette);
    if (chart.kind === 'stacked') drawStacked(doc, chart, plotX, cursor, plotW, plotH, palette);
    if (layout.legendLines.length > 0) {
        drawLegend(doc, layout.legendLines, x + 4, y + height - layout.legendLines.length * 5 - 2, palette);
    }
    doc.setFont('helvetica', 'normal');
}

function drawChartBand(doc: PdfDoc, y: number, charts: CommercialChartSpec[], palette: ChartPalette): number {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const gap = 4;
    const contentW = pageWidth - 28;
    const cardW = (contentW - gap * (charts.length - 1)) / charts.length;
    const layouts = charts.map((chart) => layoutCard(doc, chart, cardW));
    const desired = Math.max(...layouts.map((item) => item.height));
    const rowH = Math.min(desired, pageHeight - 32);
    let cursor = y + 3;
    if (cursor + rowH > pageHeight - 12) {
        doc.addPage();
        cursor = 16;
    }
    charts.forEach((chart, index) => {
        drawChart(doc, chart, 14 + index * (cardW + gap), cursor, cardW, rowH, layouts[index], palette);
    });
    return cursor + rowH + gap;
}

export function drawCommercialChartRow(doc: PdfDoc, y: number, charts: CommercialChartSpec[], palette: ChartPalette): number {
    if (charts.length === 0) return y;
    const bands: CommercialChartSpec[][] = [];
    let sideBySide: CommercialChartSpec[] = [];
    const flush = () => {
        if (sideBySide.length === 0) return;
        bands.push(sideBySide);
        sideBySide = [];
    };
    for (const chart of charts) {
        if (chart.kind === 'column' || chart.kind === 'rank') {
            flush();
            bands.push([chart]);
            continue;
        }
        sideBySide.push(chart);
        if (sideBySide.length === 2) flush();
    }
    flush();
    return bands.reduce((cursor, band) => drawChartBand(doc, cursor, band, palette), y);
}

export type ChartShot = {
    dataUrl: string;
    width: number;
    height: number;
    span: 'half' | 'third' | 'full';
};

export function drawChartShotRows(doc: PdfDoc, y: number, shots: ChartShot[]): number {
    if (shots.length === 0) return y;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const gap = 4;
    const contentW = pageWidth - 28;
    let cursor = y;
    let index = 0;
    while (index < shots.length) {
        const span = shots[index].span;
        const columns = span === 'full' ? 1 : span === 'third' ? 3 : 2;
        const row: ChartShot[] = [];
        while (row.length < columns && index < shots.length && shots[index].span === span) {
            row.push(shots[index]);
            index += 1;
        }
        const boxW = (contentW - gap * (row.length - 1)) / row.length;
        const boxH = Math.max(...row.map((shot) => (shot.width > 0 ? boxW * (shot.height / shot.width) : 40)));
        if (cursor + boxH > pageHeight - 14) {
            doc.addPage();
            cursor = 16;
        }
        row.forEach((shot, shotIndex) => {
            const height = shot.width > 0 ? boxW * (shot.height / shot.width) : boxH;
            doc.addImage(shot.dataUrl, 'PNG', 14 + shotIndex * (boxW + gap), cursor, boxW, height);
        });
        cursor += boxH + gap;
    }
    return cursor;
}
