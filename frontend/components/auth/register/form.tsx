'use client';

import { useForm } from 'react-hook-form';
import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { createRegisterSchema, type RegisterFormValues } from './scheme';
import { useRouter } from 'next/navigation';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Eye, EyeOff, LockKeyhole, Mail, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { GoogleButton } from '@/components/auth/google-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n';
import { extractErrorMessage } from '@/lib/error-messages';

export function RegisterForm() {
    const [viewPassword, setViewPassword] = useState(false);
    const [viewConfirmPassword, setViewConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const t = useTranslations('auth');
    const tc = useTranslations('common');

    const registerSchema = useMemo(
        () =>
            createRegisterSchema({
                nameMin: t.nameMin,
                emailInvalid: t.emailInvalid,
                acceptTerms: t.acceptTerms,
                passMin: t.passMin,
                passMax: t.passMax,
                passStrength: t.passStrength,
                passMismatch: t.passMismatch,
            }),
        [t]
    );

    const form = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            name: '',
            email: '',
            password: '',
            confirmPassword: '',
            acceptTermis: false,
        },
    });

    const onSubmit = async (data: RegisterFormValues) => {
        setLoading(true);
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: data.name,
                    email: data.email,
                    password: data.password,
                }),
            });

            const body = await response.json().catch(() => null);

            if (!response.ok) {
                toast.error(extractErrorMessage(body) || t.registerError);
                return;
            }

            toast.success(t.registerSuccessVerifyEmail);
            router.push(`/auth/sign-in?registered=1&email=${encodeURIComponent(data.email)}`);
        } catch {
            toast.error(tc.connectionError);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-4 flex-col">
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
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{tc.email}*</FormLabel>
                                <FormControl>
                                    <IconInput placeholder={t.registerEmailPlaceholder} StartIcon={Mail} {...field} />
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
                                        {...field}
                                        type={viewPassword ? 'text' : 'password'}
                                        ButtonIcon={{ icon: viewPassword ? EyeOff : Eye, onClick: () => setViewPassword(!viewPassword) }}
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
                                        {...field}
                                        type={viewConfirmPassword ? 'text' : 'password'}
                                        ButtonIcon={{
                                            icon: viewConfirmPassword ? EyeOff : Eye,
                                            onClick: () => setViewConfirmPassword(!viewConfirmPassword),
                                        }}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="acceptTermis"
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
                                                        Ao criar uma conta, você concorda com estes termos de uso e práticas de privacidade, que regem o
                                                        uso da plataforma Cloud3 FinOps e dos serviços oferecidos.
                                                    </p>
                                                    <p>
                                                        <strong className="text-foreground">1. Uso da Plataforma</strong>
                                                        <br />
                                                        Você é responsável por manter a confidencialidade de suas credenciais e por todas as atividades
                                                        realizadas em sua conta. O uso deve observar a legislação aplicável e estes termos.
                                                    </p>
                                                    <p>
                                                        <strong className="text-foreground">2. Privacidade e Proteção de Dados (LGPD)</strong>
                                                        <br />
                                                        O Cloud3 FinOps atua como controlador dos dados pessoais tratados na operação da plataforma.
                                                        Tratamos dados de identificação (nome e e-mail), autenticação e sessões, dados de organização e
                                                        membros, metadados de contas de nuvem e, somente com consentimento específico, dados de custos
                                                        FinOps. Quando aplicável, dados de pagamento são processados pelo prestador de cobrança
                                                        (Stripe).
                                                        <br />
                                                        <br />
                                                        As finalidades incluem criar e manter a conta, prestar o serviço, garantir segurança (sessões e
                                                        prevenção a abuso), gerenciar planos/cobrança e enviar comunicações operacionais. As bases
                                                        legais são a execução do contrato, o legítimo interesse (segurança e melhoria do serviço) e o
                                                        consentimento para a coleta FinOps, que pode ser revogado a qualquer momento na própria conta.
                                                        <br />
                                                        <br />
                                                        Não vendemos dados pessoais. O compartilhamento ocorre apenas com prestadores necessários à
                                                        operação (infraestrutura de nuvem, e-mail e pagamentos), sob obrigação de confidencialidade.
                                                        Adotamos medidas de segurança proporcionais, incluindo criptografia de credenciais de nuvem em
                                                        repouso, tokens de sessão em cookies httpOnly e respostas sanitizadas sem exposição de
                                                        segredos.
                                                        <br />
                                                        <br />
                                                        Os dados são retidos enquanto a conta ou organização existir e pelo tempo necessário ao
                                                        cumprimento de obrigações legais. A revogação do consentimento FinOps interrompe novas coletas;
                                                        o histórico já coletado pode ser preservado. Nos termos do art. 18 da LGPD, você pode solicitar
                                                        confirmação de tratamento, acesso, correção, eliminação ou anonimização nos limites legais e
                                                        técnicos do serviço, informação sobre compartilhamentos e revogação de consentimento, pelos
                                                        canais de suporte da plataforma.
                                                    </p>
                                                    <p>
                                                        <strong className="text-foreground">3. Responsabilidades</strong>
                                                        <br />O uso indevido da plataforma poderá resultar na suspensão ou encerramento da sua conta.
                                                    </p>
                                                    <p>
                                                        <strong className="text-foreground">4. Alterações</strong>
                                                        <br />
                                                        Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas na plataforma.
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

                    <Button type="submit" className="w-full" isLoading={loading}>
                        {t.registerButton}
                    </Button>
                </form>
            </Form>

            <div className="relative flex items-center gap-2">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">{t.orContinueWith}</span>
                <div className="flex-1 border-t border-border" />
            </div>

            <GoogleButton label={t.signUpWithGoogle} />

            <p className="text-center text-sm text-muted-foreground mb-3">
                {t.alreadyHaveAccount}{' '}
                <Link href="/auth/sign-in" className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity font-medium">
                    {t.doLogin}
                </Link>
            </p>
        </div>
    );
}
