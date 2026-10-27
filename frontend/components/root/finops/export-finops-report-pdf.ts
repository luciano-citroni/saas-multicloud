import { formatCurrency, formatDate } from '@/components/root/finops/overview/helpers';
import type {
    CostByServiceItem,
    OrgFinopsOverview,
    OrgOptimizeItem,
    OrgOverviewAccount,
} from '@/components/root/finops/overview/types';

export type ExportFinopsReportPdfInput = {
    overview: OrgFinopsOverview;
    accounts: OrgOverviewAccount[];
    services: CostByServiceItem[];
    optimizeItems: OrgOptimizeItem[];
    accountAliases: Record<string, string>;
    totalCost: number;
    currency: string;
    periodLabel: string;
    accountLabel: string;
    providerLabel: string;
    serviceLabel: string;
    generatedAt: string;
    fileName: string;
};

type PdfDoc = {
    internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
    lastAutoTable?: { finalY?: number };
    addImage: (...args: unknown[]) => unknown;
    setFont: (...args: unknown[]) => unknown;
    setFontSize: (...args: unknown[]) => unknown;
    setTextColor: (...args: unknown[]) => unknown;
    text: (...args: unknown[]) => unknown;
    setDrawColor: (...args: unknown[]) => unknown;
    line: (...args: unknown[]) => unknown;
    setFillColor: (...args: unknown[]) => unknown;
    roundedRect: (...args: unknown[]) => unknown;
    addPage: () => unknown;
    getNumberOfPages: () => number;
    setPage: (page: number) => unknown;
    save: (fileName: string) => unknown;
};

function getTableEndY(doc: PdfDoc, fallback: number): number {
    return doc.lastAutoTable?.finalY ?? fallback;
}

