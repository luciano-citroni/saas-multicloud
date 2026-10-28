import { cn } from '@/lib/utils';

const SUCCESS =
    'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
const FAILURE =
    'border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive';
const WARNING =
    'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
const NEUTRAL = 'border-transparent bg-muted text-muted-foreground';
const INFO =
    'border-transparent bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary';

export function executionStatusClass(status: string): string {
    switch (status) {
        case 'SUCCESS':
        case 'COMPLETED':
            return SUCCESS;
        case 'FAILED':
            return FAILURE;
        case 'ROLLED_BACK':
        case 'SKIPPED':
        case 'CANCELLED':
            return WARNING;
        case 'RUNNING':
        case 'PENDING':
            return INFO;
        default:
            return NEUTRAL;
    }
}

export function workflowStatusClass(status: string): string {
    switch (status) {
        case 'ACTIVE':
            return SUCCESS;
        case 'INACTIVE':
            return WARNING;
        case 'DRAFT':
            return NEUTRAL;
        default:
            return NEUTRAL;
    }
}

export function provisionedStatusClass(status: string): string {
    switch (status) {
        case 'PROVISIONED':
            return SUCCESS;
        case 'FAILED':
            return FAILURE;
        case 'ROLLED_BACK':
            return WARNING;
        case 'PENDING':
            return INFO;
        default:
            return NEUTRAL;
    }
}

export function statusBadgeClass(status: string, kind: 'execution' | 'workflow' | 'node' | 'resource' = 'execution'): string {
    if (kind === 'workflow') return cn(workflowStatusClass(status));
    if (kind === 'resource') return cn(provisionedStatusClass(status));
    return cn(executionStatusClass(status));
}
