import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { CommercialReportResponse } from './services/finops-commercial-report.service';
import { drawCommercialChartRow, readChartPalette } from './pdf/commercial-pdf-charts';
import { pdfCopy, type PdfLocale } from './pdf/commercial-pdf-copy';
import {
    addFinopsPdfFooter,
    drawFinopsPdfHeader,
    drawKpiRow,
    drawMetaStrip,
    drawSectionTitle,
    getTableEndY,
    PDF_DANGER,
    PDF_SUCCESS,
    type KpiTone,
} from './pdf/commercial-pdf-layout';
import { FINOPS_PDF_TABLE, type PdfDoc } from './pdf/pdf-doc';
import { collapseResourceLabels } from './pdf/resource-label';
import { friendlyServiceLabel } from './pdf/service-label';

export type CommercialPdfOptions = {
    currency?: 'USD' | 'BRL';
    locale?: PdfLocale;
};

function fileSlug(value: string): string {
    const slug = value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'organizacao';
}

export function commercialReportPdfFileName(organizationName: string, month: string): string {
    return `finops-commercial-${fileSlug(organizationName)}-${month}.pdf`;
}

function formatPct(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

function change(current: number, previous: number): number | null {
    if (Math.abs(previous) < 0.000001) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

function monthTitle(month: string, locale: PdfLocale): string {
    const label = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${month}-01T12:00:00Z`));
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDate(value: string, locale: PdfLocale): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.slice(0, 10);
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
}

function projectionDetail(
    source: CommercialReportResponse['kpis']['projectionSource'] | undefined,
    providers: string[],
    baseDays: number,
    copy: ReturnType<typeof pdfCopy>,
): string {
    const count = String(baseDays);
    if (source === 'mixed') return copy.commercialForecastMixed.replace('{count}', count);
    if (source === 'provider') {
        const names = providers.map((provider) => provider.toUpperCase());
        if (names.length === 1 && names[0] === 'AWS') return copy.commercialForecastAws;
        if (names.length === 1 && names[0] === 'AZURE') return copy.commercialForecastAzure;
        return copy.commercialForecastProvider;
    }
    return copy.commercialLinearBase.replace('{count}', count);
}

function changeTone(value: number | null): KpiTone {
    if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.05) return 'neutral';
    return value > 0 ? 'up' : 'down';
}

function variationTextColor(value: string): [number, number, number] | null {
    if (value.startsWith('+') && value !== '+0.0%') return PDF_DANGER;
    if (value.startsWith('-')) return PDF_SUCCESS;
    return null;
}

function drawNote(doc: PdfDoc, text: string, y: number): void {
    const width = doc.internal.pageSize.getWidth() - 28;
    const pageHeight = doc.internal.pageSize.getHeight();
    const lines = doc.splitTextToSize(text, width);
    let cursor = y;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90);
    for (const line of lines) {
        if (cursor > pageHeight - 16) {
            doc.addPage();
            cursor = 20;
        }
        doc.text(line, 14, cursor);
        cursor += 4;
    }
}

export async function buildCommercialReportPdf(
    report: CommercialReportResponse,
    options: CommercialPdfOptions = {},
): Promise<Buffer> {
    const locale: PdfLocale = options.locale === 'en' ? 'en' : 'pt';
    const copy = pdfCopy(locale);
    const source: 'USD' | 'BRL' = report.displayCurrency === 'USD' ? 'USD' : 'BRL';
    const viewCurrency: 'USD' | 'BRL' = options.currency === 'USD' || options.currency === 'BRL' ? options.currency : source;
    const rate = report.exchangeRate != null && report.exchangeRate > 0 ? report.exchangeRate : null;
    const toCurrency = (value: number): number => {
        if (source === viewCurrency || rate == null) return value;
        if (source === 'USD' && viewCurrency === 'BRL') return value * rate;
        if (source === 'BRL' && viewCurrency === 'USD') return value / rate;
        return value;
    };
    const money = (value: number) =>
        new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
            style: 'currency',
            currency: viewCurrency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(toCurrency(value));
    const labelOf = (month: string) => monthTitle(month, locale);
    const intl = locale === 'en' ? 'en-US' : 'pt-BR';
    const previousMonth = report.months[1]?.key ?? report.referenceMonth;
    const currencyName = viewCurrency === 'BRL' ? copy.commercialCurrencyBrl : copy.commercialCurrencyUsd;
    const providers = report.providers.length > 0 ? report.providers.map((provider) => provider.toUpperCase()).join(' · ') : '—';

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdf = doc as unknown as PdfDoc;
    const palette = readChartPalette();
    const chartBase = { currency: viewCurrency, locale: intl };
    const resourceRows = (rows: Array<{ name: string; amount: number }>) =>
        collapseResourceLabels(rows, locale).map((row) => ({ name: row.name, value: toCurrency(row.amount) }));

    drawFinopsPdfHeader(pdf, copy.commercialTitle, copy.commercialPdfGenerated.replace('{date}', formatDate(report.generatedAt, locale)));

    const showExchangeRate = viewCurrency !== 'USD' && rate != null;
    const metaItems = [
        { label: copy.commercialMetaOrg, value: report.organizationName },
        { label: copy.commercialMonth, value: labelOf(report.referenceMonth) },
        { label: copy.reportProvider, value: providers },
        { label: copy.commercialCurrencyLabel, value: currencyName },
        { label: copy.commercialSource, value: 'FinOps' },
        ...(showExchangeRate
            ? [{ label: copy.commercialKpiFx, value: rate.toLocaleString(intl, { maximumFractionDigits: 4 }) }]
            : []),
    ];

    const credits = report.credits ?? { hasCredits: false, granted: 0, consumed: 0, remaining: 0 };
    const previousCost = report.totalEvolution.find((item) => item.month === previousMonth)?.cost;
    const costDelta = previousCost == null ? null : report.kpis.totalCost - previousCost;
    const signedMoney = (value: number) => {
        const formatted = money(Math.abs(value));
        if (value > 0.004) return `+${formatted}`;
        if (value < -0.004) return `-${formatted}`;
        return formatted;
    };
    const totalTone = changeTone(report.kpis.totalChangePct);

    let y = drawMetaStrip(pdf, metaItems, 38);
    y = drawSectionTitle(pdf, copy.commercialSectionExecutive, y);
    y = drawKpiRow(pdf, y, [
        {
            label: copy.commercialKpiTotal,
            value: money(report.kpis.totalCost),
            detail: copy.commercialTotalNote,
            emphasis: 'hero',
        },
        {
            label: copy.commercialKpiChange.replace('{month}', labelOf(previousMonth)),
            value: formatPct(report.kpis.totalChangePct),
            detail: costDelta == null ? undefined : signedMoney(costDelta),
            tone: totalTone,
            emphasis: 'hero',
        },
    ]);
    y = drawKpiRow(pdf, y + 3, [
        {
            label: copy.commercialKpiAvg,
            value: money(report.kpis.avgDailyCost),
            detail: formatPct(report.kpis.avgDailyChangePct),
            tone: changeTone(report.kpis.avgDailyChangePct),
        },
        {
            label: copy.commercialKpiAccounts,
            value: copy.commercialAccountsOf
                .replace('{used}', String(report.kpis.accountsWithSpend))
                .replace('{total}', String(report.kpis.accountsTotal)),
        },
        {
            label: copy.commercialKpiProjection.replace('{month}', labelOf(report.kpis.projectionMonth)),
            value: report.kpis.projection != null ? money(report.kpis.projection) : '—',
            detail: projectionDetail(report.kpis.projectionSource, report.providers, report.kpis.projectionBaseDays, copy),
        },
        ...(showExchangeRate
            ? [{ label: copy.commercialKpiFx, value: rate.toLocaleString(intl, { maximumFractionDigits: 4 }) }]
            : []),
    ]);

    const consumedShare =
        credits.hasCredits && credits.granted > 0
            ? Math.max(0, Math.min(100, (credits.consumed / credits.granted) * 100))
            : null;
    y = drawSectionTitle(pdf, copy.commercialCreditsTitle, y);
    y = drawKpiRow(pdf, y, [
        {
            label: copy.commercialCreditsGranted,
            value: money(credits.granted),
            detail: credits.hasCredits ? copy.commercialCreditsNote : copy.commercialCreditsNone,
        },
        {
            label: copy.commercialCreditsConsumed,
            value: money(credits.consumed),
            detail: consumedShare != null ? `${consumedShare.toFixed(0)}%` : undefined,
        },
        {
            label: copy.commercialCreditsRemaining,
            value: money(credits.remaining),
        },
    ]);

    const commitments = report.commitments ?? {
        hasData: false,
        avgUtilizationPercent: null,
        avgCoveragePercent: null,
        unusedCommitment: null,
        potentialMonthlySavings: null,
        savingsPlanCount: 0,
        reservationCount: 0,
        cudCount: 0,
    };
    const inventory = [
        commitments.savingsPlanCount > 0 ? `${commitments.savingsPlanCount} ${copy.commercialCommitmentsSp}` : null,
        commitments.reservationCount > 0 ? `${commitments.reservationCount} ${copy.commercialCommitmentsReservation}` : null,
        commitments.cudCount > 0 ? `${commitments.cudCount} ${copy.commercialCommitmentsCud}` : null,
    ].filter((item): item is string => item != null);
    y = drawSectionTitle(pdf, copy.commercialCommitmentsTitle, y + 2);
    y = drawKpiRow(pdf, y, [
        {
            label: copy.commercialCommitmentsInventory,
            value: inventory.length > 0 ? inventory.join(' · ') : '—',
            detail: commitments.hasData ? undefined : copy.commercialCommitmentsNone,
        },
        {
            label: copy.commercialCommitmentsUtilization,
            value:
                commitments.avgUtilizationPercent != null && Number.isFinite(commitments.avgUtilizationPercent)
                    ? `${commitments.avgUtilizationPercent.toFixed(1)}%`
                    : '—',
        },
        {
            label: copy.commercialCommitmentsCoverage,
            value:
                commitments.avgCoveragePercent != null && Number.isFinite(commitments.avgCoveragePercent)
                    ? `${commitments.avgCoveragePercent.toFixed(1)}%`
                    : '—',
        },
    ]);
    y = drawKpiRow(pdf, y + 3, [
        {
            label: copy.commercialCommitmentsUnused,
            value: commitments.unusedCommitment != null ? money(commitments.unusedCommitment) : '—',
        },
        {
            label: copy.commercialCommitmentsPotential,
            value: commitments.potentialMonthlySavings != null ? money(commitments.potentialMonthlySavings) : '—',
        },
    ]);

    const monthHeaders = report.months.map((month) => labelOf(month.key));
    const monthKeys = report.months.map((month) => month.key);

    y = drawSectionTitle(pdf, copy.commercialSectionEvolution, y + 2, { forcePageBreak: true });
    y = drawCommercialChartRow(
        pdf,
        y,
        [
            {
                kind: 'column',
                title: copy.commercialTotalEvolution,
                labels: report.totalEvolution.map((item) => labelOf(item.month)),
                values: report.totalEvolution.map((item) => toCurrency(item.cost)),
                ...chartBase,
            },
            {
                kind: 'column',
                title: copy.commercialAvgEvolution,
                labels: report.avgDailyEvolution.map((item) => labelOf(item.month)),
                values: report.avgDailyEvolution.map((item) => toCurrency(item.avg)),
                ...chartBase,
            },
        ],
        palette,
    );
    y = drawCommercialChartRow(
        pdf,
        y,
        [
            {
                kind: 'grouped',
                title: copy.commercialAccountEvolution,
                description: monthKeys.map((month) => labelOf(month)).join(' · '),
                categories: report.accountEvolution.map((row) => row.alias),
                series: monthKeys.map((month, index) => ({
                    name: labelOf(month),
                    values: report.accountEvolution.map((row) => toCurrency(row.costs[index] ?? 0)),
                })),
                ...chartBase,
            },
        ],
        palette,
    );

    const totals = report.subscriptionTable.reduce(
        (acc, row) => [acc[0] + (row.costs[0] ?? 0), acc[1] + (row.costs[1] ?? 0), acc[2] + (row.costs[2] ?? 0)],
        [0, 0, 0],
    );
    const subscriptionBody = report.subscriptionTable.map((row) => [
        row.alias,
        money(row.costs[0] ?? 0),
        money(row.costs[1] ?? 0),
        formatPct(row.change12),
        money(row.costs[2] ?? 0),
        formatPct(row.change23),
    ]);
    if (subscriptionBody.length > 0) {
        subscriptionBody.push([
            copy.commercialTotalRow,
            money(totals[0]),
            money(totals[1]),
            formatPct(change(totals[1], totals[0])),
            money(totals[2]),
            formatPct(change(totals[2], totals[1])),
        ]);
    }
    const tableTitle = drawSectionTitle(
        pdf,
        copy.commercialDetail
            .replace('{from}', monthHeaders[0] ?? labelOf(report.referenceMonth))
            .replace('{to}', labelOf(report.referenceMonth)),
        y,
        { forcePageBreak: true },
    );
    autoTable(doc, {
        startY: tableTitle,
        head: [
            [
                copy.commercialColAccount,
                monthHeaders[0] ?? '—',
                monthHeaders[1] ?? '—',
                copy.commercialColVar,
                monthHeaders[2] ?? '—',
                copy.commercialColVar,
            ],
        ],
        body: subscriptionBody.length > 0 ? subscriptionBody : [['—', '—', '—', '—', '—', '—']],
        ...FINOPS_PDF_TABLE,
        columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
        },
        didParseCell: (data) => {
            if (data.section !== 'body') return;
            if (data.column.index === 3 || data.column.index === 5) {
                const color = variationTextColor(String(data.cell.raw ?? ''));
                if (color) data.cell.styles.textColor = color;
            }
            if (data.row.index === subscriptionBody.length - 1 && subscriptionBody.length > 0) {
                data.cell.styles.fontStyle = 'bold';
            }
        },
    });
    y = getTableEndY(pdf, tableTitle) + 8;

    const linePoints = (points: Array<{ date: string; cost: number }>) =>
        points.map((point) => ({ label: point.date.slice(8, 10), value: toCurrency(point.cost) }));
    const openTitle =
        report.inProgress.projection != null
            ? copy.commercialDailyOpen
                  .replace('{month}', labelOf(report.inProgress.month))
                  .replace('{projection}', money(report.inProgress.projection))
            : copy.commercialDailyOpenEmpty.replace('{month}', labelOf(report.inProgress.month));

    y = drawSectionTitle(pdf, copy.commercialSectionDaily, y, { forcePageBreak: true });
    y = drawCommercialChartRow(
        pdf,
        y,
        [
            {
                kind: 'line',
                title: copy.commercialDailyClosed.replace('{month}', labelOf(previousMonth)),
                description: copy.commercialAvgDaily.replace('{amount}', money(report.kpis.previousAvgDaily)),
                points: linePoints(report.dailyPrevious),
                ...chartBase,
            },
            {
                kind: 'line',
                title: copy.commercialDailyClosed.replace('{month}', labelOf(report.referenceMonth)),
                description: copy.commercialAvgDaily.replace('{amount}', money(report.kpis.avgDailyCost)),
                points: linePoints(report.dailyReference),
                ...chartBase,
            },
            { kind: 'line', title: openTitle, points: linePoints(report.inProgress.points), ...chartBase },
        ],
        palette,
    );

    y = drawSectionTitle(pdf, copy.commercialSectionDrivers, y + 2, { forcePageBreak: true });
    y = drawCommercialChartRow(
        pdf,
        y,
        [
            {
                kind: 'rank',
                title: copy.commercialReductions
                    .replace('{current}', labelOf(report.referenceMonth))
                    .replace('{previous}', labelOf(previousMonth)),
                description: `${copy.commercialReductionSum.replace('{amount}', money(report.reductionSum))} ${copy.commercialGroupedNote}`,
                rows: resourceRows(report.reductions),
                empty: copy.commercialNoResources,
                ...chartBase,
            },
            {
                kind: 'rank',
                title: copy.commercialIncreases
                    .replace('{current}', labelOf(report.referenceMonth))
                    .replace('{previous}', labelOf(previousMonth)),
                description: `${copy.commercialIncreaseSum.replace('{amount}', money(report.increaseSum))} ${copy.commercialGroupedNote}`,
                rows: resourceRows(report.increases),
                empty: copy.commercialNoResources,
                ...chartBase,
            },
        ],
        palette,
    );
    y = drawCommercialChartRow(
        pdf,
        y,
        [
            {
                kind: 'rank',
                title: copy.commercialTopServices,
                rows: report.topServices.map((item) => ({
                    name: friendlyServiceLabel(item.service, locale),
                    value: toCurrency(item.cost),
                })),
                empty: copy.commercialNoResources,
                ...chartBase,
            },
            {
                kind: 'rank',
                title: copy.commercialTopResources,
                rows: resourceRows(report.topResources.map((item) => ({ name: item.name, amount: item.cost }))),
                empty: copy.commercialNoResources,
                ...chartBase,
            },
        ],
        palette,
    );
    y = drawCommercialChartRow(
        pdf,
        y,
        [
            {
                kind: 'rank',
                title: copy.commercialCostByAccount,
                rows: report.costByAccount.map((item) => ({ name: item.alias, value: toCurrency(item.cost) })),
                empty: copy.commercialNoResources,
                ...chartBase,
            },
        ],
        palette,
    );

    const serviceNames = report.accountByService.services.map((service) => friendlyServiceLabel(service, locale));
    y = drawCommercialChartRow(
        pdf,
        y,
        [
            {
                kind: 'stacked',
                title: copy.commercialAccountService,
                categories: report.accountByService.rows.map((row) => row.alias),
                series: serviceNames.map((name, index) => ({
                    name,
                    values: report.accountByService.rows.map((row) => toCurrency(row.costs[index] ?? 0)),
                })),
                ...chartBase,
            },
        ],
        palette,
    );

    const anomalies = report.anomalies ?? { total: 0, acknowledged: 0, items: [] };
    const anomalyStatus = (status: CommercialReportResponse['anomalies']['items'][number]['status']) => {
        if (status === 'acknowledged') return copy.commercialStatusAcknowledged;
        if (status === 'resolved') return copy.commercialStatusResolved;
        return copy.commercialStatusOpen;
    };
    const anomalySeverity = (severity: CommercialReportResponse['anomalies']['items'][number]['severity']) => {
        if (severity === 'critical') return copy.severityCritical;
        if (severity === 'high') return copy.severityHigh;
        if (severity === 'low') return copy.severityLow;
        return copy.severityMedium;
    };
    y = drawSectionTitle(pdf, copy.commercialAnomaliesTitle, y, { forcePageBreak: true });
    y = drawKpiRow(pdf, y + 2, [
        { label: copy.commercialAnomaliesOccurred, value: String(anomalies.total) },
        { label: copy.commercialAnomaliesAcknowledged, value: String(anomalies.acknowledged) },
    ]);
    const anomalyBody = anomalies.items.map((item) => [
        friendlyServiceLabel(item.service, locale),
        item.accountAlias || item.provider.toUpperCase(),
        new Intl.DateTimeFormat(intl, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(new Date(`${item.date.slice(0, 10)}T12:00:00Z`)),
        anomalySeverity(item.severity),
        anomalyStatus(item.status),
        money(item.impact),
    ]);
    if (anomalies.items.length < anomalies.total) {
        anomalyBody.push([
            copy.commercialAnomaliesMore
                .replace('{shown}', String(anomalies.items.length))
                .replace('{total}', String(anomalies.total)),
            '',
            '',
            '',
            '',
            '',
        ]);
    }
    autoTable(doc, {
        startY: y + 4,
        head: [
            [
                copy.commercialAnomalyColService,
                copy.commercialAnomalyColAccount,
                copy.commercialAnomalyColDate,
                copy.commercialAnomalyColSeverity,
                copy.commercialAnomalyColStatus,
                copy.commercialAnomalyColImpact,
            ],
        ],
        body: anomalyBody.length > 0 ? anomalyBody : [[copy.commercialAnomaliesEmpty, '', '', '', '', '']],
        ...FINOPS_PDF_TABLE,
        columnStyles: { 5: { halign: 'right' } },
    });
    y = getTableEndY(pdf, y + 4) + 8;

    drawNote(
        pdf,
        copy.commercialHowToRead
            .replace('{month}', labelOf(report.referenceMonth))
            .replace(
                '{currency}',
                viewCurrency === 'BRL' ? copy.commercialAmountCurrencyBrl : copy.commercialAmountCurrencyUsd,
            ),
        y,
    );
    addFinopsPdfFooter(pdf, copy.commercialPdfFooter);
    return Buffer.from(pdf.output('arraybuffer'));
}
