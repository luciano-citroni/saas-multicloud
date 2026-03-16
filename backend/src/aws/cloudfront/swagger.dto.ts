import { ApiProperty } from '@nestjs/swagger';

export class S3BucketInfoDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174003',

        description: 'ID único do bucket S3 no banco de dados',
    })
    id: string;

    @ApiProperty({
        example: 'my-app-bucket',

        description: 'Nome do bucket S3',
    })
    bucketName: string;

    @ApiProperty({
        example: 'us-east-1',

        description: 'Região do bucket S3',
    })
    region: string;
}

export class CloudFrontDistributionResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174005',

        description: 'ID único da distribuição no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',

        description: 'ID da CloudAccount no banco de dados',
    })
    cloudAccountId: string;

    @ApiProperty({
        example: 'E1234567890ABC',

        description: 'ID da distribuição na AWS',
    })
    distributionId: string;

    @ApiProperty({
        example: 'arn:aws:cloudfront::123456789012:distribution/E1234567890ABC',

        description: 'ARN da distribuição CloudFront',
    })
    arn: string;

    @ApiProperty({
        example: 'd111111abcdef8.cloudfront.net',

        description: 'Nome de domínio da distribuição',
    })
    domainName: string;

    @ApiProperty({
        example: 'Deployed',

        description: 'Status da distribuição (Deployed, InProgress, Disabled)',

        enum: ['Deployed', 'InProgress', 'Disabled'],
    })
    status: string;

    @ApiProperty({
        example: true,

        description: 'Se a distribuição está habilitada',
    })
    enabled: boolean;

    @ApiProperty({
        example: 'Distribuição para o site principal',

        description: 'Comentário/descrição da distribuição',

        nullable: true,
    })
    comment: string | null;

    @ApiProperty({
        example: 'PriceClass_100',

        description: 'Classe de preço (PriceClass_100, PriceClass_200, PriceClass_All)',

        enum: ['PriceClass_100', 'PriceClass_200', 'PriceClass_All'],
    })
    priceClass: string;

    @ApiProperty({
        example: ['www.example.com', 'example.com'],

        description: 'CNAMEs alternativos (aliases) da distribuição',

        nullable: true,

        type: [String],
    })
    aliases: string[] | null;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174003',

        description: 'ID do bucket S3 usado como origem',

        nullable: true,
    })
    s3BucketId: string | null;

    @ApiProperty({
        description: 'Informações do bucket S3 vinculado (se aplicável)',

        nullable: true,

        type: S3BucketInfoDto,
    })
    s3Bucket: S3BucketInfoDto | null;

    @ApiProperty({
        example: 'my-app-bucket.s3.amazonaws.com',

        description: 'Nome do domínio de origem',
    })
    originDomainName: string;

    @ApiProperty({
        example: 'S3-my-app-bucket',

        description: 'ID da origem',
    })
    originId: string;

    @ApiProperty({
        example: '/production',

        description: 'Path da origem',

        nullable: true,
    })
    originPath: string | null;

    @ApiProperty({
        example: true,

        description: 'Se a origem usa Origin Access Identity (OAI) para S3',
    })
    originAccessIdentityEnabled: boolean;

    @ApiProperty({
        example: 'index.html',

        description: 'Caminho do objeto raiz padrão',

        nullable: true,
    })
    defaultRootObject: string | null;

    @ApiProperty({
        example: 'redirect-to-https',

        description: 'Política de protocolo do visualizador',

        enum: ['allow-all', 'https-only', 'redirect-to-https'],
    })
    viewerProtocolPolicy: string;

    @ApiProperty({
        example: true,

        description: 'Se a compressão está habilitada',
    })
    compress: boolean;

    @ApiProperty({
        example: 0,

        description: 'TTL mínimo do cache (em segundos)',
    })
    minTTL: number;

    @ApiProperty({
        example: 86400,

        description: 'TTL padrão do cache (em segundos)',
    })
    defaultTTL: number;

    @ApiProperty({
        example: 31536000,

        description: 'TTL máximo do cache (em segundos)',
    })
    maxTTL: number;

    @ApiProperty({
        example: true,

        description: 'Se o IPv6 está habilitado',
    })
    ipv6Enabled: boolean;

    @ApiProperty({
        example: true,

        description: 'Se a distribuição tem certificado SSL/TLS customizado',
    })
    hasCustomCertificate: boolean;

    @ApiProperty({
        example: 'arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012',

        description: 'ARN do certificado ACM',

        nullable: true,
    })
    certificateArn: string | null;

    @ApiProperty({
        example: 'TLSv1.2_2021',

        description: 'Versão mínima do protocolo TLS',

        nullable: true,
    })
    minimumProtocolVersion: string | null;

    @ApiProperty({
        example: true,

        description: 'Se o logging está habilitado',
    })
    loggingEnabled: boolean;

    @ApiProperty({
        example: 'my-logs-bucket.s3.amazonaws.com',

        description: 'Bucket de destino do logging',

        nullable: true,
    })
    loggingBucket: string | null;

    @ApiProperty({
        example: 'cloudfront-logs/',

        description: 'Prefixo do logging',

        nullable: true,
    })
    loggingPrefix: string | null;

    @ApiProperty({
        example: '2026-03-01T10:30:00Z',

        description: 'Data da última modificação da distribuição',

        nullable: true,

        format: 'date-time',
    })
    lastModifiedTime: Date | null;

    @ApiProperty({
        example: { Environment: 'production', Project: 'myapp' },

        description: 'Tags da distribuição',

        nullable: true,
    })
    tags: Record<string, string> | null;

    @ApiProperty({
        example: '2026-03-08T12:00:00Z',

        description: 'Timestamp da última sincronização com AWS',

        nullable: true,

        format: 'date-time',
    })
    lastSyncedAt: Date | null;

    @ApiProperty({
        example: '2026-03-01T09:00:00Z',

        description: 'Data de criação no banco de dados',

        format: 'date-time',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-03-08T12:00:00Z',

        description: 'Data de última atualização no banco de dados',

        format: 'date-time',
    })
    updatedAt: Date;
}

export class CloudFrontSyncResponseDto {
    @ApiProperty({
        example: 5,

        description: 'Total de distribuições CloudFront sincronizadas',
    })
    total: number;

    @ApiProperty({
        example: '2026-03-08T12:00:00Z',

        description: 'Timestamp da sincronização',

        format: 'date-time',
    })
    syncedAt: Date;

    @ApiProperty({
        description: 'Lista das distribuições sincronizadas',

        type: [CloudFrontDistributionResponseDto],
    })
    distributions: CloudFrontDistributionResponseDto[];
}
