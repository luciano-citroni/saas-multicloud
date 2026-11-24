'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    BookOpen,
    ChevronLeft,
    ChevronRight,
    FilePlus2,
    FileText,
    Plus,
    Scale,
    Trash2,
    Wallet,
    Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    deleteCloudIntelligenceKnowledge,
    fetchCloudIntelligenceKnowledge,
    upsertCloudIntelligenceKnowledge,
    type AiKnowledgeDocument,
    type KnowledgeDomain,
    type KnowledgeRole,
    type KnowledgeScope,
} from '@/app/actions/cloud-intelligence';
import {
    fetchOrganizationCloudAccounts,
    type OrganizationCloudAccount,
} from '@/app/actions/organization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Item,
    ItemActions,
    ItemContent,
    ItemDescription,
    ItemGroup,
    ItemMedia,
    ItemTitle,
} from '@/components/ui/item';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { extractErrorMessage } from '@/lib/error-messages';
import { useActiveMidOrgId } from '@/lib/hooks/use-active-mid-org-id';
import { useTranslations } from '@/lib/i18n';
import {
    ACTIVE_MID_ORG_CHANGED_EVENT,
    ACTIVE_ORG_CHANGED_EVENT,
    ACTIVE_ORG_STORAGE_KEY,
    getActiveMidOrgId,
} from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';
import { CiMarkdownEditor } from './ci-markdown-editor';
import {
    createKnowledgeSchema,
    knowledgeFormDefaults,
    type KnowledgeFormValues,
} from './knowledge-schema';

const LIBRARY_PAGE_SIZE = 8;

type PaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

function unwrapDocs(body: unknown): { items: AiKnowledgeDocument[]; pagination: PaginationMeta | null } {
    if (Array.isArray(body)) {
        return { items: body as AiKnowledgeDocument[], pagination: null };
    }
    if (body && typeof body === 'object') {
        const payload = body as { items?: unknown; pagination?: PaginationMeta | null };
        if (Array.isArray(payload.items)) {
            return {
                items: payload.items as AiKnowledgeDocument[],
                pagination: payload.pagination ?? null,
            };
        }
    }
    return { items: [], pagination: null };
}

function domainIcon(domain: KnowledgeDomain | undefined) {
    switch (domain) {
        case 'governance':
            return Scale;
        case 'finops':
            return Wallet;
        case 'automation':
            return Workflow;
        default:
            return FileText;
    }
}

function stripTitlePrefix(doc: AiKnowledgeDocument): string {
    const prefix = `${doc.title}\n\n`;
    return doc.content.startsWith(prefix) ? doc.content.slice(prefix.length) : doc.content;
}

function roleLabel(
    role: KnowledgeRole | undefined,
    labels: {
        knowledgeRoleGuidance: string;
        knowledgeRoleRule: string;
        knowledgeRoleTags: string;
        knowledgeRoleNaming: string;
    },
) {
    if (role === 'rule') return labels.knowledgeRoleRule;
    if (role === 'tags') return labels.knowledgeRoleTags;
    if (role === 'naming') return labels.knowledgeRoleNaming;
    return labels.knowledgeRoleGuidance;
}

function buildTagsContent(keys: string[]) {
    return ['Tags obrigatórias:', ...keys.map((key) => `- ${key}`)].join('\n');
}

function buildNamingContent(pattern: string, example?: string) {
    const lines = [`Padrão de nomenclatura: ${pattern}`];
    if (example?.trim()) {
        lines.push(`Exemplo: ${example.trim()}`);
    }
    return lines.join('\n');
}

