'use client';

import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    CalendarClock,
    Database,
    Lightbulb,
    RefreshCw,
    ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Deve espelhar o valor de FINOPS_CONSENT_TERMS no backend (backend/src/finops/constants.ts)
const CONSENT_TERMS = `Ao aceitar este termo, você autoriza o SaaS MultiCloud a consultar as APIs de gestão de custos da(s) sua(s) conta(s) de nuvem (AWS Cost Explorer, Azure Cost Management e/ou GCP Cloud Billing Export via BigQuery). Essas APIs podem gerar custos adicionais de acordo com o modelo de preços do provedor escolhido. Consulte a documentação do provedor para mais informações sobre tarifas.`;

type FinopsConsentDialogProps = {
    open: boolean;
    cloudProvider: string;
    onAccept: () => void;
    onCancel: () => void;
    isLoading?: boolean;
};

type ProviderMeta = {
    shortName: string;
    apiLabel: string;
    badgeClass: string;
    prerequisites: string[];
};

function getProviderMeta(cloudProvider: string): ProviderMeta {
    const provider = cloudProvider.toLowerCase();

    if (provider === 'azure') {
        return {
            shortName: 'Azure',
            apiLabel: 'Azure Cost Management',
            badgeClass: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
            prerequisites: [
                'Service principal com permissão de leitura em Cost Management',
                'Subscription vinculada à conta cloud',
            ],
        };
    }

    if (provider === 'gcp') {
        return {
            shortName: 'GCP',
            apiLabel: 'Cloud Billing Export (BigQuery)',
            badgeClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            prerequisites: [
                'Export de custos do Cloud Billing habilitado no BigQuery',
                'Service account com bigquery.jobUser e bigquery.dataViewer',
            ],
        };
    }

    return {
        shortName: 'AWS',
        apiLabel: 'AWS Cost Explorer',
        badgeClass: 'border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300',
        prerequisites: [
            'Role com permissão ce:GetCostAndUsage',
            'Trust para a conta da plataforma (AssumeRole)',
        ],
    };
}

const AFTER_ACCEPT_STEPS = [
    {
        icon: CalendarClock,
        title: 'Histórico de 3 meses',
        description: 'Coleta automática dos últimos 90 dias.',
    },
    {
        icon: Database,
        title: 'Custos agregados',
        description: 'Dados por serviço e região no painel.',
    },
    {
        icon: Lightbulb,
        title: 'Recomendações',
        description: 'Sugestões com base no inventário.',
    },
    {
        icon: RefreshCw,
        title: 'Sync diário',
        description: 'Atualizações automáticas todos os dias.',
    },
] as const;

export function FinopsConsentDialog({
    open,
    cloudProvider,
    onAccept,
    onCancel,
    isLoading = false,
}: FinopsConsentDialogProps) {
    const [checked, setChecked] = useState(false);
    const provider = getProviderMeta(cloudProvider);

    useEffect(() => {
        if (open) setChecked(false);
    }, [open, cloudProvider]);

    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen && !isLoading) {
            setChecked(false);
            onCancel();
        }
    };

    const handleAccept = () => {
        if (!checked || isLoading) return;
        onAccept();
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="flex max-h-[min(92vh,720px)] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg md:max-w-xl"
            >
                <DialogHeader className="gap-2 border-b px-4 py-4 text-left sm:px-5 sm:py-5">
                    <div className="flex items-start gap-2.5 sm:gap-3">
                        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 sm:size-9">
                            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 sm:size-[1.125rem]" />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                            <DialogTitle className="text-left text-base leading-snug sm:text-lg">
                                Termo de consentimento — FinOps
                            </DialogTitle>
                            <DialogDescription className="text-left text-xs leading-relaxed sm:text-sm">
                                Autorize a coleta de custos via{' '}
                                <span className="font-medium text-foreground">{provider.apiLabel}</span> para
                                liberar o painel FinOps.
                            </DialogDescription>
                            <div
                                className={cn(
                                    'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]',
                                    provider.badgeClass
                                )}
                            >
                                {provider.shortName}
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-5">
                    <section className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                            Termo
                        </p>
                        <div className="rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                            {CONSENT_TERMS}
                        </div>
                    </section>

                    <section className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                            Pré-requisitos ({provider.shortName})
                        </p>
                        <ul className="space-y-2 rounded-lg border p-3 text-xs text-muted-foreground sm:text-sm">
                            {provider.prerequisites.map((item) => (
                                <li key={item} className="flex gap-2.5">
                                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-foreground/40" />
                                    <span className="leading-relaxed">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="space-y-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
                            Após aceitar
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {AFTER_ACCEPT_STEPS.map((step) => (
                                <div
                                    key={step.title}
                                    className="flex gap-3 rounded-lg border p-3 sm:flex-col sm:gap-0"
                                >
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted sm:mb-2 sm:size-7">
                                        <step.icon className="size-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium leading-tight">{step.title}</p>
                                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <p>
                            Credenciais nunca são expostas no frontend. Só custos agregados são armazenados. Você
                            pode revogar o consentimento a qualquer momento.
                        </p>
                    </div>

                    <div className="flex items-start gap-3 rounded-lg border bg-background p-3">
                        <Checkbox
                            id="finops-consent-checkbox"
                            checked={checked}
                            onCheckedChange={(value) => setChecked(value === true)}
                            disabled={isLoading}
                            className="mt-0.5 shrink-0"
                        />
                        <Label
                            htmlFor="finops-consent-checkbox"
                            className="flex-1 cursor-pointer text-xs font-normal leading-relaxed sm:text-sm"
                        >
                            Li e aceito o termo e autorizo a coleta de custos desta conta via{' '}
                            <span className="font-medium text-foreground">{provider.apiLabel}</span>.
                        </Label>
                    </div>
                </div>

                <DialogFooter className="mx-0 mb-0 w-full flex-col-reverse gap-2 rounded-none border-t bg-muted/50 p-4 sm:flex-row sm:justify-end sm:px-5">
                    <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => handleOpenChange(false)}
                        disabled={isLoading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        className="w-full sm:w-auto"
                        onClick={handleAccept}
                        disabled={!checked || isLoading}
                        isLoading={isLoading}
                    >
                        Aceitar e sincronizar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
