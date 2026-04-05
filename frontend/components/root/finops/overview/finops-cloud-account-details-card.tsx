'use client';

import Link from 'next/link';
import { MoreVertical, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { OrganizationCloudAccount } from '@/app/actions/organization';
import type { FinopsDashboard } from './types';

type FinopsCloudAccountDetailsCardProps = {
    account: OrganizationCloudAccount;
    dashboard: FinopsDashboard | null;
    isLoading?: boolean;
};

export function FinopsCloudAccountDetailsCard({ account, dashboard, isLoading = false }: FinopsCloudAccountDetailsCardProps) {
    if (isLoading) {
        return <div className="rounded-xl border bg-muted h-64 animate-pulse" />;
    }

    const totalCost = dashboard ? Number(dashboard.totalCost) : 0;
    const previousCost = dashboard && dashboard.trend ? Number(dashboard.trend.previousPeriodCost) : 0;
    const costChange = totalCost - previousCost;
    const costChangePercent = previousCost > 0 ? (costChange / previousCost) * 100 : 0;
    const currency = dashboard?.currency ?? 'USD';
    const isIncreasing = costChange > 0;
    const accountDashboardHref = `/finops/dashboard?account=${encodeURIComponent(account.id)}`;

    return (
        <div className="group rounded-xl border p-4 transition-colors hover:bg-muted/50">
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div className={cn('inline-block size-3 rounded-full', account.isActive ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                        <h3 className="font-semibold truncate">{account.alias}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{account.provider.toUpperCase()}</p>

                    {account.isSyncInProgress && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                            <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
                            Sincronização em progresso
                        </div>
                    )}

                    {account.lastGeneralSyncAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                            Última sync: {new Date(account.lastGeneralSyncAt).toLocaleDateString('pt-BR')}
                        </p>
                    )}
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="size-4" />
                            <span className="sr-only">Menu</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                            <Link href={accountDashboardHref} className="cursor-pointer">
                                Ver detalhes
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href={`/cloud-accounts/${account.id}`} className="cursor-pointer">
                                Gerenciar conta
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Financial Data */}
            {dashboard ? (
                <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-2.5">
                        <p className="text-xs text-muted-foreground">Custo do mês</p>
                        <p className="mt-1 text-lg font-bold">{formatCurrency(totalCost, currency)}</p>
                        <div
                            className={cn(
                                'mt-0.5 flex items-center gap-1 text-xs',
                                isIncreasing ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                            )}
                        >
                            {isIncreasing ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                            {Math.abs(costChangePercent).toFixed(1)}%
                        </div>
                    </div>

                    <div className="rounded-lg border p-2.5">
                        <p className="text-xs text-muted-foreground">Top serviço</p>
                        <p className="mt-1 truncate text-sm font-semibold">
                            {dashboard.topServices?.[0]?.service
                                ?.replace(/^Amazon\s+/i, '')
                                .replace(/^AWS\s+/i, '')
                                .slice(0, 20) || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {dashboard.topServices?.[0] ? formatCurrency(Number(dashboard.topServices[0].cost), currency) : '--'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="mt-4 p-3 text-center text-sm text-muted-foreground rounded-lg border border-dashed">Nenhum dado de FinOps disponível</div>
            )}

            <Link href={accountDashboardHref} className="mt-3 block w-full">
                <Button variant="outline" size="sm" className="w-full">
                    Abrir dashboard
                </Button>
            </Link>
        </div>
    );
}
