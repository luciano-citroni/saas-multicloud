import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CloudProvider } from '../db/entites/cloud-account.entity';

export class CloudAccountResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',

        description: 'ID da conta de cloud (UUID)',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',

        description: 'ID da organização à qual a conta pertence',
    })
    organizationId: string;

    @ApiProperty({
        example: CloudProvider.AWS,

        description: 'Provider da conta de cloud',
    })
    provider: CloudProvider;

    @ApiProperty({
        example: 'Produção',

        description: 'Alias legível da conta',
    })
    alias: string;

    @ApiProperty({
        example: true,

        description: 'Se a conta está ativa',
    })
    isActive: boolean;

    @ApiProperty({
        example: '2026-02-27T10:00:00Z',

        description: 'Data de criação',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-02-27T10:00:00Z',

        description: 'Data da última atualização',
    })
    updatedAt: Date;

    @ApiProperty({
        example: '2026-03-11T11:20:00Z',

        description: 'Data/hora do último sync geral executado para a conta',

        required: false,

        nullable: true,
    })
    lastGeneralSyncAt: Date | null;
}

export class AwsCredentialsDto {
    @ApiProperty({ example: 'arn:aws:iam::123456789012:role/SaasMulticloudRole', description: 'ARN da role a ser assumida' })
    roleArn: string;

    @ApiPropertyOptional({
        example: 'us-east-1',

        description: 'Região AWS principal da conta. Envie este campo ou `regions`.',
    })
    region?: string;

    @ApiPropertyOptional({
        example: ['us-east-1', 'us-west-2'],

        description: 'Lista de regiões AWS associadas à conta. Envie este campo ou `region`.',

        type: [String],
    })
    regions?: string[];

    @ApiProperty({ example: 'external-id-123', description: 'External ID para cross-account (opcional)', required: false })
    externalId?: string;
}

export class CreateCloudAccountRequestDto {
    @ApiProperty({ example: CloudProvider.AWS, description: 'Provider da conta de cloud', enum: Object.values(CloudProvider) })
    provider: CloudProvider;

    @ApiProperty({ example: 'Produção', description: 'Alias legível da conta' })
    alias: string;

    @ApiProperty({
        description: 'Objeto com credenciais específicas do provider. Se `provider` for `aws`, enviar o formato de `AwsCredentialsDto`',

        oneOf: [{ $ref: '#/components/schemas/AwsCredentialsDto' }, { type: 'object', description: 'Formato genérico para outros providers' }],
    })
    credentials: any;
}

export class ValidationErrorResponseDto {
    @ApiProperty({ example: 'ValidationException' })
    error: string;

    @ApiProperty({ example: ['roleArn é obrigatório'] })
    message: string | string[];

    @ApiProperty({ example: { field: 'credentials.roleArn' }, required: false })
    details?: Record<string, any>;
}
