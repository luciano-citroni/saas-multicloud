'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Cloud, Layers, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { type OrganizationRole } from '@/lib/organization-rbac';
import { cn } from '@/lib/utils';

type OrgAccessItem = { id: string; name: string; memberRole: string | null };

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organizationId: string;
    userId: string;
    userName: string;
    userEmail: string;
    currentRole: string;
    requesterRole: OrganizationRole;
    onSuccess: () => void;
};

const ROLE_HIERARCHY: Record<string, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };

function getAssignableRoles(requesterRole: OrganizationRole): Array<'ADMIN' | 'MEMBER' | 'VIEWER'> {
    if (requesterRole === 'OWNER') return ['ADMIN', 'MEMBER', 'VIEWER'];
    if (requesterRole === 'ADMIN') return ['MEMBER', 'VIEWER'];
    return [];
}

export function EditUserDialog({ open, onOpenChange, organizationId, userId, userName, userEmail, currentRole, requesterRole, onSuccess }: Props) {
    const t = useTranslations('members');
    const tc = useTranslations('common');

    const [orgAccess, setOrgAccess] = useState<OrgAccessItem[]>([]);
    const [loadingOrgs, setLoadingOrgs] = useState(false);
    const [addingToOrg, setAddingToOrg] = useState<string | null>(null);
    const [removingFromOrg, setRemovingFromOrg] = useState<string | null>(null);
    const [pendingRole, setPendingRole] = useState<Record<string, string>>({});

    const roleSchema = z.object({
        role: z.enum(['ADMIN', 'MEMBER', 'VIEWER'], { message: t.roleRequired }),
    });
    type RoleForm = z.infer<typeof roleSchema>;

    const assignableRoles = getAssignableRoles(requesterRole);
    const canChangeRole =
        assignableRoles.length > 0 && currentRole !== 'OWNER' && (ROLE_HIERARCHY[requesterRole] ?? 0) > (ROLE_HIERARCHY[currentRole] ?? 0);

    const form = useForm<RoleForm>({
        resolver: zodResolver(roleSchema),
        defaultValues: { role: currentRole as 'ADMIN' | 'MEMBER' | 'VIEWER' },
    });
    const [savingRole, setSavingRole] = useState(false);

    const loadOrgAccess = useCallback(async () => {
        setLoadingOrgs(true);
        try {
            const res = await fetch(`/api/organization/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}/orgs`);
            if (!res.ok) {
                toast.error(t.loadOrgAccessError);
                return;
            }
            const data = await res.json().catch(() => null);
            const items = Array.isArray(data)
                ? data
                : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
                  ? (data as { items: OrgAccessItem[] }).items
                  : [];
            setOrgAccess(
                items.filter(
                    (item): item is OrgAccessItem =>
                        typeof item?.id === 'string' && typeof item?.name === 'string' && (item.memberRole === null || typeof item.memberRole === 'string')
                )
            );
        } catch {
            toast.error(t.loadOrgAccessError);
        } finally {
            setLoadingOrgs(false);
        }
    }, [organizationId, userId, t.loadOrgAccessError]);

    useEffect(() => {
        if (open) {
            form.reset({ role: currentRole as 'ADMIN' | 'MEMBER' | 'VIEWER' });
            void loadOrgAccess();
        }
    }, [open, currentRole, form, loadOrgAccess]);

    const onSaveRole = form.handleSubmit(async (data) => {
        setSavingRole(true);
        try {
            const res = await fetch(`/api/organization/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: data.role }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.changeRoleSuccess);
            onSuccess();
        } catch {
            toast.error(t.changeRoleError);
        } finally {
            setSavingRole(false);
        }
    });

    const handleAddToOrg = async (targetOrgId: string) => {
        const role = pendingRole[targetOrgId];
        if (!role) return;
        setAddingToOrg(targetOrgId);
        try {
            const res = await fetch(`/api/organization/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}/add-to-org`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId: targetOrgId, role }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }
            toast.success(t.addToOrgSuccess);
            void loadOrgAccess();
            onSuccess();
        } catch {
            toast.error(t.addToOrgError);
        } finally {
            setAddingToOrg(null);
        }
    };

    const handleRemoveFromOrg = async (targetOrgId: string) => {
        setRemovingFromOrg(targetOrgId);

        try {
            const res = await fetch(
                `/api/organization/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}/orgs/${encodeURIComponent(targetOrgId)}`,
                {
                    method: 'DELETE',
                }
            );
            const body = await res.json().catch(() => null);

            if (!res.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }

            toast.success(t.removeFromOrgSuccess);
            void loadOrgAccess();
            onSuccess();
        } catch {
            toast.error(t.removeFromOrgError);
        } finally {
            setRemovingFromOrg(null);
        }
    };

    const roleLabel = (role: string) => {
        const map: Record<string, string> = { OWNER: t.roleOwner, ADMIN: t.roleAdmin, MEMBER: t.roleMember, VIEWER: t.roleViewer };
        return map[role] ?? role;
    };

    const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
        OWNER: 'default',
        ADMIN: 'secondary',
        MEMBER: 'outline',
        VIEWER: 'outline',
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t.editUser}</DialogTitle>
                    <DialogDescription>
                        {t.editUserDesc} — <span className="font-medium">{userName}</span> <span className="text-muted-foreground">({userEmail})</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-5 pt-1">
                    {/* ── Cargo na org atual ─────────────────────────── */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <div className="flex size-7 items-center justify-center rounded-md border bg-muted/40">
                                <Layers className="size-3.5" aria-hidden="true" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">{t.roleInOrg}</p>
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.orgBadge}</p>
                            </div>
                        </div>
                        {canChangeRole ? (
                            <Form {...form}>
                                <form onSubmit={onSaveRole} className="flex items-end gap-2">
                                    <FormField
                                        control={form.control}
                                        name="role"
                                        render={({ field }) => (
                                            <FormItem className="flex-1">
                                                <FormLabel className="sr-only">{t.inviteRoleLabel}</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {assignableRoles.map((r) => (
                                                            <SelectItem key={r} value={r}>
                                                                {roleLabel(r)}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <Button type="submit" size="sm" isLoading={savingRole}>
                                        {tc.save}
                                    </Button>
                                </form>
                            </Form>
                        ) : (
                            <Badge variant={ROLE_VARIANT[currentRole] ?? 'outline'} className="w-fit">
                                {roleLabel(currentRole)}
                            </Badge>
                        )}
                    </div>

                    <Separator />

                    {/* ── Acesso cross-org ───────────────────────────── */}
                    <div className="flex flex-col gap-3">
                        <div className="space-y-2">
                            <div>
                                <p className="text-sm font-medium">{t.orgAccessTitle}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">{t.orgAccessDesc}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 font-medium text-foreground">
                                    <Layers className="size-3" aria-hidden="true" />
                                    {t.orgBadge}
                                </span>
                                <span aria-hidden="true">→</span>
                                <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5">
                                    <Cloud className="size-3" aria-hidden="true" />
                                    {t.cloudAccountsIncluded}
                                </span>
                                <span className="text-muted-foreground/80">· {t.orgAccessScopeHint}</span>
                            </div>
                        </div>

                        {loadingOrgs ? (
                            <p className="text-sm text-muted-foreground">{tc.loading}</p>
                        ) : orgAccess.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t.loadOrgAccessError}</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {orgAccess.map((org) => (
                                    <div
                                        key={org.id}
                                        className={cn(
                                            'flex flex-col gap-2 rounded-md border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3',
                                            org.memberRole ? 'border-primary/20 bg-primary/5' : 'bg-background'
                                        )}
                                    >
                                        <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                            <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background">
                                                <Layers className="size-3.5" aria-hidden="true" />
                                            </div>
                                            <div className="min-w-0 space-y-0.5">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="truncate text-sm font-medium">{org.name}</span>
                                                    <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                                        {t.orgBadge}
                                                    </span>
                                                </div>
                                                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Cloud className="size-3 shrink-0" aria-hidden="true" />
                                                    <span className="truncate">{t.cloudAccountsIncluded}</span>
                                                </p>
                                            </div>
                                        </div>

                                        {org.memberRole ? (
                                            <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                                <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-500" aria-hidden="true" />
                                                <Badge variant={ROLE_VARIANT[org.memberRole] ?? 'outline'} className="shrink-0">
                                                    {roleLabel(org.memberRole)}
                                                </Badge>
                                                {org.memberRole !== 'OWNER' && (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                                        isLoading={removingFromOrg === org.id}
                                                        disabled={removingFromOrg !== null}
                                                        onClick={() => handleRemoveFromOrg(org.id)}
                                                        title={t.removeFromOrg}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 self-end sm:shrink-0 sm:self-auto">
                                                <Select
                                                    value={pendingRole[org.id] ?? ''}
                                                    onValueChange={(v) => setPendingRole((prev) => ({ ...prev, [org.id]: v }))}
                                                >
                                                    <SelectTrigger className="h-7 w-28 text-xs">
                                                        <SelectValue placeholder={t.selectRoleToAdd} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="ADMIN">{t.roleAdmin}</SelectItem>
                                                        <SelectItem value="MEMBER">{t.roleMember}</SelectItem>
                                                        <SelectItem value="VIEWER">{t.roleViewer}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 gap-1 px-2 text-xs"
                                                    disabled={!pendingRole[org.id] || addingToOrg === org.id}
                                                    isLoading={addingToOrg === org.id}
                                                    onClick={() => handleAddToOrg(org.id)}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                    {t.addToOrg}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-1">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {tc.cancel}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
