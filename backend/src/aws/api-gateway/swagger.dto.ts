import { ApiProperty } from '@nestjs/swagger';

export class ApiGatewayRestApiResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'abc1def2gh', description: 'ID da API na AWS' })
    awsApiId: string;

    @ApiProperty({ example: 'my-rest-api' })
    name: string;

    @ApiProperty({ example: 'Minha API REST', nullable: true })
    description: string | null;

    @ApiProperty({ example: 'REGIONAL', enum: ['REGIONAL', 'EDGE', 'PRIVATE'], nullable: true })
    endpointType: string | null;

    @ApiProperty({ example: '1.0', nullable: true })
    version: string | null;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class ApiGatewayRestApiSyncResponseDto {
    @ApiProperty({ example: 'abc1def2gh' })
    awsApiId: string;

    @ApiProperty({ example: 'my-rest-api' })
    name: string;

    @ApiProperty({ example: 'REGIONAL', nullable: true })
    endpointType: string | null;
}

export class ApiGatewayRestApiWithRelationsResponseDto extends ApiGatewayRestApiResponseDto {
    @ApiProperty({
        example: { id: '123e4567', awsVpcId: 'vpc-0a1b2c3d', cidrBlock: '10.0.0.0/16', state: 'available' },
        nullable: true,
    })
    vpc?: { id: string; awsVpcId: string; cidrBlock: string; state: string } | null;
}
