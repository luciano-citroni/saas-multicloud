import { resolveWorkerConcurrency } from '../../common/queues/worker-concurrency';

export const ASSESSMENT_QUEUE = 'aws-assessment';
export const ASSESSMENT_JOB_NAME = 'run-assessment';
export const GENERAL_SYNC_QUEUE = 'aws-general-sync';
export const GENERAL_SYNC_JOB_NAME = 'run-general-sync';

export const AWS_ASSESSMENT_WORKER_CONCURRENCY = resolveWorkerConcurrency('AWS_ASSESSMENT_WORKER_CONCURRENCY', 2);
export const AWS_GENERAL_SYNC_WORKER_CONCURRENCY = resolveWorkerConcurrency('AWS_GENERAL_SYNC_WORKER_CONCURRENCY', 2);
