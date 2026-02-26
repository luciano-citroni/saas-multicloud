import { z } from 'zod';

/**
 * Validador de senha com requisitos:
 * - Mínimo 8 caracteres
 * - Pelo menos uma letra maiúscula
 * - Pelo menos uma letra minúscula
 * - Pelo menos um número
 * - Pelo menos um caractere especial
 */
export const passwordValidator = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((password) => /[A-Z]/.test(password), 'Password must contain at least one uppercase letter')
    .refine((password) => /[a-z]/.test(password), 'Password must contain at least one lowercase letter')
    .refine((password) => /[0-9]/.test(password), 'Password must contain at least one number')
    .refine((password) => /[!@#$%^&*()_+\-=\[\]{};':\"\\\|,.<>\/?]/.test(password), 'Password must contain at least one special character (!@#$%^&* etc)');
