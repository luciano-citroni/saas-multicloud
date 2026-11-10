import { getLocale } from '@/lib/locale';

type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

export function translateGovernanceSeverity(severity: FindingSeverity): string {
    if (getLocale() === 'en') {
        const enLabels: Record<FindingSeverity, string> = {
            critical: 'critical',
            high: 'high',
            medium: 'medium',
            low: 'low',
        };

        return enLabels[severity] ?? severity;
    }

    const labels: Record<FindingSeverity, string> = {
        critical: 'crítica',
        high: 'alta',
        medium: 'média',
        low: 'baixa',
    };

    return labels[severity];
}

export function translateGovernancePolicyName(name: string): string {
    if (getLocale() === 'en') return name;

    const policyMap: Record<string, string> = {
        'EC2 Instance Must Have Required Tags': 'Instância EC2 deve ter tags obrigatórias',
        'EC2 Instance Should Have an IAM Instance Profile': 'Instância EC2 deve ter um perfil de instância IAM',
        'EC2 Instance Should Not Have a Public IP Address': 'Instância EC2 não deve ter IP público',
        'S3 Bucket Must Have Server-Side Encryption Enabled': 'Bucket S3 deve ter criptografia no servidor habilitada',
        'S3 Bucket Must Not Be Publicly Accessible': 'Bucket S3 não deve ser acessível publicamente',
        'S3 Bucket Should Have Server Access Logging Enabled': 'Bucket S3 deve ter logging de acesso habilitado',
        'S3 Bucket Should Have Versioning Enabled': 'Bucket S3 deve ter versionamento habilitado',
        'Security Group Must Not Allow SSH From Any IP': 'Security Group não deve permitir SSH de qualquer IP',
        'Security Group Must Not Allow RDP From Any IP': 'Security Group não deve permitir RDP de qualquer IP',
        'Security Group Must Not Expose Database Ports Publicly':
            'Security Group não deve expor portas de banco publicamente',
        'RDS Instance Must Not Be Publicly Accessible': 'Instância RDS não deve ser acessível publicamente',
        'RDS Instance Must Have Storage Encryption Enabled': 'Instância RDS deve ter criptografia de armazenamento',
        'RDS Instance Must Have Deletion Protection Enabled': 'Instância RDS deve ter proteção contra exclusão',
        'RDS Production Instance Should Have Multi-AZ Enabled':
            'Instância RDS de produção deve ter Multi-AZ habilitado',
        'RDS Instance Must Have Automated Backups Retained for At Least 7 Days':
            'Instância RDS deve reter backups automáticos por pelo menos 7 dias',
        'IAM Role Must Not Have Unrestricted Administrator Access':
            'Role IAM não deve ter acesso de administrador irrestrito',
        'IAM Role Session Duration Should Not Exceed 8 Hours':
            'Duração da sessão da role IAM não deve exceder 8 horas',
        'Lambda Function That Accesses Private Resources Should Be in a VPC':
            'Função Lambda que acessa recursos privados deve estar em uma VPC',
        'EKS Cluster Public API Endpoint Must Be Restricted':
            'Endpoint público da API do cluster EKS deve ser restrito',
        'AWS GuardDuty Must Be Enabled': 'AWS GuardDuty deve estar habilitado',
        'KMS Customer-Managed Keys Must Have Automatic Rotation Enabled':
            'Chaves KMS gerenciadas pelo cliente devem ter rotação automática',
        'CloudTrail Trail Must Be Actively Logging': 'Trail do CloudTrail deve estar registrando ativamente',
        'CloudTrail Trail Should Be a Multi-Region Trail': 'Trail do CloudTrail deve ser multi-região',
        'CloudTrail Log File Validation Must Be Enabled':
            'Validação de arquivos de log do CloudTrail deve estar habilitada',
        'GCP Storage Bucket Must Not Be Publicly Accessible':
            'Bucket Storage GCP não deve ser acessível publicamente',
        'GCP Storage Bucket Must Use Uniform Bucket-Level Access':
            'Bucket Storage GCP deve usar acesso uniforme no nível do bucket',
        'GCP Storage Bucket Should Have Versioning Enabled':
            'Bucket Storage GCP deve ter versionamento habilitado',
        'GCP VM Instance Must Have Required Labels': 'Instância VM GCP deve ter labels obrigatórios',
        'GCP VM Instance Should Not Have a Public External IP':
            'Instância VM GCP não deve ter IP externo público',
        'GCP VM Instance Should Have Deletion Protection Enabled':
            'Instância VM GCP deve ter proteção contra exclusão',
        'GCP Firewall Rule Must Not Allow SSH From Any IP':
            'Regra de firewall GCP não deve permitir SSH de qualquer IP',
        'GCP Firewall Rule Must Not Allow RDP From Any IP':
            'Regra de firewall GCP não deve permitir RDP de qualquer IP',
        'GCP Firewall Rule Must Not Expose Database Ports to the Internet':
            'Regra de firewall GCP não deve expor portas de banco à internet',
        'GCP Cloud SQL Instance Must Not Have a Public IP Address':
            'Instância Cloud SQL não deve ter IP público',
        'GCP Cloud SQL Instance Must Have Automated Backups Enabled':
            'Instância Cloud SQL deve ter backups automáticos habilitados',
        'GCP Cloud SQL Instance Should Use High Availability':
            'Instância Cloud SQL deve usar alta disponibilidade',
        'GCP GKE Cluster Must Have Logging Enabled': 'Cluster GKE deve ter logging habilitado',
        'GCP GKE Cluster Must Have Monitoring Enabled': 'Cluster GKE deve ter monitoramento habilitado',
    };

    return policyMap[name] ?? name;
}

