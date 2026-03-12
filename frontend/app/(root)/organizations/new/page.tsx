'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormOrganization } from '@/components/root/organizations/new/form-organization';

export default function NewOrganizationPage() {
    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>Criar nova organização</CardTitle>
                    <CardDescription>Preencha os dados abaixo para criar e ativar uma nova organização.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormOrganization />
                </CardContent>
            </Card>
        </div>
    );
}
