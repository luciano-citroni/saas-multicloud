import { resolveWorkerConcurrency } from '../common/queues/worker-concurrency';

export const FINOPS_QUEUE = 'finops-sync';
export const FINOPS_JOB_NAME = 'run-finops-sync';
export const FINOPS_WORKER_CONCURRENCY = resolveWorkerConcurrency('FINOPS_WORKER_CONCURRENCY', 2);
export const FINOPS_PENDING_STATES = ['active', 'waiting', 'prioritized', 'delayed', 'paused'] as const;

/** Versão atual do termo de consentimento de APIs de custo. */
export const FINOPS_CONSENT_VERSION = '1.0';

/**
 * Texto exibido ao usuário antes da aceitação do consentimento.
 * A aceitação é obrigatória para consumir AWS Cost Explorer e Azure Cost Management.
 */
export const FINOPS_CONSENT_TERMS = `
Ao aceitar este termo, você autoriza o SaaS MultiCloud a consultar as APIs de
gestão de custos da(s) sua(s) conta(s) de nuvem (AWS Cost Explorer e/ou Azure
Cost Management). Essas APIs podem gerar custos adicionais de acordo com o
modelo de preços do provedor escolhido. Consulte a documentação do provedor
para mais informações sobre tarifas.
`.trim();
