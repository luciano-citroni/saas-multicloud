import { ApiProperty } from '@nestjs/swagger';

export class Route53HostedZoneResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'Z1D633PJN98FT9', description: 'ID da hosted zone na AWS' })
    awsHostedZoneId: string;

    @ApiProperty({ example: 'example.com.', description: 'Nome DNS da zona' })
    name: string;

    @ApiProperty({ example: 'PUBLIC', enum: ['PUBLIC', 'PRIVATE'] })
    zoneType: string;

    @ApiProperty({ example: 42, nullable: true })
    recordSetCount: number | null;

    @ApiProperty({ example: 'Minha zona DNS', nullable: true })
    comment: string | null;

    @ApiProperty({ example: false })
    isPrivate: boolean;

    @ApiProperty({ example: 'vpc-0a1b2c3d4e5f67890', nullable: true })
    awsVpcId: string | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001', nullable: true })
    vpcId: string | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class Route53HostedZoneSyncResponseDto {
    @ApiProperty({ example: 'Z1D633PJN98FT9' })
    awsHostedZoneId: string;

    @ApiProperty({ example: 'example.com.' })
    name: string;

    @ApiProperty({ example: 'PUBLIC' })
    zoneType: string;

    @ApiProperty({ example: false })
    isPrivate: boolean;
}

export class Route53HostedZoneWithRelationsResponseDto extends Route53HostedZoneResponseDto {
    @ApiProperty({
        example: { id: '123e4567-e89b-12d3-a456-426614174001', awsVpcId: 'vpc-0a1b2c3d', cidrBlock: '10.0.0.0/16', state: 'available' },
        nullable: true,
    })
    vpc?: { id: string; awsVpcId: string; cidrBlock: string; state: string } | null;
}
