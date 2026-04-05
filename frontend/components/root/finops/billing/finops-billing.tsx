'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, DollarSign, Calculator } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { extractErrorMessage } from '@/lib/error-messages';
import { computeFinopsBilling, fetchFinopsBillingHistory } from '@/app/actions/finops';
import { formatCurrency } from '@/components/root/finops/overview/helpers';
import type { BillingRecord } from '@/components/root/finops/overview/types';

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

const billingSchema = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use formato YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use formato YYYY-MM-DD'),
    markupPercentage: z.number().min(0, 'Mínimo 0%').max(500, 'Máximo 500%'),
});
type BillingFormData = z.infer<typeof billingSchema>;

function getDefaultDates() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}

export function FinopsBilling() {
    const router = useRouter();
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);
    const [history, setHistory] = useState<BillingRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const defaults = getDefaultDates();

    const form = useForm<BillingFormData>({
        resolver: zodResolver(billingSchema),
        defaultValues: { startDate: defaults.startDate, endDate: defaults.endDate, markupPercentage: 20 },
    });

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        setCloudAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
    }, []);

    const loadHistory = useCallback(async (orgId: string, cloudId: string) => {
        setLoading(true);
        try {
            const res = await fetchFinopsBillingHistory(orgId, cloudId, 12);
            if (res.status === 401) { toast.error('Sessão expirada.'); router.replace('/auth/sign-in'); return; }
            if (!res.ok) return;
            const data = await res.json().catch(() => []);
            setHistory(Array.isArray(data) ? data : (data as { items?: BillingRecord[] })?.items ?? []);
        } finally { setLoading(false); }
    }, [router]);

    useEffect(() => {
        if (!organizationId || !cloudAccountId) { setLoading(false); return; }
        void loadHistory(organizationId, cloudAccountId);
    }, [organizationId, cloudAccountId, loadHistory]);

    const onSubmit = async (data: BillingFormData) => {
        if (!organizationId || !cloudAccountId) return;
        try {
            const res = await computeFinopsBilling(organizationId, cloudAccountId, data.startDate, data.endDate, data.markupPercentage);
            const body = await res.json().catch(() => null);
            if (!res.ok) { toast.error(extractErrorMessage(body, 'pt')); return; }
            toast.success('Billing calculado e salvo!');
            void loadHistory(organizationId, cloudAccountId);
        } catch { toast.error('Não foi possível calcular o billing.'); }
    };

    if (!organizationId || !cloudAccountId) {
        return (
            <div className="rounded-xl border">
                <div className="border-b px-4 py-3">
                    <p className="text-sm font-medium">Billing & Monetização</p>
                    <p className="text-xs text-muted-foreground">Selecione uma conta cloud na sidebar.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {/* Form section */}
            <div className="rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Billing & Monetização</p>
                        <p className="text-xs text-muted-foreground">Calcule o preço final com markup e margem</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/finops">
                            <ArrowLeft className="size-4" />
                            Voltar
                        </Link>
                    </Button>
                </div>

                <div className="border-b px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Calculator className="size-3.5" />
                        Calcular billing
                    </p>
                </div>
                <div className="p-4">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3">
                            <FormField control={form.control} name="startDate" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Data início</FormLabel>
                                    <FormControl><Input type="date" className="w-40" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="endDate" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Data fim</FormLabel>
                                    <FormControl><Input type="date" className="w-40" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="markupPercentage" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">Markup (%)</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={500}
                                            step={0.1}
                                            className="w-28"
                                            {...field}
                                            onChange={(e) => field.onChange(e.target.valueAsNumber)}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <Button type="submit" size="sm" isLoading={form.formState.isSubmitting} disabled={form.formState.isSubmitting}>
                                <DollarSign className="size-4" />
                                Calcular
                            </Button>
                        </form>
                    </Form>
                </div>
            </div>

            {/* History table */}
            <div className="rounded-xl border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="space-y-0.5">
                        <p className="text-sm font-medium">Histórico de billing</p>
                        <p className="text-xs text-muted-foreground">
                            Últimos 12 períodos calculados
                            {!loading && history.length > 0 && ` — ${history.length} registro${history.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="divide-y">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3">
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                                    <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
                                </div>
                                <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
                                <div className="h-3.5 w-10 animate-pulse rounded bg-muted" />
                                <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
                                <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
                            </div>
                        ))}
                    </div>
                ) : history.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                        <DollarSign className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">Nenhum billing calculado</p>
                        <p className="text-xs text-muted-foreground">Use o formulário acima para calcular o primeiro período.</p>
                    </div>
                ) : (
                    <>
                        <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                            <span>Período</span>
                            <span className="text-right">Custo cloud</span>
                            <span className="text-right">Markup</span>
                            <span className="text-right">Preço final</span>
                            <span className="text-right">Margem</span>
                        </div>
                        <div className="divide-y">
                            {history.map((record) => {
                                const markup = Number(record.markupPercentage);
                                const marginPct = Number(record.marginPercentage);
                                const start = new Date(record.periodStart + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                                const end = new Date(record.periodEnd + 'T12:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
                                return (
                                    <div key={`${record.periodStart}-${record.periodEnd}`} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-4 py-2.5">
                                        <div>
                                            <p className="text-sm font-medium">{start} → {end}</p>
                                            <div className="mt-1 h-1 w-full max-w-28 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(marginPct, 100)}%` }} />
                                            </div>
                                        </div>
                                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground sm:text-right">{formatCurrency(Number(record.cloudCost), record.currency)}</span>
                                        <span className="shrink-0 text-sm tabular-nums sm:text-right">{markup.toFixed(1)}%</span>
                                        <span className="shrink-0 text-sm font-semibold tabular-nums sm:text-right">{formatCurrency(Number(record.finalPrice), record.currency)}</span>
                                        <span className="shrink-0 text-sm font-semibold tabular-nums text-green-600 dark:text-green-400 sm:text-right">
                                            {formatCurrency(Number(record.margin), record.currency)} ({marginPct.toFixed(1)}%)
                                        </span>
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
