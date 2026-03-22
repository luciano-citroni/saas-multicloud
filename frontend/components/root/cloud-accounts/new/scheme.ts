import { z } from 'zod';

const awsRegionRegex = /^[a-z]{2}(-gov)?-[a-z]+-\d$/i;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const cloudAccountFormScheme = z
    .object({
        alias: z.string().min(1, 'Informe um nome para a conta.').max(100, 'Nome muito longo.'),
        provider: z.enum(['aws', 'azure', 'gcp'], { message: 'Selecione um provider.' }),
        // AWS fields
        roleArn: z.string().optional(),
        region: z
            .string()
            .optional()
            .refine((val) => !val || awsRegionRegex.test(val), 'Região AWS inválida (ex: us-east-1).'),
        // Azure fields
        tenantId: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        subscriptionId: z.string().optional(),
    })
    .superRefine((data, ctx) => {
        if (data.provider === 'aws') {
            if (!data.roleArn || data.roleArn.trim().length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Role ARN é obrigatório para AWS.',
                    path: ['roleArn'],
                });
            }
            if (!data.region || data.region.trim().length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Informe a região principal (ex: us-east-1).',
                    path: ['region'],
                });
            }
        }

        if (data.provider === 'azure') {
            if (!data.tenantId || data.tenantId.trim().length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Tenant ID é obrigatório.', path: ['tenantId'] });
            } else if (!uuidRegex.test(data.tenantId.trim())) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Tenant ID deve ser um UUID válido.', path: ['tenantId'] });
            }

            if (!data.clientId || data.clientId.trim().length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Client ID (Application ID) é obrigatório.', path: ['clientId'] });
            } else if (!uuidRegex.test(data.clientId.trim())) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Client ID deve ser um UUID válido.', path: ['clientId'] });
            }

            if (!data.clientSecret || data.clientSecret.trim().length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Client Secret é obrigatório.', path: ['clientSecret'] });
            }

            if (!data.subscriptionId || data.subscriptionId.trim().length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Subscription ID é obrigatório.', path: ['subscriptionId'] });
            } else if (!uuidRegex.test(data.subscriptionId.trim())) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Subscription ID deve ser um UUID válido.', path: ['subscriptionId'] });
            }
        }
    });
