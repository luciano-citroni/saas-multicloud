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

export const whatsappTargetTypeSchema = z.enum(['phone', 'group']);

const phoneTargetSchema = z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d]/g, ''))
    .refine((value) => /^\d{10,15}$/.test(value), {
        message: 'WhatsApp phone must be 10-15 digits with country code',
    });

const groupTargetSchema = z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ''))
    .refine((value) => value.includes('@g.us') && value.length <= 120, {
        message: 'WhatsApp group id must include @g.us',
    });

export const createNotificationWhatsappTargetSchema = z
    .object({
        targetType: whatsappTargetTypeSchema,
        target: z.string().trim().min(1).max(120),
        label: z.string().trim().max(120).optional().nullable(),
        isActive: z.boolean().optional(),
    })
    .superRefine((data, ctx) => {
        const parsed =
            data.targetType === 'phone'
                ? phoneTargetSchema.safeParse(data.target)
                : groupTargetSchema.safeParse(data.target);

        if (!parsed.success) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['target'],
                message: parsed.error.issues[0]?.message ?? 'Invalid WhatsApp target',
            });
        }
    })
    .transform((data) => ({
        ...data,
        target:
            data.targetType === 'phone'
                ? phoneTargetSchema.parse(data.target)
                : groupTargetSchema.parse(data.target),
    }));

export type CreateNotificationWhatsappTargetDto = z.infer<typeof createNotificationWhatsappTargetSchema>;

export const updateNotificationWhatsappTargetSchema = z
    .object({
        targetType: whatsappTargetTypeSchema.optional(),
        target: z.string().trim().min(1).max(120).optional(),
        label: z.string().trim().max(120).optional().nullable(),
        isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'Informe ao menos um campo para atualizar',
    })
    .superRefine((data, ctx) => {
        if (data.target === undefined && data.targetType === undefined) {
            return;
        }

        if (data.target !== undefined && data.targetType === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['targetType'],
                message: 'targetType is required when updating target',
            });
            return;
        }

        if (data.targetType !== undefined && data.target !== undefined) {
            const parsed =
                data.targetType === 'phone'
                    ? phoneTargetSchema.safeParse(data.target)
                    : groupTargetSchema.safeParse(data.target);

            if (!parsed.success) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['target'],
                    message: parsed.error.issues[0]?.message ?? 'Invalid WhatsApp target',
                });
            }
        }
    })
    .transform((data) => {
        if (data.targetType !== undefined && data.target !== undefined) {
            return {
                ...data,
                target:
                    data.targetType === 'phone'
                        ? phoneTargetSchema.parse(data.target)
                        : groupTargetSchema.parse(data.target),
            };
        }

        return data;
    });

export type UpdateNotificationWhatsappTargetDto = z.infer<typeof updateNotificationWhatsappTargetSchema>;

export const joinWhatsappGroupInviteSchema = z.object({
    inviteLink: z.string().trim().min(8).max(500),
    label: z.string().trim().max(120).optional().nullable(),
    isActive: z.boolean().optional(),
});

export type JoinWhatsappGroupInviteDto = z.infer<typeof joinWhatsappGroupInviteSchema>;
