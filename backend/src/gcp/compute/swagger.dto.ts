import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpVmInstanceResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty({ description: 'GCP numeric instance ID' }) gcpInstanceId: string;
    @ApiProperty() name: string;
    @ApiProperty({ example: 'us-central1-a' }) zone: string;
    @ApiProperty({ example: 'n1-standard-1' }) machineType: string;
    @ApiProperty({ example: 'RUNNING' }) status: string;
    @ApiPropertyOptional() networkIp: string | null;
    @ApiPropertyOptional() externalIp: string | null;
    @ApiProperty() deletionProtection: boolean;
    @ApiProperty() canIpForward: boolean;
    @ApiPropertyOptional() serviceAccountEmail: string | null;
    @ApiPropertyOptional({ type: Object }) labels: Record<string, string> | null;
    @ApiPropertyOptional() creationTimestamp: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}
