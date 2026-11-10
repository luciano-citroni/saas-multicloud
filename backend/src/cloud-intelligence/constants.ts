import { resolveWorkerConcurrency } from '../common/queues/worker-concurrency';

export const CLOUD_INTELLIGENCE_DAILY_QUEUE = 'cloud-intelligence-daily';
export const CLOUD_INTELLIGENCE_DAILY_JOB = 'run-daily-intelligence';
export const CLOUD_INTELLIGENCE_DAILY_CONCURRENCY = resolveWorkerConcurrency(
    'CLOUD_INTELLIGENCE_DAILY_WORKER_CONCURRENCY',
    2,
);
