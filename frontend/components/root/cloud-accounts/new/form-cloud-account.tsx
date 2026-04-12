'use client';

import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { KeyRound, Globe, Tag, ShieldCheck, Copy, Check as CheckIcon, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { cloudAccountFormScheme } from './scheme';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { notifySidebarContextUpdated } from '@/lib/sidebar-context';
import { buildTrustPolicy, PERMISSIONS_POLICY } from '@/lib/role-permissions';

type Props = {
    organizationId: string;
};

const PROVIDERS = [
    { value: 'aws', label: 'Amazon Web Services', shortLabel: 'AWS' },
    { value: 'azure', label: 'Microsoft Azure', shortLabel: 'Azure' },
    { value: 'gcp', label: 'Google Cloud Platform', shortLabel: 'GCP' },
] as const;

type FormValues = z.infer<typeof cloudAccountFormScheme>;

type CreateCloudAccountResponse = {
    id?: string;
};

function parseAdditionalRegions(values?: Array<{ value?: string }>): string[] {
    if (!values) return [];

    return values.map((item) => (item.value ?? '').trim().toLowerCase()).filter((region) => region.length > 0);
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
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
                <CopyButton text={text} />
            </div>
            <pre className="rounded-md border border-border bg-muted/50 p-3 text-xs leading-relaxed overflow-x-auto whitespace-pre text-foreground/80">
                {text}
            </pre>
        </div>
    );
}

const GCP_CEL_EXPRESSION = `resource.service == 'compute.googleapis.com' ||
resource.service == 'storage.googleapis.com' ||
resource.service == 'sqladmin.googleapis.com' ||
resource.service == 'container.googleapis.com' ||
resource.service == 'cloudkms.googleapis.com' ||
resource.service == 'dns.googleapis.com' ||
resource.service == 'iam.googleapis.com' ||
resource.service == 'compute.backendServices.list' ||
resource.service == 'run.googleapis.com'`;

const GCP_ROLE_CLI = `gcloud iam roles create SaaSMultiCloudRole \\
  --project=SEU_PROJECT_ID \\
  --title="SaaS MultiCloud" \\
  --description="Role somente leitura para assessments" \\
  --stage=GA \\
  --permissions=compute.instances.list,compute.disks.list,compute.networks.list,compute.subnetworks.list,compute.firewalls.list,compute.addresses.list,storage.buckets.list,storage.buckets.get,storage.objects.list,cloudsql.instances.list,container.clusters.list,iam.serviceAccounts.list,cloudkms.keyRings.list,cloudkms.cryptoKeys.list,dns.managedZones.list,run.services.list`;

const GCP_PERMISSIONS_LIST = [
    'compute.instances.list',
    'compute.disks.list',
    'compute.networks.list',
    'compute.subnetworks.list',
    'compute.firewalls.list',
    'compute.addresses.list',
    'storage.buckets.list',
    'storage.buckets.get',
    'storage.objects.list',
    'cloudsql.instances.list',
    'container.clusters.list',
    'iam.serviceAccounts.list',
    'cloudkms.keyRings.list',
    'cloudkms.cryptoKeys.list',
    'dns.managedZones.list',
    'run.services.list',
    'compute.backendServices.list',
].join('\n');

