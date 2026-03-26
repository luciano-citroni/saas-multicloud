type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';

export function translateGovernanceSeverity(severity: FindingSeverity): string {
    const labels: Record<FindingSeverity, string> = {
        critical: 'crítica',
        high: 'alta',
        medium: 'média',
        low: 'baixa',
    };

    return labels[severity];
}

export function translateGovernancePolicyName(name: string): string {
    const policyMap: Record<string, string> = {
        'EC2 Instance Must Have Required Tags': 'Instância EC2 deve ter tags obrigatórias',
        'S3 Bucket Must Have Server-Side Encryption Enabled': 'Bucket S3 deve ter criptografia no servidor habilitada',
    };

    return policyMap[name] ?? name;
}

export function translateGovernanceResourceType(resourceType: string): string {
    const resourceTypeMap: Record<string, string> = {
        EC2Instance: 'Instância EC2',
        S3Bucket: 'Bucket S3',
    };

    return resourceTypeMap[resourceType] ?? resourceType;
}

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

    return applyCommonEnglishReplacements(description.replace(/is missing required tags/gi, 'está sem as tags obrigatórias'));
}

export function translateGovernanceRecommendation(recommendation: string): string {
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

    return applyCommonEnglishReplacements(
        recommendation
            .replace(/Add the following required tags to the EC2 instance/gi, 'Adicione as seguintes tags obrigatórias na instância EC2')
            .replace(/Tags should describe/gi, 'As tags devem descrever')
            .replace(/environment \(e\.g\., production, staging\)/gi, 'ambiente (ex.: produção, homologação)')
            .replace(/purpose/gi, 'finalidade')
    );
}
