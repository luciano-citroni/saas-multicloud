import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AzureSqlServerResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty() cloudAccountId!: string;
    @ApiProperty() azureId!: string;
    @ApiProperty() name!: string;
    @ApiPropertyOptional() location!: string | null;
    @ApiPropertyOptional() resourceGroup!: string | null;
    @ApiPropertyOptional() subscriptionId!: string | null;
    @ApiPropertyOptional() fullyQualifiedDomainName!: string | null;
    @ApiPropertyOptional() administratorLogin!: string | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) tags!: Record<string, string> | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) properties!: Record<string, any> | null;
    @ApiPropertyOptional() lastSyncedAt!: Date | null;
    @ApiProperty() createdAt!: Date;
    @ApiProperty() updatedAt!: Date;
}

export class AzureSqlDatabaseResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty() cloudAccountId!: string;
    @ApiProperty() azureId!: string;
    @ApiProperty() name!: string;
    @ApiPropertyOptional() location!: string | null;
    @ApiPropertyOptional() resourceGroup!: string | null;
    @ApiPropertyOptional() subscriptionId!: string | null;
    @ApiPropertyOptional() sku!: string | null;
    @ApiPropertyOptional() status!: string | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) tags!: Record<string, string> | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) properties!: Record<string, any> | null;
    @ApiPropertyOptional() lastSyncedAt!: Date | null;
    @ApiProperty() createdAt!: Date;
    @ApiProperty() updatedAt!: Date;
}

export class AzurePostgresServerResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty() cloudAccountId!: string;
    @ApiProperty() azureId!: string;
    @ApiProperty() name!: string;
    @ApiPropertyOptional() location!: string | null;
    @ApiPropertyOptional() resourceGroup!: string | null;
    @ApiPropertyOptional() subscriptionId!: string | null;
    @ApiPropertyOptional() administratorLogin!: string | null;
    @ApiPropertyOptional() version!: string | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) tags!: Record<string, string> | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) properties!: Record<string, any> | null;
    @ApiPropertyOptional() lastSyncedAt!: Date | null;
    @ApiProperty() createdAt!: Date;
    @ApiProperty() updatedAt!: Date;
}

export class AzureCosmosDbResponseDto {
    @ApiProperty({ format: 'uuid' }) id!: string;
    @ApiProperty() cloudAccountId!: string;
    @ApiProperty() azureId!: string;
    @ApiProperty() name!: string;
    @ApiPropertyOptional() location!: string | null;
    @ApiPropertyOptional() resourceGroup!: string | null;
    @ApiPropertyOptional() subscriptionId!: string | null;
    @ApiPropertyOptional() databaseAccountOfferType!: string | null;
    @ApiPropertyOptional() documentEndpoint!: string | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) tags!: Record<string, string> | null;
    @ApiPropertyOptional({ type: 'object', additionalProperties: true }) properties!: Record<string, any> | null;
    @ApiPropertyOptional() lastSyncedAt!: Date | null;
    @ApiProperty() createdAt!: Date;
    @ApiProperty() updatedAt!: Date;
}
