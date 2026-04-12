import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpStorageBucketResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiProperty() gcpBucketId: string;
    @ApiProperty() name: string;
    @ApiProperty({ example: 'US' }) location: string;
    @ApiPropertyOptional({ example: 'multi-region' }) locationType: string | null;
    @ApiProperty({ example: 'STANDARD' }) storageClass: string;
    @ApiProperty() versioningEnabled: boolean;
    @ApiPropertyOptional({ example: 'enforced' }) publicAccessPrevention: string | null;
    @ApiProperty() uniformBucketLevelAccess: boolean;
    @ApiPropertyOptional({ type: Object }) labels: Record<string, string> | null;
    @ApiPropertyOptional() timeCreated: Date | null;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}
