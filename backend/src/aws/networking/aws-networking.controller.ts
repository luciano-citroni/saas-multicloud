import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AwsNetworkingService } from './aws-networking.service';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';

@ApiTags('AWS Networking')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa (contexto de tenant)',
    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/networking')
export class AwsNetworkingController {
    constructor(private readonly service: AwsNetworkingService) {}

    // =========================================================================
    // VPCs - Banco de Dados
    // =========================================================================

    @Get('accounts/:cloudAccountId/vpcs')
    @ApiOperation({
        summary: 'Listar VPCs do banco de dados',
        description: 'Retorna as VPCs sincronizadas e armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,
        description: 'Lista de VPCs do banco de dados',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    awsVpcId: { type: 'string', example: 'vpc-0a1b2c3d4e5f67890' },
                    cidrBlock: { type: 'string', example: '10.0.0.0/16' },
                    state: { type: 'string', example: 'available' },
                    isDefault: { type: 'boolean' },
                    tags: { type: 'object' },
                    lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
                    subnetsCount: { type: 'number' },
                },
            },
        },
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listVpcs(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listVpcsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/vpcs/:vpcId')
    @ApiOperation({
        summary: 'Buscar VPC por ID com subnets',
        description: 'Retorna uma VPC específica com todas as suas subnets associadas.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'vpcId', type: 'string', format: 'uuid', description: 'UUID da VPC no banco de dados' })
    @ApiResponse({
        status: 200,
        description: 'VPC com suas subnets',
        schema: {
            type: 'object',
            properties: {
                vpc: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        awsVpcId: { type: 'string', example: 'vpc-0a1b2c3d4e5f67890' },
                        cidrBlock: { type: 'string', example: '10.0.0.0/16' },
                        state: { type: 'string', example: 'available' },
                        isDefault: { type: 'boolean' },
                        tags: { type: 'object' },
                        lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
                    },
                },
                subnets: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', format: 'uuid' },
                            vpcId: { type: 'string', format: 'uuid' },
                            awsSubnetId: { type: 'string', example: 'subnet-0a1b2c3d4e5f67890' },
                            awsVpcId: { type: 'string', example: 'vpc-0a1b2c3d4e5f67890' },
                            cidrBlock: { type: 'string', example: '10.0.1.0/24' },
                            availabilityZone: { type: 'string', example: 'us-east-1a' },
                            availableIpAddressCount: { type: 'number' },
                            state: { type: 'string', example: 'available' },
                            isDefaultForAz: { type: 'boolean' },
                            mapPublicIpOnLaunch: { type: 'boolean' },
                            tags: { type: 'object' },
                            lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
                        },
                    },
                },
            },
        },
    })
    @ApiResponse({ status: 400, description: 'VPC não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getVpcWithSubnets(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('vpcId', ParseUUIDPipe) vpcId: string,
        @CurrentOrganization() org: Organization,
    ) {
        return this.service.getVpcWithSubnets(vpcId, cloudAccountId);
    }

    @HttpCode(200)
    @Post('accounts/:cloudAccountId/vpcs/sync')
    @ApiOperation({
        summary: 'Sincronizar VPCs da AWS',
        description: 'Busca as VPCs da AWS e armazena/atualiza no banco de dados. Retorna as VPCs sincronizadas.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,
        description: 'VPCs sincronizadas com sucesso',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    vpcId: { type: 'string', example: 'vpc-0a1b2c3d4e5f67890' },
                    cidrBlock: { type: 'string', example: '10.0.0.0/16' },
                    state: { type: 'string', example: 'available' },
                    isDefault: { type: 'boolean' },
                    tags: { type: 'object' },
                },
            },
        },
    })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncVpcs(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncVpcsFromAws(cloudAccountId, org.id);
    }

    // =========================================================================
    // Subnets - Banco de Dados
    // =========================================================================

    @Get('accounts/:cloudAccountId/subnets')
    @ApiOperation({
        summary: 'Listar Subnets do banco de dados',
        description: 'Retorna as Subnets sincronizadas e armazenadas no banco de dados. Use ?vpcId= para filtrar por VPC.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar por VPC ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,
        description: 'Lista de Subnets do banco de dados',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    vpcId: { type: 'string', format: 'uuid' },
                    awsSubnetId: { type: 'string', example: 'subnet-0a1b2c3d4e5f67890' },
                    awsVpcId: { type: 'string', example: 'vpc-0a1b2c3d4e5f67890' },
                    cidrBlock: { type: 'string', example: '10.0.1.0/24' },
                    availabilityZone: { type: 'string', example: 'us-east-1a' },
                    availableIpAddressCount: { type: 'number' },
                    state: { type: 'string', example: 'available' },
                    isDefaultForAz: { type: 'boolean' },
                    mapPublicIpOnLaunch: { type: 'boolean' },
                    tags: { type: 'object' },
                    lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
                },
            },
        },
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listSubnets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization, @Query('vpcId') vpcId?: string) {
        return this.service.listSubnetsFromDatabase(cloudAccountId, vpcId);
    }

    /**
     * Sincroniza Subnets da AWS e armazena no banco de dados.
     */
    @Post('accounts/:cloudAccountId/subnets/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar Subnets da AWS',
        description: 'Busca as Subnets da AWS e armazena/atualiza no banco de dados. Use ?vpcId= para sincronizar apenas uma VPC específica.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'vpcId', required: false, description: 'Filtrar sync por VPC ID (UUID do banco de dados)', type: 'string' })
    @ApiResponse({
        status: 200,
        description: 'Subnets sincronizadas com sucesso',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    subnetId: { type: 'string', example: 'subnet-0a1b2c3d4e5f67890' },
                    vpcId: { type: 'string', example: 'vpc-0a1b2c3d4e5f67890' },
                    cidrBlock: { type: 'string', example: '10.0.1.0/24' },
                    availabilityZone: { type: 'string', example: 'us-east-1a' },
                    availableIpAddressCount: { type: 'number' },
                    state: { type: 'string', example: 'available' },
                    isDefaultForAz: { type: 'boolean' },
                    mapPublicIpOnLaunch: { type: 'boolean' },
                    tags: { type: 'object' },
                },
            },
        },
    })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncSubnets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization, @Query('vpcId') vpcId?: string) {
        return this.service.syncSubnetsFromAws(cloudAccountId, org.id, vpcId);
    }

    // Endpoints legacy removidos — use os endpoints novos que leem do banco
}
