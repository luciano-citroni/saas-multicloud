'use client';

import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { FinopsSubnav } from '@/components/root/finops/finops-subnav';
import type { OrganizationCloudAccount } from '@/app/actions/organization';
import type { FinopsBudgetPayload } from '@/app/actions/finops';

export type NotificationGroupOption = {
    id: string;
    name: string;
    channel: 'email' | 'whatsapp';
    isActive: boolean;
};

export const budgetFormSchema = z
    .object({
        name: z.string().min(1, 'Nome é obrigatório').max(255),
        amount: z.number().positive('Valor deve ser maior que zero'),
        currency: z.string().length(3, 'Moeda inválida'),
        period: z.enum(['daily', 'monthly']),
        scope: z.enum(['organization', 'cloud_account']),
        cloudAccountId: z.string().uuid().optional().or(z.literal('')),
        service: z.string().max(255).optional(),
        resourceId: z.string().max(512).optional(),
        alertFrequency: z.enum(['daily', 'monthly']),
        alertType: z.enum(['percentage', 'amount', 'resource']),
        alertAmount: z.number().positive().optional().nullable(),
        alertThresholds: z.string().optional(),
        alertChannelEmail: z.boolean(),
        alertChannelWhatsapp: z.boolean(),
        alertEmailGroupIds: z.array(z.string().uuid()),
        alertWhatsappGroupIds: z.array(z.string().uuid()),
    })
    .superRefine((data, ctx) => {
        if (data.scope === 'cloud_account' && !data.cloudAccountId) {
            ctx.addIssue({ code: 'custom', message: 'Selecione a conta cloud', path: ['cloudAccountId'] });
        }
        if (data.alertType === 'resource' && !data.resourceId?.trim()) {
            ctx.addIssue({ code: 'custom', message: 'Informe o recurso', path: ['resourceId'] });
        }
        if (data.alertType === 'amount' && (data.alertAmount == null || data.alertAmount <= 0)) {
            ctx.addIssue({ code: 'custom', message: 'Informe o valor do alerta', path: ['alertAmount'] });
        }
        if (data.alertType !== 'amount') {
            const parts = (data.alertThresholds ?? '')
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);
            if (
                parts.length === 0 ||
                parts.some((part) => {
                    const n = Number(part);
                    return !Number.isFinite(n) || n < 1 || n > 200;
                })
            ) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'Use percentuais entre 1 e 200, separados por vírgula (ex: 80, 100)',
                    path: ['alertThresholds'],
                });
            }
        }
        if (!data.alertChannelEmail && !data.alertChannelWhatsapp) {
            ctx.addIssue({
                code: 'custom',
                message: 'Selecione ao menos um canal de alerta',
                path: ['alertChannelEmail'],
            });
        }
        if (data.alertChannelEmail && data.alertEmailGroupIds.length === 0) {
            ctx.addIssue({
                code: 'custom',
                message: 'Selecione ao menos um grupo de e-mail',
                path: ['alertEmailGroupIds'],
            });
        }
        if (data.alertChannelWhatsapp && data.alertWhatsappGroupIds.length === 0) {
            ctx.addIssue({
                code: 'custom',
                message: 'Selecione ao menos um grupo de WhatsApp',
                path: ['alertWhatsappGroupIds'],
            });
        }
    });

export type BudgetFormData = z.infer<typeof budgetFormSchema>;

export function parseThresholds(value: string | undefined): number[] {
    return (value ?? '')
        .split(',')
        .map((part) => Number(part.trim()))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
}

export function toFinopsBudgetPayload(data: BudgetFormData): FinopsBudgetPayload {
    const channels: Array<'email' | 'whatsapp'> = [];
    if (data.alertChannelEmail) channels.push('email');
    if (data.alertChannelWhatsapp) channels.push('whatsapp');

    return {
        name: data.name.trim(),
        amount: data.amount,
        currency: data.currency.toUpperCase(),
        period: data.period,
        scope: data.scope,
        cloudAccountId: data.scope === 'organization' ? null : data.cloudAccountId || null,
        service: data.service?.trim() ? data.service.trim() : null,
        resourceId: data.alertType === 'resource' && data.resourceId?.trim() ? data.resourceId.trim() : null,
        alertFrequency: data.alertFrequency,
        alertType: data.alertType,
        alertAmount: data.alertType === 'amount' ? (data.alertAmount ?? null) : null,
        alertThresholds: data.alertType === 'amount' ? [100] : parseThresholds(data.alertThresholds),
        alertChannels: channels,
        alertEmails: [],
        alertNotificationGroupIds: [
            ...(data.alertChannelEmail ? data.alertEmailGroupIds : []),
            ...(data.alertChannelWhatsapp ? data.alertWhatsappGroupIds : []),
        ],
    };
}

