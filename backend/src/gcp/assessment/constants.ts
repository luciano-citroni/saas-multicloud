import { resolveWorkerConcurrency } from '../../common/queues/worker-concurrency';

export const GCP_ASSESSMENT_QUEUE = 'gcp-assessment';
export const GCP_ASSESSMENT_JOB_NAME = 'run-gcp-assessment';
export const GCP_ASSESSMENT_WORKER_CONCURRENCY = 2;

export const GCP_GENERAL_SYNC_QUEUE = 'gcp-general-sync';
export const GCP_GENERAL_SYNC_JOB_NAME = 'run-gcp-general-sync';
export const GCP_GENERAL_SYNC_WORKER_CONCURRENCY = resolveWorkerConcurrency('GCP_GENERAL_SYNC_WORKER_CONCURRENCY', 2);
