'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
    fetchActiveSessions,
    fetchCurrentUser,
    removeSession,
    updateCurrentPassword,
    updateCurrentUser,
    type ActiveSession,
    type CurrentUser,
    type RemoveSessionResult,
} from '@/app/actions/settings';
import { extractErrorMessage } from '@/lib/error-messages';
import { updatePasswordSchema, updateProfileSchema } from '@/components/root/settings/schema';
import { ProfileSettingsForm } from '@/components/root/settings/profile-settings-form';
import { PasswordSettingsForm } from '@/components/root/settings/password-settings-form';
import { ActiveSessionsCard } from '@/components/root/settings/active-sessions-card';
import { isCurrentUser, isRemoveSessionResult, normalizeOptionalCpf } from '@/components/root/settings/settings-utils';

type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;
type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>;

export function AccountSecuritySettings() {
    const router = useRouter();
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [hasPassword, setHasPassword] = useState(true);
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [removingSessionId, setRemovingSessionId] = useState<string | null>(null);

    const dateFormatter = useMemo(
        () =>
            new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
            }),
        []
    );

    const profileForm = useForm<UpdateProfileFormData>({
        resolver: zodResolver(updateProfileSchema),
        defaultValues: {
            name: '',
            email: '',
            cpf: '',
        },
    });

    const passwordForm = useForm<UpdatePasswordFormData>({
        resolver: zodResolver(updatePasswordSchema),
        defaultValues: {
            currentPassword: '',
            newPassword: '',
            confirmNewPassword: '',
        },
    });

    const loadSettingsData = useCallback(async () => {
        try {
            const [userResponse, sessionsResponse] = await Promise.all([fetchCurrentUser(), fetchActiveSessions()]);

            const userBody = (await userResponse.json().catch(() => null)) as CurrentUser | { message?: string } | null;
            const sessionsBody = (await sessionsResponse.json().catch(() => null)) as ActiveSession[] | { message?: string } | null;

            if (!userResponse.ok) {
                toast.error(extractErrorMessage(userBody, 'pt'));
                return;
            }

            if (!sessionsResponse.ok) {
                toast.error(extractErrorMessage(sessionsBody, 'pt'));
                return;
            }

            if (isCurrentUser(userBody)) {
                setHasPassword(userBody.hasPassword !== false);

                profileForm.reset({
                    name: userBody.name ?? '',
                    email: userBody.email ?? '',
                    cpf: normalizeOptionalCpf(userBody.cpf),
                });
            }

            setSessions(Array.isArray(sessionsBody) ? sessionsBody : []);
        } catch {
            toast.error('Não foi possível carregar as configurações da conta.');
        } finally {
            setIsInitialLoading(false);
        }
    }, [profileForm]);

    useEffect(() => {
        void loadSettingsData();
    }, [loadSettingsData]);

    const onSubmitProfile = profileForm.handleSubmit(async (values) => {
        try {
            const response = await updateCurrentUser({
                name: values.name,
                cpf: values.cpf?.trim() ? values.cpf.trim() : undefined,
            });

            const body = (await response.json().catch(() => null)) as CurrentUser | { message?: string } | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }

            profileForm.reset({
                name: isCurrentUser(body) ? body.name : values.name,
                email: isCurrentUser(body) ? body.email : values.email,
                cpf: isCurrentUser(body) ? normalizeOptionalCpf(body.cpf) : normalizeOptionalCpf(values.cpf),
            });

            toast.success('Dados do usuário atualizados com sucesso.');
            router.refresh();
        } catch {
            toast.error('Não foi possível atualizar seus dados.');
        }
    });

    const onSubmitPassword = passwordForm.handleSubmit(async (values) => {
        if (hasPassword && !values.currentPassword?.trim()) {
            passwordForm.setError('currentPassword', {
                type: 'manual',
                message: 'Senha atual é obrigatória',
            });
            return;
        }

        try {
            const response = await updateCurrentPassword({
                currentPassword: hasPassword ? values.currentPassword : undefined,
                newPassword: values.newPassword,
            });

            const body = (await response.json().catch(() => null)) as { success?: boolean; message?: string } | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }

            passwordForm.reset({
                currentPassword: '',
                newPassword: '',
                confirmNewPassword: '',
            });

            setHasPassword(true);
            toast.success('Senha alterada com sucesso.');
        } catch {
            toast.error('Não foi possível alterar sua senha.');
        }
    });

    const handleRemoveSession = async (sessionId: string) => {
        try {
            setRemovingSessionId(sessionId);

            const response = await removeSession(sessionId);
            const body = (await response.json().catch(() => null)) as RemoveSessionResult | { message?: string } | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }

            if (!isRemoveSessionResult(body)) {
                toast.error('Não foi possível remover a sessão selecionada.');
                return;
            }

            if (body.removedCurrent) {
                toast.success('Sessão atual encerrada. Faça login novamente.');
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            setSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId));
            toast.success('Sessão removida com sucesso.');
        } catch {
            toast.error('Não foi possível remover a sessão selecionada.');
        } finally {
            setRemovingSessionId(null);
        }
    };

    return (
        <div className="grid w-full gap-4">
            <ProfileSettingsForm form={profileForm} isLoading={isInitialLoading} onSubmit={onSubmitProfile} />

            <PasswordSettingsForm form={passwordForm} hasPassword={hasPassword} onSubmit={onSubmitPassword} />

            <ActiveSessionsCard
                sessions={sessions}
                isLoading={isInitialLoading}
                removingSessionId={removingSessionId}
                dateFormatter={dateFormatter}
                onRemoveSession={handleRemoveSession}
            />
        </div>
    );
}
