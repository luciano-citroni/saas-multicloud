export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FindingStatus = 'compliant' | 'non_compliant' | 'warning';

/**
 * Resultado da avaliação de uma política contra um único recurso.
 */
export interface PolicyEvaluationResult {
    /** Resultado da verificação para este recurso. */
    status: FindingStatus;
    /** Identificador do recurso avaliado (ARN, nome, ID nativo, etc). */
    resourceId: string;
    /** Tipo canônico do recurso (ex: S3Bucket, SecurityGroup). */
    resourceType: string;
    /** Descrição do resultado encontrado. */
    description: string;
    /** Recomendação de correção. Vazio quando status = compliant. */
    recommendation: string;
    /** Metadados adicionais para diagnóstico. */
    metadata?: Record<string, any>;
}

/**
 * Contexto de execução passado a cada política durante o scan.
 */
export interface PolicyContext {
    cloudAccountId: string;
    organizationId: string;
}

/**
 * Interface que toda política de governança deve implementar.
 *
 * Para adicionar uma nova política:
 *  1. Crie uma classe que implemente GovernancePolicy
 *  2. Anote com @Injectable()
 *  3. Registre em PolicyRegistryService
 */
export interface GovernancePolicy {
    /** Identificador único e estável da política (ex: aws-s3-no-public-access). */
    readonly id: string;
    /** Nome legível. */
    readonly name: string;
    /** Descrição do que a política verifica. */
    readonly description: string;
    /** Tipo de recurso alvo (ex: S3Bucket). */
    readonly resourceType: string;
    /** Severidade padrão dos achados não-conformes. */
    readonly severity: FindingSeverity;
    /** Provider alvo: 'aws' | 'azure' | 'gcp' | '*'. */
    readonly provider: string;
    /**
     * Avalia um único recurso e retorna um array de resultados.
     * Retorna um item com status='compliant' quando o recurso está em conformidade.
     */
    evaluate(resource: any, context: PolicyContext): PolicyEvaluationResult[];
}
