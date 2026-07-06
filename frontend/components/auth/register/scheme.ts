import { z } from 'zod';
import { isValidPassword } from '@/lib/validators/password';

export type RegisterFormValues = {
    name: string;
    email: string;
    acceptTermis: boolean;
    password: string;
    confirmPassword: string;
};

export type RegisterSchemaMessages = {
    nameMin: string;
    emailInvalid: string;
    acceptTerms: string;
    passMin: string;
    passMax: string;
    passStrength: string;
    passMismatch: string;
};

export function createRegisterSchema(msgs: RegisterSchemaMessages) {
    return z
        .object({
            name: z.string().min(3, msgs.nameMin),
            email: z.email(msgs.emailInvalid),
            acceptTermis: z.boolean({ error: msgs.acceptTerms }).refine((v) => v === true, msgs.acceptTerms),
            password: z
                .string()
                .min(6, msgs.passMin)
                .max(20, msgs.passMax)
                .refine(isValidPassword, { message: msgs.passStrength }),
            confirmPassword: z.string().min(6, msgs.passMin),
        })
        .refine((data) => data.password === data.confirmPassword, {
            message: msgs.passMismatch,
            path: ['confirmPassword'],
        });
}

export const registerScheme = createRegisterSchema({
    nameMin: 'O nome deve conter no mínimo 3 caracteres',
    emailInvalid: 'E-mail inválido',
    acceptTerms: 'Você deve aceitar os termos de uso para continuar',
    passMin: 'A senha deve conter no mínimo 6 caracteres',
    passMax: 'A senha deve conter no máximo 20 caracteres',
    passStrength: 'A senha deve ter pelo menos 8 caracteres, 1 letra maiúscula, 1 número e 1 caractere especial',
    passMismatch: 'As senhas não coincidem',
});
