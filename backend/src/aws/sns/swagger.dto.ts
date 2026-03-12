import { ApiProperty } from '@nestjs/swagger';

export class SnsTopicResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'arn:aws:sns:us-east-1:123456789012:my-topic' })
    topicArn: string;

    @ApiProperty({ example: 'my-topic' })
    topicName: string;

    @ApiProperty({ example: 'My Topic', nullable: true })
    displayName: string | null;

    @ApiProperty({ example: 5, nullable: true })
    subscriptionsConfirmed: number | null;

    @ApiProperty({ example: false })
    isFifo: boolean;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class SnsTopicSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:sns:us-east-1:123456789012:my-topic' })
    topicArn: string;

    @ApiProperty({ example: 'my-topic' })
    topicName: string;

    @ApiProperty({ example: false })
    isFifo: boolean;
}
