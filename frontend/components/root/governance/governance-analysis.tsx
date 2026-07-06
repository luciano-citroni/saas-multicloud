'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, RefreshCcw, Search, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { fetchGovernanceJobFindings, fetchGovernanceJobStatus } from '@/app/actions/governance';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import {
    translateGovernanceDescription,
    translateGovernancePolicyName,
    translateGovernanceRecommendation,
    translateGovernanceResourceType,
    translateGovernanceSeverity,
} from '@/lib/governance-translations';
import { useTranslations } from '@/lib/i18n';

type GovernanceJob = {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    score: number | null;
    totalFindings: number | null;
    totalChecks: number | null;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
};

type GovernanceFinding = {
    id: string;
    resourceId: string;
    resourceType: string;
    policyId: string;
    policyName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'non_compliant' | 'warning';
    description: string;
    recommendation: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
};

type GovernancePaginationMeta = {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';
const PAGE_SIZE_OPTIONS = [5, 10, 20, 30] as const;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

type SeverityFilter = 'all' | GovernanceFinding['severity'];

function normalizePage(value: string | null): number {
    const parsedValue = Number.parseInt(value ?? '', 10);

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_PAGE;
}

function normalizePageSize(value: string | null): number {
    const parsedValue = Number.parseInt(value ?? '', 10);

    return PAGE_SIZE_OPTIONS.includes(parsedValue as (typeof PAGE_SIZE_OPTIONS)[number]) ? parsedValue : DEFAULT_PAGE_SIZE;
}

function normalizeSeverityFilter(value: string | null): SeverityFilter {
    switch (value) {
        case 'critical':
        case 'high':
        case 'medium':
        case 'low':
            return value;
        default:
            return 'all';
    }
}

function normalizeFindingsResponse(payload: unknown): { items: GovernanceFinding[]; pagination: GovernancePaginationMeta | null } {
    const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { items?: unknown })?.items)
          ? (payload as { items: unknown[] }).items
          : [];
    const paginationPayload = (payload as { pagination?: GovernancePaginationMeta | null } | null)?.pagination;
    const pagination =
        paginationPayload &&
        typeof paginationPayload.page === 'number' &&
        typeof paginationPayload.limit === 'number' &&
        typeof paginationPayload.totalItems === 'number' &&
        typeof paginationPayload.totalPages === 'number' &&
        typeof paginationPayload.hasNextPage === 'boolean' &&
        typeof paginationPayload.hasPreviousPage === 'boolean'
            ? paginationPayload
            : null;

    return {
        items: items.filter((item): item is GovernanceFinding => typeof (item as GovernanceFinding)?.id === 'string'),
        pagination,
    };
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';

    return new Date(dateStr).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function scoreColor(score: number): string {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
}

function severityVariant(severity: string): 'destructive' | 'default' | 'secondary' | 'outline' {
    switch (severity) {
        case 'critical':
            return 'destructive';
        case 'high':
            return 'default';
        case 'medium':
            return 'secondary';
        default:
            return 'outline';
    }
}

function severityToneClass(severity: GovernanceFinding['severity']): string {
    switch (severity) {
        case 'critical':
            return 'border-destructive/40 bg-destructive/5';
        case 'high':
            return 'border-orange-500/45 bg-orange-500/6';
        case 'medium':
            return 'border-amber-500/45 bg-amber-500/8';
        default:
            return 'border-emerald-500/45 bg-emerald-500/8';
    }
}

function severityDotClass(severity: GovernanceFinding['severity']): string {
    switch (severity) {
        case 'critical':
            return 'bg-destructive';
        case 'high':
            return 'bg-orange-500';
        case 'medium':
            return 'bg-amber-500';
        default:
            return 'bg-emerald-500';
    }
}

