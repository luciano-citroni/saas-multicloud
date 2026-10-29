import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { LocaleProvider } from '@/components/providers/locale-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin'],
});

const geistMono = Geist_Mono({
    variable: '--font-geist-mono',
    subsets: ['latin'],
});

export const metadata: Metadata = {
    title: {
        default: 'Bridge MultCloud | Governanca, custos e automacao multi-cloud',
        template: '%s | Bridge MultCloud',
    },
    description: 'Centralize governanca, custos e automacoes de AWS, Azure e GCP em uma unica operacao.',
    applicationName: 'Bridge MultCloud',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="pt-BR" suppressHydrationWarning>
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
                    <LocaleProvider>
                        <QueryProvider>
                            <TooltipProvider>
                                {children}
                                <Toaster />
                            </TooltipProvider>
                        </QueryProvider>
                    </LocaleProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
