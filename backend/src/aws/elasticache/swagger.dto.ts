import { ApiProperty } from '@nestjs/swagger';

export class ElastiCacheClusterResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'my-redis-cluster' })
    cacheClusterId: string;

    @ApiProperty({ example: 'available', nullable: true })
    cacheClusterStatus: string | null;

    @ApiProperty({ example: 'cache.t3.micro', nullable: true })
    cacheNodeType: string | null;

    @ApiProperty({ example: 'redis', enum: ['redis', 'memcached'], nullable: true })
    engine: string | null;

    @ApiProperty({ example: '7.0.7', nullable: true })
    engineVersion: string | null;

    @ApiProperty({ example: 1, nullable: true })
    numCacheNodes: number | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001', nullable: true })
    vpcId: string | null;

    @ApiProperty({ example: ['123e4567-e89b-12d3-a456-426614174010'], nullable: true })
    securityGroupIds: string[] | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class ElastiCacheClusterSyncResponseDto {
    @ApiProperty({ example: 'my-redis-cluster' })
    cacheClusterId: string;

    @ApiProperty({ example: 'available', nullable: true })
    cacheClusterStatus: string | null;

    @ApiProperty({ example: 'redis', nullable: true })
    engine: string | null;
}

export class ElastiCacheClusterWithRelationsResponseDto extends ElastiCacheClusterResponseDto {
    @ApiProperty({
        example: { id: '123e4567', awsVpcId: 'vpc-0a1b2c3d', cidrBlock: '10.0.0.0/16', state: 'available' },
        nullable: true,
    })
    vpc?: { id: string; awsVpcId: string; cidrBlock: string; state: string } | null;
}
