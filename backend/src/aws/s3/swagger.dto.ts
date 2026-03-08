import { ApiProperty } from '@nestjs/swagger';

export class S3BucketResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174003',
        description: 'ID único do bucket no banco de dados (UUID)',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',
        description: 'ID da CloudAccount no banco de dados',
    })
    cloudAccountId: string;

    @ApiProperty({
        example: 'my-app-bucket',
        description: 'Nome do bucket S3 (globalmente único)',
    })
    bucketName: string;

    @ApiProperty({
        example: 'arn:aws:s3:::my-app-bucket',
        description: 'ARN do bucket',
        nullable: true,
    })
    bucketArn: string | null;

    @ApiProperty({
        example: 'us-east-1',
        description: 'Região AWS onde o bucket está localizado',
    })
    region: string;

    @ApiProperty({
        example: '2026-01-15T10:30:00Z',
        description: 'Data de criação do bucket',
        nullable: true,
        format: 'date-time',
    })
    creationDate: Date | null;

    @ApiProperty({
        example: 'Enabled',
        description: 'Status do versionamento (Enabled, Suspended, ou null)',
        nullable: true,
    })
    versioningStatus: string | null;

    @ApiProperty({
        example: true,
        description: 'Se o bucket tem criptografia padrão habilitada',
    })
    encryptionEnabled: boolean;

    @ApiProperty({
        example: 'aws:kms',
        description: 'Tipo de criptografia (AES256, aws:kms)',
        nullable: true,
    })
    encryptionType: string | null;

    @ApiProperty({
        example: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
        description: 'ID da chave KMS usada para criptografia',
        nullable: true,
    })
    kmsKeyId: string | null;

    @ApiProperty({
        example: true,
        description: 'Se o acesso público está bloqueado',
    })
    publicAccessBlocked: boolean;

    @ApiProperty({
        example: true,
        description: 'Se o bucket tem uma política de bucket configurada',
    })
    hasBucketPolicy: boolean;

    @ApiProperty({
        example: false,
        description: 'Se o bucket tem replicação configurada',
    })
    replicationEnabled: boolean;

    @ApiProperty({
        example: true,
        description: 'Se o bucket tem logging configurado',
    })
    loggingEnabled: boolean;

    @ApiProperty({
        example: 'my-logs-bucket',
        description: 'Bucket de destino do logging',
        nullable: true,
    })
    loggingTargetBucket: string | null;

    @ApiProperty({
        example: false,
        description: 'Se o bucket tem website hosting configurado',
    })
    websiteEnabled: boolean;

    @ApiProperty({
        example: 'index.html',
        description: 'Documento de índice do website',
        nullable: true,
    })
    websiteIndexDocument: string | null;

    @ApiProperty({
        example: 'error.html',
        description: 'Documento de erro do website',
        nullable: true,
    })
    websiteErrorDocument: string | null;

    @ApiProperty({
        example: {
            count: 2,
            rules: [
                { id: 'archive-old-files', status: 'Enabled', transitions: 1, expirationDays: 365 },
                { id: 'delete-temp-files', status: 'Enabled', transitions: 0, expirationDays: 7 },
            ],
        },
        description: 'Resumo das lifecycle rules configuradas',
        nullable: true,
    })
    lifecycleRules: any | null;

    @ApiProperty({
        example: { Environment: 'production', Project: 'myapp' },
        description: 'Tags do bucket (pares chave-valor)',
    })
    tags: Record<string, string>;

    @ApiProperty({
        example: '2026-03-08T10:15:30Z',
        description: 'Data e hora da última sincronização',
        nullable: true,
        format: 'date-time',
    })
    lastSyncedAt: Date | null;
}

export class S3SyncResponseDto {
    @ApiProperty({
        example: 'my-app-bucket',
        description: 'Nome do bucket S3',
    })
    bucketName: string;

    @ApiProperty({
        example: 'us-east-1',
        description: 'Região do bucket',
    })
    region: string;

    @ApiProperty({
        example: '2026-01-15T10:30:00Z',
        description: 'Data de criação',
        nullable: true,
    })
    creationDate: Date | null;

    @ApiProperty({
        example: true,
        description: 'Se o bucket tem criptografia habilitada',
    })
    encryptionEnabled: boolean;

    @ApiProperty({
        example: true,
        description: 'Se o acesso público está bloqueado',
    })
    publicAccessBlocked: boolean;

    @ApiProperty({
        example: { Environment: 'production' },
        description: 'Tags do bucket',
    })
    tags: Record<string, string>;
}
