'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { Globe, KeyRound, ShieldCheck, Tag, Trash2, Plus, Copy, Check as CheckIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { cloudAccountFormScheme } from '@/components/root/cloud-accounts/new/scheme';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
    deleteOrganizationCloudAccount,
    fetchOrganizationCloudAccountById,
    setOrganizationCloudAccountActiveStatus,
    updateOrganizationCloudAccount,
    type OrganizationCloudAccountDetails,
} from '@/app/actions/organization';
import { extractErrorMessage } from '@/lib/error-messages';
import { notifySidebarContextUpdated } from '@/lib/sidebar-context';
import { buildTrustPolicy, PERMISSIONS_POLICY } from '@/lib/role-permissions';
import { CloudAccountEditActions } from '@/components/root/cloud-accounts/edit/cloud-account-edit-actions';

type Props = {
    organizationId: string;
    cloudAccountId: string;
};

type FormValues = z.infer<typeof cloudAccountFormScheme>;

type ApiErrorPayload = {
    message?: string | string[];
    statusCode?: number;
    error?: string;
    path?: string;
    timestamp?: string;
};

function parseAdditionalRegions(values?: Array<{ value?: string }>): string[] {
    if (!values) return [];

    return values.map((item) => (item.value ?? '').trim().toLowerCase()).filter((region) => region.length > 0);
}

function normalizeCloudAccountDetails(payload: unknown): OrganizationCloudAccountDetails | null {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }

    const account = payload as OrganizationCloudAccountDetails;

    if (typeof account.id !== 'string' || typeof account.alias !== 'string' || typeof account.provider !== 'string') {
        return null;
    }

    return account;
}

function normalizeRegionFields(regions: unknown): Array<{ value: string }> {
    if (!Array.isArray(regions)) {
        return [];
    }

    return regions
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
        .map((value) => ({ value }));
}

function providerLabel(provider: string): string {
    const normalized = provider.toLowerCase();

    if (normalized === 'aws') return 'Amazon Web Services';
    if (normalized === 'azure') return 'Microsoft Azure';
    if (normalized === 'gcp') return 'Google Cloud Platform';

    return provider;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="inline-flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-auto"
        >
            {copied ? <CheckIcon className="size-3 text-green-500" /> : <Copy className="size-3" />}
            {copied ? 'Copiado!' : 'Copiar'}
        </button>
    );
}

function PolicyBlock({ label, json }: { label: string; json: object }) {
    const text = JSON.stringify(json, null, 2);

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <CopyButton text={text} />
            </div>
            <pre className="overflow-x-auto whitespace-pre rounded-md border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-foreground/80 sm:text-xs">
                {text}
            </pre>
        </div>
    );
}

