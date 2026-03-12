import { ApiProperty } from '@nestjs/swagger';

export class SqsQueueResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue' })
    queueUrl: string;

    @ApiProperty({ example: 'arn:aws:sqs:us-east-1:123456789012:my-queue', nullable: true })
    queueArn: string | null;

    @ApiProperty({ example: 'my-queue' })
    queueName: string;

    @ApiProperty({ example: false })
    isFifo: boolean;

    @ApiProperty({ example: 30, nullable: true })
    visibilityTimeout: number | null;

    @ApiProperty({ example: 345600, nullable: true })
    messageRetentionPeriod: number | null;

    @ApiProperty({ example: 0, nullable: true })
    approximateNumberOfMessages: number | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class SqsQueueSyncResponseDto {
    @ApiProperty({ example: 'https://sqs.us-east-1.amazonaws.com/123456789012/my-queue' })
    queueUrl: string;

    @ApiProperty({ example: 'my-queue' })
    queueName: string;

    @ApiProperty({ example: false })
    isFifo: boolean;
}
