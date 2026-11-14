import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type AiFinopsExecutiveReportInput = {
    organizationLabel: string;
    period: { start: string; end: string };
    totals: {
        officialCost: number;
        estimatedGatewayCost: number;
        totalTokens: number;
        requestCount: number;
    };
    momDeltas?: {
        totalTokens: number | null;
        officialCost: number | null;
        estimatedGatewayCost: number | null;
    };
    topProviders: Array<{ key: string; officialCost: number; estimatedCost: number }>;
    topModels: Array<{ key: string; officialCost: number; estimatedCost: number }>;
    licenseBurn?: { seats: number; creditRemaining: number };
    note?: string;
};

function pct(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

export function buildAiFinopsExecutivePdf(input: AiFinopsExecutiveReportInput): Buffer {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    let y = 48;
    doc.setFontSize(16);
    doc.text('AI FinOps Executive Report', 40, y);
    y += 22;
    doc.setFontSize(10);
    doc.text(`Organization: ${input.organizationLabel}`, 40, y);
    y += 14;
    doc.text(`Period: ${input.period.start} → ${input.period.end}`, 40, y);
    y += 14;
    doc.text(
        input.note ??
            'Official provider costs and Gateway estimates are reported separately and never auto-summed.',
        40,
        y,
        { maxWidth: 520 },
    );
    y += 28;

    autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value', 'MoM']],
        body: [
            ['Official cost (admin)', `$${input.totals.officialCost.toFixed(2)}`, pct(input.momDeltas?.officialCost)],
            [
                'Gateway estimated',
                `$${input.totals.estimatedGatewayCost.toFixed(2)}`,
                pct(input.momDeltas?.estimatedGatewayCost),
            ],
            ['Tokens', String(input.totals.totalTokens), pct(input.momDeltas?.totalTokens)],
            ['Requests', String(input.totals.requestCount), '—'],
            ['Seats (active qty)', String(input.licenseBurn?.seats ?? 0), '—'],
            ['Credits remaining', String(input.licenseBurn?.creditRemaining ?? 0), '—'],
        ],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
    });

    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;
    autoTable(doc, {
        startY: y,
        head: [['Top provider', 'Official', 'Gateway est.']],
        body: input.topProviders.slice(0, 8).map((row) => [
            row.key,
            `$${row.officialCost.toFixed(2)}`,
            `$${row.estimatedCost.toFixed(2)}`,
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
    });

    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 20;
    autoTable(doc, {
        startY: y,
        head: [['Top model', 'Official', 'Gateway est.']],
        body: input.topModels.slice(0, 8).map((row) => [
            row.key,
            `$${row.officialCost.toFixed(2)}`,
            `$${row.estimatedCost.toFixed(2)}`,
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [37, 99, 235] },
    });

    const arrayBuffer = doc.output('arraybuffer');
    return Buffer.from(arrayBuffer);
}

export function aiFinopsExecutivePdfFileName(label: string, endDate: string): string {
    const slug = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'org';
    return `ai-finops-executive-${slug}-${endDate}.pdf`;
}
