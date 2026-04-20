'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Layers, DollarSign, CreditCard, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AutomationBuilder } from '@/components/root/automation/automation-builder';
import { CostEstimationPanel } from '@/components/root/automation/cost-estimation-panel';
import { PricingModelSelector } from '@/components/root/automation/pricing-model-selector';
import { ExecutionConfirmation } from '@/components/root/automation/execution-confirmation';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import type { FlowDefinition, PricingModel, CostEstimateResponse, AutomationExecution } from '@/app/actions/automation';
import { estimateAutomationCost, runAutomation } from '@/app/actions/automation';
import { cn } from '@/lib/utils';

type Step = 'builder' | 'estimate' | 'pricing' | 'confirm' | 'done';

const STEPS: { id: Step; label: string; icon: React.ElementType }[] = [
    { id: 'builder', label: 'Builder', icon: Layers },
    { id: 'estimate', label: 'Estimativa', icon: DollarSign },
    { id: 'pricing', label: 'Pricing', icon: CreditCard },
    { id: 'confirm', label: 'Confirmar', icon: CheckCircle2 },
];

const STEP_ORDER: Step[] = ['builder', 'estimate', 'pricing', 'confirm', 'done'];

function getActiveOrg(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

function getActiveCloudAccount(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('smc_active_cloud_account_id');
}

export default function AutomationPage() {
    const [currentStep, setCurrentStep] = useState<Step>('builder');
    const [flow, setFlow] = useState<FlowDefinition>({ nodes: [], edges: [] });
    const [estimate, setEstimate] = useState<CostEstimateResponse | null>(null);
    const [pricingModel, setPricingModel] = useState<PricingModel>('ON_DEMAND');
    const [isLoading, setIsLoading] = useState(false);
    const [executionResult, setExecutionResult] = useState<AutomationExecution | null>(null);

    const stepIndex = STEP_ORDER.indexOf(currentStep);

    async function goToEstimate() {
        if (flow.nodes.length === 0) {
            toast.error('Adicione ao menos um recurso ao fluxo antes de continuar.');
            return;
        }

        const unconfigured = flow.nodes.filter((n) => {
            const config = n.config as Record<string, unknown>;
            if (n.type === 's3') return !config.bucketName || String(config.bucketName).length < 3;
            if (n.type === 'rds') return !config.dbInstanceIdentifier || !config.masterUserPassword;
            if (n.type === 'lambda') return !config.functionName || !config.roleArn;
            return false;
        });

        if (unconfigured.length > 0) {
            toast.error(`Configure todos os recursos antes de continuar. ${unconfigured.length} recurso(s) incompleto(s).`);
            return;
        }

        const organizationId = getActiveOrg();
        const cloudAccountId = getActiveCloudAccount();

        if (!organizationId) {
            toast.error('Selecione uma organização na sidebar antes de continuar.');
            return;
        }
        if (!cloudAccountId) {
            toast.error('Selecione uma conta cloud na sidebar antes de continuar.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await estimateAutomationCost(flow, cloudAccountId, organizationId);
            const body = (await response.json()) as CostEstimateResponse;
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            setEstimate(body);
            setCurrentStep('estimate');
        } catch {
            toast.error('Falha ao calcular estimativa de custo.');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleProvision() {
        const organizationId = getActiveOrg();
        const cloudAccountId = getActiveCloudAccount();

        if (!organizationId || !cloudAccountId) {
            toast.error('Organização ou conta cloud não selecionada.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await runAutomation(flow, pricingModel, cloudAccountId, organizationId);
            const body = (await response.json()) as AutomationExecution;
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            setExecutionResult(body);
            setCurrentStep('done');
            toast.success('Infraestrutura provisionada com sucesso!');
        } catch {
            toast.error('Falha ao provisionar a infraestrutura.');
        } finally {
            setIsLoading(false);
        }
    }

    function goBack() {
        const prevIndex = stepIndex - 1;
        if (prevIndex >= 0) setCurrentStep(STEP_ORDER[prevIndex]);
    }

    return (
        <div className="w-full space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold">Automação de Infraestrutura</h1>
                <p className="text-sm text-muted-foreground">
                    Construa fluxos visuais, estime custos com FinOps integrado e provisione recursos AWS com um clique.
                </p>
            </div>

            {/* Step indicator */}
            {currentStep !== 'done' && (
                <div className="flex items-center gap-0">
                    {STEPS.map((step, idx) => {
                        const isCurrent = step.id === currentStep;
                        const isDone = STEP_ORDER.indexOf(step.id) < stepIndex;
                        const Icon = step.icon;

                        return (
                            <React.Fragment key={step.id}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                                            isCurrent && 'border-primary bg-primary text-primary-foreground',
                                            isDone && 'border-primary bg-primary/10 text-primary',
                                            !isCurrent && !isDone && 'border-muted text-muted-foreground'
                                        )}
                                    >
                                        {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                                    </div>
                                    <span className={cn('text-sm font-medium', isCurrent ? 'text-foreground' : 'text-muted-foreground')}>
                                        {step.label}
                                    </span>
                                </div>
                                {idx < STEPS.length - 1 && <div className={cn('mx-3 h-px flex-1', isDone ? 'bg-primary' : 'bg-border')} />}
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            {/* Step content */}
            <div className="rounded-xl border bg-card">
                {currentStep === 'builder' && (
                    <>
                        <div className="border-b px-6 py-4">
                            <h2 className="font-semibold">1. Construa seu fluxo</h2>
                            <p className="text-sm text-muted-foreground">
                                Adicione recursos AWS da paleta e conecte-os para definir a ordem de provisionamento.
                            </p>
                        </div>
                        <div className="p-6">
                            <AutomationBuilder
                                onFlowChange={setFlow}
                                cloudAccountId={getActiveCloudAccount() ?? ''}
                                organizationId={getActiveOrg() ?? ''}
                            />
                        </div>
                        <div className="flex justify-end border-t px-6 py-4">
                            <Button onClick={goToEstimate} disabled={isLoading || flow.nodes.length === 0}>
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Estimar Custo
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </>
                )}

                {currentStep === 'estimate' && estimate && (
                    <>
                        <div className="border-b px-6 py-4">
                            <h2 className="font-semibold">2. Estimativa de Custo</h2>
                            <p className="text-sm text-muted-foreground">Comparação dos 3 modelos de precificação AWS para os recursos do seu fluxo.</p>
                        </div>
                        <div className="p-6">
                            <CostEstimationPanel estimate={estimate} />
                        </div>
                        <div className="flex justify-between border-t px-6 py-4">
                            <Button variant="outline" onClick={goBack}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Voltar
                            </Button>
                            <Button onClick={() => setCurrentStep('pricing')}>
                                Escolher Modelo
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </>
                )}

                {currentStep === 'pricing' && estimate && (
                    <>
                        <div className="border-b px-6 py-4">
                            <h2 className="font-semibold">3. Escolha o Modelo de Preço</h2>
                            <p className="text-sm text-muted-foreground">Selecione o modelo que melhor se adapta ao seu caso de uso.</p>
                        </div>
                        <div className="p-6">
                            <PricingModelSelector selected={pricingModel} onChange={setPricingModel} totals={estimate.totals} />
                        </div>
                        <div className="flex justify-between border-t px-6 py-4">
                            <Button variant="outline" onClick={goBack}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Voltar
                            </Button>
                            <Button onClick={() => setCurrentStep('confirm')}>
                                Revisar e Confirmar
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </>
                )}

                {currentStep === 'confirm' && estimate && (
                    <>
                        <div className="border-b px-6 py-4">
                            <h2 className="font-semibold">4. Confirmar Provisionamento</h2>
                            <p className="text-sm text-muted-foreground">Revise os recursos e confirme para iniciar o provisionamento na AWS.</p>
                        </div>
                        <div className="p-6">
                            <ExecutionConfirmation
                                flow={flow}
                                pricingModel={pricingModel}
                                estimate={estimate}
                                cloudAccountId={getActiveCloudAccount() ?? ''}
                            />
                        </div>
                        <div className="flex justify-between border-t px-6 py-4">
                            <Button variant="outline" onClick={goBack}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Voltar
                            </Button>
                            <Button onClick={handleProvision} disabled={isLoading} className="bg-primary">
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Provisionando...
                                    </>
                                ) : (
                                    <>
                                        <Play className="mr-2 h-4 w-4" />
                                        Provisionar Infraestrutura
                                    </>
                                )}
                            </Button>
                        </div>
                    </>
                )}

                {currentStep === 'done' && executionResult && (
                    <div className="flex flex-col items-center gap-4 p-12 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">Infraestrutura Provisionada!</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Execução <span className="font-mono text-xs">{executionResult.id}</span> concluída.
                            </p>
                        </div>
                        <div className="mt-2 w-full max-w-sm rounded-xl border p-4 text-left space-y-2">
                            {executionResult.resources?.map((r) => (
                                <div key={r.id} className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{r.resourceType.toUpperCase()}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs text-muted-foreground">{r.awsResourceId ?? '—'}</span>
                                        <span
                                            className={cn(
                                                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                                                r.status === 'PROVISIONED'
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                                    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                            )}
                                        >
                                            {r.status}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setCurrentStep('builder');
                                setFlow({ nodes: [], edges: [] });
                                setEstimate(null);
                                setPricingModel('ON_DEMAND');
                                setExecutionResult(null);
                            }}
                        >
                            Criar Novo Fluxo
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

