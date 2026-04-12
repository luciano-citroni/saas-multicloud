import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GcpServiceAccountResponseDto {
    @ApiProperty({ format: 'uuid' }) id: string;
    @ApiProperty() cloudAccountId: string;
    @ApiPropertyOptional() gcpUniqueId: string | null;
    @ApiProperty({ example: 'sa@project.iam.gserviceaccount.com' }) email: string;
    @ApiPropertyOptional() displayName: string | null;
    @ApiPropertyOptional() description: string | null;
    @ApiProperty() disabled: boolean;
    @ApiPropertyOptional() lastSyncedAt: Date | null;
    @ApiProperty() createdAt: Date;
    @ApiProperty() updatedAt: Date;
}
