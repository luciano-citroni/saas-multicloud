'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCreateOrganization } from '@/components/root/tenant/organizations/form-create-organization';

export default function NewTenantOrganizationPage() {
    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>Criar organização</CardTitle>
                    <CardDescription>Agrupe contas cloud dentro do tenant ativo.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormCreateOrganization />
                </CardContent>
            </Card>
        </div>
    );
}