export function FormCloudAccountEdit({ organizationId, cloudAccountId }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isStatusLoading, setIsStatusLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoadingAccount, setIsLoadingAccount] = useState(true);
    const [cloudAccount, setCloudAccount] = useState<OrganizationCloudAccountDetails | null>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(cloudAccountFormScheme),
        defaultValues: {
            alias: '',
            provider: 'aws',
            roleArn: '',
            region: '',
            awsRegions: [],
            tenantId: '',
            clientId: '',
            clientSecret: '',
            subscriptionId: '',
        },
    });

    const {
        fields: awsRegionFields,
        append: appendAwsRegion,
        remove: removeAwsRegion,
    } = useFieldArray({
        control: form.control,
        name: 'awsRegions',
    });

    useEffect(() => {
        const loadCloudAccount = async () => {
            setIsLoadingAccount(true);

            try {
                const response = await fetchOrganizationCloudAccountById(organizationId, cloudAccountId);
                const payload = (await response.json().catch(() => null)) as unknown;

                if (!response.ok) {
                    toast.error(extractErrorMessage((payload as ApiErrorPayload | null) ?? null, 'pt'));
                    router.replace('/organizations');
                    return;
                }

                const account = normalizeCloudAccountDetails(payload);

                if (!account) {
                    toast.error('Não foi possível carregar os dados da conta cloud.');
                    router.replace('/organizations');
                    return;
                }

                const credentials = (account.credentials ?? {}) as Record<string, unknown>;
                const provider = account.provider.toLowerCase();

                const nextFormValues: FormValues = {
                    alias: account.alias,
                    provider: provider === 'azure' || provider === 'gcp' ? provider : 'aws',
                    roleArn: typeof credentials.roleArn === 'string' ? credentials.roleArn : '',
                    region: typeof credentials.region === 'string' ? credentials.region : '',
                    awsRegions: normalizeRegionFields(credentials.regions),
                    tenantId: typeof credentials.tenantId === 'string' ? credentials.tenantId : '',
                    clientId: typeof credentials.clientId === 'string' ? credentials.clientId : '',
                    clientSecret: typeof credentials.clientSecret === 'string' ? credentials.clientSecret : '',
                    subscriptionId: typeof credentials.subscriptionId === 'string' ? credentials.subscriptionId : '',
                };

                setCloudAccount(account);
                form.reset(nextFormValues);
            } catch {
                toast.error('Não foi possível carregar os dados da conta cloud.');
                router.replace('/organizations');
            } finally {
                setIsLoadingAccount(false);
            }
        };

        void loadCloudAccount();
    }, [cloudAccountId, form, organizationId, router]);

    const selectedProvider = form.watch('provider');

    const externalId = useMemo(() => {
        const credentials = (cloudAccount?.credentials ?? {}) as Record<string, unknown>;
        return typeof credentials.externalId === 'string' ? credentials.externalId : undefined;
    }, [cloudAccount]);

    const roleTutorialExternalId = externalId ?? 'EXTERNAL_ID_DA_PLATAFORMA';

    const onSubmit = async (data: FormValues) => {
        setIsLoading(true);

        try {
            const credentials: Record<string, unknown> = {};

            if (data.provider === 'aws') {
                if (data.roleArn) credentials.roleArn = data.roleArn.trim();
                if (data.region) credentials.region = data.region.trim();

                const parsedRegions = parseAdditionalRegions(data.awsRegions);
                if (parsedRegions.length > 0) {
                    credentials.regions = Array.from(new Set(parsedRegions));
                }

                if (externalId) {
                    credentials.externalId = externalId;
                }
            }

            if (data.provider === 'azure') {
                if (data.tenantId) credentials.tenantId = data.tenantId.trim();
                if (data.clientId) credentials.clientId = data.clientId.trim();
                if (data.clientSecret) credentials.clientSecret = data.clientSecret.trim();
                if (data.subscriptionId) credentials.subscriptionId = data.subscriptionId.trim();
            }

            const response = await updateOrganizationCloudAccount(organizationId, cloudAccountId, {
                alias: data.alias.trim(),
                credentials,
            });

            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                return;
            }

            notifySidebarContextUpdated();
            toast.success('Conta cloud atualizada com sucesso.');
            router.replace('/organizations');
            router.refresh();
        } catch {
            toast.error('Não foi possível atualizar a conta cloud.');
        } finally {
            setIsLoading(false);
        }
    };

    const onToggleActiveStatus = async (): Promise<boolean> => {
        if (!cloudAccount) {
            return false;
        }

        const nextIsActive = cloudAccount.isActive === false;
        const actionLabel = nextIsActive ? 'ativar' : 'desativar';

        setIsStatusLoading(true);

        try {
            const response = await setOrganizationCloudAccountActiveStatus(organizationId, cloudAccountId, nextIsActive);
            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                return false;
            }

            setCloudAccount((previous) => (previous ? { ...previous, isActive: nextIsActive } : previous));
            notifySidebarContextUpdated();
            toast.success(nextIsActive ? 'Conta cloud ativada com sucesso.' : 'Conta cloud desativada com sucesso.');
            router.refresh();
            return true;
        } catch {
            toast.error(`Não foi possível ${actionLabel} a conta cloud.`);
            return false;
        } finally {
            setIsStatusLoading(false);
        }
    };

    const onDeleteCloudAccount = async (): Promise<boolean> => {
        setIsDeleting(true);

        try {
            const response = await deleteOrganizationCloudAccount(organizationId, cloudAccountId);
            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload, 'pt'));
                return false;
            }

            notifySidebarContextUpdated();
            toast.success('Conta cloud excluída com sucesso.');
            router.replace('/organizations');
            router.refresh();
            return true;
        } catch {
            toast.error('Não foi possível excluir a conta cloud.');
            return false;
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoadingAccount) {
        return <div className="py-6 text-sm text-muted-foreground">Carregando conta cloud...</div>;
    }

    return (
        <div className="flex w-full flex-col gap-5 sm:gap-6">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 sm:gap-6">
                    <FormField
                        control={form.control}
                        name="alias"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nome da conta</FormLabel>
                                <FormControl>
                                    <IconInput placeholder="Ex: Produção AWS" StartIcon={Tag} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Provider conectado</p>
                        <p className="mt-1 text-sm font-medium">{providerLabel(selectedProvider)}</p>
                    </div>

                    {selectedProvider === 'aws' && (
                        <>
                            <div className="flex flex-col gap-4 rounded-xl border border-border/70 p-4 sm:p-5">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <ShieldCheck className="size-3.5" />
                                    Credenciais AWS (Role ARN)
                                </p>

                                <FormField
                                    control={form.control}
                                    name="roleArn"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Role ARN</FormLabel>
                                            <FormControl>
                                                <IconInput placeholder="arn:aws:iam::123456789012:role/MyRole" StartIcon={KeyRound} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="region"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Região principal</FormLabel>
                                            <FormControl>
                                                <IconInput placeholder="us-east-1" StartIcon={Globe} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="awsRegions"
                                    render={() => (
                                        <FormItem>
                                            <FormLabel>Regiões adicionais (opcional)</FormLabel>
                                            <div className="flex flex-col gap-2">
                                                {awsRegionFields.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground">Nenhuma região adicional adicionada.</p>
                                                ) : null}

                                                {awsRegionFields.map((awsRegionField, index) => (
                                                    <div key={awsRegionField.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                        <FormField
                                                            control={form.control}
                                                            name={`awsRegions.${index}.value`}
                                                            render={({ field }) => (
                                                                <FormControl>
                                                                    <IconInput placeholder="ex: us-west-2" StartIcon={Globe} {...field} />
                                                                </FormControl>
                                                            )}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            onClick={() => removeAwsRegion(index)}
                                                            title="Remover região"
                                                            className="w-full sm:w-9"
                                                        >
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    </div>
                                                ))}

                                                <div className="flex">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => appendAwsRegion({ value: '' })}
                                                        className="w-full gap-1 sm:w-auto"
                                                    >
                                                        <Plus className="size-4" />
                                                        Adicionar região
                                                    </Button>
                                                </div>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <Accordion type="single" collapsible>
                                <AccordionItem value="iam-role-help" className="rounded-xl border border-border/70 px-3 sm:px-4">
                                    <AccordionTrigger className="gap-2 text-left text-sm font-medium hover:no-underline">
                                        <span className="flex items-start gap-2 sm:items-center">
                                            <ShieldCheck className="size-4 text-muted-foreground shrink-0" />
                                            Tutorial: como configurar a IAM Role na AWS
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="flex flex-col gap-5 pb-4">
                                        <p className="text-sm text-muted-foreground">
                                            Use as políticas abaixo para configurar a role que a plataforma vai assumir. O <strong>External ID</strong>{' '}
                                            precisa ser exatamente o mesmo mostrado aqui.
                                        </p>

                                        <PolicyBlock label="1. Trust Policy (quem pode assumir a role)" json={buildTrustPolicy(roleTutorialExternalId)} />
                                        <PolicyBlock label="2. Permissions Policy (o que a role pode acessar)" json={PERMISSIONS_POLICY} />

                                        <p className="wrap-break-word text-xs text-muted-foreground">
                                            Substitua <code className="rounded bg-muted px-1">&lt;PLATFORM_ACCOUNT_ID&gt;</code> pelo ID da conta da
                                            plataforma informado pelo administrador.
                                        </p>

                                        {!externalId ? (
                                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                                External ID não encontrado nesta conta. Se necessário, peça suporte antes de alterar a trust policy.
                                            </p>
                                        ) : null}
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </>
                    )}

                    {selectedProvider === 'azure' && (
                        <div className="flex flex-col gap-4 rounded-xl border border-border/70 p-4 sm:p-5">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <ShieldCheck className="size-3.5" />
                                Credenciais Azure (Service Principal)
                            </p>

                            <FormField
                                control={form.control}
                                name="tenantId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tenant ID</FormLabel>
                                        <FormControl>
                                            <IconInput placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" StartIcon={KeyRound} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="clientId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Client ID (Application ID)</FormLabel>
                                        <FormControl>
                                            <IconInput placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" StartIcon={KeyRound} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="clientSecret"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Client Secret</FormLabel>
                                        <FormControl>
                                            <IconInput placeholder="Client secret do App Registration" StartIcon={KeyRound} type="password" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="subscriptionId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Subscription ID</FormLabel>
                                        <FormControl>
                                            <IconInput placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" StartIcon={Globe} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}

                    <CloudAccountEditActions
                        isActive={cloudAccount?.isActive !== false}
                        isSaving={isLoading}
                        isStatusLoading={isStatusLoading}
                        isDeleting={isDeleting}
                        onConfirmToggleStatus={onToggleActiveStatus}
                        onConfirmDelete={onDeleteCloudAccount}
                    />
                </form>
            </Form>
        </div>
    );
}
