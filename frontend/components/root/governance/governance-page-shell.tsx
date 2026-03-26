import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

type GovernancePageShellProps = {
    description: string;
    children: ReactNode;
};

export function GovernancePageShell({ description, children }: GovernancePageShellProps) {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <ShieldCheck className="size-5" />
                    Governança
                </h1>
                <p className="text-sm text-muted-foreground">{description}</p>
            </div>

            {children}
        </div>
    );
}
