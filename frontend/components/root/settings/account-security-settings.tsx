'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import {
    createUpdateProfileSchema,
    createUpdatePasswordSchema,
    type UpdateProfileFormData,
    type UpdatePasswordFormData,
} from '@/components/root/settings/schema';
import { ProfileSettingsForm } from '@/components/root/settings/profile-settings-form';
import { PasswordSettingsForm } from '@/components/root/settings/password-settings-form';
import { ActiveSessionsCard } from '@/components/root/settings/active-sessions-card';
import { isCurrentUser, isRemoveSessionResult } from '@/components/root/settings/settings-utils';
import { useTranslations } from '@/lib/i18n';
import { useLocale } from '@/components/providers/locale-provider';

export function AccountSecuritySettings() {
    const router = useRouter();
    const ts = useTranslations('settings');
    const tp = useTranslations('profile');
    const tpw = useTranslations('password');
    const tss = useTranslations('sessions');
    const { locale } = useLocale();
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [hasPassword, setHasPassword] = useState(true);
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [removingSessionId, setRemovingSessionId] = useState<string | null>(null);

    const dateFormatter = useMemo(
        () =>
            new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
            }),
        [locale]
    );

    const profileSchema = useMemo(() => createUpdateProfileSchema(tp), [tp]);
    const passwordSchema = useMemo(() => createUpdatePasswordSchema(tpw), [tpw]);

    const profileForm = useForm<UpdateProfileFormData>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: '',
            email: '',
        },
    });

    const passwordForm = useForm<UpdatePasswordFormData>({
        resolver: zodResolver(passwordSchema),
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
                toast.error(extractErrorMessage(userBody));
                return;
            }

            if (!sessionsResponse.ok) {
                toast.error(extractErrorMessage(sessionsBody));
                return;
            }

            if (isCurrentUser(userBody)) {
                setHasPassword(userBody.hasPassword !== false);

                profileForm.reset({
                    name: userBody.name ?? '',
                    email: userBody.email ?? '',
                });
            }

            setSessions(Array.isArray(sessionsBody) ? sessionsBody : []);
        } catch {
            toast.error(ts.loadError);
        } finally {
            setIsInitialLoading(false);
        }
    }, [profileForm, ts]);

    useEffect(() => {
        void loadSettingsData();
    }, [loadSettingsData]);

    const onSubmitProfile = profileForm.handleSubmit(async (values) => {
        try {
            const response = await updateCurrentUser({
                name: values.name,
            });

            const body = (await response.json().catch(() => null)) as CurrentUser | { message?: string } | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }

            profileForm.reset({
                name: isCurrentUser(body) ? body.name : values.name,
                email: isCurrentUser(body) ? body.email : values.email,
            });

            toast.success(tp.saveSuccess);
            router.refresh();
        } catch {
            toast.error(tp.saveError);
        }
    });

    const onSubmitPassword = passwordForm.handleSubmit(async (values) => {
        if (hasPassword && !values.currentPassword?.trim()) {
            passwordForm.setError('currentPassword', {
                type: 'manual',
                message: tpw.currentPasswordRequired,
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
                toast.error(extractErrorMessage(body));
                return;
            }

            passwordForm.reset({
                currentPassword: '',
                newPassword: '',
                confirmNewPassword: '',
            });

            setHasPassword(true);
            toast.success(tpw.changeSuccess);
        } catch {
            toast.error(tpw.changeError);
        }
    });

    const handleRemoveSession = async (sessionId: string) => {
        try {
            setRemovingSessionId(sessionId);

            const response = await removeSession(sessionId);
            const body = (await response.json().catch(() => null)) as RemoveSessionResult | { message?: string } | null;

            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }

            if (!isRemoveSessionResult(body)) {
                toast.error(tss.removeError);
                return;
            }

            if (body.removedCurrent) {
                toast.success(tss.removeCurrentSuccess);
                router.replace('/auth/sign-in');
                router.refresh();
                return;
            }

            setSessions((currentSessions) => currentSessions.filter((session) => session.id !== sessionId));
            toast.success(tss.removeSuccess);
        } catch {
            toast.error(tss.removeError);
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
