import { ApiProperty } from '@nestjs/swagger';

export class LambdaFunctionResponseDto {
    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174050' })
    id: string;

    @ApiProperty({ example: 'arn:aws:lambda:us-east-1:123456789012:function:my-function' })
    functionArn: string;

    @ApiProperty({ example: 'my-function' })
    functionName: string;

    @ApiProperty({ example: 'nodejs20.x', nullable: true })
    runtime: string | null;

    @ApiProperty({ example: 'index.handler', nullable: true })
    handler: string | null;

    @ApiProperty({ example: 'Active', nullable: true })
    state: string | null;

    @ApiProperty({ example: 128, nullable: true })
    memorySize: number | null;

    @ApiProperty({ example: 30, nullable: true })
    timeout: number | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001', nullable: true })
    vpcId: string | null;

    @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174030', nullable: true })
    iamRoleId: string | null;

    @ApiProperty({ example: { Environment: 'prod' } })
    tags: Record<string, string>;

    @ApiProperty({ example: '2026-03-09T12:00:00Z', nullable: true })
    lastSyncedAt: Date | null;
}

export class LambdaFunctionSyncResponseDto {
    @ApiProperty({ example: 'arn:aws:lambda:us-east-1:123456789012:function:my-function' })
    functionArn: string;

    @ApiProperty({ example: 'my-function' })
    functionName: string;

    @ApiProperty({ example: 'nodejs20.x', nullable: true })
    runtime: string | null;

    @ApiProperty({ example: 'vpc-0a1b2c3d4e5f67890', nullable: true })
    awsVpcId: string | null;
}

export class LambdaFunctionWithRelationsResponseDto extends LambdaFunctionResponseDto {
    @ApiProperty({
        example: { id: '123e4567', awsVpcId: 'vpc-0a1b2c3d', cidrBlock: '10.0.0.0/16', state: 'available' },
        nullable: true,
    })
    vpc?: { id: string; awsVpcId: string; cidrBlock: string; state: string } | null;

    @ApiProperty({
        example: { id: '123e4567', roleArn: 'arn:aws:iam::123456789012:role/MyRole', roleName: 'MyRole' },
        nullable: true,
    })
    iamRole?: { id: string; roleArn: string; roleName: string } | null;
}
