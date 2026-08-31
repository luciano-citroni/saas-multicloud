import { resolveWorkerConcurrency } from '../common/queues/worker-concurrency';

export const AUTOMATION_EXECUTION_QUEUE = 'automation-execution';
export const AUTOMATION_EXECUTION_JOB_NAME = 'run-automation-execution';
export const AUTOMATION_EXECUTION_WORKER_CONCURRENCY = resolveWorkerConcurrency('AUTOMATION_EXECUTION_WORKER_CONCURRENCY', 2);

export const AUTOMATION_ACTION_TYPES = {
    AWS_S3_BUCKET_CREATE: 'AWS_S3_BUCKET_CREATE',
    AWS_CLOUDFRONT_DISTRIBUTION_CREATE: 'AWS_CLOUDFRONT_DISTRIBUTION_CREATE',
} as const;

export type AutomationActionType = keyof typeof AUTOMATION_ACTION_TYPES | string;

/** Maps legacy node types to canonical action types. */
export const LEGACY_ACTION_TYPE_MAP: Record<string, string> = {
    s3: AUTOMATION_ACTION_TYPES.AWS_S3_BUCKET_CREATE,
    cloudfront: AUTOMATION_ACTION_TYPES.AWS_CLOUDFRONT_DISTRIBUTION_CREATE,
    ec2: 'ec2',
    rds: 'rds',
    lambda: 'lambda',
};

export function normalizeActionType(type: string): string {
    return LEGACY_ACTION_TYPE_MAP[type] ?? type;
}
