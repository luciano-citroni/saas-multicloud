'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from 'recharts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { CostByServiceItem } from '@/components/root/finops/overview/types';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { fetchFinopsCostByService } from '@/app/actions/finops';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ─── Service name shortcuts ───────────────────────────────────────────────────

const SERVICE_ALIASES: Record<string, string> = {
    'Amazon Elastic Compute Cloud':          'EC2',
    'Amazon Simple Storage Service':         'S3',
    'Amazon Relational Database Service':    'RDS',
    'Amazon CloudFront':                     'CloudFront',
    'Amazon Route 53':                       'Route 53',
    'AWS Lambda':                            'Lambda',
    'Amazon DynamoDB':                       'DynamoDB',
    'Amazon Virtual Private Cloud':          'VPC',
    'AWS Key Management Service':            'KMS',
    'Amazon Simple Notification Service':    'SNS',
    'Amazon Simple Queue Service':           'SQS',
    'Amazon ElastiCache':                    'ElastiCache',
    'Amazon Elastic Kubernetes Service':     'EKS',
    'Amazon Elastic Container Service':      'ECS',
    'Amazon Elastic Block Store':            'EBS',
    'Amazon Elastic Load Balancing':         'ELB',
    'AWS CloudTrail':                        'CloudTrail',
    'Amazon CloudWatch':                     'CloudWatch',
    'AWS Secrets Manager':                   'Secrets Manager',
    'Amazon API Gateway':                    'API Gateway',
    'AWS WAF':                               'WAF',
    'Amazon Cognito':                        'Cognito',
    'Amazon SageMaker':                      'SageMaker',
    'AWS Glue':                              'Glue',
    'Amazon Athena':                         'Athena',
    'Amazon Redshift':                       'Redshift',
    'Amazon OpenSearch Service':             'OpenSearch',
    'AWS Backup':                            'Backup',
    'Amazon Elastic File System':            'EFS',
    'AWS Transfer Family':                   'Transfer',
    'Amazon MSK':                            'MSK (Kafka)',
    'Amazon Kinesis':                        'Kinesis',
    'Amazon EventBridge':                    'EventBridge',
    'AWS Step Functions':                    'Step Functions',
    'Amazon SES':                            'SES',
    'Amazon Pinpoint':                       'Pinpoint',
    'Amazon Inspector':                      'Inspector',
    'Amazon GuardDuty':                      'GuardDuty',
    'AWS Shield':                            'Shield',
    'AWS Config':                            'Config',
    'Amazon Rekognition':                    'Rekognition',
    'Amazon Textract':                       'Textract',
    // Azure
    'Virtual Machines':                      'VMs',
    'Azure App Service':                     'App Service',
    'Azure SQL Database':                    'SQL Database',
    'Azure Kubernetes Service':              'AKS',
    'Azure Blob Storage':                    'Blob Storage',
    'Azure Functions':                       'Functions',
    'Azure Cosmos DB':                       'Cosmos DB',
    'Azure Monitor':                         'Monitor',
    'Azure Active Directory':                'Azure AD',
    'Azure Load Balancer':                   'Load Balancer',
    'Azure Application Gateway':             'App Gateway',
    'Azure Key Vault':                       'Key Vault',
    'Azure Container Registry':              'Container Registry',
    'Azure DevOps':                          'DevOps',
    'Azure Backup':                          'Backup',
    'Azure Site Recovery':                   'Site Recovery',
    'Bandwidth':                             'Bandwidth',
    'Support':                               'Support',
    'Tax':                                   'Tax',
};

