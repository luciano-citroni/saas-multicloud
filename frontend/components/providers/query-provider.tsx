'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { bindQueryInvalidationToSidebarEvents } from '@/lib/queries/invalidate';

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60_000,
                gcTime: 5 * 60_000,
                refetchOnWindowFocus: false,
                retry: 1,
            },
        },
    });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
    const [client] = React.useState(() => makeQueryClient());

    React.useEffect(() => bindQueryInvalidationToSidebarEvents(client), [client]);

    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