/** Translates CI recommendation titles like "Governance: Policy Name" / "Cost anomaly: Service". */
export function translateCiRecommendationTitle(
    title: string,
    prefixes?: { governance: string; costAnomaly: string },
): string {
    const governancePrefix = prefixes?.governance ?? 'Governance';
    const costAnomalyPrefix = prefixes?.costAnomaly ?? 'Cost anomaly';

    const governanceMatch = title.match(/^Governance:\s*(.+)$/i);
    if (governanceMatch) {
        return `${governancePrefix}: ${translateGovernancePolicyName(governanceMatch[1].trim())}`;
    }

    const costMatch = title.match(/^Cost anomaly:\s*(.+)$/i);
    if (costMatch) {
        return `${costAnomalyPrefix}: ${costMatch[1].trim()}`;
    }

    // Plain policy name without prefix (legacy / edge cases).
    const translatedPolicy = translateGovernancePolicyName(title);
    if (translatedPolicy !== title) return translatedPolicy;

    return title;
}

export function translateGovernanceResourceType(resourceType: string): string {
    if (getLocale() === 'en') {
        const enResourceTypeMap: Record<string, string> = {
            EC2Instance: 'EC2 Instance',
            S3Bucket: 'S3 Bucket',
            SecurityGroup: 'Security Group',
            RDSInstance: 'RDS Instance',
            IAMRole: 'IAM Role',
            LambdaFunction: 'Lambda Function',
            EKSCluster: 'EKS Cluster',
            CloudTrailTrail: 'CloudTrail',
            KMSKey: 'KMS Key',
            GuardDutyDetector: 'GuardDuty',
            GcpVmInstance: 'VM Instance (GCP)',
            GcpStorageBucket: 'Storage Bucket (GCP)',
            GcpFirewallRule: 'Firewall Rule (GCP)',
            GcpSqlInstance: 'Cloud SQL (GCP)',
            GcpGkeCluster: 'GKE Cluster',
        };

        return enResourceTypeMap[resourceType] ?? resourceType;
    }

    const resourceTypeMap: Record<string, string> = {
        EC2Instance: 'Instância EC2',
        S3Bucket: 'Bucket S3',
        SecurityGroup: 'Security Group',
        RDSInstance: 'Instância RDS',
        IAMRole: 'Role IAM',
        LambdaFunction: 'Função Lambda',
        EKSCluster: 'Cluster EKS',
        CloudTrailTrail: 'CloudTrail',
        KMSKey: 'Chave KMS',
        GuardDutyDetector: 'GuardDuty',
        GcpVmInstance: 'Instância VM (GCP)',
        GcpStorageBucket: 'Bucket Storage (GCP)',
        GcpFirewallRule: 'Regra de Firewall (GCP)',
        GcpSqlInstance: 'Cloud SQL (GCP)',
        GcpGkeCluster: 'Cluster GKE',
    };

    return resourceTypeMap[resourceType] ?? resourceType;
}

