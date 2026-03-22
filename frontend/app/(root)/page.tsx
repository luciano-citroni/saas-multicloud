import { PrivateHome } from '@/components/auth/private-home';
import { House } from 'lucide-react';

export default function HomePage() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <House className="size-5" />
                    Início
                </h1>
                <p className="text-sm text-muted-foreground">Acompanhe as informações da sua sessão autenticada.</p>
            </div>

            <PrivateHome />
        </div>
    );
}
