import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpCloudRunJobResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty({ description: 'Full GCP resource name' }) gcpJobName: string;
    @ApiProperty() name: string;
    @ApiProperty({ example: 'us-central1' }) region: string;
    @ApiPropertyOptional({ example: 'CONDITION_SUCCEEDED' }) condition: string | null;
    @ApiPropertyOptional() containerImage: string | null;
    @ApiPropertyOptional({ example: '1000m' }) cpuLimit: string | null;
    @ApiPropertyOptional({ example: '512Mi' }) memoryLimit: string | null;
    @ApiPropertyOptional() taskCount: number | null;
    @ApiPropertyOptional() maxRetries: number | null;
    @ApiPropertyOptional() executionCount: number | null;
    @ApiPropertyOptional() latestCreatedExecution: string | null;
    @ApiPropertyOptional({ type: Object }) labels: Record<string, string> | null;
    @ApiPropertyOptional() createTime: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}

export class GcpCloudRunServiceResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty({ description: 'Full GCP resource name' }) gcpServiceName: string;
    @ApiProperty() name: string;
    @ApiProperty({ example: 'us-central1' }) region: string;
    @ApiPropertyOptional({ example: 'READY' }) condition: string | null;
    @ApiPropertyOptional({ example: 'https://my-service-xxxx.run.app' }) uri: string | null;
    @ApiProperty() allowsUnauthenticated: boolean;
    @ApiPropertyOptional() latestReadyRevision: string | null;
    @ApiPropertyOptional() containerImage: string | null;
    @ApiPropertyOptional() maxInstanceCount: number | null;
    @ApiPropertyOptional() minInstanceCount: number | null;
    @ApiPropertyOptional({ example: '1000m' }) cpuLimit: string | null;
    @ApiPropertyOptional({ example: '512Mi' }) memoryLimit: string | null;
    @ApiPropertyOptional() vpcConnector: string | null;
    @ApiPropertyOptional({ type: Object }) labels: Record<string, string> | null;
    @ApiPropertyOptional() createTime: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}
