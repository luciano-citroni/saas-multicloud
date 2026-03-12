'use client';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { toast } from 'sonner';
import { extractErrorMessage } from '@/lib/error-messages';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { IconInput } from '@/components/ui/input-icon';
import { Button } from '@/components/ui/button';
import { GoogleButton } from '@/components/auth/google-button';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const loginScheme = z.object({
    email: z.email('E-mail inválido'),
    password: z.string().min(1, 'Senha é obrigatória'),
});

type LoginFormData = z.infer<typeof loginScheme>;

export function LoginForm() {
    const [viewPassword, setViewPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const form = useForm<LoginFormData>({
        resolver: zodResolver(loginScheme),
        defaultValues: { email: '', password: '' },
    });

    const onSubmit = async (data: LoginFormData) => {
        setLoading(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const body = await response.json();

            if (!response.ok) {
                toast.error(extractErrorMessage(body, 'pt'));
                return;
            }

            router.replace('/');
            router.refresh();
        } catch {
            toast.error('Erro de conexão. Tente novamente.');
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
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <IconInput placeholder="seu@email.com" StartIcon={Mail} {...field} />
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
                                <FormLabel>Senha</FormLabel>
                                <FormControl>
                                    <IconInput
                                        placeholder="Sua senha"
                                        StartIcon={LockKeyhole}
                                        type={viewPassword ? 'text' : 'password'}
                                        ButtonIcon={{
                                            icon: viewPassword ? EyeOff : Eye,
                                            onClick: () => setViewPassword(!viewPassword),
                                        }}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <Button type="submit" disabled={loading}>
                        {loading ? 'Entrando...' : 'Entrar'}
                    </Button>
                </form>
            </Form>

            <div className="relative flex items-center gap-2">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 border-t border-border" />
            </div>

            <GoogleButton label="Entrar com Google" />

            <Link href="/auth/sign-up" className="">
                <p className="text-center text-sm text-muted-foreground">
                    Não tem conta? <span className="font-medium text-primary hover:underline">Cadastre-se</span>
                </p>
            </Link>
        </div>
    );
}
