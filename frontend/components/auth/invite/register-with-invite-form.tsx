'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LockKeyhole, UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { extractErrorMessage } from '@/lib/error-messages';
import { isValidPassword } from '@/lib/validators/password';
import { useTranslations } from '@/lib/i18n';

type Props = {
    email: string;
    inviteToken: string;
    organizationName: string;
    role: string;
};

export function RegisterWithInviteForm({ email, inviteToken, organizationName, role }: Props) {
    const t = useTranslations('auth');
    const ti = useTranslations('invite');
    const [viewPassword, setViewPassword] = useState(false);
    const [viewConfirmPassword, setViewConfirmPassword] = useState(false);
    const router = useRouter();

    const schema = useMemo(
        () =>
            z
                .object({
                    name: z.string().min(3, t.nameMin),
                    password: z
                        .string()
                        .min(6, t.passMin)
                        .max(20, t.passMax)
                        .refine(isValidPassword, { message: t.passStrength }),
                    confirmPassword: z.string().min(6, t.passMin),
                    acceptTerms: z.boolean({ error: t.acceptTerms }).refine((v) => v === true, t.acceptTerms),
                })
                .refine((d) => d.password === d.confirmPassword, {
                    message: t.passMismatch,
                    path: ['confirmPassword'],
                }),
        [t],
    );

    type FormValues = z.infer<typeof schema>;

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { name: '', password: '', confirmPassword: '', acceptTerms: false },
    });

    const onSubmit = form.handleSubmit(async (data) => {
        try {
            const response = await fetch('/api/auth/register-with-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: data.name,
                    email,
                    password: data.password,
                    inviteToken,
                }),
            });

            const body = await response.json().catch(() => null);

            if (!response.ok) {
                toast.error(extractErrorMessage(body));
                return;
            }

            toast.success(ti.registerSuccess);
            router.replace('/');
            router.refresh();
        } catch {
            toast.error(ti.registerError);
        }
    });

    const roleMap: Record<string, string> = {
        ADMIN: ti.roleAdmin,
        MEMBER: ti.roleMember,
        VIEWER: ti.roleViewer,
        OWNER: ti.roleOwner,
    };

    return (
        <div className="flex flex-col gap-5">
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm flex flex-col gap-1">
                <span className="text-muted-foreground">{ti.joiningOrg}</span>
                <div className="flex items-center gap-2 font-medium">
                    {organizationName}
                    <Badge variant="secondary" className="text-xs">{roleMap[role] ?? role}</Badge>
                </div>
            </div>

            <Form {...form}>
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <div>
                        <p className="text-sm font-medium mb-1.5">{ti.emailLabel}</p>
                        <Input value={email} disabled className="bg-muted/50" />
                    </div>

                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.registerNameLabel}*</FormLabel>
                                <FormControl>
                                    <IconInput placeholder={t.registerNamePlaceholder} StartIcon={UserIcon} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.registerPasswordLabel}*</FormLabel>
                                <FormControl>
                                    <IconInput
                                        placeholder={t.registerPasswordPlaceholder}
                                        StartIcon={LockKeyhole}
                                        type={viewPassword ? 'text' : 'password'}
                                        ButtonIcon={{ icon: viewPassword ? EyeOff : Eye, onClick: () => setViewPassword((v) => !v) }}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t.registerConfirmLabel}*</FormLabel>
                                <FormControl>
                                    <IconInput
                                        placeholder={t.registerConfirmPlaceholder}
                                        StartIcon={LockKeyhole}
                                        type={viewConfirmPassword ? 'text' : 'password'}
                                        ButtonIcon={{ icon: viewConfirmPassword ? EyeOff : Eye, onClick: () => setViewConfirmPassword((v) => !v) }}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="acceptTerms"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center gap-2">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value === true}
                                            onCheckedChange={(checked) => field.onChange(checked === true)}
                                        />
                                    </FormControl>
                                    <FormLabel className="text-sm font-normal leading-none">
                                        {t.termsAccept}{' '}
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
                                                >
                                                    {t.termsTitle}
                                                </button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                                                <DialogHeader>
                                                    <DialogTitle>{t.termsTitle}</DialogTitle>
                                                    <DialogDescription>{t.termsDesc}</DialogDescription>
                                                </DialogHeader>
                                                <div className="text-sm text-muted-foreground space-y-3 mt-2">
                                                    <p>
                                                        Ao criar uma conta, você concorda com nossos termos de uso e política de privacidade. Estes termos
                                                        regem o uso da plataforma e dos serviços oferecidos.
                                                    </p>
                                                    <p>
                                                        <strong className="text-foreground">1. Uso da Plataforma</strong>
                                                        <br />
                                                        Você é responsável por manter a confidencialidade de suas credenciais e por todas as atividades
                                                        realizadas em sua conta.
                                                    </p>
                                                    <p>
                                                        <strong className="text-foreground">2. Privacidade</strong>
                                                        <br />
                                                        Coletamos apenas os dados necessários para o funcionamento da plataforma. Seus dados não serão
                                                        compartilhados com terceiros sem seu consentimento.
                                                    </p>
                                                    <p>
                                                        <strong className="text-foreground">3. Responsabilidades</strong>
                                                        <br />O uso indevido da plataforma poderá resultar na suspensão ou encerramento da sua conta.
                                                    </p>
                                                    <p>
                                                        <strong className="text-foreground">4. Alterações</strong>
                                                        <br />
                                                        Reservamos o direito de atualizar estes termos. Você será notificado em caso de mudanças
                                                        relevantes.
                                                    </p>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </FormLabel>
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <Button type="submit" className="w-full mt-1" isLoading={form.formState.isSubmitting}>
                        {ti.createAccountAndJoin}
                    </Button>
                </form>
            </Form>
        </div>
    );
}
