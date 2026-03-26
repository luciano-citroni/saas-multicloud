export function GovernanceLoadingSkeleton() {
    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
                <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
                <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
            </div>

            <div className="rounded-xl border">
                <div className="h-14 animate-pulse border-b bg-muted/30" />
                <div className="space-y-3 p-4">
                    <div className="h-12 animate-pulse rounded-md bg-muted/30" />
                    <div className="h-12 animate-pulse rounded-md bg-muted/30" />
                    <div className="h-12 animate-pulse rounded-md bg-muted/30" />
                    <div className="h-12 animate-pulse rounded-md bg-muted/30" />
                </div>
            </div>
        </div>
    );
}
