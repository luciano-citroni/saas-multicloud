import { z } from 'zod';

const awsRegionRegex = /^[a-z]{2}(?:-(?:gov|iso|isob|isof))?-[a-z0-9-]+-\d+$/i;
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const gcpProjectIdRegex = /^[a-z][a-z0-9\-]{4,28}[a-z0-9]$/;
const gcpSaEmailRegex = /^.+@.+\.iam\.gserviceaccount\.com$/;

const normalizeRegions = (values?: Array<{ value?: string }>): string[] => {
    if (!values) return [];
    return values.map((item) => (item.value ?? '').trim()).filter((region) => region.length > 0);
};

export type CloudAccountFormValues = z.infer<typeof cloudAccountFormScheme>;

export type CloudAccountSchemaMessages = {
    aliasRequired: string;
    aliasLong: string;
    providerRequired: string;
    orgRequired_error: string;
    awsRegionInvalid: string;
    roleArnRequired: string;
    awsRegionOrAdditional: string;
    tenantIdRequired: string;
    tenantIdUuid: string;
    clientIdRequired: string;
    clientIdUuid: string;
    clientSecretRequired: string;
    subscriptionIdRequired: string;
    subscriptionIdUuid: string;
    gcpProjectIdRequired: string;
    gcpProjectIdInvalid: string;
    gcpSaEmailRequired: string;
    gcpSaEmailInvalid: string;
};

export function createCloudAccountSchema(msgs: CloudAccountSchemaMessages) {
    return z
        .object({
            alias: z.string().min(1, msgs.aliasRequired).max(100, msgs.aliasLong),
            provider: z.enum(['aws', 'azure', 'gcp'], { message: msgs.providerRequired }),
            orgId: z.string().min(1, msgs.orgRequired_error),
            roleArn: z.string().optional(),
            region: z
                .string()
                .optional()
                .refine((val) => !val || awsRegionRegex.test(val), msgs.awsRegionInvalid),
            awsRegions: z.array(z.object({ value: z.string().optional() })).optional(),
            tenantId: z.string().optional(),
            clientId: z.string().optional(),
            clientSecret: z.string().optional(),
            subscriptionId: z.string().optional(),
            gcpProjectId: z.string().optional(),
            gcpServiceAccountEmail: z.string().optional(),
        })
        .superRefine((data, ctx) => {
            if (data.provider === 'aws') {
                if (!data.roleArn || data.roleArn.trim().length === 0) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.roleArnRequired, path: ['roleArn'] });
                }
                const additionalRegions = normalizeRegions(data.awsRegions);
                additionalRegions.forEach((region, index) => {
                    if (!awsRegionRegex.test(region)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.awsRegionInvalid, path: ['awsRegions', index, 'value'] });
                    }
                });
                if (!data.region || data.region.trim().length === 0) {
                    if (additionalRegions.length === 0) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.awsRegionOrAdditional, path: ['region'] });
                    }
                }
            }
            if (data.provider === 'azure') {
                if (!data.tenantId || data.tenantId.trim().length === 0) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.tenantIdRequired, path: ['tenantId'] });
                } else if (!uuidRegex.test(data.tenantId.trim())) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.tenantIdUuid, path: ['tenantId'] });
                }
                if (!data.clientId || data.clientId.trim().length === 0) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.clientIdRequired, path: ['clientId'] });
                } else if (!uuidRegex.test(data.clientId.trim())) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.clientIdUuid, path: ['clientId'] });
                }
                if (!data.clientSecret || data.clientSecret.trim().length === 0) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.clientSecretRequired, path: ['clientSecret'] });
                }
                if (!data.subscriptionId || data.subscriptionId.trim().length === 0) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.subscriptionIdRequired, path: ['subscriptionId'] });
                } else if (!uuidRegex.test(data.subscriptionId.trim())) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.subscriptionIdUuid, path: ['subscriptionId'] });
                }
            }
            if (data.provider === 'gcp') {
                if (!data.gcpProjectId || data.gcpProjectId.trim().length === 0) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.gcpProjectIdRequired, path: ['gcpProjectId'] });
                } else if (!gcpProjectIdRegex.test(data.gcpProjectId.trim())) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.gcpProjectIdInvalid, path: ['gcpProjectId'] });
                }
                if (!data.gcpServiceAccountEmail || data.gcpServiceAccountEmail.trim().length === 0) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.gcpSaEmailRequired, path: ['gcpServiceAccountEmail'] });
                } else if (!gcpSaEmailRegex.test(data.gcpServiceAccountEmail.trim())) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msgs.gcpSaEmailInvalid, path: ['gcpServiceAccountEmail'] });
                }
            }
        });
}

export const cloudAccountFormScheme = createCloudAccountSchema({
    aliasRequired: 'Informe um nome para a conta.',
    aliasLong: 'Nome muito longo.',
    providerRequired: 'Selecione um provider.',
    orgRequired_error: 'Selecione uma organização.',
    awsRegionInvalid: 'Região AWS inválida (ex: us-east-1).',
    roleArnRequired: 'Role ARN é obrigatório para AWS.',
    awsRegionOrAdditional: 'Informe a região principal ou adicione ao menos uma região AWS.',
    tenantIdRequired: 'Tenant ID é obrigatório.',
    tenantIdUuid: 'Tenant ID deve ser um UUID válido.',
    clientIdRequired: 'Client ID (Application ID) é obrigatório.',
    clientIdUuid: 'Client ID deve ser um UUID válido.',
    clientSecretRequired: 'Client Secret é obrigatório.',
    subscriptionIdRequired: 'Subscription ID é obrigatório.',
    subscriptionIdUuid: 'Subscription ID deve ser um UUID válido.',
    gcpProjectIdRequired: 'Project ID é obrigatório.',
    gcpProjectIdInvalid: 'Project ID inválido (6-30 chars, letras minúsculas, números e hifens, ex: meu-projeto-123).',
    gcpSaEmailRequired: 'Service Account Email é obrigatório.',
    gcpSaEmailInvalid: 'Deve ser um e-mail de Service Account GCP (ex: sa@projeto.iam.gserviceaccount.com).',
});
