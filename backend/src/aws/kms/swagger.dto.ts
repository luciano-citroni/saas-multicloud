import { ApiProperty } from '@nestjs/swagger';

export class KmsKeyResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: '1234abcd-12ab-34cd-56ef-1234567890ab' })
    awsKeyId: string;

    @ApiProperty({ example: 'arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab' })
    keyArn: string;

    @ApiProperty({ example: 'Enabled', nullable: true })
    keyState: string | null;

    @ApiProperty({ example: 'ENCRYPT_DECRYPT', nullable: true })
    keyUsage: string | null;

    @ApiProperty({ example: 'CUSTOMER', enum: ['AWS', 'CUSTOMER'], nullable: true })
    keyManager: string | null;

    @ApiProperty({ example: true, nullable: true })
    keyRotationEnabled: boolean | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class KmsKeySyncResponseDto {
    @ApiProperty({ example: '1234abcd-12ab-34cd-56ef-1234567890ab' })
    awsKeyId: string;

    @ApiProperty({ example: 'arn:aws:kms:us-east-1:123456789012:key/1234abcd' })
    keyArn: string;

    @ApiProperty({ example: 'Enabled', nullable: true })
    keyState: string | null;
}
