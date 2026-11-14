import { z } from 'zod';

export type ResourceConfigSchemaMessages = {
    instanceTypeRequired: string;
    regionRequired: string;
    amiOrOsRequired: string;
    bucketNameMin: string;
    dbIdentifierRequired: string;
    engineRequired: string;
    masterPasswordRequired: string;
    functionNameRequired: string;
    roleArnRequired: string;
    keyNameRequired: string;
    unsupportedType: string;
};

const baseMessages = (msgs: ResourceConfigSchemaMessages) => msgs;

export function createEc2ConfigSchema(msgs: ResourceConfigSchemaMessages) {
    return z
        .object({
            instanceType: z.string().optional(),
            region: z.string().optional(),
            amiId: z.string().optional(),
            osPreset: z.string().optional(),
        })
        .passthrough()
        .superRefine((data, ctx) => {
            if (!data.instanceType?.trim()) {
                ctx.addIssue({ code: 'custom', message: msgs.instanceTypeRequired, path: ['instanceType'] });
            }
            if (!data.region?.trim()) {
                ctx.addIssue({ code: 'custom', message: msgs.regionRequired, path: ['region'] });
            }
            if (!data.amiId?.trim() && !data.osPreset?.trim()) {
                ctx.addIssue({ code: 'custom', message: msgs.amiOrOsRequired, path: ['amiId'] });
            }
        });
}

export function createS3ConfigSchema(msgs: ResourceConfigSchemaMessages) {
    return z
        .object({
            bucketName: z.string().trim().min(3, msgs.bucketNameMin),
            region: z.string().trim().min(1, msgs.regionRequired),
        })
        .passthrough();
}

export function createRdsConfigSchema(msgs: ResourceConfigSchemaMessages) {
    return z
        .object({
            dbInstanceIdentifier: z.string().trim().min(1, msgs.dbIdentifierRequired),
            engine: z.string().trim().min(1, msgs.engineRequired),
            masterUserPassword: z.string().min(1, msgs.masterPasswordRequired),
        })
        .passthrough();
}

export function createLambdaConfigSchema(msgs: ResourceConfigSchemaMessages) {
    return z
        .object({
            functionName: z.string().trim().min(1, msgs.functionNameRequired),
            roleArn: z.string().trim().min(1, msgs.roleArnRequired),
        })
        .passthrough();
}

export function createKeyPairSchema(msgs: ResourceConfigSchemaMessages) {
    return z.object({
        name: z.string().trim().min(1, msgs.keyNameRequired),
    });
}

export function validateResourceConfig(
    type: string,
    config: Record<string, unknown>,
    msgs: ResourceConfigSchemaMessages,
): { ok: true } | { ok: false; errors: Record<string, string>; message: string } {
    const schema =
        type === 'ec2'
            ? createEc2ConfigSchema(msgs)
            : type === 's3'
              ? createS3ConfigSchema(msgs)
              : type === 'rds'
                ? createRdsConfigSchema(msgs)
                : type === 'lambda'
                  ? createLambdaConfigSchema(msgs)
                  : null;

    if (!schema) {
        return { ok: false, errors: {}, message: msgs.unsupportedType };
    }

    const parsed = schema.safeParse(config);
    if (parsed.success) return { ok: true };

    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '_');
        if (!errors[key]) errors[key] = issue.message;
    }
    const message = parsed.error.issues[0]?.message ?? msgs.unsupportedType;
    return { ok: false, errors, message };
}

export function isResourceConfigured(
    type: string,
    config: Record<string, unknown>,
    msgs?: ResourceConfigSchemaMessages,
): boolean {
    const fallback: ResourceConfigSchemaMessages = {
        instanceTypeRequired: 'required',
        regionRequired: 'required',
        amiOrOsRequired: 'required',
        bucketNameMin: 'required',
        dbIdentifierRequired: 'required',
        engineRequired: 'required',
        masterPasswordRequired: 'required',
        functionNameRequired: 'required',
        roleArnRequired: 'required',
        keyNameRequired: 'required',
        unsupportedType: 'unsupported',
    };
    return validateResourceConfig(type, config, msgs ?? baseMessages(fallback)).ok;
}