export const GOVERNANCE_RESOURCE_TYPES_BY_PROVIDER: Record<string, string[]> = {
    aws: [
        'EC2Instance',
        'S3Bucket',
        'SecurityGroup',
        'RDSInstance',
        'IAMRole',
        'LambdaFunction',
        'EKSCluster',
        'CloudTrailTrail',
        'KMSKey',
        'GuardDutyDetector',
    ],
    gcp: ['GcpVmInstance', 'GcpStorageBucket', 'GcpFirewallRule', 'GcpSqlInstance', 'GcpGkeCluster'],
};

function applyCommonEnglishReplacements(text: string): string {
    return text
        .replace(
            /Enable all four configurações de Bloqueio de Acesso Público on the bucket S3/gi,
            'Habilite as quatro configurações de Bloqueio de Acesso Público no bucket S3'
        )
        .replace(/Enable all four/gi, 'Habilite as quatro')
        .replace(/on the bucket S3/gi, 'no bucket S3')
        .replace(/server-side encryption/gi, 'criptografia no servidor')
        .replace(/Enable server-side encryption/gi, 'Habilite a criptografia no servidor')
        .replace(
            /Enable all four Block Public Access settings on the bucket S3/gi,
            'Habilite as quatro configurações de Bloqueio de Acesso Público no bucket S3'
        )
        .replace(/Block Public Access settings/gi, 'configurações de Bloqueio de Acesso Público')
        .replace(/Block Public Access/gi, 'Bloqueio de Acesso Público')
        .replace(/BlockPublicAcls/gi, 'Bloquear ACLs públicas (BlockPublicAcls)')
        .replace(/IgnorePublicAcls/gi, 'Ignorar ACLs públicas (IgnorePublicAcls)')
        .replace(/BlockPublicPolicy/gi, 'Bloquear política pública (BlockPublicPolicy)')
        .replace(/RestrictPublicBuckets/gi, 'Restringir buckets públicos (RestrictPublicBuckets)')
        .replace(/S3 bucket/gi, 'bucket S3')
        .replace(/EC2 instance/gi, 'instância EC2')
        .replace(/required tags/gi, 'tags obrigatórias')
        .replace(/resource/gi, 'recurso')
        .replace(/Use SSE-KMS/gi, 'Use SSE-KMS')
        .replace(/for stronger key management/gi, 'para um gerenciamento de chaves mais forte')
        .replace(/or SSE-S3 \(AES256\) as a minimum baseline/gi, 'ou SSE-S3 (AES256) como linha de base mínima')
        .replace(/does not have/gi, 'não possui')
        .replace(/enabled/gi, 'habilitada')
        .replace(/and may be publicly accessible\.?/gi, 'e pode estar acessível publicamente.');
}

