import { formatCurrency, formatDate } from '@/components/root/finops/overview/helpers';
import {
    addFinopsPdfFooter,
    createFinopsPdf,
    drawFinopsPdfHeader,
    drawKpiRow,
    drawMetaLines,
    drawSectionTitle,
    FINOPS_PDF_TABLE,
    getTableEndY,
} from '@/components/root/finops/finops-pdf-layout';
import { translations } from '@/lib/i18n/translations';
import { getLocale } from '@/lib/locale';
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

function finopsCopy() {
    return translations[getLocale()].finops;
}

export async function exportFinopsReportPdf(input: ExportFinopsReportPdfInput): Promise<void> {
    if (typeof window === 'undefined') {
        throw new Error('Exportação de PDF disponível apenas no navegador.');
    }

    const { doc, autoTable } = await createFinopsPdf();

    await drawFinopsPdfHeader(doc, 'Relatório FinOps', `Gerado em ${formatDate(input.generatedAt)}`);

    let y = drawMetaLines(doc, [
        `Período: ${input.periodLabel} (${input.overview.period.startDate} → ${input.overview.period.endDate})`,
        `Conta: ${input.accountLabel}`,
        `Provedor: ${input.providerLabel}`,
        `Serviço: ${input.serviceLabel}`,
    ]);

    y = drawKpiRow(doc, y + 4, [
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
    ]);

    y = drawSectionTitle(doc, 'Por conta', y + 10);
    autoTable(doc, {
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
        ...FINOPS_PDF_TABLE,
        columnStyles: {
            2: { halign: 'right' },
            3: { halign: 'right' },
        },
    });

    y = drawSectionTitle(doc, `Por serviço (${input.services.length})`, getTableEndY(doc, y) + 10);
    autoTable(doc, {
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
        ...FINOPS_PDF_TABLE,
        columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
        },
    });

    y = drawSectionTitle(doc, 'Oportunidades e anomalias', getTableEndY(doc, y) + 10);
    autoTable(doc, {
        startY: y,
        head: [['Tipo', 'Conta', 'Título', 'Provedor', 'Impacto']],
        body:
            input.optimizeItems.length === 0
                ? [['—', '—', finopsCopy().noOpenOpportunity, '—', '—']]
                : input.optimizeItems.map((item) => [
                      item.kind,
                      input.accountAliases[item.cloudAccountId] ?? item.cloudAccountId.slice(0, 8),
                      item.title,
                      item.cloudProvider.toUpperCase(),
                      formatCurrency(item.impact, item.currency || input.currency),
                  ]),
        ...FINOPS_PDF_TABLE,
        columnStyles: {
            4: { halign: 'right' },
        },
    });

    addFinopsPdfFooter(doc, 'Bridge MultCloud · Relatório FinOps');
    doc.save(input.fileName);
}