function shortenServiceName(name: string): string {
    if (SERVICE_ALIASES[name]) return SERVICE_ALIASES[name];
    return name
        .replace(/^Amazon\s+/i, '')
        .replace(/^AWS\s+/i, '')
        .replace(/^Microsoft\s+Azure\s+/i, '')
        .replace(/\s+Service$/i, '')
        .replace(/\s+Cloud$/i, '')
        .trim()
        .slice(0, 22);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrendBadge({ trend, changePercentage }: { trend: 'up' | 'down' | 'stable'; changePercentage: number }) {
    if (trend === 'stable') {
        return (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                <Minus className="size-3 shrink-0" />
                <span className="hidden sm:inline">estável</span>
            </span>
        );
    }
    if (trend === 'up') {
        return (
            <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-destructive">
                <TrendingUp className="size-3 shrink-0" />
                +{changePercentage.toFixed(1)}%
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-success">
            <TrendingDown className="size-3 shrink-0" />
            {changePercentage.toFixed(1)}%
        </span>
    );
}

function SkeletonRow() {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="h-4 w-12 animate-pulse rounded bg-muted" />
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FinopsCostDetails() {
    const router = useRouter();

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const [items, setItems] = useState<CostByServiceItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const orgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        const cloudId = window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY);
        setOrganizationId(orgId);
        setCloudAccountId(cloudId);
    }, []);

    const loadData = useCallback(
        async (orgId: string, cloudId: string, y: number, m: number) => {
            setLoading(true);
            try {
                const res = await fetchFinopsCostByService(orgId, cloudId, y, m);
                if (res.status === 401) {
                    toast.error('Sua sessão expirou.');
                    router.replace('/auth/sign-in');
                    return;
                }
                if (!res.ok) {
                    const body = await res.json().catch(() => null);
                    toast.error(extractErrorMessage(body, 'pt'));
                    return;
                }
                const data = await res.json().catch(() => []);
                setItems(Array.isArray(data) ? data : []);
            } catch {
                toast.error('Não foi possível carregar os dados de custo.');
            } finally {
                setLoading(false);
            }
        },
        [router],
    );

    useEffect(() => {
        if (!organizationId || !cloudAccountId) { setLoading(false); return; }
        void loadData(organizationId, cloudAccountId, year, month);
    }, [organizationId, cloudAccountId, year, month, loadData]);

    const goPrevMonth = () => {
        if (month === 1) { setYear((y) => y - 1); setMonth(12); }
        else setMonth((m) => m - 1);
    };

    const goNextMonth = () => {
        if (isCurrentMonth) return;
        if (month === 12) { setYear((y) => y + 1); setMonth(1); }
        else setMonth((m) => m + 1);
    };

    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const totalCost = items.reduce((s, i) => s + i.currentMonthCost, 0);
    const increasingServices = items.filter((i) => i.trend === 'up' && i.changePercentage > 10);
    const currency = items[0]?.currency ?? 'USD';

    // Chart: top 8 services, horizontal bars
    const chartItems = items.slice(0, 8).map((i) => ({
        ...i,
        label: shortenServiceName(i.service),
    }));
    const chartHeight = Math.max(220, chartItems.length * 44);

    const chartConfig = {
        currentMonthCost: {
            label: 'Custo do mês',
            color: 'var(--chart-1)',
        },
    } satisfies ChartConfig;

    if (!organizationId || !cloudAccountId) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Detalhes de Custos</CardTitle>
                    <CardDescription>
                        Selecione uma organização e uma conta cloud na sidebar para visualizar os custos por serviço.
                    </CardDescription>
                </CardHeader>
            </Card>
        );
    }

    const prevMonthLabel = month === 1
        ? `Dez ${year - 1}`
        : `${MONTH_NAMES[month - 2].slice(0, 3)} ${year}`;

    return (
        <div className="flex flex-col gap-4">

            {/* ── Header ── */}
            <div className="rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Custos por Serviço</p>
                        <p className="text-xs text-muted-foreground">
                            {MONTH_NAMES[month - 1]} {year}
                            {!loading && ` — ${items.length} serviço${items.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="size-8" onClick={goPrevMonth}>
                            <ChevronLeft className="size-4" />
                        </Button>
                        <span className="min-w-27.5 text-center text-sm font-medium tabular-nums">
                            {MONTH_NAMES[month - 1].slice(0, 3)} {year}
                        </span>
                        <Button variant="outline" size="icon" className="size-8" onClick={goNextMonth} disabled={isCurrentMonth}>
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                </div>

                {/* ── Summary cards ── */}
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Total do mês</p>
                        <p className="mt-1 text-xl font-bold">
                            {loading ? <span className="text-muted-foreground">—</span> : formatCurrency(totalCost, currency)}
                        </p>
                    </div>

                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Em alta (&gt;10%)</p>
                        <p className={cn('mt-1 text-xl font-bold', !loading && increasingServices.length > 0 ? 'text-destructive' : '')}>
                            {loading ? '—' : increasingServices.length}
                        </p>
                        {!loading && increasingServices.length > 0 && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {increasingServices.slice(0, 2).map((s) => shortenServiceName(s.service)).join(', ')}
                                {increasingServices.length > 2 ? ` +${increasingServices.length - 2}` : ''}
                            </p>
                        )}
                    </div>

                    <div className="col-span-2 rounded-lg border p-3 sm:col-span-1">
                        <p className="text-xs text-muted-foreground">Maior serviço</p>
                        {!loading && items.length > 0 ? (
                            <>
                                <p className="mt-1 truncate text-base font-bold">
                                    {shortenServiceName(items[0].service)}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {formatCurrency(items[0].currentMonthCost, currency)}
                                    {totalCost > 0 && ` · ${((items[0].currentMonthCost / totalCost) * 100).toFixed(1)}%`}
                                </p>
                            </>
                        ) : (
                            <p className="mt-1 text-xl font-bold text-muted-foreground">—</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Horizontal bar chart ── */}
            {!loading && chartItems.length > 0 && (
                <div className="rounded-xl border">
                    <div className="border-b px-4 py-3">
                        <p className="text-sm font-medium">Top {chartItems.length} serviços</p>
                        <p className="text-xs text-muted-foreground">
                            Em <span className="text-destructive font-medium">vermelho</span>: aumento &gt;10% vs {prevMonthLabel}
                        </p>
                    </div>
                    <div className="p-4">
                        <ChartContainer config={chartConfig} style={{ height: chartHeight }} className="w-full">
                            <BarChart
                                layout="vertical"
                                data={chartItems}
                                margin={{ top: 0, right: 56, left: 0, bottom: 0 }}
                            >
                                <CartesianGrid horizontal={false} />
                                <YAxis
                                    dataKey="label"
                                    type="category"
                                    width={96}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 12 }}
                                />
                                <XAxis
                                    type="number"
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 11 }}
                                    tickFormatter={(v: number) =>
                                        v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`
                                    }
                                />
                                <ChartTooltip
                                    cursor={{ fill: 'color-mix(in oklch, var(--muted) 40%, transparent)' }}
                                    content={
                                        <ChartTooltipContent
                                            labelKey="label"
                                            formatter={(value) => formatCurrency(Number(value), currency)}
                                        />
                                    }
                                />
                                <Bar dataKey="currentMonthCost" radius={[0, 4, 4, 0]} maxBarSize={28}>
                                    {chartItems.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={
                                                entry.trend === 'up' && entry.changePercentage > 10
                                                    ? 'var(--destructive)'
                                                    : 'var(--chart-1)'
                                            }
                                        />
                                    ))}
                                    <LabelList
                                        dataKey="currentMonthCost"
                                        position="right"
                                        style={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                                        formatter={(v: number) =>
                                            v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`
                                        }
                                    />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </div>
                </div>
            )}

            {/* ── Table ── */}
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Detalhamento completo</p>
                    <p className="text-xs text-muted-foreground">Comparação com {prevMonthLabel}</p>
                </div>

                {loading ? (
                    <div className="divide-y">
                        {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                        <BarChart2 className="size-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            Nenhum dado para {MONTH_NAMES[month - 1]} {year}.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Realize uma sincronização FinOps para coletar dados deste período.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Header row */}
                        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[1fr_auto_auto_auto]">
                            <span>Serviço</span>
                            <span className="text-right">Mês atual</span>
                            <span className="hidden text-right sm:block">{prevMonthLabel}</span>
                            <span className="text-right">Var.</span>
                        </div>

                        <div className="divide-y">
                            {items.map((item) => {
                                const isRising = item.trend === 'up' && item.changePercentage > 10;
                                const share = totalCost > 0
                                    ? ((item.currentMonthCost / totalCost) * 100).toFixed(1)
                                    : '0';

                                return (
                                    <div
                                        key={item.service}
                                        className={cn(
                                            'grid grid-cols-[1fr_auto_auto] items-center gap-2 px-4 py-2.5 sm:grid-cols-[1fr_auto_auto_auto]',
                                            isRising && 'bg-destructive/5',
                                        )}
                                    >
                                        {/* Service name */}
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                {shortenServiceName(item.service)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{share}% do total</p>
                                        </div>

                                        {/* Current cost */}
                                        <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                                            {formatCurrency(item.currentMonthCost, item.currency)}
                                        </span>

                                        {/* Previous cost — hidden on mobile */}
                                        <span className="hidden shrink-0 text-right text-sm text-muted-foreground tabular-nums sm:block">
                                            {item.previousMonthCost > 0
                                                ? formatCurrency(item.previousMonthCost, item.currency)
                                                : '—'}
                                        </span>

                                        {/* Trend */}
                                        <div className="shrink-0 text-right">
                                            <TrendBadge trend={item.trend} changePercentage={item.changePercentage} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
