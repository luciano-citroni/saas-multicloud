import { z } from 'zod';
import { cpfValidator, passwordValidator } from '../common/validators';

export const registerSchema = z.object({
    name: z.string().min(2).max(255),
    email: z.string().email(),
    cpf: cpfValidator,
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