export function defaultBudgetFormValues(overrides?: Partial<BudgetFormData>): BudgetFormData {
    return {
        name: '',
        amount: 1000,
        currency: 'USD',
        period: 'monthly',
        scope: 'cloud_account',
        cloudAccountId: '',
        service: '',
        resourceId: '',
        alertFrequency: 'monthly',
        alertType: 'percentage',
        alertAmount: null,
        alertThresholds: '80, 100',
        alertChannelEmail: true,
        alertChannelWhatsapp: false,
        alertEmailGroupIds: [],
        alertWhatsappGroupIds: [],
        ...overrides,
    };
}

type FinopsBudgetFormProps = {
    mode: 'create' | 'edit';
    defaultValues: BudgetFormData;
    cloudAccounts: OrganizationCloudAccount[];
    emailGroups: NotificationGroupOption[];
    whatsappGroups: NotificationGroupOption[];
    loadingGroups: boolean;
    backHref: string;
    onSubmit: (data: BudgetFormData) => Promise<void>;
};

function GroupChecklist({
    groups,
    loading,
    value,
    onChange,
    emptyLabel,
}: {
    groups: NotificationGroupOption[];
    loading: boolean;
    value: string[];
    onChange: (next: string[]) => void;
    emptyLabel: string;
}) {
    if (loading) {
        return <p className="text-sm text-muted-foreground">Carregando grupos…</p>;
    }

    if (groups.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                {emptyLabel}{' '}
                <Link href="/tenant/notifications" className="underline underline-offset-2">
                    Gerenciar em Notificações
                </Link>
            </p>
        );
    }

    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((group) => {
                const checked = value.includes(group.id);
                return (
                    <label
                        key={group.id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
                    >
                        <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(next) => {
                                const enabled = next === true;
                                onChange(
                                    enabled ? [...value, group.id] : value.filter((id) => id !== group.id)
                                );
                            }}
                        />
                        <span className="leading-snug">{group.name}</span>
                    </label>
                );
            })}
        </div>
    );
}

