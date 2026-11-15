import { BillingPlansRules } from '@/components/root/billing/billing-plans-rules';
import { BillingLoadingSkeleton } from '@/components/root/billing/billing-loading-skeleton';
import { CreditCard } from 'lucide-react';
import { Suspense } from 'react';

export default function BillingPage() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="min-w-0 space-y-1">
                <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight">
                    <CreditCard className="size-5" />
                    <span className="truncate">Billing</span>
                </h1>
                <p className="text-sm text-muted-foreground">Acompanhe o plano atual da organização e gerencie mudanças de assinatura.</p>
            </div>

            <Suspense fallback={<BillingLoadingSkeleton />}>
                <BillingPlansRules />
            </Suspense>
        </div>
    );
}
