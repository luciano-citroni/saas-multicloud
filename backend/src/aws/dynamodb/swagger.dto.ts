import { ApiProperty } from '@nestjs/swagger';

export class DynamoDbTableResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'arn:aws:dynamodb:us-east-1:123456789012:table/my-table' })
    tableArn: string;

    @ApiProperty({ example: 'my-table' })
    tableName: string;

    @ApiProperty({ example: 'ACTIVE', nullable: true })
    tableStatus: string | null;

    @ApiProperty({ example: 'PAY_PER_REQUEST', enum: ['PROVISIONED', 'PAY_PER_REQUEST'], nullable: true })
    billingMode: string | null;

    @ApiProperty({ example: 1000, nullable: true })
    itemCount: number | null;

    @ApiProperty({ example: 512000, nullable: true })
    tableSizeBytes: number | null;

    @ApiProperty({ example: true, nullable: true })
    pointInTimeRecoveryEnabled: boolean | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class DynamoDbTableSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:dynamodb:us-east-1:123456789012:table/my-table' })
    tableArn: string;

    @ApiProperty({ example: 'my-table' })
    tableName: string;

    @ApiProperty({ example: 'ACTIVE', nullable: true })
    tableStatus: string | null;
}