export function FinopsBudgetForm({
    mode,
    defaultValues,
    cloudAccounts,
    emailGroups,
    whatsappGroups,
    loadingGroups,
    backHref,
    onSubmit,
}: FinopsBudgetFormProps) {
    const form = useForm<BudgetFormData>({
        resolver: zodResolver(budgetFormSchema),
        defaultValues,
    });

    const watchedScope = useWatch({ control: form.control, name: 'scope' });
    const watchedAlertType = useWatch({ control: form.control, name: 'alertType' });
    const watchedEmailChannel = useWatch({ control: form.control, name: 'alertChannelEmail' });
    const watchedWhatsappChannel = useWatch({ control: form.control, name: 'alertChannelWhatsapp' });

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">
                            {mode === 'edit' ? 'Editar orçamento' : 'Novo orçamento'}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Defina o limite de gasto e quem deve ser notificado quando os limiares forem atingidos.
                        </p>
                    </div>
                    <FinopsSubnav />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={backHref}>Cancelar</Link>
                    </Button>
                    <Button
                        size="sm"
                        type="submit"
                        form="finops-budget-form"
                        isLoading={form.formState.isSubmitting}
                    >
                        {mode === 'edit' ? 'Salvar' : 'Criar orçamento'}
                    </Button>
                </div>
            </div>

            <Form {...form}>
                <form
                    id="finops-budget-form"
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="flex flex-col gap-6"
                >
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Orçamento</CardTitle>
                            <CardDescription>Nome, escopo, período e valor limite.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Budget mensal produção" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="scope"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Escopo</FormLabel>
                                            <Select
                                                value={field.value}
                                                onValueChange={(value) => {
                                                    field.onChange(value);
                                                    if (value === 'organization') {
                                                        form.setValue('cloudAccountId', '');
                                                    }
                                                }}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="organization">Toda a organização</SelectItem>
                                                    <SelectItem value="cloud_account">Conta cloud</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="period"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Período do orçamento</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="monthly">Mensal</SelectItem>
                                                    <SelectItem value="daily">Diário</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {watchedScope === 'cloud_account' ? (
                                <FormField
                                    control={form.control}
                                    name="cloudAccountId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Conta cloud</FormLabel>
                                            <Select value={field.value || undefined} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione a conta" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {cloudAccounts.map((account) => (
                                                        <SelectItem key={account.id} value={account.id}>
                                                            {`${account.alias} (${account.provider.toUpperCase()})`}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}

                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="amount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Limite</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0.01}
                                                    step={0.01}
                                                    value={Number.isFinite(field.value) ? field.value : ''}
                                                    onChange={(e) => {
                                                        const next = e.target.valueAsNumber;
                                                        field.onChange(Number.isFinite(next) ? next : undefined);
                                                    }}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="currency"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Moeda</FormLabel>
                                            <FormControl>
                                                <Input placeholder="USD" maxLength={3} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="service"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Serviço (opcional)</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Ex: Amazon EC2 — vazio = todos" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Alertas</CardTitle>
                            <CardDescription>
                                Quando e como disparar o alerta em relação ao gasto do período.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="alertFrequency"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Frequência</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="daily">Diário</SelectItem>
                                                    <SelectItem value="monthly">Mensal</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="alertType"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Tipo</FormLabel>
                                            <Select value={field.value} onValueChange={field.onChange}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="percentage">% do orçamento</SelectItem>
                                                    <SelectItem value="amount">Por valor</SelectItem>
                                                    <SelectItem value="resource">Por recurso</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {watchedAlertType === 'amount' ? (
                                <FormField
                                    control={form.control}
                                    name="alertAmount"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Valor do alerta</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    min={0.01}
                                                    step={0.01}
                                                    value={
                                                        field.value != null && Number.isFinite(field.value)
                                                            ? field.value
                                                            : ''
                                                    }
                                                    onChange={(e) =>
                                                        field.onChange(
                                                            Number.isFinite(e.target.valueAsNumber)
                                                                ? e.target.valueAsNumber
                                                                : null
                                                        )
                                                    }
                                                />
                                            </FormControl>
                                            <p className="text-xs text-muted-foreground">
                                                Dispara quando o gasto do período do alerta atingir este valor.
                                            </p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}

                            {watchedAlertType === 'resource' ? (
                                <FormField
                                    control={form.control}
                                    name="resourceId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>ID do recurso</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ex: i-0123… / vm-name" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}

                            {watchedAlertType !== 'amount' ? (
                                <FormField
                                    control={form.control}
                                    name="alertThresholds"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Limiares (%)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="80, 100" {...field} />
                                            </FormControl>
                                            <p className="text-xs text-muted-foreground">
                                                Percentuais separados por vírgula. Ex.: 50, 80, 100
                                            </p>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Notificações</CardTitle>
                            <CardDescription>
                                Escolha os canais e os grupos cadastrados em Tenant → Notificações.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="space-y-3">
                                <p className="text-sm font-medium">Canais</p>
                                <div className="flex flex-wrap gap-4">
                                    <FormField
                                        control={form.control}
                                        name="alertChannelEmail"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(checked) =>
                                                            field.onChange(checked === true)
                                                        }
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">E-mail</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="alertChannelWhatsapp"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value}
                                                        onCheckedChange={(checked) =>
                                                            field.onChange(checked === true)
                                                        }
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">WhatsApp</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <FormMessage>
                                    {form.formState.errors.alertChannelEmail?.message}
                                </FormMessage>
                            </div>

                            {watchedEmailChannel || watchedWhatsappChannel ? <Separator /> : null}

                            {watchedEmailChannel ? (
                                <FormField
                                    control={form.control}
                                    name="alertEmailGroupIds"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Grupos de e-mail</FormLabel>
                                            <GroupChecklist
                                                groups={emailGroups}
                                                loading={loadingGroups}
                                                value={field.value}
                                                onChange={field.onChange}
                                                emptyLabel="Nenhum grupo de e-mail ativo."
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}

                            {watchedWhatsappChannel ? (
                                <FormField
                                    control={form.control}
                                    name="alertWhatsappGroupIds"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Grupos de WhatsApp</FormLabel>
                                            <GroupChecklist
                                                groups={whatsappGroups}
                                                loading={loadingGroups}
                                                value={field.value}
                                                onChange={field.onChange}
                                                emptyLabel="Nenhum grupo de WhatsApp ativo."
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            ) : null}
                        </CardContent>
                    </Card>
                </form>
            </Form>
        </div>
    );
}