async function loadBridgeLogoDataUrl(): Promise<string> {
    const response = await fetch('/logo.svg', { cache: 'force-cache' });
    if (!response.ok) {
        throw new Error('Falha ao carregar a logo Bridge.');
    }

    // Logo padrão é clara; no PDF (fundo branco) usamos versão preta.
    let svgMarkup = await response.text();
    svgMarkup = svgMarkup.replace(/fill="[^"]+"/gi, 'fill="#111111"');

    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Falha ao decodificar a logo Bridge.'));
            img.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        const targetWidth = 520;
        const scale = targetWidth / image.naturalWidth;
        canvas.width = targetWidth;
        canvas.height = Math.round(image.naturalHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Falha ao preparar canvas da logo.');
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

function addFooter(doc: PdfDoc, pageNumber: number, pageCount: number) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Bridge MultCloud · Relatório FinOps', 14, pageHeight - 8);
    doc.text(`${pageNumber} / ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
}

function drawSectionTitle(doc: PdfDoc, title: string, y: number): number {
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

export async function exportFinopsReportPdf(input: ExportFinopsReportPdfInput): Promise<void> {
    if (typeof window === 'undefined') {
        throw new Error('Exportação de PDF disponível apenas no navegador.');
    }

    // Importa explicitamente o build browser (evita jspdf.node.min.js + fflate/node no bundler).
    const [jspdfModule, autoTableModule] = await Promise.all([
        import('jspdf/dist/jspdf.es.min.js'),
        import('jspdf-autotable/es'),
    ]);
    const jsPDFCtor =
        (jspdfModule as { jsPDF?: new (options: object) => PdfDoc }).jsPDF ??
        (jspdfModule as { default?: { jsPDF?: new (options: object) => PdfDoc } }).default?.jsPDF ??
        (jspdfModule as { default?: new (options: object) => PdfDoc }).default;

    if (!jsPDFCtor) {
        throw new Error('Falha ao carregar jsPDF no navegador.');
    }

    const autoTable =
        (autoTableModule as { default?: (doc: never, options: object) => void }).default ??
        (autoTableModule as unknown as (doc: never, options: object) => void);

    const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const logoDataUrl = await loadBridgeLogoDataUrl();

    doc.addImage(logoDataUrl, 'PNG', 14, 12, 42, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(17);
    doc.text('Relatório FinOps', pageWidth - 14, 18, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text('Bridge MultCloud', pageWidth - 14, 24, { align: 'right' });
    doc.text(`Gerado em ${formatDate(input.generatedAt)}`, pageWidth - 14, 29, { align: 'right' });

    doc.setDrawColor(220);
    doc.line(14, 34, pageWidth - 14, 34);

    let y = 40;
    doc.setFontSize(9);
    doc.setTextColor(40);
    const metaLines = [
        `Período: ${input.periodLabel} (${input.overview.period.startDate} → ${input.overview.period.endDate})`,
        `Conta: ${input.accountLabel}`,
        `Provedor: ${input.providerLabel}`,
        `Serviço: ${input.serviceLabel}`,
    ];
    for (const line of metaLines) {
        doc.text(line, 14, y);
        y += 5;
    }

    y += 4;
    const boxW = (pageWidth - 28 - 9) / 4;
    const boxH = 18;
    const kpis = [
        { label: 'Custo total', value: formatCurrency(input.totalCost, input.currency) },
        { label: 'Variação MoM', value: `${Number(input.overview.totals.momGrowth).toFixed(1)}%` },
        {
            label: 'Previsão',
            value:
                input.overview.totals.forecastedCost != null
                    ? formatCurrency(input.overview.totals.forecastedCost, input.currency)
                    : '—',
        },
        {
            label: 'Economia potencial',
            value: formatCurrency(input.overview.totals.potentialSavings, input.currency),
        },
    ];

    kpis.forEach((kpi, index) => {
        const x = 14 + index * (boxW + 3);
        doc.setDrawColor(230);
        doc.setFillColor(248, 248, 248);
        doc.roundedRect(x, y, boxW, boxH, 2, 2, 'FD');
        doc.setFontSize(7);
        doc.setTextColor(110);
        doc.text(kpi.label, x + 2.5, y + 5.5);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(20);
        doc.text(kpi.value, x + 2.5, y + 12.5, { maxWidth: boxW - 5 });
        doc.setFont('helvetica', 'normal');
    });

    y = drawSectionTitle(doc, 'Por conta', y + boxH + 10);
    autoTable(doc as never, {
        startY: y,
        head: [['Conta', 'Provedor', 'Custo', '% do total']],
        body:
            input.accounts.length === 0
                ? [['—', '—', '—', '—']]
                : input.accounts.map((account) => {
                      const share = input.totalCost > 0 ? (Number(account.totalCost) / input.totalCost) * 100 : 0;
                      return [
                          account.alias,
                          account.provider.toUpperCase(),
                          formatCurrency(account.totalCost, input.currency),
                          `${share.toFixed(1)}%`,
                      ];
                  }),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        margin: { left: 14, right: 14 },
        columnStyles: {
            2: { halign: 'right' },
            3: { halign: 'right' },
        },
    });

    y = drawSectionTitle(doc, `Por serviço (${input.services.length})`, getTableEndY(doc, y) + 10);
    autoTable(doc as never, {
        startY: y,
        head: [['Serviço', 'Atual', 'Anterior', 'Variação %']],
        body:
            input.services.length === 0
                ? [['—', '—', '—', '—']]
                : input.services.map((item) => [
                      item.service,
                      formatCurrency(item.currentMonthCost, item.currency || input.currency),
                      formatCurrency(item.previousMonthCost, item.currency || input.currency),
                      `${Number(item.changePercentage).toFixed(1)}%`,
                  ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        margin: { left: 14, right: 14 },
        columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
        },
    });

    y = drawSectionTitle(doc, 'Oportunidades e anomalias', getTableEndY(doc, y) + 10);
    autoTable(doc as never, {
        startY: y,
        head: [['Tipo', 'Conta', 'Título', 'Provedor', 'Impacto']],
        body:
            input.optimizeItems.length === 0
                ? [['—', '—', 'Nenhuma oportunidade/anomalia aberta', '—', '—']]
                : input.optimizeItems.map((item) => [
                      item.kind,
                      input.accountAliases[item.cloudAccountId] ?? item.cloudAccountId.slice(0, 8),
                      item.title,
                      item.cloudProvider.toUpperCase(),
                      formatCurrency(item.impact, item.currency || input.currency),
                  ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [17, 17, 17], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        margin: { left: 14, right: 14 },
        columnStyles: {
            4: { halign: 'right' },
        },
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        addFooter(doc, page, pageCount);
    }

    doc.save(input.fileName);
}
