import { z } from 'zod';
import { cpfValidator, passwordValidator } from '../common/validators';

export const registerSchema = z.object({
    name: z.string().min(2).max(255),
    email: z.string().email(),
    cpf: cpfValidator.optional(),
    password: passwordValidator,
});
export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1),
});
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

export const googleExchangeSchema = z.object({
    code: z.string().min(1),
});
export type GoogleExchangeDto = z.infer<typeof googleExchangeSchema>;

export const registerWithInviteSchema = z.object({
    name: z.string().min(2).max(255),
    email: z.string().email(),
    cpf: cpfValidator,
    password: passwordValidator,
    inviteToken: z.string().uuid(),
});
export type RegisterWithInviteDto = z.infer<typeof registerWithInviteSchema>;

export const updateMeSchema = z
    .object({
        name: z.string().min(2).max(255).optional(),
        email: z.string().email().optional(),
        cpf: cpfValidator.optional(),
    })
    .refine((payload) => Object.keys(payload).length > 0, {
        message: 'At least one field must be provided',
    });
export type UpdateMeDto = z.infer<typeof updateMeSchema>;

export const updateMyPasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required').optional(),
    newPassword: passwordValidator,
});
export type UpdateMyPasswordDto = z.infer<typeof updateMyPasswordSchema>;
