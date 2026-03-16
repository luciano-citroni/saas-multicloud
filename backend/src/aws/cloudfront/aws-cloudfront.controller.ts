import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { CloudFrontService } from './aws-cloudfront.service';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { CloudFrontDistributionResponseDto, CloudFrontSyncResponseDto } from './swagger.dto';

@ApiTags('AWS CloudFront')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/cloudfront')
export class CloudFrontController {
    constructor(private readonly service: CloudFrontService) {}

    // =========================================================================

    // Distribuições CloudFront - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId/distributions')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Distribuições CloudFront do banco de dados',

        description: 'Retorna as Distribuições CloudFront sincronizadas e armazenadas no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Lista de Distribuições CloudFront do banco de dados',

        type: [CloudFrontDistributionResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listDistributions(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listDistributionsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/distributions/:distributionId')
    @ApiOperation({
        summary: 'Buscar distribuição CloudFront por ID',

        description: 'Retorna os detalhes de uma distribuição CloudFront específica pelo ID do banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'distributionId', type: 'string', format: 'uuid', description: 'UUID da distribuição no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes da distribuição CloudFront',

        type: CloudFrontDistributionResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Distribuição não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getDistribution(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('distributionId', ParseUUIDPipe) distributionId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getDistributionById(distributionId, cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/distributions/by-aws-id/:awsDistributionId')
    @ApiOperation({
        summary: 'Buscar distribuição CloudFront por ID da AWS',

        description: 'Retorna os detalhes de uma distribuição CloudFront específica pelo ID da AWS (ex: E1234567890ABC).',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'awsDistributionId', type: 'string', description: 'ID da distribuição na AWS' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes da distribuição CloudFront',

        type: CloudFrontDistributionResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Distribuição não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getDistributionByAwsId(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('awsDistributionId') awsDistributionId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getDistributionByAwsId(awsDistributionId, cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/s3-buckets/:s3BucketId/distributions')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar Distribuições CloudFront vinculadas a um bucket S3',

        description: 'Retorna as Distribuições CloudFront que usam um bucket S3 específico como origem.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 's3BucketId', type: 'string', format: 'uuid', description: 'UUID do bucket S3 no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Lista de Distribuições CloudFront vinculadas ao bucket S3',

        type: [CloudFrontDistributionResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Bucket S3 não encontrado' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listDistributionsByS3Bucket(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('s3BucketId', ParseUUIDPipe) s3BucketId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.listDistributionsByS3Bucket(s3BucketId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/distributions/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar Distribuições CloudFront da AWS',

        description:
            'Busca as Distribuições CloudFront da AWS e armazena/atualiza no banco de dados. Vincula automaticamente com buckets S3 quando a origem for S3.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Distribuições CloudFront sincronizadas com sucesso',

        type: CloudFrontSyncResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Falha ao sincronizar Distribuições da AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncDistributions(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncDistributionsFromAws(cloudAccountId, org.id);
    }
}
