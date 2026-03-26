import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { GovernanceJob } from '@/components/root/governance/overview/types';

export function JobStatusIcon({ status }: { status: GovernanceJob['status'] }) {
    switch (status) {
        case 'completed':
            return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />;
        case 'failed':
            return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
        case 'running':
        case 'pending':
            return <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />;
    }
}

export function JobStatusBadge({ status }: { status: GovernanceJob['status'] }) {
    const map: Record<GovernanceJob['status'], { label: string; variant: 'secondary' | 'outline' | 'destructive' | 'default' }> = {
        pending: { label: 'Aguardando', variant: 'outline' },
        running: { label: 'Em andamento', variant: 'secondary' },
        completed: { label: 'Concluído', variant: 'default' },
        failed: { label: 'Falhou', variant: 'destructive' },
    };

    const { label, variant } = map[status];
    return (
        <Badge variant={variant} className="text-xs">
            {label}
        </Badge>
    );
}
