import { ApiProperty } from '@nestjs/swagger';

export class WafWebAclResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'a1b2c3d4-5678-90ab-cdef-EXAMPLE11111' })
    awsWebAclId: string;

    @ApiProperty({ example: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/my-acl/a1b2c3d4' })
    webAclArn: string;

    @ApiProperty({ example: 'my-acl' })
    name: string;

    @ApiProperty({ example: 'REGIONAL', enum: ['REGIONAL', 'CLOUDFRONT'] })
    scope: string;

    @ApiProperty({ example: 100, nullable: true })
    capacity: number | null;

    @ApiProperty({ example: 'ALLOW', enum: ['ALLOW', 'BLOCK'], nullable: true })
    defaultAction: string | null;

    @ApiProperty({ example: 5, nullable: true })
    rulesCount: number | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class WafWebAclSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/my-acl/a1b2c3d4' })
    webAclArn: string;

    @ApiProperty({ example: 'my-acl' })
    name: string;

    @ApiProperty({ example: 'REGIONAL' })
    scope: string;
}
