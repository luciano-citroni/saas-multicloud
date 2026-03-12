import { ApiProperty } from '@nestjs/swagger';

export class GuardDutyDetectorResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'abc1234567890abcdef1234567890abc' })
    detectorId: string;

    @ApiProperty({ example: 'ENABLED', enum: ['ENABLED', 'DISABLED'], nullable: true })
    status: string | null;

    @ApiProperty({ example: 'SIX_HOURS', enum: ['SIX_HOURS', 'ONE_HOUR', 'FIFTEEN_MINUTES'], nullable: true })
    findingPublishingFrequency: string | null;

    @ApiProperty({ example: 42, nullable: true })
    findingsCount: number | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class GuardDutyDetectorSyncResponseDto {
    @ApiProperty({ example: 'abc1234567890abcdef1234567890abc' })
    detectorId: string;

    @ApiProperty({ example: 'ENABLED', nullable: true })
    status: string | null;

    @ApiProperty({ example: 42, nullable: true })
    findingsCount: number | null;
}
