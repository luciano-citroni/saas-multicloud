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

    @ApiProperty({ example: 'us-east-1', nullable: true })
    region: string | null;

    @ApiProperty({ example: 100, nullable: true })
    capacity: number | null;

    @ApiProperty({ example: 'ALLOW', enum: ['ALLOW', 'BLOCK'], nullable: true })
    defaultAction: string | null;

    @ApiProperty({ example: 5, nullable: true })
    rulesCount: number | null;

    @ApiProperty({
        example: [{ name: 'block-bad-ips', priority: 1, action: 'BLOCK', statementType: 'IPSetReferenceStatement' }],
        nullable: true,
    })
    rules: Record<string, unknown>[] | null;

    @ApiProperty({ example: ['arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/my-alb/50dc6c495c0c9188'], nullable: true })
    associatedResources: string[] | null;

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

export class WafIpSetResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'a1b2c3d4-5678-90ab-cdef-EXAMPLE22222' })
    awsIpSetId: string;

    @ApiProperty({ example: 'arn:aws:wafv2:us-east-1:123456789012:regional/ipset/blocked-ips/a1b2c3d4' })
    ipSetArn: string;

    @ApiProperty({ example: 'blocked-ips' })
    name: string;

    @ApiProperty({ example: 'REGIONAL', enum: ['REGIONAL', 'CLOUDFRONT'] })
    scope: string;

    @ApiProperty({ example: 'us-east-1', nullable: true })
    region: string | null;

    @ApiProperty({ example: 'IPV4', enum: ['IPV4', 'IPV6'], nullable: true })
    ipAddressVersion: string | null;

    @ApiProperty({ example: ['203.0.113.0/24', '198.51.100.0/24'], nullable: true })
    addresses: string[] | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class WafIpSetSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:wafv2:us-east-1:123456789012:regional/ipset/blocked-ips/a1b2c3d4' })
    ipSetArn: string;

    @ApiProperty({ example: 'blocked-ips' })
    name: string;

    @ApiProperty({ example: 'REGIONAL' })
    scope: string;
}
