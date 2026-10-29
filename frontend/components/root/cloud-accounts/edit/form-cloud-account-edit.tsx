'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Globe, KeyRound, ShieldCheck, Tag, Trash2, Plus, Copy, Check as CheckIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { createCloudAccountSchema, type CloudAccountFormValues } from '@/components/root/cloud-accounts/new/scheme';
import { useTranslations } from '@/lib/i18n';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox';
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
import { CloudAccountSyncStatus } from '@/components/root/cloud-accounts/cloud-account-sync-status';
import { useLocale } from '@/components/providers/locale-provider';

type Props = {
    organizationId: string;
    cloudAccountId: string;
};

type FormValues = CloudAccountFormValues;

type ApiErrorPayload = {
    message?: string | string[];
    statusCode?: number;
    error?: string;
    path?: string;
    timestamp?: string;
};

type MidOrg = {
    id: string;
    name: string;
};

function parseAdditionalRegions(values?: Array<{ value?: string }>): string[] {
    if (!values) return [];

    return values.map((item) => (item.value ?? '').trim().toLowerCase()).filter((region) => region.length > 0);
}

type CloudAccountDetailsApiItem = OrganizationCloudAccountDetails & {
    is_sync_in_progress?: boolean;
    last_general_sync_at?: string | null;
    last_general_sync_error?: string | null;
    last_general_sync_warning?: string | null;
};

function normalizeDateValue(value: unknown): string | null {
    if (typeof value === 'string') {
        return value;
    }

    if (value === null) {
        return null;
    }

    return null;
}

function normalizeCloudAccountDetails(payload: unknown): OrganizationCloudAccountDetails | null {
    if (typeof payload !== 'object' || payload === null) {
        return null;
    }

    const account = payload as CloudAccountDetailsApiItem;

    if (typeof account.id !== 'string' || typeof account.alias !== 'string' || typeof account.provider !== 'string') {
        return null;
    }

    return {
        ...account,
        isSyncInProgress: account.isSyncInProgress === true || account.is_sync_in_progress === true,
        lastGeneralSyncAt: normalizeDateValue(account.lastGeneralSyncAt ?? account.last_general_sync_at ?? null),
        lastGeneralSyncError:
            typeof account.lastGeneralSyncError === 'string'
                ? account.lastGeneralSyncError
                : typeof account.last_general_sync_error === 'string'
                  ? account.last_general_sync_error
                  : null,
        lastGeneralSyncWarning:
            typeof account.lastGeneralSyncWarning === 'string'
                ? account.lastGeneralSyncWarning
                : typeof account.last_general_sync_warning === 'string'
                  ? account.last_general_sync_warning
                  : null,
    };
}

