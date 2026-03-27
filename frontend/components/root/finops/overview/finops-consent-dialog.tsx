'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

// Deve espelhar o valor de FINOPS_CONSENT_TERMS no backend (backend/src/finops/constants.ts)
const CONSENT_TERMS = `Ao aceitar este termo, você autoriza o SaaS MultiCloud a consultar as APIs de gestão de custos da(s) sua(s) conta(s) de nuvem (AWS Cost Explorer e/ou Azure Cost Management). Essas APIs podem gerar custos adicionais de acordo com o modelo de preços do provedor escolhido. Consulte a documentação do provedor para mais informações sobre tarifas.`;

type FinopsConsentDialogProps = {
    open: boolean;
    cloudProvider: string;
    onAccept: () => void;
    onCancel: () => void;
    isLoading?: boolean;
};

export function FinopsConsentDialog({ open, cloudProvider, onAccept, onCancel, isLoading = false }: FinopsConsentDialogProps) {
    const [checked, setChecked] = useState(false);

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

    const providerLabel = cloudProvider === 'azure' ? 'Azure Cost Management' : 'AWS Cost Explorer';

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="size-5 shrink-0 text-yellow-500" />
                        <DialogTitle>Termo de consentimento — FinOps</DialogTitle>
                    </div>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Provider info */}
                    <p className="text-sm text-muted-foreground">
                        Para coletar dados de custo desta conta via{' '}
                        <span className="font-medium text-foreground">{providerLabel}</span>, você
                        precisa ler e aceitar o termo abaixo.
                    </p>

                    {/* Terms text */}
                    <div className="max-h-44 overflow-y-auto rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
                        {CONSENT_TERMS}
                    </div>

                    {/* What will happen */}
                    <div className="rounded-lg border p-3 text-xs text-muted-foreground space-y-1.5">
                        <p className="font-medium text-foreground">O que acontece após aceitar:</p>
                        <ul className="list-disc list-inside space-y-1 pl-1">
                            <li>Coleta histórica dos últimos 3 meses será iniciada automaticamente</li>
                            <li>Dados de custo por serviço e região serão armazenados</li>
                            <li>Recomendações de otimização serão geradas</li>
                            <li>Sincronizações diárias automáticas serão ativadas</li>
                        </ul>
                        <p className="pt-1">
                            Nenhuma credencial é exposta. Apenas dados de custo agregados são armazenados.
                            O consentimento pode ser revogado a qualquer momento.
                        </p>
                    </div>

                    {/* Checkbox */}
                    <div className="flex items-start gap-3">
                        <Checkbox
                            id="finops-consent-checkbox"
                            checked={checked}
                            onCheckedChange={(value) => setChecked(value === true)}
                            disabled={isLoading}
                            className="mt-0.5"
                        />
                        <Label
                            htmlFor="finops-consent-checkbox"
                            className="cursor-pointer text-sm leading-relaxed"
                        >
                            Li e aceito os termos acima e autorizo a coleta de dados de custo desta
                            conta via <span className="font-medium">{providerLabel}</span>.
                        </Label>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button onClick={handleAccept} disabled={!checked || isLoading} isLoading={isLoading}>
                        Aceitar e sincronizar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
