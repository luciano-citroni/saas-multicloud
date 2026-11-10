import { Suspense } from 'react';
import { AppSidebar } from '@/components/sidebar/app-sidebar';
import { ModuleAccessGuard } from '@/components/root/module-access-guard';
import { AiChatDrawer } from '@/components/root/ai-chat/ai-chat-drawer';
import { EmailVerificationBanner } from '@/components/root/email-verification-banner';
import { SiteHeader } from '@/components/sidebar/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function AuthenticatedLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <SidebarProvider
            style={
                {
                    '--sidebar-width': 'calc(var(--spacing) * 72)',
                    '--header-height': 'calc(var(--spacing) * 12)',
                } as React.CSSProperties
            }
        >
            <ModuleAccessGuard />
            <AppSidebar variant="inset" />
            <SidebarInset className="min-h-0">
                <Suspense fallback={null}>
                    <SiteHeader />
                </Suspense>
                <EmailVerificationBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="@container/main flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4 md:gap-6 md:py-6 lg:px-6">
                            {children}
                        </div>
                    </div>
                </div>
            </SidebarInset>
            <AiChatDrawer />
        </SidebarProvider>
    );
}
