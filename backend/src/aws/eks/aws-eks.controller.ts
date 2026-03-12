import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AwsEksService } from './aws-eks.service';
import { EksClusterResponseDto, EksClusterSyncResponseDto, EksClusterWithRelationsResponseDto } from './swagger.dto';

@ApiTags('AWS EKS')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'UUID da organização ativa (contexto de tenant)',
    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/eks')
export class AwsEksController {
    constructor(private readonly service: AwsEksService) {}

    @Get('accounts/:cloudAccountId/clusters')
    @ApiOperation({
        summary: 'Listar clusters EKS do banco de dados',
        description: 'Retorna os clusters EKS sincronizados e armazenados no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Lista de clusters EKS do banco de dados', type: [EksClusterResponseDto] })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listClustersFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/clusters/:clusterId')
    @ApiOperation({
        summary: 'Buscar cluster EKS por ID',
        description: 'Retorna os detalhes de um cluster EKS específico.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'clusterId', type: 'string', format: 'uuid', description: 'UUID do cluster no banco de dados' })
    @ApiResponse({ status: 200, description: 'Detalhes do cluster EKS', type: EksClusterWithRelationsResponseDto })
    @ApiResponse({ status: 400, description: 'Cluster não encontrado' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getCluster(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('clusterId', ParseUUIDPipe) clusterId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getClusterById(clusterId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/clusters/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar clusters EKS da AWS',
        description: 'Busca os clusters EKS da AWS e armazena/atualiza no banco de dados com vínculos de VPC, IAM, Security Group e EC2.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, description: 'Clusters EKS sincronizados com sucesso', type: [EksClusterSyncResponseDto] })
    @ApiResponse({ status: 400, description: 'Falha ao sincronizar clusters EKS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncClusters(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncClustersFromAws(cloudAccountId, org.id);
    }
}
