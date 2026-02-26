import { z } from 'zod';
import { cpfValidator, passwordValidator } from '../common/validators';

const userIdSchema = z.string().uuid();

const userBaseSchema = z.object({
    name: z.string().min(2).max(255),
    email: z.string().email(),
    cpf: cpfValidator,
});

export const createUserSchema = userBaseSchema.extend({
    password: passwordValidator,
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
    name: z.string().min(2).max(255).optional(),
    email: z.string().email().optional(),
    cpf: cpfValidator.optional(),
    isActive: z.boolean().optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const userIdParamSchema = z.object({
    id: userIdSchema,
});
export type UserIdParam = z.infer<typeof userIdParamSchema>;
