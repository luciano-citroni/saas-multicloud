import { resolveWorkerConcurrency } from '../common/queues/worker-concurrency';

export const GOVERNANCE_QUEUE = 'governance-scan';
export const GOVERNANCE_JOB_NAME = 'run-governance-scan';
export const GOVERNANCE_WORKER_CONCURRENCY = resolveWorkerConcurrency('GOVERNANCE_WORKER_CONCURRENCY', 4);
export const GOVERNANCE_PENDING_STATES = ['active', 'waiting', 'prioritized', 'delayed', 'paused'] as const;
export const GOVERNANCE_FINDINGS_BATCH_SIZE = 250;
