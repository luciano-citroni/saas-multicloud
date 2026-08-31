'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { extractErrorMessage } from '@/lib/error-messages';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/sidebar-context';
import { createAutomation } from '@/app/actions/automations';

function getOrgId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
}

function getCloudAccountId(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem('smc_active_cloud_account_id');
}

export function NewAutomationClient() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const orgId = getOrgId();
        const cloudAccountId = getCloudAccountId();

        if (!orgId) {
            toast.error('Selecione uma organização');
            return;
        }
        if (!cloudAccountId) {
            toast.error('Selecione uma conta cloud');
            return;
        }

        setLoading(true);
        try {
            const response = await createAutomation(orgId, {
                name,
                description: description || undefined,
                cloudAccountId,
                cloudProvider: 'AWS',
            });
            const body = await response.json();
            if (!response.ok) {
                toast.error(extractErrorMessage(body as never, 'pt'));
                return;
            }
            const created = body as { id: string };
            toast.success('Automação criada');
            router.push(`/automations/${created.id}`);
        } catch {
            toast.error('Falha ao criar automação');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="mx-auto max-w-lg space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold">Nova automação</h1>
                <p className="text-sm text-muted-foreground">Crie um fluxo de provisionamento AWS</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>
                <Button type="submit" disabled={loading || !name.trim()}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar automação
                </Button>
            </form>
        </div>
    );
}