export function FormCloudAccount({ organizationId }: Props) {
    const [isLoading, setIsLoading] = useState(false);
    // gerado uma vez por sessão de criação — mostrado na trust policy para o usuário configurar antes de submeter
    const [externalId] = useState(() => crypto.randomUUID());
    const router = useRouter();

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

    const selectedProvider = form.watch('provider');

    const onSubmit = async (data: FormValues) => {
        setIsLoading(true);
        try {
            const credentials: Record<string, string | string[]> = {};

            if (data.provider === 'aws') {
                if (data.roleArn) credentials.roleArn = data.roleArn.trim();
                if (data.region) credentials.region = data.region.trim();

                const parsedRegions = parseAdditionalRegions(data.awsRegions);
                if (parsedRegions.length > 0) {
                    credentials.regions = Array.from(new Set(parsedRegions));
                }

                credentials.externalId = externalId;
            } else if (data.provider === 'azure') {
                if (data.tenantId) credentials.tenantId = data.tenantId.trim();
                if (data.clientId) credentials.clientId = data.clientId.trim();
                if (data.clientSecret) credentials.clientSecret = data.clientSecret.trim();
                if (data.subscriptionId) credentials.subscriptionId = data.subscriptionId.trim();
            } else if (data.provider === 'gcp') {
                if (data.gcpProjectId) credentials.projectId = data.gcpProjectId.trim();
                if (data.gcpServiceAccountEmail) credentials.serviceAccountEmail = data.gcpServiceAccountEmail.trim();
            }

            const body = {
                provider: data.provider,
                alias: data.alias.trim(),
                credentials,
            };

            const response = await fetch(`/api/cloud/accounts?organizationId=${encodeURIComponent(organizationId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const payload = (await response.json().catch(() => null)) as CreateCloudAccountResponse | { message?: string } | null;

            if (!response.ok) {
                const message =
                    typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
                        ? payload.message
                        : 'Não foi possível conectar a conta cloud.';
                toast.error(message);
                return;
            }

            if (payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string') {
                const storageKey = `smc_active_cloud_account_id:${organizationId}`;
                window.localStorage.setItem(storageKey, payload.id);
                window.localStorage.setItem('smc_active_cloud_account_id', payload.id);
            }

            notifySidebarContextUpdated();

            toast.success('Conta cloud conectada com sucesso.');
            router.replace('/');
            router.refresh();
        } catch {
            toast.error('Não foi possível conectar a conta cloud.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full flex flex-col gap-6">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
                    {/* Alias */}
                    <FormField
                        control={form.control}
                        name="alias"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nome da conta</FormLabel>
                                <FormControl>
                                    <IconInput placeholder="Ex: Produção AWS, Dev GCP…" StartIcon={Tag} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* Provider */}
                    <FormField
                        control={form.control}
                        name="provider"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Provider</FormLabel>
                                <FormControl>
                                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {PROVIDERS.map((provider) => (
                                            <Label
                                                key={provider.value}
                                                htmlFor={`provider-${provider.value}`}
                                                className="flex items-center gap-3 rounded-lg border border-input p-3 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5"
                                            >
                                                <RadioGroupItem id={`provider-${provider.value}`} value={provider.value} />
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-sm">{provider.shortLabel}</span>
                                                    <span className="text-xs text-muted-foreground hidden sm:block">{provider.label}</span>
                                                </div>
                                            </Label>
                                        ))}
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    {/* AWS credentials */}
                    {selectedProvider === 'aws' && (
                        <>
                            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
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
                                                    <div key={awsRegionField.id} className="flex items-center gap-2">
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
                                                        >
                                                            <Trash2 className="size-4" />
                                                        </Button>
                                                    </div>
                                                ))}

                                                <div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => appendAwsRegion({ value: '' })}
                                                        className="gap-1"
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

                            {/* IAM Role helper */}
                            <Accordion type="single" collapsible>
                                <AccordionItem value="iam-policy" className="rounded-lg border border-border px-4">
                                    <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
                                        <span className="flex items-center gap-2">
                                            <ShieldCheck className="size-4 text-muted-foreground shrink-0" />
                                            Como obter as credenciais na AWS
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="flex flex-col gap-5 pb-4">
                                        <p className="text-sm text-muted-foreground">
                                            Siga os passos abaixo no <strong>AWS Console</strong> para criar a IAM Role e obter o Role ARN.
                                        </p>

                                        <ol className="flex flex-col gap-3 text-sm text-muted-foreground list-decimal list-inside">
                                            <li>
                                                Acesse o <strong>AWS Console</strong> → <strong>IAM</strong> → <strong>Roles</strong> → clique em{' '}
                                                <strong>Create role</strong>.
                                            </li>
                                            <li>
                                                Em <strong>Trusted entity type</strong>, selecione <strong>AWS account</strong> → marque{' '}
                                                <strong>Another AWS account</strong> e informe o Account ID da plataforma (solicite ao administrador).
                                            </li>
                                            <li>
                                                Marque <strong>Require external ID</strong> e cole o External ID gerado automaticamente pelo formulário
                                                acima.
                                            </li>
                                            <li>
                                                Em <strong>Add permissions</strong>, clique em <strong>Create inline policy</strong> e cole o JSON da
                                                Permissions Policy abaixo.
                                            </li>
                                            <li>
                                                Dê um nome à role (ex: <code className="bg-muted px-1 rounded">SaaSMultiCloudRole</code>) e clique em{' '}
                                                <strong>Create role</strong>.
                                            </li>
                                            <li>
                                                Abra a role criada e copie o <strong>ARN</strong> exibido no topo (formato:{' '}
                                                <code className="bg-muted px-1 rounded">arn:aws:iam::123456789012:role/NomeDaRole</code>). Cole no campo{' '}
                                                <strong>Role ARN</strong> acima.
                                            </li>
                                        </ol>

                                        <PolicyBlock label="Trust Policy — cole ao criar a role" json={buildTrustPolicy(externalId)} />
                                        <PolicyBlock label="Permissions Policy — cole como inline policy" json={PERMISSIONS_POLICY} />

                                        <p className="text-xs text-muted-foreground">
                                            Substitua <code className="bg-muted px-1 rounded">&lt;PLATFORM_ACCOUNT_ID&gt;</code> pelo Account ID da
                                            plataforma fornecido pelo seu administrador.
                                        </p>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </>
                    )}

                    {/* Azure credentials */}
                    {selectedProvider === 'azure' && (
                        <>
                            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
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
                                                <IconInput
                                                    placeholder="Client secret do App Registration"
                                                    StartIcon={KeyRound}
                                                    type="password"
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

                            {/* Azure tutorial */}
                            <Accordion type="single" collapsible>
                                <AccordionItem value="azure-setup" className="rounded-lg border border-border px-4">
                                    <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
                                        <span className="flex items-center gap-2">
                                            <ShieldCheck className="size-4 text-muted-foreground shrink-0" />
                                            Como obter as credenciais no Azure
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="flex flex-col gap-5 pb-4">
                                        <p className="text-sm text-muted-foreground">
                                            Você precisará criar um <strong>App Registration</strong> no Microsoft Entra ID e conceder acesso à
                                            subscription desejada.
                                        </p>

                                        <div className="flex flex-col gap-4">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                                    Passo 1 — Criar o App Registration
                                                </p>
                                                <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside">
                                                    <li>
                                                        Acesse o <strong>Azure Portal</strong> → <strong>Microsoft Entra ID</strong> (antigo Azure AD) →{' '}
                                                        <strong>App registrations</strong> → <strong>New registration</strong>.
                                                    </li>
                                                    <li>
                                                        Dê um nome ao app (ex: <code className="bg-muted px-1 rounded">saas-multicloud</code>), mantenha os
                                                        demais campos padrão e clique em <strong>Register</strong>.
                                                    </li>
                                                    <li>
                                                        Na tela de visão geral do app, copie:
                                                        <ul className="mt-1 ml-4 flex flex-col gap-1 list-disc list-inside">
                                                            <li>
                                                                <strong>Application (client) ID</strong> → cole no campo <strong>Client ID</strong> acima.
                                                            </li>
                                                            <li>
                                                                <strong>Directory (tenant) ID</strong> → cole no campo <strong>Tenant ID</strong> acima.
                                                            </li>
                                                        </ul>
                                                    </li>
                                                </ol>
                                            </div>

                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                                    Passo 2 — Criar o Client Secret
                                                </p>
                                                <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside">
                                                    <li>
                                                        Ainda no app criado, vá em <strong>Certificates &amp; secrets</strong> →{' '}
                                                        <strong>Client secrets</strong> → <strong>New client secret</strong>.
                                                    </li>
                                                    <li>
                                                        Escolha uma descrição e validade, clique em <strong>Add</strong>.
                                                    </li>
                                                    <li>
                                                        Copie imediatamente o <strong>Value</strong> do secret criado (ele não será exibido novamente) →
                                                        cole no campo <strong>Client Secret</strong> acima.
                                                    </li>
                                                </ol>
                                            </div>

                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                                    Passo 3 — Obter o Subscription ID e conceder acesso
                                                </p>
                                                <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside">
                                                    <li>
                                                        Acesse <strong>Subscriptions</strong> no Azure Portal, selecione a subscription desejada e copie o{' '}
                                                        <strong>Subscription ID</strong> → cole no campo acima.
                                                    </li>
                                                    <li>
                                                        Na subscription, clique em <strong>Access control (IAM)</strong> → <strong>Add</strong> →{' '}
                                                        <strong>Add role assignment</strong>.
                                                    </li>
                                                    <li>
                                                        Selecione o papel <strong>Reader</strong>, avance para a aba <strong>Members</strong> →{' '}
                                                        <strong>Select members</strong> → busque pelo nome do app criado no Passo 1 e adicione.
                                                    </li>
                                                </ol>
                                            </div>
                                        </div>

                                        <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3">
                                            <p className="text-xs text-blue-700 dark:text-blue-400">
                                                Para monitorar múltiplas subscriptions, repita o Passo 3 em cada uma delas usando o mesmo App Registration.
                                            </p>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </>
                    )}

                    {/* GCP credentials */}
                    {selectedProvider === 'gcp' && (
                        <>
                            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                    <ShieldCheck className="size-3.5" />
                                    Credenciais GCP (Service Account Impersonation)
                                </p>

                                <FormField
                                    control={form.control}
                                    name="gcpProjectId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Project ID</FormLabel>
                                            <FormControl>
                                                <IconInput placeholder="meu-projeto-gcp-123" StartIcon={Globe} {...field} />
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
                                                <IconInput placeholder="sa@meu-projeto-gcp-123.iam.gserviceaccount.com" StartIcon={KeyRound} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* GCP setup helper */}
                            <Accordion type="single" collapsible>
                                <AccordionItem value="gcp-setup" className="rounded-lg border border-border px-4">
                                    <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
                                        <span className="flex items-center gap-2">
                                            <ShieldCheck className="size-4 text-muted-foreground shrink-0" />
                                            Como configurar a Service Account no GCP
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="flex flex-col gap-5 pb-4">
                                        <p className="text-sm text-muted-foreground">
                                            A plataforma acessa seu projeto GCP via <strong>impersonation de Service Account</strong> — sem chaves de longa
                                            duração armazenadas.
                                        </p>

                                        <div className="flex flex-col gap-4">
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                                    Passo 1 — Obter o Project ID
                                                </p>
                                                <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside">
                                                    <li>
                                                        Acesse o <strong>Google Cloud Console</strong> e clique no seletor de projeto no topo da página.
                                                    </li>
                                                    <li>
                                                        Na lista de projetos, copie o valor da coluna <strong>ID</strong> (diferente do nome — formato:{' '}
                                                        <code className="bg-muted px-1 rounded">meu-projeto-123456</code>). Cole no campo{' '}
                                                        <strong>Project ID</strong> acima.
                                                    </li>
                                                </ol>
                                            </div>

                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                                    Passo 2 — Criar a Service Account
                                                </p>
                                                <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside">
                                                    <li>
                                                        No Google Cloud Console, acesse <strong>IAM &amp; Admin</strong> →{' '}
                                                        <strong>Service Accounts</strong> → <strong>Create Service Account</strong>.
                                                    </li>
                                                    <li>
                                                        Dê um nome (ex: <code className="bg-muted px-1 rounded">saas-multicloud</code>), clique em{' '}
                                                        <strong>Create and continue</strong> e depois em <strong>Done</strong> (sem atribuir roles agora —
                                                        faremos isso no passo seguinte).
                                                    </li>
                                                    <li>
                                                        Copie o <strong>e-mail</strong> da SA criada (formato:{' '}
                                                        <code className="bg-muted px-1 rounded">nome@projeto.iam.gserviceaccount.com</code>) e cole no
                                                        campo <strong>Service Account Email</strong> acima.
                                                    </li>
                                                </ol>
                                            </div>

                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                                    Passo 3 — Criar a IAM Role e conceder acesso com condição CEL
                                                </p>
                                                <p className="text-sm text-muted-foreground mb-3">
                                                    Crie a <strong>custom role</strong> com as permissões de leitura e, em seguida, vincule-a à Service
                                                    Account usando uma <strong>condição IAM (CEL)</strong> que restringe o acesso apenas aos serviços
                                                    necessários.
                                                </p>

                                                <div className="flex flex-col gap-4">
                                                    <div>
                                                        <p className="text-xs font-medium text-muted-foreground mb-2">
                                                            3a. Criar a role — <strong>IAM &amp; Admin</strong> → <strong>Roles</strong> →{' '}
                                                            <strong>Create Role</strong>
                                                        </p>
                                                        <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside mb-3">
                                                            <li>
                                                                Preencha os campos: <strong>Title</strong> ={' '}
                                                                <code className="bg-muted px-1 rounded">SaaS MultiCloud</code>, <strong>Role ID</strong> ={' '}
                                                                <code className="bg-muted px-1 rounded">SaaSMultiCloudRole</code>,{' '}
                                                                <strong>Role launch stage</strong> ={' '}
                                                                <code className="bg-muted px-1 rounded">General Availability</code>.
                                                            </li>
                                                            <li>
                                                                Clique em <strong>+ ADD PERMISSIONS</strong>, use o campo de busca para encontrar e marcar
                                                                cada permissão da lista abaixo.
                                                            </li>
                                                            <li>
                                                                Após adicionar todas as permissões, clique em <strong>CREATE</strong>.
                                                            </li>
                                                        </ol>
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs text-muted-foreground">
                                                                    Permissões a adicionar (uma por vez no campo de busca)
                                                                </span>
                                                                <CopyButton text={GCP_PERMISSIONS_LIST} />
                                                            </div>
                                                            <pre className="rounded-md border border-border bg-muted/50 p-3 text-xs leading-relaxed overflow-x-auto whitespace-pre text-foreground/80">
                                                                {GCP_PERMISSIONS_LIST}
                                                            </pre>
                                                        </div>
                                                        <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3 mt-2">
                                                            <p className="text-xs text-green-700 dark:text-green-400 font-medium mb-1">
                                                                Alternativa mais rápida: gcloud CLI
                                                            </p>
                                                            <p className="text-xs text-green-700 dark:text-green-400 mb-2">
                                                                Se tiver o <strong>gcloud CLI</strong> instalado, crie a role com um único comando:
                                                            </p>
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="text-xs text-green-700 dark:text-green-400">
                                                                    Substitua{' '}
                                                                    <code className="bg-green-100 dark:bg-green-900 px-1 rounded">SEU_PROJECT_ID</code>{' '}
                                                                    pelo seu Project ID
                                                                </span>
                                                                <CopyButton text={GCP_ROLE_CLI} />
                                                            </div>
                                                            <pre className="rounded-md border border-green-200 dark:border-green-800 bg-green-100/50 dark:bg-green-900/20 p-3 text-xs leading-relaxed overflow-x-auto whitespace-pre text-foreground/80">
                                                                {GCP_ROLE_CLI}
                                                            </pre>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs font-medium text-muted-foreground mb-2">
                                                            3b. Vincular a role com condição — <strong>IAM</strong> → <strong>Grant Access</strong>
                                                        </p>
                                                        <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside mb-3">
                                                            <li>
                                                                Adicione o e-mail da SA do Passo 2 em <strong>New principals</strong>.
                                                            </li>
                                                            <li>
                                                                Em <strong>Role</strong>, selecione{' '}
                                                                <code className="bg-muted px-1 rounded">SaaS MultiCloud</code> (seção <em>Custom</em>).
                                                            </li>
                                                            <li>
                                                                Clique em <strong>+ Add IAM condition</strong> e preencha:
                                                                <ul className="mt-1 ml-4 flex flex-col gap-1 list-disc list-inside">
                                                                    <li>
                                                                        <strong>Title:</strong>{' '}
                                                                        <code className="bg-muted px-1 rounded">SaaS MultiCloud Assessment</code>
                                                                    </li>
                                                                    <li>
                                                                        <strong>Description:</strong>{' '}
                                                                        <code className="bg-muted px-1 rounded">
                                                                            Acesso somente leitura para assessments
                                                                        </code>
                                                                    </li>
                                                                    <li>
                                                                        <strong>Expression:</strong> cole a expressão CEL abaixo no editor.
                                                                    </li>
                                                                </ul>
                                                            </li>
                                                            <li>
                                                                Clique em <strong>Save</strong>.
                                                            </li>
                                                        </ol>
                                                        <div className="flex flex-col gap-1.5">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs text-muted-foreground">
                                                                    Condição CEL — cole no campo <strong>Expression</strong>
                                                                </span>
                                                                <CopyButton text={GCP_CEL_EXPRESSION} />
                                                            </div>
                                                            <pre className="rounded-md border border-border bg-muted/50 p-3 text-xs leading-relaxed overflow-x-auto whitespace-pre text-foreground/80">
                                                                {GCP_CEL_EXPRESSION}
                                                            </pre>
                                                        </div>
                                                        <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 mt-2">
                                                            <p className="text-xs text-blue-700 dark:text-blue-400">
                                                                A condição CEL restringe a vinculação apenas aos serviços utilizados nos assessments,
                                                                seguindo o formato de <strong>IAM Conditions</strong> do Google Cloud (
                                                                <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">condition.expression</code>).
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                                    Passo 4 — Autorizar impersonation da SA da plataforma
                                                </p>
                                                <p className="text-sm text-muted-foreground mb-2">
                                                    A plataforma precisa permissão para <em>impersonar</em> a SA criada. Isso é feito concedendo o papel{' '}
                                                    <code className="bg-muted px-1 rounded">Service Account Token Creator</code> à SA da plataforma
                                                    diretamente nas permissões do projeto.
                                                </p>
                                                <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside">
                                                    <li>
                                                        Acesse <strong>IAM &amp; Admin → IAM</strong> no console do GCP.
                                                    </li>
                                                    <li>
                                                        Clique no botão <strong>Grant Access</strong> (topo da página).
                                                    </li>
                                                    <li>
                                                        No campo <strong>New principals</strong>, informe o e-mail da Service Account{' '}
                                                        <em>da plataforma</em> fornecido pelo administrador.
                                                    </li>
                                                    <li>
                                                        No campo <strong>Role</strong>, busque e selecione{' '}
                                                        <code className="bg-muted px-1 rounded">Service Account Token Creator</code> (
                                                        <code className="bg-muted px-1 rounded">roles/iam.serviceAccountTokenCreator</code>).
                                                    </li>
                                                    <li>
                                                        Clique em <strong>Save</strong>.
                                                    </li>
                                                </ol>
                                            </div>
                                        </div>

                                        <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3">
                                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                                <strong>Importante:</strong> a concessão do Passo 4 deve ser feita em{' '}
                                                <strong>IAM &amp; Admin → IAM → Grant Access</strong>, e não via &quot;Manage permissions&quot; da Service
                                                Account. Solicite ao administrador da plataforma o e-mail correto da SA da plataforma.
                                            </p>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        </>
                    )}

                    <div className="flex justify-end">
                        <Button type="submit" isLoading={isLoading}>
                            Conectar Conta Cloud
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
