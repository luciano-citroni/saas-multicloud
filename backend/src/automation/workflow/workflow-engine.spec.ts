import { BadRequestException } from '@nestjs/common';
import { DependencyResolver } from './dependency-resolver';
import { OutputResolver } from './output-resolver';
import { WorkflowValidator } from './workflow-validator';
import type { WorkflowSnapshot } from './workflow.types';

describe('WorkflowValidator', () => {
    const validator = new WorkflowValidator();

    const validSnapshot: WorkflowSnapshot = {
        nodes: [
            {
                id: 's3-node',
                type: 'AWS_S3_BUCKET_CREATE',
                name: 'Bucket',
                config: { bucketName: 'my-bucket', region: 'us-east-1' },
            },
            {
                id: 'cf-node',
                type: 'AWS_CLOUDFRONT_DISTRIBUTION_CREATE',
                name: 'CDN',
                config: {
                    origin: { type: 'NODE_OUTPUT', nodeId: 's3-node', field: 'bucketDomainName' },
                },
            },
        ],
        edges: [{ id: 'e1', sourceNodeId: 's3-node', targetNodeId: 'cf-node' }],
    };

    it('aceita workflow válido S3 -> CloudFront', () => {
        expect(() => validator.validate(validSnapshot)).not.toThrow();
    });

    it('rejeita workflow vazio', () => {
        expect(() => validator.validate({ nodes: [], edges: [] })).toThrow(BadRequestException);
    });

    it('rejeita ciclo', () => {
        const cyclic: WorkflowSnapshot = {
            nodes: [
                { id: 'a', type: 'AWS_S3_BUCKET_CREATE', name: 'A', config: { bucketName: 'a', region: 'us-east-1' } },
                { id: 'b', type: 'AWS_S3_BUCKET_CREATE', name: 'B', config: { bucketName: 'b', region: 'us-east-1' } },
            ],
            edges: [
                { id: 'e1', sourceNodeId: 'a', targetNodeId: 'b' },
                { id: 'e2', sourceNodeId: 'b', targetNodeId: 'a' },
            ],
        };
        expect(() => validator.validate(cyclic)).toThrow(BadRequestException);
    });

    it('rejeita referência inválida', () => {
        const invalid: WorkflowSnapshot = {
            nodes: [
                {
                    id: 'cf-node',
                    type: 'AWS_CLOUDFRONT_DISTRIBUTION_CREATE',
                    name: 'CDN',
                    config: {
                        origin: { type: 'NODE_OUTPUT', nodeId: 'missing', field: 'bucketDomainName' },
                    },
                },
            ],
            edges: [],
        };
        expect(() => validator.validate(invalid)).toThrow(BadRequestException);
    });
});

describe('DependencyResolver', () => {
    const resolver = new DependencyResolver();

    it('ordena S3 antes de CloudFront', () => {
        const snapshot: WorkflowSnapshot = {
            nodes: [
                { id: 's3', type: 'AWS_S3_BUCKET_CREATE', name: 'S3', config: { bucketName: 'x', region: 'us-east-1' } },
                { id: 'cf', type: 'AWS_CLOUDFRONT_DISTRIBUTION_CREATE', name: 'CF', config: { origin: { type: 'NODE_OUTPUT', nodeId: 's3', field: 'bucketDomainName' } } },
            ],
            edges: [{ id: 'e1', sourceNodeId: 's3', targetNodeId: 'cf' }],
        };

        const batches = resolver.resolveBatches(snapshot);
        expect(batches[0]).toEqual(['s3']);
        expect(batches[1]).toEqual(['cf']);
    });

    it('permite paralelismo em mesmo nível', () => {
        const snapshot: WorkflowSnapshot = {
            nodes: [
                { id: 'vpc', type: 'AWS_S3_BUCKET_CREATE', name: 'VPC', config: { bucketName: 'vpc', region: 'us-east-1' } },
                { id: 'subnet-a', type: 'AWS_S3_BUCKET_CREATE', name: 'A', config: { bucketName: 'a', region: 'us-east-1' } },
                { id: 'subnet-b', type: 'AWS_S3_BUCKET_CREATE', name: 'B', config: { bucketName: 'b', region: 'us-east-1' } },
            ],
            edges: [
                { id: 'e1', sourceNodeId: 'vpc', targetNodeId: 'subnet-a' },
                { id: 'e2', sourceNodeId: 'vpc', targetNodeId: 'subnet-b' },
            ],
        };

        const batches = resolver.resolveBatches(snapshot);
        expect(batches[0]).toEqual(['vpc']);
        expect(batches[1]).toHaveLength(2);
        expect(batches[1]).toContain('subnet-a');
        expect(batches[1]).toContain('subnet-b');
    });
});

describe('OutputResolver', () => {
    const resolver = new OutputResolver();

    it('resolve NODE_OUTPUT', () => {
        const outputs = new Map<string, Record<string, unknown>>([
            ['s3-node', { bucketDomainName: 'my-bucket.s3.amazonaws.com' }],
        ]);

        const resolved = resolver.resolveConfig(
            {
                origin: { type: 'NODE_OUTPUT', nodeId: 's3-node', field: 'bucketDomainName' },
            },
            outputs,
        );

        expect(resolved.origin).toBe('my-bucket.s3.amazonaws.com');
    });

    it('falha quando output não existe', () => {
        const outputs = new Map<string, Record<string, unknown>>();
        expect(() =>
            resolver.resolveConfig(
                { origin: { type: 'NODE_OUTPUT', nodeId: 'missing', field: 'bucketDomainName' } },
                outputs,
            ),
        ).toThrow(BadRequestException);
    });
});
