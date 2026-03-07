import { Controller, Get, Post, Param, ParseUUIDPipe, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AwsSecurityGroupService } from './aws-security-group.service';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { SecurityGroupResponseDto, SecurityGroupSyncResponseDto } from './swagger.dto';

@ApiTags('AWS Security Groups')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa (contexto de tenant)',
    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/security-groups')
export class AwsSecurityGroupController {
    constructor(private readonly service: AwsSecurityGroupService) {}

    // =========================================================================
    // Security Groups - Banco de Dados
    // =========================================================================

    @Get('accounts/:cloudAccountId')
    @ApiOperation({
        summary: 'Listar Security Groups do banco de dados',
        description: 'Retorna os Security Groups sincronizados e armazenados no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,
        description: 'Lista de Security Groups do banco de dados',
        type: [SecurityGroupResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listSecurityGroups(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listSecurityGroupsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/vpcs/:vpcId')
    @ApiOperation({
        summary: 'Listar Security Groups de uma VPC específica',
        description: 'Retorna os Security Groups de uma VPC específica armazenados no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'vpcId', type: 'string', format: 'uuid', description: 'UUID da VPC no banco de dados' })
    @ApiResponse({
        status: 200,
        description: 'Lista de Security Groups da VPC',
        type: [SecurityGroupResponseDto],
    })
    @ApiResponse({ status: 400, description: 'VPC não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listSecurityGroupsByVpc(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('vpcId', ParseUUIDPipe) vpcId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.listSecurityGroupsByVpcFromDatabase(vpcId, cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/security-groups/:securityGroupId')
    @ApiOperation({
        summary: 'Buscar Security Group por ID',
        description: 'Retorna os detalhes de um Security Group específico com suas regras de entrada e saída.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'securityGroupId', type: 'string', format: 'uuid', description: 'UUID do Security Group no banco de dados' })
    @ApiResponse({
        status: 200,
        description: 'Detalhes do Security Group',
        type: SecurityGroupResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Security Group não encontrado' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getSecurityGroup(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('securityGroupId', ParseUUIDPipe) securityGroupId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getSecurityGroupById(securityGroupId, cloudAccountId);
    }

    // =========================================================================
    // Sincronização AWS → Banco de Dados
    // =========================================================================

    @Post('accounts/:cloudAccountId/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar Security Groups da AWS',
        description:
            'Busca os Security Groups da AWS e armazena/atualiza no banco de dados. ' +
            'Use ?vpcId= para filtrar por AWS VPC ID (ex: vpc-xxx). ' +
            'Requer permissão ec2:DescribeSecurityGroups na role AWS.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({
        name: 'vpcId',
        required: false,
        description: 'Filtrar por AWS VPC ID (ex: vpc-0a1b2c3d). Se omitido, sincroniza todos os Security Groups da conta.',
        type: 'string',
    })
    @ApiResponse({
        status: 200,
        description: 'Security Groups sincronizados com sucesso',
        type: [SecurityGroupSyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Credenciais inválidas ou erro na AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncSecurityGroups(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Organization,
        @Query('vpcId') vpcId?: string
    ) {
        return this.service.syncSecurityGroupsFromAws(cloudAccountId, org.id, vpcId);
    }
}
