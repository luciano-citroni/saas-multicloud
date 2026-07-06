'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormCreateTenant } from '@/components/root/tenant/new/form-create-tenant';
import { useTranslations } from '@/lib/i18n';

export default function NewTenantPage() {
    const to = useTranslations('organizations');

    return (
        <div className="mx-auto w-full max-w-2xl">
            <Card>
                <CardHeader>
                    <CardTitle>{to.newTenantTitle}</CardTitle>
                    <CardDescription>{to.newTenantDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                    <FormCreateTenant />
                </CardContent>
            </Card>
        </div>
    );
}
