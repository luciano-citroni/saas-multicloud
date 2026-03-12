import { z } from 'zod';
import { isValidPassword } from '@/lib/validators/password';
import { isValidCPF } from '@/lib/validators/cpf';

export const registerScheme = z
    .object({
        name: z.string().min(3, 'O nome deve conter no mínimo 3 caracteres'),
        email: z.email('E-mail inválido'),
        cpf: z
            .string()
            .transform((value) => value.trim())
            .refine((value) => value === '' || value.replace(/\D/g, '').length === 11, 'CPF deve conter 11 dígitos')
            .refine((value) => value === '' || isValidCPF(value), 'CPF inválido')
            .optional(),
        acceptTermis: z.literal(true, {
            message: 'Você deve aceitar os termos de uso',
        }),
        password: z
            .string()
            .min(6, 'A senha deve conter no mínimo 6 caracteres')
            .max(20, 'A senha deve conter no máximo 20 caracteres')
            .refine(isValidPassword, {
                message: 'A senha deve ter pelo menos 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial',
            }),
        confirmPassword: z.string().min(6, 'A senha deve conter no mínimo 6 caracteres'),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'As senhas não coincidem',
        path: ['confirmPassword'],
    });