export function translateGovernanceDescription(description: string): string {
    if (getLocale() === 'en') return description;

    const missingTagsRegex = /^EC2 instance "([^"]+)" is missing required tags: (.+)\.$/i;
    const match = description.match(missingTagsRegex);

    if (match) {
        const [, instanceId, tags] = match;
        return `A instância EC2 "${instanceId}" está sem as tags obrigatórias: ${tags}.`;
    }

    const s3EncryptionRegex = /^S3 bucket "([^"]+)" does not have server-side encryption enabled\.$/i;
    const s3Match = description.match(s3EncryptionRegex);

    if (s3Match) {
        const [, bucketName] = s3Match;
        return `O bucket S3 "${bucketName}" não possui criptografia no servidor habilitada.`;
    }

    const s3PublicAccessRegex = /^S3 bucket "([^"]+)" does not have Block Public Access enabled and may be publicly accessible\.$/i;
    const s3PublicAccessMatch = description.match(s3PublicAccessRegex);

    if (s3PublicAccessMatch) {
        const [, bucketName] = s3PublicAccessMatch;
        return `O bucket S3 "${bucketName}" não possui Bloqueio de Acesso Público habilitado e pode estar acessível publicamente.`;
    }

    const s3AccessLoggingRegex = /^S3 bucket "([^"]+)" does not have server access logging enabled\. Access requests are not being recorded\.$/i;
    const s3AccessLoggingMatch = description.match(s3AccessLoggingRegex);

    if (s3AccessLoggingMatch) {
        const [, bucketName] = s3AccessLoggingMatch;
        return `O bucket S3 "${bucketName}" não possui logging de acesso habilitado. As solicitações de acesso não estão sendo registradas.`;
    }

    return applyCommonEnglishReplacements(description.replace(/is missing required tags/gi, 'está sem as tags obrigatórias'));
}

export function translateGovernanceRecommendation(recommendation: string): string {
    if (getLocale() === 'en') return recommendation;

    const addTagsRegex =
        /^Add the following required tags to the EC2 instance: (.+)\. Tags should describe the resource's name, environment \(e\.g\., production, staging\), and purpose\.$/i;

    const match = recommendation.match(addTagsRegex);

    if (match) {
        const [, tags] = match;
        return `Adicione as seguintes tags obrigatórias na instância EC2: ${tags}. As tags devem descrever o nome do recurso, o ambiente (ex.: produção, homologação) e a finalidade.`;
    }

    const s3EncryptionRecommendationRegex =
        /^Enable server-side encryption on the S3 bucket\. Use SSE-KMS \(aws:kms\) for stronger key management or SSE-S3 \(AES256\) as a minimum baseline\.$/i;

    if (s3EncryptionRecommendationRegex.test(recommendation)) {
        return 'Habilite a criptografia no servidor no bucket S3. Use SSE-KMS (aws:kms) para um gerenciamento de chaves mais forte ou SSE-S3 (AES256) como linha de base mínima.';
    }

    const s3PublicAccessRegex =
        /^Enable all four Block Public Access settings on the bucket S3: BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy, RestrictPublicBuckets\.$/i;

    if (s3PublicAccessRegex.test(recommendation)) {
        return 'Habilite as quatro configurações de Bloqueio de Acesso Público no bucket S3: Bloquear ACLs públicas (BlockPublicAcls), Ignorar ACLs públicas (IgnorePublicAcls), Bloquear política pública (BlockPublicPolicy) e Restringir buckets públicos (RestrictPublicBuckets).';
    }

    const s3AccessLoggingRecommendationRegex =
        /^Enable S3 server access logging on the bucket and configure a target logging bucket\. This provides an audit trail of all requests for security analysis and compliance\.$/i;

    if (s3AccessLoggingRecommendationRegex.test(recommendation)) {
        return 'Habilite o logging de acesso do S3 no bucket e configure um bucket de destino para logs. Isso fornece um histórico de auditoria de todas as solicitações para análise de segurança e conformidade.';
    }

    return applyCommonEnglishReplacements(
        recommendation
            .replace(/Add the following required tags to the EC2 instance/gi, 'Adicione as seguintes tags obrigatórias na instância EC2')
            .replace(/Tags should describe/gi, 'As tags devem descrever')
            .replace(/environment \(e\.g\., production, staging\)/gi, 'ambiente (ex.: produção, homologação)')
            .replace(/purpose/gi, 'finalidade')
    );
}
