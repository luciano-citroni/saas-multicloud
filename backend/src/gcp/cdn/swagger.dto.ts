import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpCdnBackendServiceResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty({ description: 'GCP numeric backend service ID' }) gcpBackendServiceId: string;
    @ApiProperty() name: string;
    @ApiProperty({ example: 'global' }) region: string;
    @ApiPropertyOptional({ example: 'EXTERNAL' }) loadBalancingScheme: string | null;
    @ApiPropertyOptional({ example: 'HTTP' }) protocol: string | null;
    @ApiProperty() cdnEnabled: boolean;
    @ApiPropertyOptional({ example: 'CACHE_ALL_STATIC' }) cacheMode: string | null;
    @ApiPropertyOptional() defaultTtlSeconds: number | null;
    @ApiPropertyOptional() maxTtlSeconds: number | null;
    @ApiPropertyOptional() connectionDrainingTimeoutSec: number | null;
    @ApiPropertyOptional({ type: [Object] }) backends: Record<string, unknown>[] | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}
