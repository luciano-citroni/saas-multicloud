'use client';

import { Cloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';
import type { OrganizationCloudAccount } from '@/app/actions/organization';
import type { VariableMap } from './variable-editor';

const PROVIDER_STYLES: Record<string, { label: string; className: string }> = {
    aws: {
        label: 'AWS',
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    },
    azure: {
        label: 'Azure',
        className: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
    },
    gcp: {
        label: 'GCP',
        className: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300',
    },
};

function getProviderStyle(provider?: string) {
    const key = (provider ?? '').trim().toLowerCase();
    return (
        PROVIDER_STYLES[key] ?? {
            label: (provider ?? 'Cloud').toUpperCase(),
            className: 'border-border bg-muted text-muted-foreground',
        }
    );
}

export function coerceParameterValue(type: string, raw: string): unknown {
    if (type === 'number') {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : raw;
    }
    if (type === 'boolean') return raw === 'true';
    return raw;
}

export function buildInitialParameters(variables: VariableMap): Record<string, string> {
    const initial: Record<string, string> = {};
    for (const [name, variable] of Object.entries(variables)) {
        if (variable.default == null || variable.default === '') {
            initial[name] = '';
            continue;
        }
        initial[name] = String(variable.default);
    }
    return initial;
}

export function parametersFromForm(variables: VariableMap, formValues: Record<string, string>): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};
    for (const [name, variable] of Object.entries(variables)) {
        const raw = formValues[name];
        if (raw == null || String(raw).trim() === '') continue;
        parameters[name] = coerceParameterValue(variable.type, String(raw));
    }
    return parameters;
}

export function mergeReplayParameters(
    variables: VariableMap,
    base: Record<string, string>,
    parameters: Record<string, unknown>,
): Record<string, string> {
    const next = { ...base };
    for (const name of Object.keys(variables)) {
        if (!(name in parameters) || parameters[name] == null) continue;
        const value = parameters[name];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            next[name] = String(value);
        } else {
            next[name] = JSON.stringify(value);
        }
    }
    return next;
}

export function resolveDefaultCloudAccountId(options: {
    accounts: OrganizationCloudAccount[];
    sidebarAccountId: string | null;
    automationCloudAccountId?: string | null;
}): string {
    const { accounts, sidebarAccountId, automationCloudAccountId } = options;
    if (sidebarAccountId && accounts.some((account) => account.id === sidebarAccountId)) {
        return sidebarAccountId;
    }
    if (automationCloudAccountId && accounts.some((account) => account.id === automationCloudAccountId)) {
        return automationCloudAccountId;
    }
    return accounts[0]?.id ?? '';
}

export function ExecutionCloudAccountField({
    accounts,
    value,
    onChange,
    loading,
}: {
    accounts: OrganizationCloudAccount[];
    value: string;
    onChange: (cloudAccountId: string) => void;
    loading?: boolean;
}) {
    const t = useTranslations('automation');
    const selected = accounts.find((account) => account.id === value) ?? null;
    const selectedProvider = getProviderStyle(selected?.provider);

    return (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                    <Cloud className="size-4" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold">{t.cloudAccountLabel}</p>
                    <p className="text-xs text-muted-foreground">
                        {t.cloudAccountDesc}
                    </p>
                </div>
            </div>

            {loading ? (
                <Skeleton className="h-11 w-full rounded-lg" />
            ) : (
                <Select
                    value={value || undefined}
                    onValueChange={onChange}
                    disabled={accounts.length === 0}
                >
                    <SelectTrigger
                        id="execution-cloud-account"
                        className="h-auto w-full min-h-11 py-2"
                    >
                        <SelectValue placeholder={t.selectAccountPlaceholder}>
                            {selected ? (
                                <span className="flex min-w-0 items-center gap-2.5">
                                    <Badge
                                        variant="outline"
                                        className={cn('shrink-0 text-[10px] font-semibold', selectedProvider.className)}
                                    >
                                        {selectedProvider.label}
                                    </Badge>
                                    <span className="truncate font-medium">{selected.alias}</span>
                                </span>
                            ) : null}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" className="w-(--radix-select-trigger-width)">
                        {accounts.map((account) => {
                            const provider = getProviderStyle(account.provider);
                            return (
                                <SelectItem key={account.id} value={account.id} className="py-2.5">
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        <Badge
                                            variant="outline"
                                            className={cn('shrink-0 text-[10px] font-semibold', provider.className)}
                                        >
                                            {provider.label}
                                        </Badge>
                                        <span className="truncate">{account.alias}</span>
                                    </span>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>
            )}

            {accounts.length === 0 && !loading ? (
                <p className="text-xs text-destructive">{t.noCloudAccounts}</p>
            ) : null}
        </div>
    );
}

export function ExecutionParametersForm({
    variables,
    values,
    onChange,
    errors,
}: {
    variables: VariableMap;
    values: Record<string, string>;
    onChange: (name: string, value: string) => void;
    errors?: Record<string, string>;
}) {
    const t = useTranslations('automation');
    const tc = useTranslations('common');
    const entries = Object.entries(variables);
    if (entries.length === 0) return null;

    return (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <div>
                <p className="text-sm font-semibold">{t.executionParamsTitle}</p>
                <p className="text-xs text-muted-foreground">
                    {t.executionParamsDesc}
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {entries.map(([name, variable]) => {
                    const required = variable.required !== false && variable.default == null;
                    const error = errors?.[name];
                    const label = variable.description?.trim() || name;
                    return (
                        <div key={name} className="space-y-1.5">
                            <Label className="text-xs" htmlFor={`exec-param-${name}`}>
                                {label}
                                {required ? ' *' : ''}
                            </Label>
                            {variable.description && variable.description.trim() !== name ? (
                                <p className="font-mono text-[10px] text-muted-foreground">{name}</p>
                            ) : null}
                            {variable.type === 'boolean' ? (
                                <Select
                                    value={values[name] || undefined}
                                    onValueChange={(next) => onChange(name, next)}
                                >
                                    <SelectTrigger id={`exec-param-${name}`} className="h-9 text-xs">
                                        <SelectValue placeholder={t.selectPlaceholder} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="true" className="text-xs">
                                            {tc.yes} (true)
                                        </SelectItem>
                                        <SelectItem value="false" className="text-xs">
                                            {tc.no} (false)
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    id={`exec-param-${name}`}
                                    className="h-9 text-xs"
                                    type={variable.sensitive ? 'password' : variable.type === 'number' ? 'number' : 'text'}
                                    value={values[name] ?? ''}
                                    placeholder={
                                        variable.default != null
                                            ? t.defaultValue.replace('{value}', String(variable.default))
                                            : t.enterValue
                                    }
                                    onChange={(event) => onChange(name, event.target.value)}
                                    aria-invalid={Boolean(error)}
                                />
                            )}
                            {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
