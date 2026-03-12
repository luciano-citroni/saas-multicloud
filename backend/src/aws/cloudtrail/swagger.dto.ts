import { ApiProperty } from '@nestjs/swagger';

export class CloudTrailTrailResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/my-trail' })
    trailArn: string;

    @ApiProperty({ example: 'my-trail' })
    name: string;

    @ApiProperty({ example: 'my-bucket', nullable: true })
    s3BucketName: string | null;

    @ApiProperty({ example: false })
    isMultiRegionTrail: boolean;

    @ApiProperty({ example: true })
    isLogging: boolean;

    @ApiProperty({ example: 'us-east-1', nullable: true })
    homeRegion: string | null;

    @ApiProperty({ example: true })
    logFileValidationEnabled: boolean;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class CloudTrailTrailSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:cloudtrail:us-east-1:123456789012:trail/my-trail' })
    trailArn: string;

    @ApiProperty({ example: 'my-trail' })
    name: string;

    @ApiProperty({ example: true })
    isLogging: boolean;
}

export class CloudTrailTrailWithRelationsResponseDto extends CloudTrailTrailResponseDto {
    @ApiProperty({
        example: { id: '123e4567-e89b-12d3-a456-426614174001', awsVpcId: 'vpc-0a1b2c3d', cidrBlock: '10.0.0.0/16', state: 'available' },
        nullable: true,
    })
    vpc?: { id: string; awsVpcId: string; cidrBlock: string; state: string } | null;
}
