'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

const ACTIVE_CLOUD_GLOBAL_KEY = 'smc_active_cloud_account_id';

function normalizeFindings(payload: unknown): GovernanceFinding[] {
    const items = Array.isArray(payload) ? payload : Array.isArray((payload as { items?: unknown })?.items) ? (payload as { items: unknown[] }).items : [];

    return items.filter((item): item is GovernanceFinding => typeof (item as GovernanceFinding)?.id === 'string');
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

function severityBorderClass(severity: GovernanceFinding['severity']): string {
    switch (severity) {
        case 'critical':
            return 'border-l-destructive';
        case 'high':
            return 'border-l-orange-500';
        case 'medium':
            return 'border-l-amber-500';
        default:
            return 'border-l-emerald-500';
    }
}

export function GovernanceAnalysis() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const jobId = useMemo(() => searchParams.get('jobId'), [searchParams]);

    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const [cloudAccountId, setCloudAccountId] = useState<string | null>(null);

    const [job, setJob] = useState<GovernanceJob | null>(null);
    const [findings, setFindings] = useState<GovernanceFinding[]>([]);

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setOrganizationId(window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY));
        setCloudAccountId(window.localStorage.getItem(ACTIVE_CLOUD_GLOBAL_KEY));
    }, []);

    useEffect(() => {
        if (!organizationId || !cloudAccountId || !jobId) {
            setLoading(false);
            return;
        }

        const loadData = async () => {
            setLoading(true);

            try {
                const [jobResponse, findingsResponse] = await Promise.all([
                    fetchGovernanceJobStatus(organizationId, cloudAccountId, jobId),
                    fetchGovernanceJobFindings(organizationId, cloudAccountId, jobId),
                ]);

                if (jobResponse.status === 401 || findingsResponse.status === 401) {
                    toast.error('Sua sessão expirou.');
                    router.replace('/auth/sign-in');
                    return;
                }

                const jobPayload = await jobResponse.json().catch(() => null);
                const findingsPayload = await findingsResponse.json().catch(() => null);

                if (!jobResponse.ok) {
                    toast.error(extractErrorMessage(jobPayload, 'pt'));
                } else {
                    setJob(jobPayload as GovernanceJob);
                }

                if (!findingsResponse.ok) {
                    toast.error(extractErrorMessage(findingsPayload, 'pt'));
                } else {
                    setFindings(normalizeFindings(findingsPayload));
                }
            } catch {
                toast.error('Não foi possível carregar a análise da varredura.');
            } finally {
                setLoading(false);
            }
        };

        void loadData();
    }, [organizationId, cloudAccountId, jobId, router]);

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

            {findings.length === 0 ? (
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

                    <div className="space-y-3 p-3">
                        {findings.map((finding) => (
                            <Card key={finding.id} className={`border-l-4 ${severityBorderClass(finding.severity)}`}>
                                <CardContent className="p-4">
                                    <div className="flex flex-wrap items-start gap-2">
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
                                        Recurso: <span className="font-mono">{finding.resourceId}</span>
                                    </p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
