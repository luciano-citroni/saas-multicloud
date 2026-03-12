'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCloudAccount } from '@/components/root/cloud-accounts/new/form-cloud-account';

export default function NewCloudAccountPage() {
    const [organizationId, setOrganizationId] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const orgId = window.localStorage.getItem('smc_active_organization_id');

        if (!orgId) {
            toast.error('Selecione uma organização antes de conectar uma cloud account.');
            router.replace('/');
            return;
        }

        setOrganizationId(orgId);
    }, [router]);

    if (!organizationId) {
        return null;
    }

    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>Conectar nova cloud account</CardTitle>
                    <CardDescription>Adicione uma conta de cloud à sua organização para começar a gerenciar recursos.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormCloudAccount organizationId={organizationId} />
                </CardContent>
            </Card>
        </div>
    );
}
