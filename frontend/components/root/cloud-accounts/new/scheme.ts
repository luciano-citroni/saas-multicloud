import { z } from 'zod';

const awsRegionRegex = /^[a-z]{2}(-gov)?-[a-z]+-\d$/i;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const gcpProjectIdRegex = /^[a-z][a-z0-9\-]{4,28}[a-z0-9]$/;
const gcpSaEmailRegex = /^.+@.+\.iam\.gserviceaccount\.com$/;

const normalizeRegions = (values?: Array<{ value?: string }>): string[] => {
    if (!values) return [];

    return values.map((item) => (item.value ?? '').trim()).filter((region) => region.length > 0);
};

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
        awsRegions: z.array(z.object({ value: z.string().optional() })).optional(),
        // Azure fields
        tenantId: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        subscriptionId: z.string().optional(),
        // GCP fields
        gcpProjectId: z.string().optional(),
        gcpServiceAccountEmail: z.string().optional(),
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

            const additionalRegions = normalizeRegions(data.awsRegions);
            additionalRegions.forEach((region, index) => {
                if (!awsRegionRegex.test(region)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'Região AWS inválida (ex: us-east-1).',
                        path: ['awsRegions', index, 'value'],
                    });
                }
            });

            if (!data.region || data.region.trim().length === 0) {
                const hasAdditionalRegions = additionalRegions.length > 0;

                if (!hasAdditionalRegions) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'Informe a região principal ou adicione ao menos uma região AWS.',
                        path: ['region'],
                    });
                }
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

        if (data.provider === 'gcp') {
            if (!data.gcpProjectId || data.gcpProjectId.trim().length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Project ID é obrigatório.', path: ['gcpProjectId'] });
            } else if (!gcpProjectIdRegex.test(data.gcpProjectId.trim())) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Project ID inválido (6-30 chars, letras minúsculas, números e hifens, ex: meu-projeto-123).',
                    path: ['gcpProjectId'],
                });
            }

            if (!data.gcpServiceAccountEmail || data.gcpServiceAccountEmail.trim().length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Service Account Email é obrigatório.', path: ['gcpServiceAccountEmail'] });
            } else if (!gcpSaEmailRegex.test(data.gcpServiceAccountEmail.trim())) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Deve ser um e-mail de Service Account GCP (ex: sa@projeto.iam.gserviceaccount.com).',
                    path: ['gcpServiceAccountEmail'],
                });
            }
        }
    });
