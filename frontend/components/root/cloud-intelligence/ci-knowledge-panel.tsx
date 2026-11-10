'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
} from '@/app/actions/cloud-intelligence';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
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
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { cn } from '@/lib/utils';
import { CiMarkdownEditor } from './ci-markdown-editor';

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
    },
) {
    if (role === 'rule') return labels.knowledgeRoleRule;
    if (role === 'tags') return labels.knowledgeRoleTags;
    return labels.knowledgeRoleGuidance;
}

function buildTagsContent(keys: string[]) {
    return ['Tags obrigatórias:', ...keys.map((key) => `- ${key}`)].join('\n');
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

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [domain, setDomain] = useState<KnowledgeDomain>('general');
    const [role, setRole] = useState<KnowledgeRole>('guidance');
    const [tagRows, setTagRows] = useState<string[]>(['']);
    const [pending, setPending] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [docs, setDocs] = useState<AiKnowledgeDocument[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedSnapshot, setSelectedSnapshot] = useState<AiKnowledgeDocument | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AiKnowledgeDocument | null>(null);

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

    const load = useCallback(async () => {
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
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
            setDocs(parsed.items);
            setPagination(parsed.pagination);
            if (parsed.pagination && page > parsed.pagination.totalPages && parsed.pagination.totalPages > 0) {
                setPage(parsed.pagination.totalPages);
            }
        } finally {
            setLoading(false);
        }
    }, [page, setPage]);

    useEffect(() => {
        void load();
    }, [load]);

    const normalizedTags = useMemo(
        () =>
            tagRows
                .map((tag) => tag.trim())
                .filter(Boolean)
                .slice(0, 20),
        [tagRows],
    );

    const isTagsRole = domain === 'governance' && role === 'tags';

    const resetForm = () => {
        setTitle('');
        setContent('');
        setDomain('general');
        setRole('guidance');
        setTagRows(['']);
        setSelectedId(null);
        setSelectedSnapshot(null);
    };

    const onSelect = (doc: AiKnowledgeDocument) => {
        setSelectedId(doc.id);
        setSelectedSnapshot(doc);
        setTitle(doc.title);
        setContent(stripTitlePrefix(doc));
        setDomain(doc.domain ?? 'general');
        const nextRole =
            doc.role === 'tags' ||
            (doc.domain === 'governance' && doc.rule?.type === 'required_tags')
                ? 'tags'
                : (doc.role ?? 'guidance');
        setRole(nextRole);
        setTagRows(
            doc.rule?.type === 'required_tags' && doc.rule.keys.length > 0
                ? doc.rule.keys
                : [''],
        );
    };

    const onDomainChange = (value: KnowledgeDomain) => {
        setDomain(value);
        if (value !== 'governance' && role === 'tags') {
            setRole('guidance');
            setTagRows(['']);
        }
    };

    const onRoleChange = (value: KnowledgeRole) => {
        setRole(value);
        if (value === 'tags') {
            setDomain('governance');
            if (tagRows.every((row) => !row.trim())) {
                setTagRows(['']);
            }
        }
    };

    const updateTagRow = (index: number, value: string) => {
        setTagRows((rows) => rows.map((row, i) => (i === index ? value : row)));
    };

    const addTagRow = () => {
        setTagRows((rows) => (rows.length >= 20 ? rows : [...rows, '']));
    };

    const removeTagRow = (index: number) => {
        setTagRows((rows) => {
            if (rows.length <= 1) return [''];
            return rows.filter((_, i) => i !== index);
        });
    };

    const canSave =
        Boolean(title.trim()) &&
        (isTagsRole ? normalizedTags.length > 0 : Boolean(content.trim()));

    const onSave = async () => {
        const organizationId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
        if (!organizationId || !canSave) return;

        if (isTagsRole && normalizedTags.length === 0) {
            toast.error(t.knowledgeTagRuleRequired);
            return;
        }

        const contentToSave =
            isTagsRole && !content.trim() ? buildTagsContent(normalizedTags) : content.trim();

        setPending(true);
        try {
            const res = await upsertCloudIntelligenceKnowledge(organizationId, {
                ...(selectedId ? { id: selectedId } : {}),
                title: title.trim(),
                content: contentToSave,
                source: 'ui-upload',
                domain: isTagsRole ? 'governance' : domain,
                role: isTagsRole ? 'tags' : role,
                ...(isTagsRole
                    ? {
                          rule: {
                              type: 'required_tags' as const,
                              keys: normalizedTags,
                              providers: ['aws', 'azure', 'gcp'] as Array<'aws' | 'azure' | 'gcp'>,
                          },
                      }
                    : {}),
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
                    title: title.trim(),
                    source: 'ui-upload',
                    content: `${title.trim()}\n\n${contentToSave}`,
                    contentPreview: contentToSave.slice(0, 180),
                    domain: isTagsRole ? 'governance' : domain,
                    role: isTagsRole ? 'tags' : role,
                    rule: isTagsRole
                        ? {
                              type: 'required_tags',
                              keys: normalizedTags,
                              providers: ['aws', 'azure', 'gcp'],
                          }
                        : undefined,
                    hasEmbedding: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });
                if (isTagsRole && !content.trim()) {
                    setContent(contentToSave);
                }
            }
        } finally {
            setPending(false);
        }
    };

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
            <aside className="border-border bg-card flex min-h-[32rem] flex-col overflow-hidden rounded-xl border shadow-xs">
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

            <section className="border-border bg-card flex min-h-[32rem] flex-col gap-4 overflow-hidden rounded-xl border p-4 shadow-xs sm:p-5">
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

                <div className="space-y-3">
                    <Input
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder={t.knowledgeTitleLabel}
                        disabled={pending || deleting}
                        className="h-9"
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs">{t.knowledgeDomainLabel}</Label>
                            <Select
                                value={domain}
                                onValueChange={(value) => onDomainChange(value as KnowledgeDomain)}
                                disabled={pending || deleting}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="general">{t.knowledgeDomainGeneral}</SelectItem>
                                    <SelectItem value="governance">
                                        {t.knowledgeDomainGovernance}
                                    </SelectItem>
                                    <SelectItem value="finops">{t.knowledgeDomainFinops}</SelectItem>
                                    <SelectItem value="automation">
                                        {t.knowledgeDomainAutomation}
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">{t.knowledgeRoleLabel}</Label>
                            <Select
                                value={role}
                                onValueChange={(value) => onRoleChange(value as KnowledgeRole)}
                                disabled={pending || deleting}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="guidance">{t.knowledgeRoleGuidance}</SelectItem>
                                    <SelectItem value="rule">{t.knowledgeRoleRule}</SelectItem>
                                    {domain === 'governance' ? (
                                        <SelectItem value="tags">{t.knowledgeRoleTags}</SelectItem>
                                    ) : null}
                                </SelectContent>
                            </Select>
                        </div>
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
                            <Label className="text-xs">{t.knowledgeRequiredTagsLabel}</Label>
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

                <div className="min-h-0 flex-1">
                    {isTagsRole ? (
                        <Label className="text-muted-foreground mb-1.5 block text-xs">
                            {t.knowledgeContentOptionalLabel}
                        </Label>
                    ) : null}
                    <CiMarkdownEditor
                        value={content}
                        onChange={setContent}
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
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                    <Button
                        type="button"
                        size="sm"
                        disabled={pending || deleting || !canSave}
                        isLoading={pending}
                        onClick={() => void onSave()}
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
