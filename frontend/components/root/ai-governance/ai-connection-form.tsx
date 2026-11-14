'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createAiFinopsConnection } from '@/app/actions/ai-finops';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { IconInput } from '@/components/ui/input-icon';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { AiProviderSetupGuide } from './ai-provider-setup-guide';
import {
    buildConnectionCredentials,
    createConnectionSchema,
    type ConnectionFormValues,
} from './schema';

type Provider = { id: string; slug: string; name: string };

type Props = {
    tenantId: string;
    midOrgId: string;
    providers: Provider[];
    onSuccess: () => void;
};

export function AiConnectionForm({ tenantId, midOrgId, providers, onSuccess }: Props) {
    const t = useTranslations('aiGovernance');
    const [pending, setPending] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [showAdminApiKey, setShowAdminApiKey] = useState(false);
    const [showClientSecret, setShowClientSecret] = useState(false);

    const schema = useMemo(
        () =>
            createConnectionSchema({
                nameRequired: t.validation.nameRequired,
                providerRequired: t.validation.providerRequired,
                apiKeyRequired: t.validation.apiKeyRequired,
                roleArnRequired: t.validation.roleArnRequired,
                regionRequired: t.validation.regionRequired,
                endpointRequired: t.validation.endpointRequired,
                entraTenantRequired: t.validation.entraTenantRequired,
                clientIdRequired: t.validation.clientIdRequired,
                clientSecretRequired: t.validation.clientSecretRequired,
                subscriptionIdRequired: t.validation.subscriptionIdRequired,
                quantityInvalid: t.validation.quantityInvalid,
                unitCostInvalid: t.validation.unitCostInvalid,
                remainingInvalid: t.validation.remainingInvalid,
            }),
        [t],
    );

    const defaultProvider = providers[0]?.slug ?? 'openai';

    const form = useForm<ConnectionFormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            providerSlug: defaultProvider,
            connectionName: '',
            apiKey: '',
            adminApiKey: '',
            providerOrgId: '',
            providerProjectId: '',
            roleArn: '',
            externalId: '',
            awsRegion: 'us-east-1',
            azureEndpoint: '',
            azureSubscriptionId: '',
            msTenantId: '',
            msClientId: '',
            msClientSecret: '',
        },
    });

    const providerSlug = form.watch('providerSlug');

    useEffect(() => {
        if (providers.length > 0 && !providers.some((p) => p.slug === form.getValues('providerSlug'))) {
            form.setValue('providerSlug', providers[0].slug);
        }
    }, [providers, form]);

    useEffect(() => {
        setShowApiKey(false);
        setShowAdminApiKey(false);
        setShowClientSecret(false);
    }, [providerSlug]);

    const onValid = async (data: ConnectionFormValues) => {
        setPending(true);
        try {
            const response = await createAiFinopsConnection(tenantId, {
                organizationId: midOrgId,
                providerSlug: data.providerSlug,
                name: data.connectionName,
                credentials: buildConnectionCredentials(data),
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.connectionCreated);
            form.reset({
                providerSlug: data.providerSlug,
                connectionName: '',
                apiKey: '',
                adminApiKey: '',
                providerOrgId: '',
                providerProjectId: '',
                roleArn: '',
                externalId: '',
                awsRegion: 'us-east-1',
                azureEndpoint: '',
                azureSubscriptionId: '',
                msTenantId: '',
                msClientId: '',
                msClientSecret: '',
            });
            onSuccess();
        } catch {
            toast.error(t.loadError);
        } finally {
            setPending(false);
        }
    };

    const onInvalid = (errors: FieldErrors<ConnectionFormValues>) => {
        const first = Object.values(errors).find((error) => error?.message);
        toast.error(String(first?.message ?? t.validation.nameRequired));
    };

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onValid, onInvalid)}
                className="grid gap-3 md:grid-cols-2"
                noValidate
            >
                <FormField
                    control={form.control}
                    name="providerSlug"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.providers}</FormLabel>
                            <SearchableSelect
                                mode="single"
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={providers.length === 0}
                                placeholder={t.providers}
                                options={providers.map((provider) => ({
                                    value: provider.slug,
                                    label: provider.name,
                                }))}
                            />
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="connectionName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t.connectionName}</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <AiProviderSetupGuide key={providerSlug} providerSlug={providerSlug} />

                {providerSlug === 'aws_bedrock' ? (
                    <>
                        <FormField
                            control={form.control}
                            name="roleArn"
                            render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                    <FormLabel>{t.roleArn}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="externalId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.externalId}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="awsRegion"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.region}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="providerOrgId"
                            render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                    <FormLabel>{t.awsAccountId}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </>
                ) : providerSlug === 'azure_ai_foundry' ? (
                    <>
                        <FormField
                            control={form.control}
                            name="azureEndpoint"
                            render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                    <FormLabel>{t.endpoint}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="apiKey"
                            render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                    <FormLabel>{t.apiKey}</FormLabel>
                                    <FormControl>
                                        <IconInput
                                            type={showApiKey ? 'text' : 'password'}
                                            autoComplete="off"
                                            ButtonIcon={{
                                                icon: showApiKey ? EyeOff : Eye,
                                                onClick: () => setShowApiKey((v) => !v),
                                            }}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="providerOrgId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.resourceName}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="providerProjectId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.deployment}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <p className="text-muted-foreground md:col-span-2 text-xs">{t.azureCostManagementHint}</p>
                        <FormField
                            control={form.control}
                            name="msTenantId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.entraTenantId}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="azureSubscriptionId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.subscriptionIdOptional}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="msClientId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.clientId}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="msClientSecret"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.clientSecret}</FormLabel>
                                    <FormControl>
                                        <IconInput
                                            type={showClientSecret ? 'text' : 'password'}
                                            autoComplete="off"
                                            ButtonIcon={{
                                                icon: showClientSecret ? EyeOff : Eye,
                                                onClick: () => setShowClientSecret((v) => !v),
                                            }}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </>
                ) : providerSlug === 'microsoft_copilot' ? (
                    <>
                        <FormField
                            control={form.control}
                            name="msTenantId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.entraTenantId}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="msClientId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.clientId}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="msClientSecret"
                            render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                    <FormLabel>{t.clientSecret}</FormLabel>
                                    <FormControl>
                                        <IconInput
                                            type={showClientSecret ? 'text' : 'password'}
                                            autoComplete="off"
                                            ButtonIcon={{
                                                icon: showClientSecret ? EyeOff : Eye,
                                                onClick: () => setShowClientSecret((v) => !v),
                                            }}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </>
                ) : (
                    <>
                        <FormField
                            control={form.control}
                            name="apiKey"
                            render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                    <FormLabel>{t.apiKey}</FormLabel>
                                    <FormControl>
                                        <IconInput
                                            type={showApiKey ? 'text' : 'password'}
                                            autoComplete="off"
                                            ButtonIcon={{
                                                icon: showApiKey ? EyeOff : Eye,
                                                onClick: () => setShowApiKey((v) => !v),
                                            }}
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {(providerSlug === 'openai' ||
                            providerSlug === 'anthropic' ||
                            providerSlug === 'mistral') && (
                            <FormField
                                control={form.control}
                                name="adminApiKey"
                                render={({ field }) => (
                                    <FormItem className="md:col-span-2">
                                        <FormLabel>{t.adminApiKeyOptional}</FormLabel>
                                        <FormControl>
                                            <IconInput
                                                type={showAdminApiKey ? 'text' : 'password'}
                                                autoComplete="off"
                                                ButtonIcon={{
                                                    icon: showAdminApiKey ? EyeOff : Eye,
                                                    onClick: () => setShowAdminApiKey((v) => !v),
                                                }}
                                                {...field}
                                            />
                                        </FormControl>
                                        <p className="text-muted-foreground text-xs">
                                            {providerSlug === 'mistral'
                                                ? t.mistralAdminApiKeyHint
                                                : t.adminApiKeyHint}
                                        </p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}
                        <FormField
                            control={form.control}
                            name="providerOrgId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.organizationIdOptional}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="providerProjectId"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.projectIdOptional}</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </>
                )}

                <div className="md:col-span-2 flex flex-col items-start gap-2">
                    {providers.length === 0 ? (
                        <p className="text-muted-foreground text-xs">{t.loadError}</p>
                    ) : null}
                    <Button type="submit" size="sm" isLoading={pending} disabled={pending || providers.length === 0}>
                        <Plus className="size-3.5" />
                        {t.createConnection}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
