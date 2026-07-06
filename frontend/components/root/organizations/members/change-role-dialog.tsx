'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import type { OrganizationRole } from '@/lib/organization-rbac';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationId: string;
    userId: string;
    currentRole: string;
    userName: string;
    requesterRole: OrganizationRole;
    onSuccess: () => void;
};

function getAvailableRoles(requesterRole: OrganizationRole): Array<'ADMIN' | 'MEMBER' | 'VIEWER'> {
    if (requesterRole === 'OWNER') return ['ADMIN', 'MEMBER', 'VIEWER'];
    if (requesterRole === 'ADMIN') return ['MEMBER', 'VIEWER'];
    return [];
}

export function ChangeRoleDialog({ open, onOpenChange, organizationId, userId, currentRole, userName, requesterRole, onSuccess }: Props) {
    const t = useTranslations('members');
    const tc = useTranslations('common');

    const schema = z.object({
        role: z.enum(['ADMIN', 'MEMBER', 'VIEWER'], { message: t.roleRequired }),
    });
    type FormValues = z.infer<typeof schema>;

    const availableRoles = getAvailableRoles(requesterRole);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { role: currentRole as 'ADMIN' | 'MEMBER' | 'VIEWER' },
    });

    const [isLoading, setIsLoading] = useState(false);

    const onSubmit = form.handleSubmit(async (data) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/organization/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: data.role }),
            });
            const body = await response.json().catch(() => null);

            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }

            toast.success(t.changeRoleSuccess);
            onOpenChange(false);
            onSuccess();
        } catch {
            toast.error(t.changeRoleError);
        } finally {
            setIsLoading(false);
        }
    });

    const roleLabels: Record<string, string> = {
        ADMIN: t.roleAdmin,
        MEMBER: t.roleMember,
        VIEWER: t.roleViewer,
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t.changeRoleTitle}</DialogTitle>
                    <DialogDescription>
                        {t.changeRoleDesc} <span className="font-medium">{userName}</span>
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={onSubmit} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t.inviteRoleLabel}</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {availableRoles.map((role) => (
                                                <SelectItem key={role} value={role}>
                                                    {roleLabels[role]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                {tc.cancel}
                            </Button>
                            <Button type="submit" isLoading={isLoading}>
                                {tc.save}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
