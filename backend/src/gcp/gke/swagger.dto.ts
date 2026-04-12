import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpGkeClusterResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty() gcpClusterId: string;
    @ApiProperty() name: string;
    @ApiProperty({ example: 'us-central1' }) location: string;
    @ApiProperty({ example: 'RUNNING' }) status: string;
    @ApiPropertyOptional({ example: 3 }) nodeCount: number | null;
    @ApiPropertyOptional({ example: '1.30.5-gke.1014001' }) currentMasterVersion: string | null;
    @ApiPropertyOptional() currentNodeVersion: string | null;
    @ApiPropertyOptional() endpoint: string | null;
    @ApiPropertyOptional() networkName: string | null;
    @ApiPropertyOptional() subnetwork: string | null;
    @ApiPropertyOptional({ type: Object }) resourceLabels: Record<string, string> | null;
    @ApiPropertyOptional() createTime: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}
