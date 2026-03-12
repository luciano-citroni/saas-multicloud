import { z } from 'zod';

const awsRegionRegex = /^[a-z]{2}(-gov)?-[a-z]+-\d$/i;

export const cloudAccountFormScheme = z
    .object({
        alias: z.string().min(1, 'Informe um nome para a conta.').max(100, 'Nome muito longo.'),
        provider: z.enum(['aws', 'azure', 'gcp'], { required_error: 'Selecione um provider.' }),
        roleArn: z.string().optional(),
        region: z
            .string()
            .optional()
            .refine((val) => !val || awsRegionRegex.test(val), 'Região AWS inválida (ex: us-east-1).'),
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
    });
