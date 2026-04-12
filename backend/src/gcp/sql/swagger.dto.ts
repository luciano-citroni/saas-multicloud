import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpSqlInstanceResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty() gcpInstanceId: string;
    @ApiProperty() name: string;
    @ApiProperty({ example: 'POSTGRES_15' }) databaseVersion: string;
    @ApiProperty({ example: 'us-central1' }) region: string;
    @ApiProperty({ example: 'RUNNABLE' }) state: string;
    @ApiPropertyOptional({ example: 'db-n1-standard-1' }) tier: string | null;
    @ApiPropertyOptional({ type: [Object] }) ipAddresses: Record<string, any>[] | null;
    @ApiPropertyOptional({ example: 'PD_SSD' }) diskType: string | null;
    @ApiPropertyOptional({ example: 100 }) diskSizeGb: number | null;
    @ApiProperty() backupEnabled: boolean;
    @ApiPropertyOptional({ example: 'REGIONAL' }) availabilityType: string | null;
    @ApiPropertyOptional({ type: Object }) userLabels: Record<string, string> | null;
    @ApiPropertyOptional() createTime: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}
