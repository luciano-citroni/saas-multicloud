import { z } from 'zod';

export type UpdateProfileFormData = {
    name: string;
    email: string;
};

export type UpdatePasswordFormData = {
    currentPassword?: string;
    newPassword: string;
    confirmNewPassword: string;
};

export type ProfileSchemaMessages = {
    nameMin: string;
    nameLong: string;
    emailInvalid: string;
};

export type PasswordSchemaMessages = {
    newPassMin: string;
    newPassUpper: string;
    newPassLower: string;
    newPassNumber: string;
    newPassSpecial: string;
    confirmRequired: string;
    confirmMatch: string;
};

export function createUpdateProfileSchema(msgs: ProfileSchemaMessages) {
    return z.object({
        name: z.string().trim().min(2, msgs.nameMin).max(255, msgs.nameLong),
        email: z.string().trim().email(msgs.emailInvalid),
    });
}

export function createUpdatePasswordSchema(msgs: PasswordSchemaMessages) {
    return z
        .object({
            currentPassword: z.string().optional(),
            newPassword: z
                .string()
                .min(8, msgs.newPassMin)
                .refine((value) => /[A-Z]/.test(value), msgs.newPassUpper)
                .refine((value) => /[a-z]/.test(value), msgs.newPassLower)
                .refine((value) => /[0-9]/.test(value), msgs.newPassNumber)
                .refine((value) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(value), msgs.newPassSpecial),
            confirmNewPassword: z.string().min(1, msgs.confirmRequired),
        })
        .refine((payload) => payload.newPassword === payload.confirmNewPassword, {
            path: ['confirmNewPassword'],
            message: msgs.confirmMatch,
        });
}

export const updateProfileSchema = createUpdateProfileSchema({
    nameMin: 'Nome deve ter pelo menos 2 caracteres',
    nameLong: 'Nome muito longo',
    emailInvalid: 'E-mail inválido',
});

export const updatePasswordSchema = createUpdatePasswordSchema({
    newPassMin: 'A nova senha deve ter pelo menos 8 caracteres',
    newPassUpper: 'A nova senha precisa ter pelo menos uma letra maiúscula',
    newPassLower: 'A nova senha precisa ter pelo menos uma letra minúscula',
    newPassNumber: 'A nova senha precisa ter pelo menos um número',
    newPassSpecial: 'A nova senha precisa ter um caractere especial',
    confirmRequired: 'Confirmação de senha é obrigatória',
    confirmMatch: 'A confirmação de senha deve ser igual à nova senha',
});