export function CiKnowledgePanel() {
    const t = useTranslations('cloudIntelligence');
    const tc = useTranslations('common');
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const page = useMemo(() => {
        const raw = Number(searchParams.get('page') ?? '1');
        return Number.isInteger(raw) && raw > 0 ? raw : 1;
    }, [searchParams]);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const midOrgId = useActiveMidOrgId(organizationId);
    const [cloudAccounts, setCloudAccounts] = useState<OrganizationCloudAccount[]>([]);
    const [pending, setPending] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [docs, setDocs] = useState<AiKnowledgeDocument[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedSnapshot, setSelectedSnapshot] = useState<AiKnowledgeDocument | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AiKnowledgeDocument | null>(null);

    const knowledgeSchema = useMemo(
        () =>
            createKnowledgeSchema({
                titleRequired: t.knowledgeTitleRequired,
                contentRequired: t.knowledgeContentRequired,
                tagsRequired: t.knowledgeTagRuleRequired,
                namingRequired: t.knowledgeNamingRuleRequired,
                accountsRequired: t.knowledgeScopeAccountsRequired,
            }),
        [t],
    );

    const form = useForm<KnowledgeFormValues>({
        resolver: zodResolver(knowledgeSchema),
        defaultValues: knowledgeFormDefaults,
    });

    const domain = form.watch('domain');
    const role = form.watch('role');
    const tagRows = form.watch('tagRows');
    const scope = form.watch('scope');
    const selectedAccountIds = form.watch('selectedAccountIds');

    const domainLabel = useMemo(
        () =>
            ({
                governance: t.knowledgeDomainGovernance,
                finops: t.knowledgeDomainFinops,
                automation: t.knowledgeDomainAutomation,
                general: t.knowledgeDomainGeneral,
            }) as Record<KnowledgeDomain, string>,
        [t],
    );

    const setPage = useCallback(
        (nextPage: number) => {
            const params = new URLSearchParams(searchParams.toString());
            if (nextPage <= 1) params.delete('page');
            else params.set('page', String(nextPage));
            const qs = params.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams],
    );

    useEffect(() => {
        const syncOrg = () => setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        syncOrg();
        window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, syncOrg);
        window.addEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, syncOrg);
        return () => {
            window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, syncOrg);
            window.removeEventListener(ACTIVE_MID_ORG_CHANGED_EVENT, syncOrg);
        };
    }, []);

    const scopedAccountIds = useMemo(() => cloudAccounts.map((account) => account.id), [cloudAccounts]);

    const load = useCallback(async () => {
        if (!organizationId) {
            setDocs([]);
            setPagination(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await fetchCloudIntelligenceKnowledge(organizationId, {
                page,
                limit: LIBRARY_PAGE_SIZE,
            });
            if (!res.ok) {
                toast.error(extractErrorMessage(await res.json().catch(() => ({}))));
                setDocs([]);
                setPagination(null);
                return;
            }
            const parsed = unwrapDocs(await res.json());
            const allowed = new Set(scopedAccountIds);
            const filtered = parsed.items.filter((doc) => {
                if (doc.scope !== 'cloud_accounts') return true;
                const ids = doc.cloudAccountIds ?? [];
                if (ids.length === 0) return true;
                return ids.some((id) => allowed.has(id));
            });
            setDocs(filtered);
            setPagination(parsed.pagination);
            if (parsed.pagination && page > parsed.pagination.totalPages && parsed.pagination.totalPages > 0) {
                setPage(parsed.pagination.totalPages);
            }
        } finally {
            setLoading(false);
        }
    }, [organizationId, page, scopedAccountIds, setPage]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!organizationId) {
            setCloudAccounts([]);
            return;
        }
        void (async () => {
            try {
                const res = await fetchOrganizationCloudAccounts(organizationId, {
                    limit: 100,
                    isActive: true,
                    midOrgId: midOrgId ?? getActiveMidOrgId(organizationId),
                });
                if (!res.ok) {
                    setCloudAccounts([]);
                    return;
                }
                const body = (await res.json().catch(() => null)) as
                    | OrganizationCloudAccount[]
                    | { items?: OrganizationCloudAccount[] }
                    | null;
                const items = Array.isArray(body)
                    ? body
                    : Array.isArray(body?.items)
                      ? body.items
                      : [];
                setCloudAccounts(items);
            } catch {
                setCloudAccounts([]);
            }
        })();
    }, [organizationId, midOrgId]);

    const normalizedTags = useMemo(
        () =>
            tagRows
                .map((tag) => tag.trim())
                .filter(Boolean)
                .slice(0, 20),
        [tagRows],
    );

    const isTagsRole = domain === 'governance' && role === 'tags';
    const isNamingRole = domain === 'governance' && role === 'naming';
    const isStructuredGovernanceRole = isTagsRole || isNamingRole;

    const resetForm = () => {
        form.reset(knowledgeFormDefaults);
        setSelectedId(null);
        setSelectedSnapshot(null);
    };

    const onSelect = (doc: AiKnowledgeDocument) => {
        setSelectedId(doc.id);
        setSelectedSnapshot(doc);
        const nextRole: KnowledgeRole =
            doc.role === 'tags' ||
            (doc.domain === 'governance' && doc.rule?.type === 'required_tags')
                ? 'tags'
                : doc.role === 'naming' ||
                    (doc.domain === 'governance' && doc.rule?.type === 'naming_pattern')
                  ? 'naming'
                  : (doc.role ?? 'guidance');
        const nextScope: KnowledgeScope =
            doc.scope === 'cloud_accounts' || (doc.cloudAccountIds?.length ?? 0) > 0
                ? 'cloud_accounts'
                : 'organization';
        form.reset({
            title: doc.title,
            content: stripTitlePrefix(doc),
            domain: doc.domain ?? 'general',
            role: nextRole,
            tagRows:
                doc.rule?.type === 'required_tags' && doc.rule.keys.length > 0
                    ? doc.rule.keys
                    : [''],
            namingPattern: doc.rule?.type === 'naming_pattern' ? doc.rule.pattern : '',
            namingExample:
                doc.rule?.type === 'naming_pattern' && doc.rule.example ? doc.rule.example : '',
            scope: nextScope,
            selectedAccountIds: doc.cloudAccountIds ?? [],
        });
    };

    const toggleAccount = (accountId: string, checked: boolean) => {
        const ids = form.getValues('selectedAccountIds');
        form.setValue(
            'selectedAccountIds',
            checked
                ? ids.includes(accountId)
                    ? ids
                    : [...ids, accountId]
                : ids.filter((id) => id !== accountId),
            { shouldValidate: true },
        );
    };

    const onDomainChange = (value: KnowledgeDomain) => {
        form.setValue('domain', value, { shouldValidate: true });
        if (value !== 'governance' && (role === 'tags' || role === 'naming')) {
            form.setValue('role', 'guidance', { shouldValidate: true });
            form.setValue('tagRows', [''], { shouldValidate: true });
            form.setValue('namingPattern', '', { shouldValidate: true });
            form.setValue('namingExample', '', { shouldValidate: true });
        }
    };

    const onRoleChange = (value: KnowledgeRole) => {
        form.setValue('role', value, { shouldValidate: true });
        if (value === 'tags' || value === 'naming') {
            form.setValue('domain', 'governance', { shouldValidate: true });
            if (value === 'tags' && tagRows.every((row) => !row.trim())) {
                form.setValue('tagRows', [''], { shouldValidate: true });
            }
        }
    };

    const updateTagRow = (index: number, value: string) => {
        const rows = form.getValues('tagRows').map((row, i) => (i === index ? value : row));
        form.setValue('tagRows', rows, { shouldValidate: true });
    };

    const addTagRow = () => {
        const rows = form.getValues('tagRows');
        if (rows.length >= 20) return;
        form.setValue('tagRows', [...rows, ''], { shouldValidate: true });
    };

    const removeTagRow = (index: number) => {
        const rows = form.getValues('tagRows');
        form.setValue(
            'tagRows',
            rows.length <= 1 ? [''] : rows.filter((_, i) => i !== index),
            { shouldValidate: true },
        );
    };

    const onSave = form.handleSubmit(async (data) => {
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (!organizationId) return;

        const dataIsTagsRole = data.domain === 'governance' && data.role === 'tags';
        const dataIsNamingRole = data.domain === 'governance' && data.role === 'naming';
        const dataIsStructured = dataIsTagsRole || dataIsNamingRole;
        const tags = data.tagRows.map((tag) => tag.trim()).filter(Boolean).slice(0, 20);

        const contentToSave = dataIsTagsRole
            ? data.content.trim() || buildTagsContent(tags)
            : dataIsNamingRole
              ? data.content.trim() || buildNamingContent(data.namingPattern.trim(), data.namingExample)
              : data.content.trim();

        const allProviders = ['aws', 'azure', 'gcp'] as Array<'aws' | 'azure' | 'gcp'>;
        const structuredRule = dataIsTagsRole
            ? {
                  type: 'required_tags' as const,
                  keys: tags,
                  providers: allProviders,
              }
            : dataIsNamingRole
              ? {
                    type: 'naming_pattern' as const,
                    pattern: data.namingPattern.trim(),
                    ...(data.namingExample.trim() ? { example: data.namingExample.trim() } : {}),
                    providers: allProviders,
                }
              : undefined;

        const effectiveScope: KnowledgeScope = dataIsStructured ? data.scope : 'organization';
        const effectiveAccountIds =
            effectiveScope === 'cloud_accounts' ? data.selectedAccountIds : [];

        setPending(true);
        try {
            const res = await upsertCloudIntelligenceKnowledge(organizationId, {
                ...(selectedId ? { id: selectedId } : {}),
                title: data.title.trim(),
                content: contentToSave,
                source: 'ui-upload',
                domain: dataIsStructured ? 'governance' : data.domain,
                role: dataIsTagsRole ? 'tags' : dataIsNamingRole ? 'naming' : data.role,
                scope: effectiveScope,
                cloudAccountIds: effectiveAccountIds,
                ...(structuredRule ? { rule: structuredRule } : {}),
            });
            const body = (await res.json().catch(() => ({}))) as {
                ok?: boolean;
                id?: string;
                warning?: string;
                message?: string;
            };
            if (!res.ok || body.ok !== true) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.knowledgeSaved);
            if (typeof body.warning === 'string' && body.warning) {
                toast.message(extractErrorMessage({ message: body.warning }));
            }
            const savedId = typeof body.id === 'string' ? body.id : selectedId;
            if (!selectedId) {
                setPage(1);
            }
            await load();
            if (savedId) {
                setSelectedId(savedId);
                setSelectedSnapshot({
                    id: savedId,
                    title: data.title.trim(),
                    source: 'ui-upload',
                    content: `${data.title.trim()}\n\n${contentToSave}`,
                    contentPreview: contentToSave.slice(0, 180),
                    domain: dataIsStructured ? 'governance' : data.domain,
                    role: dataIsTagsRole ? 'tags' : dataIsNamingRole ? 'naming' : data.role,
                    rule: structuredRule,
                    scope: effectiveScope,
                    cloudAccountIds: effectiveAccountIds,
                    hasEmbedding: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
                if (dataIsStructured && !data.content.trim()) {
                    form.setValue('content', contentToSave);
                }
            }
        } finally {
            setPending(false);
        }
    });

    const requestDelete = (doc?: AiKnowledgeDocument | null) => {
        const target = doc ?? selectedSnapshot;
        if (!target) return;
        setDeleteTarget(target);
    };

    const confirmDelete = async () => {
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (!organizationId || !deleteTarget) return false;

        setDeleting(true);
        try {
            const res = await deleteCloudIntelligenceKnowledge(organizationId, deleteTarget.id);
            if (!res.ok && res.status !== 204) {
                toast.error(extractErrorMessage(await res.json().catch(() => ({}))));
                return false;
            }
            toast.success(t.knowledgeDeleted);
            if (selectedId === deleteTarget.id) {
                resetForm();
            }
            setDeleteTarget(null);
            await load();
            return true;
        } finally {
            setDeleting(false);
        }
    };

    const totalPages = Math.max(1, pagination?.totalPages ?? 1);
    const totalItems = pagination?.totalItems ?? docs.length;
    const showPagination = totalItems > LIBRARY_PAGE_SIZE || (pagination?.totalPages ?? 0) > 1;

    return (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="border-border bg-card flex min-h-[20rem] flex-col overflow-hidden rounded-xl border shadow-xs lg:min-h-[32rem]">
                <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium">{t.knowledgeLibrary}</p>
                        <p className="text-muted-foreground text-[11px] tabular-nums">
                            {loading
                                ? t.loading
                                : t.knowledgeLibraryCount.replace('{count}', String(totalItems))}
                        </p>
                    </div>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 px-2.5"
                        onClick={resetForm}
                    >
                        <FilePlus2 className="size-3.5" />
                        {t.knowledgeNew}
                    </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
                    {loading ? (
                        <div className="space-y-2 p-1">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="bg-muted/60 h-[4.5rem] animate-pulse rounded-lg"
                                />
                            ))}
                        </div>
                    ) : docs.length === 0 ? (
                        <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-14 text-center">
                            <div className="bg-muted flex size-10 items-center justify-center rounded-full">
                                <BookOpen className="size-4 opacity-70" />
                            </div>
                            <p className="text-xs leading-relaxed">{t.knowledgeEmpty}</p>
                        </div>
                    ) : (
                        <ItemGroup className="gap-2" data-size="sm">
                            {docs.map((doc) => {
                                const isActive = selectedId === doc.id;
                                const Icon = domainIcon(doc.domain);
                                return (
                                    <Item
                                        key={doc.id}
                                        role="listitem"
                                        tabIndex={0}
                                        size="sm"
                                        variant={isActive ? 'muted' : 'outline'}
                                        aria-selected={isActive}
                                        className={cn(
                                            'cursor-pointer hover:bg-muted/60',
                                            isActive &&
                                                'border-primary/40 bg-primary/10 ring-primary/20 ring-1',
                                        )}
                                        onClick={() => onSelect(doc)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                onSelect(doc);
                                            }
                                        }}
                                    >
                                        <ItemMedia
                                            variant="icon"
                                            className={cn(
                                                'bg-background size-9 rounded-lg border',
                                                isActive
                                                    ? 'border-primary/30 text-primary'
                                                    : 'border-border text-muted-foreground',
                                            )}
                                        >
                                            <Icon className="size-4" />
                                        </ItemMedia>
                                        <ItemContent className="min-w-0">
                                            <ItemTitle className="w-full max-w-none text-xs">
                                                {doc.title}
                                            </ItemTitle>
                                            <ItemDescription className="line-clamp-2 text-[11px]">
                                                {doc.contentPreview}
                                            </ItemDescription>
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                                <Badge
                                                    variant="outline"
                                                    className="h-5 px-1.5 text-[10px]"
                                                >
                                                    {domainLabel[doc.domain ?? 'general']}
                                                </Badge>
                                                <Badge
                                                    variant="secondary"
                                                    className="h-5 px-1.5 text-[10px]"
                                                >
                                                    {roleLabel(doc.role, t)}
                                                </Badge>
                                                {doc.role === 'tags' || doc.role === 'naming' ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="h-5 px-1.5 text-[10px]"
                                                    >
                                                        {doc.scope === 'cloud_accounts'
                                                            ? t.knowledgeScopeAccounts
                                                            : t.knowledgeScopeOrganization}
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </ItemContent>
                                        <ItemActions className="self-start">
                                            <Button
                                                type="button"
                                                size="icon-xs"
                                                variant="ghost"
                                                className="text-muted-foreground hover:text-destructive"
                                                title={t.knowledgeDelete}
                                                aria-label={t.knowledgeDelete}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    requestDelete(doc);
                                                }}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </ItemActions>
                                    </Item>
                                );
                            })}
                        </ItemGroup>
                    )}
                </div>

                {showPagination ? (
                    <div className="border-border flex items-center justify-between gap-2 border-t px-3 py-2">
                        <p className="text-muted-foreground text-[11px] tabular-nums">
                            {tc.pageOf
                                .replace('{page}', String(pagination?.page ?? page))
                                .replace('{pages}', String(totalPages))}
                        </p>
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                disabled={loading || !(pagination?.hasPreviousPage ?? page > 1)}
                                aria-label={t.knowledgePreviousPage}
                                onClick={() => setPage(Math.max(1, page - 1))}
                            >
                                <ChevronLeft className="size-3.5" />
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-xs"
                                disabled={loading || !(pagination?.hasNextPage ?? false)}
                                aria-label={t.knowledgeNextPage}
                                onClick={() => setPage(page + 1)}
                            >
                                <ChevronRight className="size-3.5" />
                            </Button>
                        </div>
                    </div>
                ) : null}
            </aside>

            <section className="border-border bg-card flex min-h-[20rem] flex-col gap-4 overflow-hidden rounded-xl border p-4 shadow-xs sm:p-5 lg:min-h-[32rem]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-medium">
                            {selectedId ? t.knowledgeEdit : t.knowledgeNew}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                            {t.knowledgeRulesHint}
                        </p>
                    </div>
                    {selectedId ? (
                        <Badge variant="outline" className="h-6 px-2 text-[10px]">
                            {domainLabel[domain]}
                        </Badge>
                    ) : null}
                </div>

                <Form {...form}>
                    <form onSubmit={onSave} className="flex min-h-0 flex-1 flex-col gap-4">
                <div className="space-y-3">
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem>
                                <FormControl>
                                    <Input
                                        {...field}
                                        placeholder={t.knowledgeTitleLabel}
                                        disabled={pending || deleting}
                                        className="h-9"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="domain"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">{t.knowledgeDomainLabel}</FormLabel>
                                    <SearchableSelect
                                        mode="single"
                                        value={field.value}
                                        onValueChange={(value) => onDomainChange(value as KnowledgeDomain)}
                                        disabled={pending || deleting}
                                        options={[
                                            { value: 'general', label: t.knowledgeDomainGeneral },
                                            { value: 'governance', label: t.knowledgeDomainGovernance },
                                            { value: 'finops', label: t.knowledgeDomainFinops },
                                            { value: 'automation', label: t.knowledgeDomainAutomation },
                                        ]}
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">{t.knowledgeRoleLabel}</FormLabel>
                                    <SearchableSelect
                                        mode="single"
                                        value={field.value}
                                        onValueChange={(value) => onRoleChange(value as KnowledgeRole)}
                                        disabled={pending || deleting}
                                        options={[
                                            { value: 'guidance', label: t.knowledgeRoleGuidance },
                                            { value: 'rule', label: t.knowledgeRoleRule },
                                            ...(domain === 'governance'
                                                ? [
                                                      { value: 'tags', label: t.knowledgeRoleTags },
                                                      { value: 'naming', label: t.knowledgeRoleNaming },
                                                  ]
                                                : []),
                                        ]}
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                {isTagsRole ? (
                    <div className="bg-muted/30 space-y-3 rounded-xl border border-border/70 p-3">
                        <div>
                            <p className="text-xs font-medium">{t.knowledgeTagRuleTitle}</p>
                            <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                                {t.knowledgeTagRuleHint}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <FormLabel className="text-xs">{t.knowledgeRequiredTagsLabel}</FormLabel>
                            {tagRows.map((tag, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <Input
                                        value={tag}
                                        onChange={(event) =>
                                            updateTagRow(index, event.target.value)
                                        }
                                        placeholder={t.knowledgeRequiredTagsPlaceholder}
                                        disabled={pending || deleting}
                                        className="h-9"
                                        aria-label={`${t.knowledgeRequiredTagsLabel} ${index + 1}`}
                                    />
                                    <Button
                                        type="button"
                                        size="icon-xs"
                                        variant="ghost"
                                        className="text-muted-foreground hover:text-destructive shrink-0"
                                        disabled={pending || deleting}
                                        title={t.knowledgeRemoveTagRow}
                                        aria-label={t.knowledgeRemoveTagRow}
                                        onClick={() => removeTagRow(index)}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </Button>
                                </div>
                            ))}
                            {form.formState.errors.tagRows ? (
                                <p className="text-[0.8rem] font-medium text-destructive">
                                    {form.formState.errors.tagRows.message as string}
                                </p>
                            ) : null}
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5"
                                disabled={pending || deleting || tagRows.length >= 20}
                                onClick={addTagRow}
                            >
                                <Plus className="size-3.5" />
                                {t.knowledgeAddTagRow}
                            </Button>
                        </div>
                    </div>
                ) : null}

                {isNamingRole ? (
                    <div className="bg-muted/30 space-y-3 rounded-xl border border-border/70 p-3">
                        <div>
                            <p className="text-xs font-medium">{t.knowledgeNamingRuleTitle}</p>
                            <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                                {t.knowledgeNamingRuleHint}
                            </p>
                        </div>
                        <FormField
                            control={form.control}
                            name="namingPattern"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">{t.knowledgeNamingPatternLabel}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder={t.knowledgeNamingPatternPlaceholder}
                                            disabled={pending || deleting}
                                            className="h-9"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="namingExample"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">{t.knowledgeNamingExampleLabel}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder={t.knowledgeNamingExamplePlaceholder}
                                            disabled={pending || deleting}
                                            className="h-9"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                ) : null}

                {isStructuredGovernanceRole ? (
                    <div className="bg-muted/30 space-y-3 rounded-xl border border-border/70 p-3">
                        <FormField
                            control={form.control}
                            name="scope"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs">{t.knowledgeScopeLabel}</FormLabel>
                                    <SearchableSelect
                                        mode="single"
                                        value={field.value}
                                        onValueChange={(value) => {
                                            const next = value as KnowledgeScope;
                                            form.setValue('scope', next, { shouldValidate: true });
                                            if (next === 'organization') {
                                                form.setValue('selectedAccountIds', [], {
                                                    shouldValidate: true,
                                                });
                                            }
                                        }}
                                        disabled={pending || deleting}
                                        options={[
                                            {
                                                value: 'organization',
                                                label: t.knowledgeScopeOrganization,
                                            },
                                            {
                                                value: 'cloud_accounts',
                                                label: t.knowledgeScopeAccounts,
                                            },
                                        ]}
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {scope === 'cloud_accounts' ? (
                            <div className="space-y-2">
                                <p className="text-muted-foreground text-[11px] leading-relaxed">
                                    {t.knowledgeScopeAccountsHint}
                                </p>
                                {cloudAccounts.length === 0 ? (
                                    <p className="text-muted-foreground text-[11px]">
                                        {t.knowledgeScopeAccountsEmpty}
                                    </p>
                                ) : (
                                    <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                                        {cloudAccounts.map((account) => {
                                            const checked = selectedAccountIds.includes(account.id);
                                            return (
                                                <label
                                                    key={account.id}
                                                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-1 py-1"
                                                >
                                                    <Checkbox
                                                        checked={checked}
                                                        disabled={pending || deleting}
                                                        onCheckedChange={(value) =>
                                                            toggleAccount(account.id, value === true)
                                                        }
                                                    />
                                                    <span className="min-w-0 flex-1 truncate text-xs">
                                                        {account.alias}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className="h-5 shrink-0 px-1.5 text-[10px] uppercase"
                                                    >
                                                        {account.provider}
                                                    </Badge>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                {form.formState.errors.selectedAccountIds ? (
                                    <p className="text-[0.8rem] font-medium text-destructive">
                                        {form.formState.errors.selectedAccountIds.message as string}
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <div className="min-h-0 flex-1">
                    {isStructuredGovernanceRole ? (
                        <FormLabel className="text-muted-foreground mb-1.5 block text-xs">
                            {t.knowledgeContentOptionalLabel}
                        </FormLabel>
                    ) : null}
                    <FormField
                        control={form.control}
                        name="content"
                        render={({ field }) => (
                            <FormItem className="h-full">
                                <FormControl>
                                    <CiMarkdownEditor
                                        value={field.value}
                                        onChange={field.onChange}
                                        disabled={pending || deleting}
                                        placeholder={t.knowledgeContentLabel}
                                        labels={{
                                            bold: t.knowledgeFmtBold,
                                            italic: t.knowledgeFmtItalic,
                                            strike: t.knowledgeFmtStrike,
                                            heading: t.knowledgeFmtHeading,
                                            bullet: t.knowledgeFmtBullet,
                                            numbered: t.knowledgeFmtNumbered,
                                            quote: t.knowledgeFmtQuote,
                                            code: t.knowledgeFmtCode,
                                            indent: t.knowledgeFmtIndent,
                                            outdent: t.knowledgeFmtOutdent,
                                        }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                    <Button
                        type="submit"
                        size="sm"
                        disabled={pending || deleting}
                        isLoading={pending}
                    >
                        {selectedId ? t.knowledgeUpdate : t.knowledgeSave}
                    </Button>
                    {selectedId ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            disabled={pending || deleting}
                            onClick={() => requestDelete(selectedSnapshot)}
                        >
                            <Trash2 className="size-3.5" />
                            {t.knowledgeDelete}
                        </Button>
                    ) : null}
                </div>
                    </form>
                </Form>
            </section>

            <ConfirmDeleteDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => {
                    if (!open && !deleting) {
                        setDeleteTarget(null);
                    }
                }}
                title={t.knowledgeDeleteTitle}
                description={
                    deleteTarget ? (
                        <>
                            <span className="text-foreground font-medium">
                                &ldquo;{deleteTarget.title}&rdquo;
                            </span>{' '}
                            {t.knowledgeDeleteDescription}
                        </>
                    ) : (
                        t.knowledgeDeleteDescription
                    )
                }
                resourceName={deleteTarget?.title ?? ''}
                confirmLabel={tc.delete}
                isConfirming={deleting}
                onConfirm={confirmDelete}
            />
        </div>
    );
}
