import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../tenant/tenant.guard';
import { RolesGuard } from '../rbac/roles.guard';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { Organization } from '../db/entites/organization.entity';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from 'zod';
import { AwsResourcesService } from './aws-resources.service';

const createKeyPairSchema = z.object({
    cloudAccountId: z.string().uuid(),
    region: z.string().min(1),
    keyName: z.string().min(1).max(255),
});

@ApiTags('Automation')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa', required: true })
@UseGuards(TenantGuard, RolesGuard)
@Controller('automation/resources')
export class AutomationResourcesController {
    constructor(private readonly awsResources: AwsResourcesService) {}

    @Get('vpcs')
    @ApiOperation({ summary: 'Listar VPCs disponíveis na região' })
    @ApiQuery({ name: 'cloudAccountId', required: true })
    @ApiQuery({ name: 'region', required: true })
    @ApiResponse({ status: 200 })
    async listVpcs(
        @CurrentOrganization() org: Organization,
        @Query('cloudAccountId') cloudAccountId: string,
        @Query('region') region: string,
    ) {
        return this.awsResources.listVpcs(cloudAccountId, org.id, region);
    }

    @Get('subnets')
    @ApiOperation({ summary: 'Listar Subnets de uma região/VPC' })
    @ApiQuery({ name: 'cloudAccountId', required: true })
    @ApiQuery({ name: 'region', required: true })
    @ApiQuery({ name: 'vpcId', required: false })
    @ApiResponse({ status: 200 })
    async listSubnets(
        @CurrentOrganization() org: Organization,
        @Query('cloudAccountId') cloudAccountId: string,
        @Query('region') region: string,
        @Query('vpcId') vpcId?: string,
    ) {
        return this.awsResources.listSubnets(cloudAccountId, org.id, region, vpcId);
    }

    @Get('security-groups')
    @ApiOperation({ summary: 'Listar Security Groups de uma região/VPC' })
    @ApiQuery({ name: 'cloudAccountId', required: true })
    @ApiQuery({ name: 'region', required: true })
    @ApiQuery({ name: 'vpcId', required: false })
    @ApiResponse({ status: 200 })
    async listSecurityGroups(
        @CurrentOrganization() org: Organization,
        @Query('cloudAccountId') cloudAccountId: string,
        @Query('region') region: string,
        @Query('vpcId') vpcId?: string,
    ) {
        return this.awsResources.listSecurityGroups(cloudAccountId, org.id, region, vpcId);
    }

    @Get('key-pairs')
    @ApiOperation({ summary: 'Listar Key Pairs disponíveis na região' })
    @ApiQuery({ name: 'cloudAccountId', required: true })
    @ApiQuery({ name: 'region', required: true })
    @ApiResponse({ status: 200 })
    async listKeyPairs(
        @CurrentOrganization() org: Organization,
        @Query('cloudAccountId') cloudAccountId: string,
        @Query('region') region: string,
    ) {
        return this.awsResources.listKeyPairs(cloudAccountId, org.id, region);
    }

    @Post('key-pairs')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Criar novo Key Pair e retornar PEM' })
    @ApiResponse({ status: 201 })
    async createKeyPair(
        @CurrentOrganization() org: Organization,
        @Body(new ZodValidationPipe(createKeyPairSchema)) body: z.infer<typeof createKeyPairSchema>,
    ) {
        return this.awsResources.createKeyPair(body.cloudAccountId, org.id, body.region, body.keyName);
    }

    @Get('ami')
    @ApiOperation({ summary: 'Resolver AMI mais recente para um OS preset e região' })
    @ApiQuery({ name: 'cloudAccountId', required: true })
    @ApiQuery({ name: 'region', required: true })
    @ApiQuery({ name: 'os', required: true })
    @ApiResponse({ status: 200 })
    async resolveAmi(
        @CurrentOrganization() org: Organization,
        @Query('cloudAccountId') cloudAccountId: string,
        @Query('region') region: string,
        @Query('os') os: string,
    ) {
        return this.awsResources.resolveAmi(cloudAccountId, org.id, region, os);
    }
}
