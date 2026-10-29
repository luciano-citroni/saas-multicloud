import { z } from 'zod';

export const notificationChannelSchema = z.enum(['email', 'whatsapp']);

export const createNotificationGroupSchema = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(255).optional().nullable(),
    channel: notificationChannelSchema.default('email'),
    isActive: z.boolean().optional(),
});

export type CreateNotificationGroupDto = z.infer<typeof createNotificationGroupSchema>;

export const updateNotificationGroupSchema = z
    .object({
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(255).optional().nullable(),
        isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'Informe ao menos um campo para atualizar',
    });

export type UpdateNotificationGroupDto = z.infer<typeof updateNotificationGroupSchema>;

export const createNotificationEmailSchema = z.object({
    email: z.string().email().max(320),
    label: z.string().trim().max(120).optional().nullable(),
    isActive: z.boolean().optional(),
});

export type CreateNotificationEmailDto = z.infer<typeof createNotificationEmailSchema>;

export const updateNotificationEmailSchema = createNotificationEmailSchema.partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'Informe ao menos um campo para atualizar' },
);

export type UpdateNotificationEmailDto = z.infer<typeof updateNotificationEmailSchema>;
