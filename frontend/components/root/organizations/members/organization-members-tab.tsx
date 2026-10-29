'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pencil, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConfirmDeleteDialog } from '@/components/ui/confirm-delete-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { extractErrorMessage } from '@/lib/error-messages';
import { useTranslations } from '@/lib/i18n';
import { hasRequiredOrganizationRole, type OrganizationRole } from '@/lib/organization-rbac';
import { InviteMemberDialog } from './invite-member-dialog';
import { EditUserDialog } from './edit-user-dialog';

type MemberUser = { id: string; name: string; email: string };
type Member = { id: string; userId: string; organizationId: string; role: string; joinedAt: string; user: MemberUser };
type Invite = { id: string; email: string; role: string; status: string; expiresAt: string; createdAt: string };

type Props = {
    organizationId: string;
    currentRole: OrganizationRole;
    currentUserId?: string;
};

const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    OWNER: 'default',
    ADMIN: 'secondary',
    MEMBER: 'outline',
    VIEWER: 'outline',
};

export function OrganizationMembersTab({ organizationId, currentRole, currentUserId }: Props) {
    const t = useTranslations('members');
    const tc = useTranslations('common');

    const [members, setMembers] = useState<Member[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(true);
    const [loadingInvites, setLoadingInvites] = useState(true);

    const [removingId, setRemovingId] = useState<string | null>(null);
    const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
    const [editingMember, setEditingMember] = useState<Member | null>(null);

    const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
    const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
    const [inviteToCancel, setInviteToCancel] = useState<Invite | null>(null);

    const canManage = hasRequiredOrganizationRole(currentRole, 'ADMIN');

    const [memberNameFilter, setMemberNameFilter] = useState('');
    const [memberRoleFilter, setMemberRoleFilter] = useState('ALL');
    const [memberPageIndex, setMemberPageIndex] = useState(0);
    const [memberPageSize, setMemberPageSize] = useState(10);

    const [inviteEmailFilter, setInviteEmailFilter] = useState('');
    const [inviteRoleFilter, setInviteRoleFilter] = useState('ALL');
    const [invitePageIndex, setInvitePageIndex] = useState(0);
    const [invitePageSize, setInvitePageSize] = useState(10);

    const filteredMembers = useMemo(() => {
        let result = members;
        const q = memberNameFilter.trim().toLowerCase();
        if (q) result = result.filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q));
        if (memberRoleFilter !== 'ALL') result = result.filter((m) => m.role === memberRoleFilter);
        return result;
    }, [members, memberNameFilter, memberRoleFilter]);

    const memberTotalPages = Math.ceil(filteredMembers.length / memberPageSize) || 1;
    const paginatedMembers = filteredMembers.slice(memberPageIndex * memberPageSize, (memberPageIndex + 1) * memberPageSize);

    const filteredInvites = useMemo(() => {
        let result = invites;
        const q = inviteEmailFilter.trim().toLowerCase();
        if (q) result = result.filter((i) => i.email.toLowerCase().includes(q));
        if (inviteRoleFilter !== 'ALL') result = result.filter((i) => i.role === inviteRoleFilter);
        return result;
    }, [invites, inviteEmailFilter, inviteRoleFilter]);

    const inviteTotalPages = Math.ceil(filteredInvites.length / invitePageSize) || 1;
    const paginatedInvites = filteredInvites.slice(invitePageIndex * invitePageSize, (invitePageIndex + 1) * invitePageSize);

    const loadMembers = useCallback(async () => {
        setLoadingMembers(true);
        try {
            const res = await fetch(`/api/organization/${encodeURIComponent(organizationId)}/members`);
            if (!res.ok) { toast.error(t.loadError); return; }
            const data = await res.json().catch(() => []);
            setMembers(Array.isArray(data) ? data : []);
        } catch {
            toast.error(t.loadError);
        } finally {
            setLoadingMembers(false);
        }
    }, [organizationId, t.loadError]);

    const loadInvites = useCallback(async () => {
        setLoadingInvites(true);
        try {
            const res = await fetch(`/api/organization/${encodeURIComponent(organizationId)}/members/invites`);
            if (!res.ok) { toast.error(t.loadInvitesError); return; }
            const data = await res.json().catch(() => []);
            setInvites(Array.isArray(data) ? data : []);
        } catch {
            toast.error(t.loadInvitesError);
        } finally {
            setLoadingInvites(false);
        }
    }, [organizationId, t.loadInvitesError]);

    useEffect(() => {
        void loadMembers();
        void loadInvites();
    }, [loadMembers, loadInvites]);

    const handleRemove = async (): Promise<boolean> => {
        if (!memberToRemove) return true;
        setRemovingId(memberToRemove.userId);
        try {
            const res = await fetch(
                `/api/organization/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(memberToRemove.userId)}`,
                { method: 'DELETE' },
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                toast.error(extractErrorMessage(body));
                return false;
            }
            toast.success(t.removeMemberSuccess);
            void loadMembers();
            setMemberToRemove(null);
            return true;
        } catch {
            toast.error(t.removeMemberError);
            return false;
        } finally {
            setRemovingId(null);
        }
    };

    const handleResendInvite = async (invite: Invite) => {
        setResendingInviteId(invite.id);
        try {
            const res = await fetch(
                `/api/organization/${encodeURIComponent(organizationId)}/members/invites/${encodeURIComponent(invite.id)}`,
                { method: 'POST' },
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) { toast.error(extractErrorMessage(body)); return; }
            toast.success('Convite reenviado com sucesso!');
            void loadInvites();
        } catch {
            toast.error('Erro ao reenviar convite.');
        } finally {
            setResendingInviteId(null);
        }
    };

    const handleCancelInvite = async () => {
        if (!inviteToCancel) return;
        setCancellingInviteId(inviteToCancel.id);
        try {
            const res = await fetch(
                `/api/organization/${encodeURIComponent(organizationId)}/members/invites/${encodeURIComponent(inviteToCancel.id)}`,
                { method: 'DELETE' },
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) { toast.error(extractErrorMessage(body)); return; }
            toast.success('Convite cancelado.');
            void loadInvites();
        } catch {
            toast.error('Erro ao cancelar convite.');
        } finally {
            setCancellingInviteId(null);
            setInviteToCancel(null);
        }
    };

    const roleLabel = (role: string) => {
        const map: Record<string, string> = { OWNER: t.roleOwner, ADMIN: t.roleAdmin, MEMBER: t.roleMember, VIEWER: t.roleViewer };
        return map[role] ?? role;
    };

    const canActOnMember = (targetRole: string) => {
        if (!canManage) return false;
        if (targetRole === 'OWNER') return false;
        const hierarchy: Record<string, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };
        return (hierarchy[currentRole] ?? 0) > (hierarchy[targetRole] ?? 0);
    };

    const refresh = () => { void loadMembers(); void loadInvites(); };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={refresh} title={tc.refresh}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    {canManage && (
                        <InviteMemberDialog organizationId={organizationId} onSuccess={refresh} />
                    )}
                </div>
            </div>

            <Tabs defaultValue="members">
                <TabsList>
                    <TabsTrigger value="members">{t.membersTab}</TabsTrigger>
                    <TabsTrigger value="invites">{t.invitesTab}</TabsTrigger>
                </TabsList>

                <TabsContent value="members" className="mt-4">
                    {loadingMembers ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">{tc.loading}</p>
                    ) : members.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">{t.noMembers}</p>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    value={memberNameFilter}
                                    onChange={(e) => { setMemberNameFilter(e.target.value); setMemberPageIndex(0); }}
                                    placeholder="Filtrar por nome ou e-mail..."
                                    className="h-8 w-50"
                                />
                                <Select value={memberRoleFilter} onValueChange={(v) => { setMemberRoleFilter(v); setMemberPageIndex(0); }}>
                                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todos os cargos</SelectItem>
                                        <SelectItem value="OWNER">Owner</SelectItem>
                                        <SelectItem value="ADMIN">Admin</SelectItem>
                                        <SelectItem value="MEMBER">Member</SelectItem>
                                        <SelectItem value="VIEWER">Viewer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="px-4 font-medium">{tc.name}</TableHead>
                                            <TableHead className="px-4 font-medium">{tc.email}</TableHead>
                                            <TableHead className="px-4 font-medium">Cargo</TableHead>
                                            <TableHead className="px-4 font-medium">{t.joinedAt}</TableHead>
                                            {canManage && <TableHead className="w-20 px-4 font-medium" />}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedMembers.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={canManage ? 5 : 4} className="h-24 text-center text-muted-foreground">
                                                    Nenhum membro encontrado para os filtros aplicados.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedMembers.map((member) => {
                                                const canAct = canActOnMember(member.role) && member.userId !== currentUserId;
                                                return (
                                                    <TableRow key={member.id}>
                                                        <TableCell className="px-4 font-medium">{member.user.name}</TableCell>
                                                        <TableCell className="px-4 text-muted-foreground">{member.user.email}</TableCell>
                                                        <TableCell className="px-4">
                                                            <Badge variant={ROLE_VARIANT[member.role] ?? 'outline'}>
                                                                {roleLabel(member.role)}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="px-4 text-muted-foreground text-sm">
                                                            {format(new Date(member.joinedAt), 'dd/MM/yyyy')}
                                                        </TableCell>
                                                        {canManage && (
                                                            <TableCell className="px-4">
                                                                {canAct && (
                                                                    <div className="flex items-center gap-1">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8"
                                                                            title={t.editUser}
                                                                            onClick={() => setEditingMember(member)}
                                                                        >
                                                                            <Pencil className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                                                            title={t.removeMember}
                                                                            disabled={removingId === member.userId}
                                                                            onClick={() => setMemberToRemove(member)}
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        )}
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                                <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                                    <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                                    <Select value={`${memberPageSize}`} onValueChange={(v) => { setMemberPageSize(Number(v)); setMemberPageIndex(0); }}>
                                        <SelectTrigger className="h-8 min-w-22"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[5, 10, 20, 30].map((s) => <SelectItem key={s} value={`${s}`}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                    <span className="text-sm font-medium">Página {memberPageIndex + 1} de {memberTotalPages}</span>
                                    <div className="flex items-center gap-1 self-start sm:self-auto">
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMemberPageIndex(0)} disabled={memberPageIndex === 0}>
                                            <ChevronsLeft className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMemberPageIndex((p) => Math.max(p - 1, 0))} disabled={memberPageIndex === 0}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMemberPageIndex((p) => Math.min(p + 1, memberTotalPages - 1))} disabled={memberPageIndex >= memberTotalPages - 1}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMemberPageIndex(memberTotalPages - 1)} disabled={memberPageIndex >= memberTotalPages - 1}>
                                            <ChevronsRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="invites" className="mt-4">
                    {loadingInvites ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">{tc.loading}</p>
                    ) : invites.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">{t.noInvites}</p>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    value={inviteEmailFilter}
                                    onChange={(e) => { setInviteEmailFilter(e.target.value); setInvitePageIndex(0); }}
                                    placeholder="Filtrar por e-mail..."
                                    className="h-8 w-50"
                                />
                                <Select value={inviteRoleFilter} onValueChange={(v) => { setInviteRoleFilter(v); setInvitePageIndex(0); }}>
                                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Todos os cargos</SelectItem>
                                        <SelectItem value="OWNER">Owner</SelectItem>
                                        <SelectItem value="ADMIN">Admin</SelectItem>
                                        <SelectItem value="MEMBER">Member</SelectItem>
                                        <SelectItem value="VIEWER">Viewer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted/50">
                                        <TableRow>
                                            <TableHead className="px-4 font-medium">{tc.email}</TableHead>
                                            <TableHead className="px-4 font-medium">Cargo</TableHead>
                                            <TableHead className="px-4 font-medium">{t.sentAt}</TableHead>
                                            <TableHead className="px-4 font-medium">{t.expiresAt}</TableHead>
                                            {canManage && <TableHead className="w-24 px-4 font-medium" />}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginatedInvites.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={canManage ? 5 : 4} className="h-24 text-center text-muted-foreground">
                                                    Nenhum convite encontrado para os filtros aplicados.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            paginatedInvites.map((invite) => (
                                                <TableRow key={invite.id}>
                                                    <TableCell className="px-4 font-medium">{invite.email}</TableCell>
                                                    <TableCell className="px-4">
                                                        <Badge variant={ROLE_VARIANT[invite.role] ?? 'outline'}>
                                                            {roleLabel(invite.role)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="px-4 text-muted-foreground text-sm">
                                                        {format(new Date(invite.createdAt), 'dd/MM/yyyy')}
                                                    </TableCell>
                                                    <TableCell className="px-4 text-muted-foreground text-sm">
                                                        {format(new Date(invite.expiresAt), 'dd/MM/yyyy')}
                                                    </TableCell>
                                                    {canManage && (
                                                        <TableCell className="px-4">
                                                            <div className="flex items-center gap-1">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8"
                                                                    title="Reenviar convite"
                                                                    disabled={resendingInviteId === invite.id}
                                                                    onClick={() => handleResendInvite(invite)}
                                                                >
                                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                                    title="Cancelar convite"
                                                                    disabled={cancellingInviteId === invite.id}
                                                                    onClick={() => setInviteToCancel(invite)}
                                                                >
                                                                    <X className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="flex flex-col gap-4 px-2 sm:flex-row sm:items-center sm:justify-end sm:gap-8">
                                <div className="flex flex-wrap items-center gap-2 text-sm font-medium sm:flex-nowrap">
                                    <span className="shrink-0 whitespace-nowrap">Linhas por página</span>
                                    <Select value={`${invitePageSize}`} onValueChange={(v) => { setInvitePageSize(Number(v)); setInvitePageIndex(0); }}>
                                        <SelectTrigger className="h-8 min-w-22"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {[5, 10, 20, 30].map((s) => <SelectItem key={s} value={`${s}`}>{s}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                                    <span className="text-sm font-medium">Página {invitePageIndex + 1} de {inviteTotalPages}</span>
                                    <div className="flex items-center gap-1 self-start sm:self-auto">
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setInvitePageIndex(0)} disabled={invitePageIndex === 0}>
                                            <ChevronsLeft className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setInvitePageIndex((p) => Math.max(p - 1, 0))} disabled={invitePageIndex === 0}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setInvitePageIndex((p) => Math.min(p + 1, inviteTotalPages - 1))} disabled={invitePageIndex >= inviteTotalPages - 1}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setInvitePageIndex(inviteTotalPages - 1)} disabled={invitePageIndex >= inviteTotalPages - 1}>
                                            <ChevronsRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {editingMember && (
                <EditUserDialog
                    open={!!editingMember}
                    onOpenChange={(o) => { if (!o) setEditingMember(null); }}
                    organizationId={organizationId}
                    userId={editingMember.userId}
                    userName={editingMember.user.name}
                    userEmail={editingMember.user.email}
                    currentRole={editingMember.role}
                    requesterRole={currentRole}
                    onSuccess={() => { void loadMembers(); }}
                />
            )}

            <ConfirmDeleteDialog
                open={!!memberToRemove}
                onOpenChange={(open) => {
                    if (!open) setMemberToRemove(null);
                }}
                title={t.removeMemberTitle}
                description={
                    <>
                        {t.removeMemberDesc}{' '}
                        {memberToRemove && <span className="font-medium">{memberToRemove.user.name}</span>}?
                    </>
                }
                resourceName={memberToRemove?.user.name ?? ''}
                isConfirming={removingId === memberToRemove?.userId}
                onConfirm={handleRemove}
            />

            <AlertDialog open={!!inviteToCancel} onOpenChange={(o) => { if (!o) setInviteToCancel(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancelar convite</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja cancelar o convite para{' '}
                            {inviteToCancel && <span className="font-medium">{inviteToCancel.email}</span>}?
                            O link enviado anteriormente não funcionará mais.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{tc.cancel}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancelInvite}>Cancelar convite</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
