import { resolveWorkerConcurrency } from '../../common/queues/worker-concurrency';

export const AZURE_ASSESSMENT_QUEUE = 'azure-assessment';
export const AZURE_ASSESSMENT_JOB_NAME = 'run-azure-assessment';
export const AZURE_ASSESSMENT_WORKER_CONCURRENCY = resolveWorkerConcurrency('AZURE_ASSESSMENT_WORKER_CONCURRENCY', 2);