export function GovernanceAnalysis() {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const tg = useTranslations('governance');
    const tc = useTranslations('common');

    const jobId = useMemo(() => searchParams.get('jobId'), [searchParams]);
    const nameFilter = useMemo(() => searchParams.get('name') ?? '', [searchParams]);
    const severityFilter = useMemo(() => normalizeSeverityFilter(searchParams.get('severity')), [searchParams]);
    const page = useMemo(() => normalizePage(searchParams.get('page')), [searchParams]);
    const pageSize = useMemo(() => normalizePageSize(searchParams.get('limit')), [searchParams]);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);

    const [job, setJob] = useState<GovernanceJob | null>(null);
    const [findings, setFindings] = useState<GovernanceFinding[]>([]);
    const [pagination, setPagination] = useState<GovernancePaginationMeta | null>(null);
    const [jobError, setJobError] = useState<string | null>(null);
    const [findingsError, setFindingsError] = useState<string | null>(null);
    const [jobRetryNonce, setJobRetryNonce] = useState(0);
    const [findingsRetryNonce, setFindingsRetryNonce] = useState(0);

    const [loading, setLoading] = useState(true);
    const [loadingFindings, setLoadingFindings] = useState(true);
    const deferredNameFilter = useDeferredValue(nameFilter);
    const hasActiveFilters = nameFilter.trim().length > 0 || severityFilter !== 'all';

    const syncFilterUrlState = useCallback(
        (nextState: { nameFilter: string; severityFilter: SeverityFilter; page: number; pageSize: number }) => {
            const params = new URLSearchParams(searchParams.toString());
            const normalizedName = nextState.nameFilter.trim();

            if (normalizedName.length > 0) {
                params.set('name', normalizedName);
            } else {
                params.delete('name');
            }

            if (nextState.severityFilter === 'all') {
                params.delete('severity');
            } else {
                params.set('severity', nextState.severityFilter);
            }

            if (nextState.page <= DEFAULT_PAGE) {
                params.delete('page');
            } else {
                params.set('page', String(nextState.page));
            }

            if (nextState.pageSize === DEFAULT_PAGE_SIZE) {
                params.delete('limit');
            } else {
                params.set('limit', String(nextState.pageSize));
            }

            const nextQuery = params.toString();
            const currentQuery = searchParams.toString();

            if (nextQuery === currentQuery) {
                return;
            }

            router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        setCloudAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
    }, []);

    useEffect(() => {
        if (!organizationId || !cloudAccountId || !jobId) {
            setLoading(false);
            setJobError(null);
            return;
        }

        const loadJob = async () => {
            setLoading(true);
            setJobError(null);

            try {
                const jobResponse = await fetchGovernanceJobStatus(organizationId, cloudAccountId, jobId);

                if (jobResponse.status === 401) {
                    toast.error(tc.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }

                const jobPayload = await jobResponse.json().catch(() => null);

                if (!jobResponse.ok) {
                    const message = extractErrorMessage(jobPayload);
                    setJobError(message);
                    toast.error(message);
                    return;
                }

                setJob(jobPayload as GovernanceJob);
            } catch {
                setJobError(tg.loadAnalysisError);
                toast.error(tg.loadAnalysisError);
            } finally {
                setLoading(false);
            }
        };

        void loadJob();
    }, [cloudAccountId, jobId, jobRetryNonce, organizationId, router, tc.sessionExpired, tg.loadAnalysisError]);

    useEffect(() => {
        if (!organizationId || !cloudAccountId || !jobId) {
            setLoadingFindings(false);
            setFindingsError(null);
            return;
        }

        const loadFindings = async () => {
            setLoadingFindings(true);
            setFindingsError(null);

            try {
                const findingsResponse = await fetchGovernanceJobFindings(organizationId, cloudAccountId, jobId, {
                    page,
                    limit: pageSize,
                    name: deferredNameFilter,
                    severity: severityFilter === 'all' ? undefined : severityFilter,
                });

                if (findingsResponse.status === 401) {
                    toast.error(tc.sessionExpired);
                    router.replace('/auth/sign-in');
                    return;
                }

                const findingsPayload = await findingsResponse.json().catch(() => null);

                if (!findingsResponse.ok) {
                    const message = extractErrorMessage(findingsPayload);
                    setFindingsError(message);
                    toast.error(message);
                    return;
                }

                const normalizedResponse = normalizeFindingsResponse(findingsPayload);
                setFindings(normalizedResponse.items);
                setPagination(normalizedResponse.pagination);
            } catch {
                setFindingsError(tg.loadAnalysisError);
                toast.error(tg.loadAnalysisError);
            } finally {
                setLoadingFindings(false);
            }
        };

        void loadFindings();
    }, [cloudAccountId, deferredNameFilter, findingsRetryNonce, jobId, organizationId, page, pageSize, router, severityFilter, tc.sessionExpired, tg.loadAnalysisError]);

    const totalPages = Math.max(1, pagination?.totalPages ?? 1);
    const currentPage = pagination?.page ?? page;
    const filteredTotalItems = pagination?.totalItems ?? findings.length;
    const hasAnyFindings = (job?.totalFindings ?? 0) > 0;

    useEffect(() => {
        if (!pagination) {
            return;
        }

        if (page !== pagination.page || pageSize !== pagination.limit) {
            syncFilterUrlState({
                nameFilter,
                severityFilter,
                page: pagination.page,
                pageSize: pagination.limit,
            });
        }
    }, [nameFilter, page, pageSize, pagination, severityFilter, syncFilterUrlState]);

    if (!jobId) {
        return (
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Análise indisponível
                    </CardTitle>
                    <CardDescription>Selecione uma varredura concluída no histórico para abrir os detalhes.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="outline" onClick={() => router.push('/governance')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar para governança
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (!organizationId || !cloudAccountId) {
        return (
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4" />
                        Contexto não selecionado
                    </CardTitle>
                    <CardDescription>Selecione uma organização e uma conta cloud na barra lateral para visualizar a análise.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col gap-4">
                <div className="h-24 animate-pulse rounded-xl border bg-muted/30" />
                <div className="grid gap-3 sm:grid-cols-3">
                    <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />
                    <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />
                    <div className="h-20 animate-pulse rounded-xl border bg-muted/30" />
                </div>
                <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
            </div>
        );
    }

    if (jobError) {
        return (
            <Card className="border-destructive/35 bg-destructive/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldAlert className="h-4 w-4 text-destructive" />
                        Falha ao carregar análise
                    </CardTitle>
                    <CardDescription className="text-foreground/90">{jobError}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => setJobRetryNonce((value) => value + 1)}>
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        Tentar novamente
                    </Button>
                    <Button variant="ghost" onClick={() => router.push('/governance')}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar para governança
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="mx-auto flex w-full flex-col gap-4">
            <div className="rounded-xl border bg-linear-to-br from-muted/50 via-card to-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                        <p className="flex items-center gap-2 text-sm font-medium">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            Achados da varredura
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {job ? `Executada em ${formatDate(job.createdAt)}.` : 'Detalhes da varredura selecionada.'}
                        </p>
                    </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Card className="border-muted/70 bg-background/80">
                        <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground">Score de governança</p>
                            <p className={`text-2xl font-semibold ${typeof job?.score === 'number' ? scoreColor(job.score) : 'text-muted-foreground'}`}>
                                {job?.score ?? '--'}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-muted/70 bg-background/80">
                        <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground">Achados</p>
                            <p className="text-2xl font-semibold">{job?.totalFindings ?? findings.length}</p>
                        </CardContent>
                    </Card>
                    <Card className="border-muted/70 bg-background/80">
                        <CardContent className="p-4">
                            <p className="text-xs text-muted-foreground">Verificações</p>
                            <p className="text-2xl font-semibold">{job?.totalChecks ?? '--'}</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {!hasAnyFindings && !loadingFindings ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                        <CheckCircle2 className="h-8 w-8 text-green-500" />
                        <p className="text-sm font-medium">Nenhum achado não-conforme</p>
                        <p className="max-w-xl text-xs text-muted-foreground">
                            Todos os recursos avaliados estão em conformidade com as políticas desta varredura.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="rounded-xl border bg-card">
                    <div className="border-b px-4 py-3">
                        <p className="text-sm font-medium">Análise detalhada</p>
                        <p className="text-xs text-muted-foreground">Exibindo achados não-conformes e avisos com recomendações.</p>
                    </div>

                    <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                                <div className="relative w-full sm:max-w-sm">
                                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={nameFilter}
                                        onChange={(event) =>
                                            syncFilterUrlState({
                                                nameFilter: event.target.value,
                                                severityFilter,
                                                page: DEFAULT_PAGE,
                                                pageSize,
                                            })
                                        }
                                        placeholder="Filtrar por nome da política, tipo ou recurso"
                                        className="w-full pr-9 pl-9"
                                    />
                                    {nameFilter.trim().length > 0 && (
                                        <button
                                            type="button"
                                            aria-label="Limpar filtro de texto"
                                            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                            onClick={() =>
                                                syncFilterUrlState({
                                                    nameFilter: '',
                                                    severityFilter,
                                                    page: DEFAULT_PAGE,
                                                    pageSize,
                                                })
                                            }
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between sm:w-44">
                                        <span className="truncate">
                                            {severityFilter === 'all' ? 'Todas as criticidades' : translateGovernanceSeverity(severityFilter)}
                                        </span>
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-44">
                                    <DropdownMenuRadioGroup
                                        value={severityFilter}
                                        onValueChange={(value) =>
                                            syncFilterUrlState({
                                                nameFilter,
                                                severityFilter: value as SeverityFilter,
                                                page: DEFAULT_PAGE,
                                                pageSize,
                                            })
                                        }
                                    >
                                        <DropdownMenuRadioItem value="all">Todas as criticidades</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="critical">{translateGovernanceSeverity('critical')}</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="high">{translateGovernanceSeverity('high')}</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="medium">{translateGovernanceSeverity('medium')}</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="low">{translateGovernanceSeverity('low')}</DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {hasActiveFilters && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-fit"
                                    onClick={() =>
                                        syncFilterUrlState({
                                            nameFilter: '',
                                            severityFilter: 'all',
                                            page: DEFAULT_PAGE,
                                            pageSize,
                                        })
                                    }
                                >
                                    <X className="mr-2 h-4 w-4" />
                                    Limpar filtros
                                </Button>
                            )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>
                                {filteredTotalItems} de {job?.totalFindings ?? findings.length} achados
                            </span>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" className="w-24 justify-between">
                                        <span>{pageSize}/pág.</span>
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-24">
                                    <DropdownMenuRadioGroup
                                        value={String(pageSize)}
                                        onValueChange={(value) =>
                                            syncFilterUrlState({
                                                nameFilter,
                                                severityFilter,
                                                page: DEFAULT_PAGE,
                                                pageSize: Number(value),
                                            })
                                        }
                                    >
                                        {PAGE_SIZE_OPTIONS.map((size) => (
                                            <DropdownMenuRadioItem key={size} value={String(size)}>
                                                {size}/pág.
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    <div className="space-y-3 p-3">
                        {findingsError && !loadingFindings && (
                            <Card className="border-destructive/35 bg-destructive/5">
                                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm font-medium">Erro ao carregar achados</p>
                                        <p className="text-xs text-muted-foreground">{findingsError}</p>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setFindingsRetryNonce((value) => value + 1)}>
                                        <RefreshCcw className="mr-2 h-4 w-4" />
                                        Recarregar
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        {loadingFindings ? (
                            <div className="space-y-3">
                                <div className="h-24 animate-pulse rounded-xl border bg-muted/30" />
                                <div className="h-24 animate-pulse rounded-xl border bg-muted/30" />
                                <div className="h-24 animate-pulse rounded-xl border bg-muted/30" />
                            </div>
                        ) : (
                            findings.map((finding) => (
                            <Card key={finding.id} className={severityToneClass(finding.severity)}>
                                <CardContent className="p-4">
                                    <div className="flex flex-wrap items-start gap-2.5">
                                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${severityDotClass(finding.severity)}`} aria-hidden="true" />
                                        <Badge variant={severityVariant(finding.severity)} className="shrink-0 uppercase text-xs">
                                            {translateGovernanceSeverity(finding.severity)}
                                        </Badge>
                                        <Badge variant="outline" className="shrink-0 text-xs">
                                            {translateGovernanceResourceType(finding.resourceType)}
                                        </Badge>
                                        <span className="min-w-0 truncate text-sm font-medium">{translateGovernancePolicyName(finding.policyName)}</span>
                                    </div>

                                    <p className="mt-2 text-sm text-foreground">{translateGovernanceDescription(finding.description)}</p>

                                    {finding.recommendation && (
                                        <div className="mt-3 flex gap-2 rounded-md border bg-muted/40 px-3 py-2">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                                            <p className="text-xs text-muted-foreground">{translateGovernanceRecommendation(finding.recommendation)}</p>
                                        </div>
                                    )}

                                    <p className="mt-3 text-xs text-muted-foreground">
                                        Recurso: <span className="font-mono break-all">{finding.resourceId}</span>
                                    </p>
                                </CardContent>
                            </Card>
                            ))
                        )}

                        {!loadingFindings && findings.length === 0 && (
                            <Card className="border-dashed">
                                <CardContent className="py-10 text-center">
                                    <p className="text-sm font-medium">Nenhum achado corresponde aos filtros</p>
                                    <p className="mt-1 text-xs text-muted-foreground">Ajuste o nome ou a criticidade para refinar a análise.</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                            Página {currentPage} de {totalPages}
                        </p>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    syncFilterUrlState({
                                        nameFilter,
                                        severityFilter,
                                        page: Math.max(currentPage - 1, DEFAULT_PAGE),
                                        pageSize,
                                    })
                                }
                                disabled={!pagination?.hasPreviousPage}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Anterior
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    syncFilterUrlState({
                                        nameFilter,
                                        severityFilter,
                                        page: Math.min(currentPage + 1, totalPages),
                                        pageSize,
                                    })
                                }
                                disabled={!pagination?.hasNextPage}
                            >
                                Próxima
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
