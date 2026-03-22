import { AccountSecuritySettings } from '@/components/root/settings/account-security-settings';
import { ThemeSelection } from '@/components/root/settings/theme-selector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette } from 'lucide-react';

export default function SettingsPage() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
                <p className="text-sm text-muted-foreground">Gerencie aparência, dados da conta, senha e sessões ativas.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Palette className="size-4" />
                        Aparência
                    </CardTitle>
                    <CardDescription>Escolha o tema da interface.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ThemeSelection />
                </CardContent>
            </Card>

            <AccountSecuritySettings />
        </div>
    );
}
