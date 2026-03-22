import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class AzureNetworkBaseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty() cloudAccountId!: string;
    @ApiProperty() azureId!: string;
    @ApiProperty() name!: string;
    @ApiPropertyOptional() location!: string | null;
    @ApiPropertyOptional() resourceGroup!: string | null;
    @ApiPropertyOptional() subscriptionId!: string | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) tags!: Record<string, string> | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) properties!: Record<string, any> | null;
    @ApiPropertyOptional() lastSyncedAt!: Date | null;
    @ApiProperty() createdAt!: Date;
    @ApiProperty() updatedAt!: Date;
}

export class AzureVirtualNetworkResponseDto extends AzureNetworkBaseDto {
    @ApiPropertyOptional({ type: [String] }) addressPrefixes!: string[] | null;
}

export class AzureNetworkInterfaceResponseDto extends AzureNetworkBaseDto {
    @ApiPropertyOptional() privateIpAddress!: string | null;
    @ApiPropertyOptional() provisioningState!: string | null;
}

export class AzurePublicIpResponseDto extends AzureNetworkBaseDto {
    @ApiPropertyOptional() ipAddress!: string | null;
    @ApiPropertyOptional() allocationMethod!: string | null;
}

export class AzureNsgResponseDto extends AzureNetworkBaseDto {}

export class AzureLoadBalancerResponseDto extends AzureNetworkBaseDto {
    @ApiPropertyOptional() sku!: string | null;
}

export class AzureApplicationGatewayResponseDto extends AzureNetworkBaseDto {
    @ApiPropertyOptional() sku!: string | null;
    @ApiPropertyOptional() provisioningState!: string | null;
}
