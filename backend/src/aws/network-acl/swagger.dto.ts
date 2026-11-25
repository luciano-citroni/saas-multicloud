import { ApiProperty } from '@nestjs/swagger';

export class NetworkAclResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'acl-0a1b2c3d4e5f67890' })
    awsNetworkAclId: string;

    @ApiProperty({ example: 'vpc-0a1b2c3d4e5f67890', nullable: true })
    awsVpcId: string | null;

    @ApiProperty({ example: 'us-east-1', nullable: true })
    region: string | null;

    @ApiProperty({ example: true })
    isDefault: boolean;

    @ApiProperty({
        example: [{ ruleNumber: 100, protocol: '6', ruleAction: 'allow', egress: false, cidrBlock: '0.0.0.0/0' }],
        nullable: true,
    })
    entries: Record<string, unknown>[] | null;

    @ApiProperty({
        example: [{ networkAclAssociationId: 'aclassoc-xxx', subnetId: 'subnet-xxx' }],
        nullable: true,
    })
    associations: Record<string, unknown>[] | null;

    @ApiProperty({ example: { Name: 'my-nacl' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class NetworkAclSyncResponseDto {
    @ApiProperty({ example: 'acl-0a1b2c3d4e5f67890' })
    awsNetworkAclId: string;

    @ApiProperty({ example: 'my-nacl' })
    name: string;

    @ApiProperty({ example: 'us-east-1', nullable: true })
    region: string | null;
}
