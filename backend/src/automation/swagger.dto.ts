import { ApiProperty } from '@nestjs/swagger';

export class ResourceCostEstimateDto {
    @ApiProperty({ example: 'node-1' })
    nodeId: string;

    @ApiProperty({ example: 'ec2' })
    type: string;

    @ApiProperty({ example: 'EC2 t3.micro' })
    label: string;

    @ApiProperty({ example: 'us-east-1' })
    region: string;

    @ApiProperty({ example: 7.59 })
    onDemand: number;

    @ApiProperty({ example: 5.31 })
    reserved: number;

    @ApiProperty({ example: 4.55 })
    savings: number;
}

export class CostTotalsDto {
    @ApiProperty({ example: 37.50 })
    onDemand: number;

    @ApiProperty({ example: 26.25 })
    reserved: number;

    @ApiProperty({ example: 22.50 })
    savings: number;
}

export class CostEstimateResponseDto {
    @ApiProperty({ type: [ResourceCostEstimateDto] })
    resources: ResourceCostEstimateDto[];

    @ApiProperty({ type: CostTotalsDto })
    totals: CostTotalsDto;

    @ApiProperty({ example: 40, description: 'Percentual de economia do Savings Plan vs On-Demand' })
    savingsPercent: number;
}

export class ProvisionedResourceResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty({ example: 'ec2' })
    resourceType: string;

    @ApiProperty({ example: 'i-0abc123def456789', nullable: true })
    awsResourceId: string | null;

    @ApiProperty({ example: 'us-east-1' })
    region: string;

    @ApiProperty({ example: 'PROVISIONED' })
    status: string;

    @ApiProperty({ example: 7.59 })
    estimatedCost: number;

    @ApiProperty()
    createdAt: Date;
}

export class AutomationExecutionResponseDto {
    @ApiProperty()
    id: string;

    @ApiProperty({ example: 'SAVINGS' })
    pricingModel: string;

    @ApiProperty({ example: 22.50 })
    totalEstimatedCost: number;

    @ApiProperty({ example: 'COMPLETED' })
    status: string;

    @ApiProperty({ type: [ProvisionedResourceResponseDto] })
    resources: ProvisionedResourceResponseDto[];

    @ApiProperty()
    createdAt: Date;
}

export class RunAutomationRequestDto {
    @ApiProperty({ description: 'Definição do fluxo com nodes e edges' })
    flow: Record<string, unknown>;

    @ApiProperty({ enum: ['ON_DEMAND', 'RESERVED', 'SAVINGS'] })
    pricingModel: string;

    @ApiProperty({ example: 'uuid-da-cloud-account' })
    cloudAccountId: string;
}

export class EstimateRequestDto {
    @ApiProperty({ description: 'Definição do fluxo com nodes e edges' })
    flow: Record<string, unknown>;

    @ApiProperty({ example: 'uuid-da-cloud-account' })
    cloudAccountId: string;
}
