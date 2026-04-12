import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpVpcNetworkResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty() gcpNetworkId: string;
    @ApiProperty() name: string;
    @ApiPropertyOptional() description: string | null;
    @ApiPropertyOptional({ example: 'REGIONAL' }) routingMode: string | null;
    @ApiProperty() autoCreateSubnetworks: boolean;
    @ApiPropertyOptional({ type: [String] }) subnetworkUrls: string[] | null;
    @ApiPropertyOptional() creationTimestamp: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}

export class GcpSubnetworkResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty() gcpSubnetworkId: string;
    @ApiProperty() name: string;
    @ApiProperty({ example: 'us-central1' }) region: string;
    @ApiProperty({ example: '10.0.0.0/24' }) ipCidrRange: string;
    @ApiPropertyOptional() networkName: string | null;
    @ApiProperty() privateIpGoogleAccess: boolean;
    @ApiPropertyOptional() purpose: string | null;
    @ApiPropertyOptional() creationTimestamp: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}

export class GcpFirewallRuleResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty() gcpFirewallId: string;
    @ApiProperty() name: string;
    @ApiPropertyOptional() description: string | null;
    @ApiPropertyOptional() networkName: string | null;
    @ApiProperty({ example: 'INGRESS' }) direction: string;
    @ApiProperty({ example: 1000 }) priority: number;
    @ApiPropertyOptional({ type: [Object] }) allowed: Record<string, any>[] | null;
    @ApiPropertyOptional({ type: [Object] }) denied: Record<string, any>[] | null;
    @ApiPropertyOptional({ type: [String] }) sourceRanges: string[] | null;
    @ApiPropertyOptional({ type: [String] }) targetTags: string[] | null;
    @ApiProperty() disabled: boolean;
    @ApiPropertyOptional() creationTimestamp: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}
