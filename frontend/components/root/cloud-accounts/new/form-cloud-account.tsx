'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { Cloud, KeyRound, Globe, Tag, ShieldCheck, Copy, Check as CheckIcon } from 'lucide-react';
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
            tenantId: '',
            clientId: '',
            clientSecret: '',
            subscriptionId: '',
        },
    });

    const selectedProvider = form.watch('provider');

    const onSubmit = async (data: FormValues) => {
        setIsLoading(true);
        try {
            const credentials: Record<string, string> = {};

            if (data.provider === 'aws') {
                if (data.roleArn) credentials.roleArn = data.roleArn.trim();
                if (data.region) credentials.region = data.region.trim();
                credentials.externalId = externalId;
            } else if (data.provider === 'azure') {
                if (data.tenantId) credentials.tenantId = data.tenantId.trim();
                if (data.clientId) credentials.clientId = data.clientId.trim();
                if (data.clientSecret) credentials.clientSecret = data.clientSecret.trim();
                if (data.subscriptionId) credentials.subscriptionId = data.subscriptionId.trim();
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
                        : 'Não foi possível conectar a cloud account.';
                toast.error(message);
                return;
            }

            if (payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string') {
                const storageKey = `smc_active_cloud_account_id:${organizationId}`;
                window.localStorage.setItem(storageKey, payload.id);
                window.localStorage.setItem('smc_active_cloud_account_id', payload.id);
            }

            notifySidebarContextUpdated();

            toast.success('Cloud account conectada com sucesso.');
            router.replace('/');
            router.refresh();
        } catch {
            toast.error('Não foi possível conectar a cloud account.');
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
                            </div>

                            {/* IAM Role helper */}
                            <Accordion type="single" collapsible>
                                <AccordionItem value="iam-policy" className="rounded-lg border border-border px-4">
                                    <AccordionTrigger className="text-sm font-medium gap-2 hover:no-underline">
                                        <span className="flex items-center gap-2">
                                            <ShieldCheck className="size-4 text-muted-foreground shrink-0" />
                                            Como configurar a IAM Role na AWS
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="flex flex-col gap-5 pb-4">
                                        <p className="text-sm text-muted-foreground">
                                            Crie uma IAM Role na sua conta AWS com as políticas abaixo. O <strong>External ID</strong> já está
                                            pré-configurado — use-o exatamente como mostrado.
                                        </p>

                                        <PolicyBlock label="1. Trust Policy (quem pode assumir a role)" json={buildTrustPolicy(externalId)} />
                                        <PolicyBlock label="2. Permissions Policy (o que a role pode fazer)" json={PERMISSIONS_POLICY} />

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

                    {/* GCP placeholder */}
                    {selectedProvider === 'gcp' && (
                        <div className="rounded-lg border border-border p-4 flex items-center gap-3">
                            <Cloud className="size-5 text-muted-foreground shrink-0" />
                            <p className="text-sm text-muted-foreground">
                                Suporte a <strong>GCP</strong> em breve.
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <Button type="submit" isLoading={isLoading} disabled={selectedProvider === 'gcp'}>
                            Conectar cloud account
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
