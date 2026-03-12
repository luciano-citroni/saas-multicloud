import { ApiProperty } from '@nestjs/swagger';

export class EcrRepositoryResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'arn:aws:ecr:us-east-1:123456789012:repository/my-repo' })
    repositoryArn: string;

    @ApiProperty({ example: 'my-repo' })
    repositoryName: string;

    @ApiProperty({ example: '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-repo', nullable: true })
    repositoryUri: string | null;

    @ApiProperty({ example: 'MUTABLE', enum: ['MUTABLE', 'IMMUTABLE'], nullable: true })
    imageTagMutability: string | null;

    @ApiProperty({ example: true })
    scanOnPush: boolean;

    @ApiProperty({ example: 'AES256', nullable: true })
    encryptionType: string | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class EcrRepositorySyncResponseDto {
    @ApiProperty({ example: 'arn:aws:ecr:us-east-1:123456789012:repository/my-repo' })
    repositoryArn: string;

    @ApiProperty({ example: 'my-repo' })
    repositoryName: string;

    @ApiProperty({ example: '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-repo', nullable: true })
    repositoryUri: string | null;
}
