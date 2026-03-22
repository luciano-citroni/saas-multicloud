import { z } from 'zod';

export const updateProfileSchema = z.object({
    name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255, 'Nome muito longo'),
    email: z.string().trim().email('E-mail inválido'),
    cpf: z.string().trim().optional(),
});

export const updatePasswordSchema = z
    .object({
        currentPassword: z.string().optional(),
        newPassword: z
            .string()
            .min(8, 'A nova senha deve ter pelo menos 8 caracteres')
            .refine((value) => /[A-Z]/.test(value), 'A nova senha precisa ter pelo menos uma letra maiúscula')
            .refine((value) => /[a-z]/.test(value), 'A nova senha precisa ter pelo menos uma letra minúscula')
            .refine((value) => /[0-9]/.test(value), 'A nova senha precisa ter pelo menos um número')
            .refine((value) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value), 'A nova senha precisa ter um caractere especial'),
        confirmNewPassword: z.string().min(1, 'Confirmação de senha é obrigatória'),
    })
    .refine((payload) => payload.newPassword === payload.confirmNewPassword, {
        path: ['confirmNewPassword'],
        message: 'A confirmação de senha deve ser igual à nova senha',
    });
