import { ApiProperty } from '@nestjs/swagger';

export class CloudWatchAlarmResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:high-cpu' })
    alarmArn: string;

    @ApiProperty({ example: 'high-cpu' })
    alarmName: string;

    @ApiProperty({ example: 'Alarme de CPU alta', nullable: true })
    alarmDescription: string | null;

    @ApiProperty({ example: 'ALARM', enum: ['OK', 'ALARM', 'INSUFFICIENT_DATA'] })
    stateValue: string;

    @ApiProperty({ example: 'AWS/EC2', nullable: true })
    namespace: string | null;

    @ApiProperty({ example: 'CPUUtilization', nullable: true })
    metricName: string | null;

    @ApiProperty({ example: 'GreaterThanThreshold', nullable: true })
    comparisonOperator: string | null;

    @ApiProperty({ example: 80, nullable: true })
    threshold: number | null;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class CloudWatchAlarmSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:cloudwatch:us-east-1:123456789012:alarm:high-cpu' })
    alarmArn: string;

    @ApiProperty({ example: 'high-cpu' })
    alarmName: string;

    @ApiProperty({ example: 'ALARM' })
    stateValue: string;
}
