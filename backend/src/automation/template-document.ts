import { createHash } from 'crypto';
import yaml from 'js-yaml';
import { BadRequestException } from '@nestjs/common';
import { ErrorMessages } from '../common/messages/error-messages';
import { TEMPLATE_BODY_LIMIT, detectCapabilities } from './bindings';

export interface ExtractedParameter {
    name: string;
    type: string;
    description?: string;
    default?: unknown;
    required: boolean;
    allowedValues?: unknown[];
    noEcho: boolean;
    constraintDescription?: string;
}

export interface ExtractedResource {
    logicalId: string;
    type: string;
    dependsOn: string[];
    references: string[];
    condition?: string;
}

export interface ExtractedOutput {
    name: string;
    description?: string;
}

export interface ExtractedTemplate {
    format: 'yaml' | 'json';
    parameters: ExtractedParameter[];
    resources: ExtractedResource[];
    outputs: ExtractedOutput[];
    hasTransform: boolean;
    capabilities: string[];
    contentHash: string;
    conditions: string[];
    mappings: string[];
}

const CFN_FUNCTIONS = [
    'Base64',
    'Cidr',
    'And',
    'Equals',
    'If',
    'Not',
    'Or',
    'FindInMap',
    'GetAtt',
    'GetAZs',
    'ImportValue',
    'Join',
    'Select',
    'Split',
    'Sub',
    'Transform',
];

function cfnSchema(): yaml.Schema {
    const types: yaml.Type[] = [
        new yaml.Type('!Ref', { kind: 'scalar', construct: (data) => ({ Ref: data }) }),
        new yaml.Type('!Condition', { kind: 'scalar', construct: (data) => ({ Condition: data }) }),
    ];

    for (const name of CFN_FUNCTIONS) {
        for (const kind of ['scalar', 'sequence', 'mapping'] as const) {
            types.push(
                new yaml.Type(`!${name}`, {
                    kind,
                    construct: (data: unknown) => ({ [`Fn::${name}`]: data }),
                }),
            );
        }
    }

    return yaml.DEFAULT_SCHEMA.extend(types);
}

const SCHEMA = cfnSchema();

const BLOCKED_RESOURCE_TYPES = new Set([
    'AWS::CloudFormation::CustomResource',
    'AWS::CloudFormation::Stack',
    'AWS::CloudFormation::Macro',
    'AWS::Lambda::Function',
    'AWS::Lambda::LayerVersion',
    'AWS::Serverless::Function',
]);

const ALLOWED_TRANSFORMS = new Set(['AWS::LanguageExtensions', 'AWS::Serverless-2016-10-31']);

function assertSupportedResource(type: string): void {
    if (type.startsWith('Custom::') || BLOCKED_RESOURCE_TYPES.has(type)) {
        throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_UNSUPPORTED);
    }
}

function transformNames(value: unknown): string[] {
    if (value === undefined) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value as string[];
    throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_UNSUPPORTED);
}

function dependsOnNames(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
    return [];
}

function collectResourceReferences(value: unknown, known: Set<string>, into: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) collectResourceReferences(item, known, into);
        return;
    }
    const record = asRecord(value);
    if (!record) return;
    if (typeof record.Ref === 'string' && known.has(record.Ref)) into.add(record.Ref);
    const getAtt = record['Fn::GetAtt'];
    if (typeof getAtt === 'string') {
        const id = getAtt.split('.')[0];
        if (id && known.has(id)) into.add(id);
    } else if (Array.isArray(getAtt) && typeof getAtt[0] === 'string' && known.has(getAtt[0])) {
        into.add(getAtt[0]);
    }
    for (const child of Object.values(record)) collectResourceReferences(child, known, into);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return null;
}

export function hashTemplate(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

export function extractTemplateDocument(content: string): ExtractedTemplate {
    const trimmed = content.trim();
    if (!trimmed) {
        throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_INVALID);
    }
    if (Buffer.byteLength(trimmed, 'utf8') > TEMPLATE_BODY_LIMIT) {
        throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_TOO_LARGE);
    }

    let document: unknown;
    let format: 'yaml' | 'json';
    try {
        document = JSON.parse(trimmed);
        format = 'json';
    } catch {
        try {
            document = yaml.load(trimmed, { schema: SCHEMA });
            format = 'yaml';
        } catch {
            throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_INVALID);
        }
    }

    const root = asRecord(document);
    const resources = asRecord(root?.Resources);
    if (!root || !resources || Object.keys(resources).length === 0) {
        throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_INVALID);
    }

    const transforms = transformNames(root.Transform);
    for (const transform of transforms) {
        if (!ALLOWED_TRANSFORMS.has(transform)) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_UNSUPPORTED);
        }
    }

    const knownIds = new Set(Object.keys(resources));
    const extractedResources: ExtractedResource[] = Object.entries(resources).map(([logicalId, value]) => {
        const record = asRecord(value);
        const type = record?.Type;
        if (typeof type !== 'string' || (!type.startsWith('AWS::') && !type.startsWith('Custom::'))) {
            throw new BadRequestException(ErrorMessages.AUTOMATION.TEMPLATE_INVALID);
        }
        assertSupportedResource(type);
        const references = new Set<string>();
        collectResourceReferences(record, knownIds, references);
        references.delete(logicalId);
        const condition = typeof record?.Condition === 'string' ? record.Condition : undefined;
        return {
            logicalId,
            type,
            dependsOn: dependsOnNames(record?.DependsOn),
            references: [...references],
            ...(condition ? { condition } : {}),
        };
    });

    const parameters: ExtractedParameter[] = Object.entries(asRecord(root.Parameters) ?? {}).map(([name, value]) => {
        const record = asRecord(value) ?? {};
        const parameterType = typeof record.Type === 'string' ? record.Type : 'String';
        return {
            name,
            type: parameterType,
            description: typeof record.Description === 'string' ? record.Description : undefined,
            default: record.Default,
            required: record.Default === undefined,
            allowedValues: Array.isArray(record.AllowedValues) ? record.AllowedValues : undefined,
            noEcho: record.NoEcho === true,
            constraintDescription: typeof record.ConstraintDescription === 'string' ? record.ConstraintDescription : undefined,
        };
    });

    const outputs: ExtractedOutput[] = Object.entries(asRecord(root.Outputs) ?? {}).map(([name, value]) => {
        const record = asRecord(value) ?? {};
        return {
            name,
            description: typeof record.Description === 'string' ? record.Description : undefined,
        };
    });

    const hasTransform = root.Transform !== undefined;

    return {
        format,
        parameters,
        resources: extractedResources,
        outputs,
        hasTransform,
        capabilities: detectCapabilities(extractedResources.map((resource) => resource.type), hasTransform),
        contentHash: hashTemplate(trimmed),
        conditions: Object.keys(asRecord(root.Conditions) ?? {}),
        mappings: Object.keys(asRecord(root.Mappings) ?? {}),
    };
}