function normalizeRegionFields(regions: unknown, primaryRegion?: string): Array<{ value: string }> {
    if (!Array.isArray(regions)) {
        return [];
    }

    const normalizedPrimaryRegion = (primaryRegion ?? '').trim().toLowerCase();

    return regions
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0)
        .filter((value) => value !== normalizedPrimaryRegion)
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
    const tc = useTranslations('common');

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
            {copied ? tc.copied : tc.copy}
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
    const tca = useTranslations('cloudAccounts');
    const { locale } = useLocale();
    const schema = useMemo(() => createCloudAccountSchema(tca), [tca]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStatusLoading, setIsStatusLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isLoadingAccount, setIsLoadingAccount] = useState(true);
    const [cloudAccount, setCloudAccount] = useState<OrganizationCloudAccountDetails | null>(null);
    const [orgs, setOrgs] = useState<MidOrg[]>([]);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            alias: '',
            provider: 'aws',
            orgId: '',
            roleArn: '',
            region: '',
            awsRegions: [],
            tenantId: '',
            clientId: '',
            clientSecret: '',
            subscriptionId: '',
            gcpProjectId: '',
            gcpServiceAccountEmail: '',
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
        void fetch(`/api/orgs?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
            .then((response) => response.json())
            .then((payload: unknown) => {
                const items = Array.isArray(payload)
                    ? payload
                    : Array.isArray((payload as { items?: unknown }).items)
                      ? ((payload as { items?: MidOrg[] }).items ?? [])
                      : [];

                const normalized = items.filter(
                    (item): item is MidOrg => typeof item === 'object' && item !== null && typeof (item as MidOrg).id === 'string' && typeof (item as MidOrg).name === 'string'
                );

                setOrgs(normalized);
            })
            .catch(() => setOrgs([]));
    }, [organizationId]);

    useEffect(() => {
        const loadCloudAccount = async () => {
            setIsLoadingAccount(true);

            try {
                const response = await fetchOrganizationCloudAccountById(organizationId, cloudAccountId);
                const payload = (await response.json().catch(() => null)) as unknown;

                if (!response.ok) {
                    toast.error(extractErrorMessage((payload as ApiErrorPayload | null) ?? null));
                    router.replace('/organizations');
                    return;
                }

                const account = normalizeCloudAccountDetails(payload);

                if (!account) {
                    toast.error(tca.loadError);
                    router.replace('/organizations');
                    return;
                }

                const credentials = (account.credentials ?? {}) as Record<string, unknown>;
                const provider = account.provider.toLowerCase();
                const primaryRegion = typeof credentials.region === 'string' ? credentials.region : '';

                const nextFormValues: FormValues = {
                    alias: account.alias,
                    provider: provider === 'azure' || provider === 'gcp' ? provider : 'aws',
                    orgId: '',
                    roleArn: typeof credentials.roleArn === 'string' ? credentials.roleArn : '',
                    region: primaryRegion,
                    awsRegions: normalizeRegionFields(credentials.regions, primaryRegion),
                    tenantId: typeof credentials.tenantId === 'string' ? credentials.tenantId : '',
                    clientId: typeof credentials.clientId === 'string' ? credentials.clientId : '',
                    // Secrets are never returned by the API — leave blank; omit on save to keep existing.
                    clientSecret: '',
                    subscriptionId: typeof credentials.subscriptionId === 'string' ? credentials.subscriptionId : '',
                    gcpProjectId: typeof credentials.projectId === 'string' ? credentials.projectId : '',
                    gcpServiceAccountEmail: typeof credentials.serviceAccountEmail === 'string' ? credentials.serviceAccountEmail : '',
                };

                setCloudAccount(account);
                form.reset(nextFormValues);

                if (typeof account.organizationId === 'string') {
                    const selectedOrg = orgs.find((org) => org.id === account.organizationId);
                    form.setValue('orgId', selectedOrg?.name ?? '', { shouldValidate: true });
                }
            } catch {
                toast.error(tca.loadError);
                router.replace('/organizations');
            } finally {
                setIsLoadingAccount(false);
            }
        };

        void loadCloudAccount();
    }, [cloudAccountId, form, orgs, organizationId, router, tca.loadError]);

    useEffect(() => {
        if (!cloudAccount?.isSyncInProgress) {
            return;
        }

        const refreshAccount = async () => {
            try {
                const response = await fetchOrganizationCloudAccountById(organizationId, cloudAccountId);
                const payload = (await response.json().catch(() => null)) as unknown;

                if (!response.ok) {
                    return;
                }

                const account = normalizeCloudAccountDetails(payload);

                if (account) {
                    setCloudAccount(account);
                }
            } catch {
                // ignore transient polling errors
            }
        };

        const intervalId = window.setInterval(() => {
            void refreshAccount();
        }, 10000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [cloudAccount?.isSyncInProgress, cloudAccountId, organizationId]);

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
                const previousPrimaryRegion =
                    typeof (cloudAccount?.credentials as Record<string, unknown> | undefined)?.region === 'string'
                        ? ((cloudAccount?.credentials as Record<string, unknown>).region as string).trim().toLowerCase()
                        : '';
                const nextPrimaryRegion = data.region?.trim().toLowerCase() ?? '';

                if (data.roleArn) credentials.roleArn = data.roleArn.trim();
                if (nextPrimaryRegion) credentials.region = nextPrimaryRegion;

                const parsedRegions = parseAdditionalRegions(data.awsRegions);
                const nextAdditionalRegions = [...parsedRegions];

                // Ao trocar a região principal, mantém a principal antiga como adicional para não perder cobertura.
                if (
                    previousPrimaryRegion &&
                    nextPrimaryRegion &&
                    previousPrimaryRegion !== nextPrimaryRegion &&
                    !nextAdditionalRegions.includes(previousPrimaryRegion)
                ) {
                    nextAdditionalRegions.push(previousPrimaryRegion);
                }

                if (nextAdditionalRegions.length > 0) {
                    credentials.regions = Array.from(new Set(nextAdditionalRegions));
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

            if (data.provider === 'gcp') {
                if (data.gcpProjectId) credentials.projectId = data.gcpProjectId.trim();
                if (data.gcpServiceAccountEmail) credentials.serviceAccountEmail = data.gcpServiceAccountEmail.trim();
            }

            const selectedOrg = orgs.find((org) => org.name === data.orgId);

            const response = await updateOrganizationCloudAccount(organizationId, cloudAccountId, {
                alias: data.alias.trim(),
                credentials,
                organizationId: selectedOrg?.id,
            });

            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return;
            }

            notifySidebarContextUpdated();
            toast.success(tca.updateSuccess);
            router.replace('/organizations');
            router.refresh();
        } catch {
            toast.error(tca.updateError);
        } finally {
            setIsLoading(false);
        }
    };

    const onToggleActiveStatus = async (): Promise<boolean> => {
        if (!cloudAccount) {
            return false;
        }

        const nextIsActive = cloudAccount.isActive === false;

        setIsStatusLoading(true);

        try {
            const response = await setOrganizationCloudAccountActiveStatus(organizationId, cloudAccountId, nextIsActive);
            const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(payload));
                return false;
            }

            setCloudAccount((previous) => (previous ? { ...previous, isActive: nextIsActive } : previous));
            notifySidebarContextUpdated();
            toast.success(nextIsActive ? tca.activateSuccess : tca.deactivateSuccess);
            router.refresh();
            return true;
        } catch {
            toast.error(nextIsActive ? tca.activateError : tca.deactivateError);
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
                toast.error(extractErrorMessage(payload));
                return false;
            }

            notifySidebarContextUpdated();
            toast.success(tca.deleteSuccess);
            router.replace('/organizations');
            router.refresh();
            return true;
        } catch {
            toast.error(tca.deleteError);
            return false;
        } finally {
            setIsDeleting(false);
        }
    };

    if (isLoadingAccount) {
        return <div className="py-6 text-sm text-muted-foreground">{tca.loadingAccount}</div>;
    }

    return (
        <div className="flex w-full flex-col gap-5 sm:gap-6">
            {cloudAccount ? (
                <CloudAccountSyncStatus
                    account={cloudAccount}
                    locale={locale}
                    variant="banner"
                    labels={{
                        notSynced: tca.notSynced,
                        invalidDate: tca.invalidDate,
                        processing: tca.processing,
                        syncFailedLabel: tca.syncFailedLabel,
                        syncWarningLabel: tca.syncWarningLabel,
                        lastSyncLabel: tca.lastSyncLabel,
                    }}
                />
            ) : null}

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5 sm:gap-6">
                    <FormField
                        control={form.control}
                        name="alias"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tca.accountName}</FormLabel>
                                <FormControl>
                                    <IconInput placeholder={tca.accountNamePlaceholder} StartIcon={Tag} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="orgId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tca.organizationRequired}</FormLabel>
                                <Combobox items={orgs} value={field.value ?? ''} onValueChange={(value) => field.onChange(value ?? '')}>
                                    <ComboboxInput placeholder={tca.organizationPlaceholder} className="h-9 w-full rounded-md shadow-sm" />
                                    <ComboboxContent>
                                        <ComboboxEmpty>{tca.noOrganization}</ComboboxEmpty>
                                        <ComboboxList>
                                            {(org: MidOrg) => <ComboboxItem key={org.id} value={org.name}>{org.name}</ComboboxItem>}
                                        </ComboboxList>
                                    </ComboboxContent>
                                </Combobox>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{tca.connectedProvider}</p>
                        <p className="mt-1 text-sm font-medium">{providerLabel(selectedProvider)}</p>
                    </div>

                    {selectedProvider === 'aws' && (
                        <>
                            <div className="flex flex-col gap-4 rounded-xl border border-border/70 p-4 sm:p-5">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <ShieldCheck className="size-3.5" />
                                    {tca.awsCredentials}
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
                                            <FormLabel>{tca.primaryRegion}</FormLabel>
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
                                            <FormLabel>{tca.additionalRegions}</FormLabel>
                                            <div className="flex flex-col gap-2">
                                                {awsRegionFields.length === 0 ? (
                                                    <p className="text-xs text-muted-foreground">{tca.noAdditionalRegions}</p>
                                                ) : null}

                                                {awsRegionFields.map((awsRegionField, index) => (
                                                    <div key={awsRegionField.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                        <FormField
                                                            control={form.control}
                                                            name={`awsRegions.${index}.value`}
                                                            render={({ field }) => (
                                                                <FormControl>
                                                                    <IconInput placeholder={tca.regionPlaceholder} StartIcon={Globe} {...field} />
                                                                </FormControl>
                                                            )}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            onClick={() => removeAwsRegion(index)}
                                                            title={tca.removeRegion}
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
                                                        {tca.addRegion}
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
                                            {tca.awsTutorialTitle}
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="flex flex-col gap-5 pb-4">
                                        <p className="text-sm text-muted-foreground">{tca.awsTutorialDesc}</p>

                                        <PolicyBlock label={tca.trustPolicy} json={buildTrustPolicy(roleTutorialExternalId)} />
                                        <PolicyBlock label={tca.permissionsPolicy} json={PERMISSIONS_POLICY} />

                                        <p className="wrap-break-word text-xs text-muted-foreground">{tca.replacePlatformAccountId}</p>

                                        {!externalId ? (
                                            <p className="text-xs text-amber-600 dark:text-amber-400">{tca.externalIdNotFound}</p>
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
                                {tca.azureCredentials}
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
                                            <IconInput
                                                placeholder={
                                                    (cloudAccount?.credentials as { hasClientSecret?: boolean } | undefined)
                                                        ?.hasClientSecret
                                                        ? '•••••••• (deixe em branco para manter)'
                                                        : tca.clientSecretPlaceholder
                                                }
                                                StartIcon={KeyRound}
                                                type="password"
                                                autoComplete="new-password"
                                                {...field}
                                            />
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

                    {selectedProvider === 'gcp' && (
                        <div className="flex flex-col gap-4 rounded-xl border border-border/70 p-4 sm:p-5">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <ShieldCheck className="size-3.5" />
                                {tca.gcpCredentials}
                            </p>

                            <FormField
                                control={form.control}
                                name="gcpProjectId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Project ID</FormLabel>
                                        <FormControl>
                                            <IconInput placeholder={tca.gcpProjectIdPlaceholder} StartIcon={Globe} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="gcpServiceAccountEmail"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Service Account Email</FormLabel>
                                        <FormControl>
                                            <IconInput
                                                placeholder="sa@meu-projeto-gcp-123.iam.gserviceaccount.com"
                                                StartIcon={KeyRound}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    )}

                    <CloudAccountEditActions
                        resourceName={cloudAccount?.alias ?? ''}
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
