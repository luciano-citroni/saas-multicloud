'use client';

import { useForm } from 'react-hook-form';
import z from 'zod';
import { registerScheme } from './scheme';
import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { registerAction } from '@/lib/auth/actions';
import { useRouter } from 'next/navigation';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Eye, EyeOff, LockKeyhole, Mail, UserIcon, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { GoogleButton } from '@/components/auth/google-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { formatCPF } from '@/lib/validators/cpf';

export function RegisterForm() {
    const [viewPassword, setViewPassword] = useState(false);
    const [viewConfirmPassword, setViewConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const onSubmit = async (data: z.infer<typeof registerScheme>) => {
        setLoading(true);
        try {
            const result = await registerAction(data);

            if (!result.success) {
                toast.error(result.error || 'Erro ao criar conta');
                return;
            }

            toast.success('Conta criada com sucesso! Faça login para continuar.');
            router.push('/auth/sign-in');
        } finally {
            setLoading(false);
        }
    };

    const form = useForm<z.infer<typeof registerScheme>>({
        resolver: zodResolver(registerScheme),
        defaultValues: {
            name: '',
            email: '',
            cpf: '',
            password: '',
            confirmPassword: '',
            acceptTermis: undefined,
        },
    });

    return (
        <div className="flex flex-col gap-4">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-4 flex-col">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Nome*</FormLabel>
                                <FormControl>
                                    <IconInput placeholder="Coloque seu nome" StartIcon={UserIcon} {...field} />
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
                                <FormLabel>E-mail*</FormLabel>
                                <FormControl>
                                    <IconInput placeholder="Coloque seu e-mail" StartIcon={Mail} {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="cpf"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>CPF</FormLabel>
                                <FormControl>
                                    <IconInput
                                        placeholder="000.000.000-00"
                                        StartIcon={IdCard}
                                        {...field}
                                        onChange={(e) => {
                                            const formatted = formatCPF(e.target.value);
                                            field.onChange(formatted);
                                        }}
                                        maxLength={14}
                                    />
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
                                <FormLabel>Senha*</FormLabel>
                                <FormControl>
                                    <IconInput
                                        placeholder="Coloque sua senha"
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
                                <FormLabel>Confirme a senha*</FormLabel>
                                <FormControl>
                                    <IconInput
                                        placeholder="Confirme sua senha"
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
                                            onCheckedChange={(checked) => field.onChange(checked === true ? true : undefined)}
                                        />
                                    </FormControl>
                                    <FormLabel className="text-sm font-normal leading-none">
                                        Eu li e aceito os{' '}
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
                                                >
                                                    Termos de Uso
                                                </button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                                                <DialogHeader>
                                                    <DialogTitle>Termos de Uso</DialogTitle>
                                                    <DialogDescription>Leia atentamente antes de criar sua conta.</DialogDescription>
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

                    <Button type="submit" className="w-full" isLoading={loading}>
                        Cadastrar
                    </Button>
                </form>
            </Form>

            <div className="relative flex items-center gap-2">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">ou continue com</span>
                <div className="flex-1 border-t border-border" />
            </div>

            <GoogleButton label="Cadastrar com Google" />

            <p className="text-center text-sm text-muted-foreground mb-3">
                Já tem uma conta?{' '}
                <Link href="/auth/sign-in" className="text-primary underline underline-offset-4 hover:opacity-80 transition-opacity font-medium">
                    Fazer login
                </Link>
            </p>
        </div>
    );
}
