import { ApiProperty } from '@nestjs/swagger';

export class SecretsManagerSecretResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-abc123' })
    secretArn: string;

    @ApiProperty({ example: 'my-secret' })
    name: string;

    @ApiProperty({ example: 'Meu secret de produção', nullable: true })
    description: string | null;

    @ApiProperty({ example: false })
    rotationEnabled: boolean;

    @ApiProperty({ example: 30, nullable: true })
    rotationRulesAutomaticallyAfterDays: number | null;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastRotatedDate: Date | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class SecretsManagerSecretSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-abc123' })
    secretArn: string;

    @ApiProperty({ example: 'my-secret' })
    name: string;

    @ApiProperty({ example: false })
    rotationEnabled: boolean;
}
