import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AzureSubscriptionResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty() cloudAccountId!: string;
    @ApiProperty() azureId!: string;
    @ApiProperty() name!: string;
    @ApiPropertyOptional() location!: string | null;
    @ApiPropertyOptional() subscriptionId!: string | null;
    @ApiPropertyOptional() state!: string | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) tags!: Record<string, string> | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) properties!: Record<string, any> | null;
    @ApiPropertyOptional() lastSyncedAt!: Date | null;
    @ApiProperty() createdAt!: Date;
    @ApiProperty() updatedAt!: Date;
}

export class AzureResourceGroupResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty() cloudAccountId!: string;
    @ApiProperty() azureId!: string;
    @ApiProperty() name!: string;
    @ApiPropertyOptional() location!: string | null;
    @ApiPropertyOptional() subscriptionId!: string | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) tags!: Record<string, string> | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) properties!: Record<string, any> | null;
    @ApiPropertyOptional() lastSyncedAt!: Date | null;
    @ApiProperty() createdAt!: Date;
    @ApiProperty() updatedAt!: Date;
}
