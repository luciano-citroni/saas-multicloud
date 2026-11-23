import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InventoryResourceDto {
    @ApiProperty({ format: 'uuid' })
    id!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty({ example: 'EC2 Instance' })
    resourceType!: string;

    @ApiPropertyOptional({ nullable: true })
    region!: string | null;

    @ApiPropertyOptional({ nullable: true })
    status!: string | null;

    @ApiProperty({ format: 'date-time' })
    createdAt!: string;

    @ApiProperty({ enum: ['aws', 'azure', 'gcp'] })
    provider!: string;

    @ApiProperty({
        type: 'object',
        additionalProperties: { type: 'string', nullable: true },
        description: 'Type-specific fields (instance type, SKU, IPs, etc.)',
    })
    attributes!: Record<string, string | null>;

    @ApiProperty({
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'AWS/Azure tags or GCP labels',
    })
    tags!: Record<string, string>;
}

export class InventoryMonthlyPointDto {
    @ApiProperty({ example: '2026-01' })
    month!: string;

    @ApiProperty({ example: 12 })
    count!: number;
}

export class InventoryOverviewResponseDto {
    @ApiProperty()
    totalResources!: number;

    @ApiProperty()
    newThisMonth!: number;

    @ApiProperty({ type: 'object', additionalProperties: { type: 'number' } })
    byType!: Record<string, number>;

    @ApiProperty({ type: [String] })
    regions!: string[];

    @ApiProperty({ type: [String], description: 'Tag pairs as key:value' })
    tags!: string[];

    @ApiProperty({ type: [String] })
    resourceTypes!: string[];

    @ApiProperty({ type: [InventoryMonthlyPointDto] })
    monthlyNew!: InventoryMonthlyPointDto[];

    @ApiProperty({ enum: ['aws', 'azure', 'gcp'] })
    provider!: string;

    @ApiProperty()
    cloudAccountId!: string;

    @ApiProperty()
    cloudAccountAlias!: string;
}

export class InventoryResourcesPaginationDto {
    @ApiProperty()
    page!: number;

    @ApiProperty()
    limit!: number;

    @ApiProperty()
    totalItems!: number;

    @ApiProperty()
    totalPages!: number;

    @ApiProperty()
    hasNextPage!: boolean;

    @ApiProperty()
    hasPreviousPage!: boolean;
}

export class InventoryResourcesFacetsDto {
    @ApiProperty({ type: [String] })
    regions!: string[];

    @ApiProperty({ type: [String], description: 'Tag pairs as key:value' })
    tags!: string[];
}

export class InventoryResourcesResponseDto {
    @ApiProperty({ type: [InventoryResourceDto] })
    items!: InventoryResourceDto[];

    @ApiProperty({ type: InventoryResourcesPaginationDto })
    pagination!: InventoryResourcesPaginationDto;

    @ApiProperty({ type: InventoryResourcesFacetsDto })
    facets!: InventoryResourcesFacetsDto;
}
