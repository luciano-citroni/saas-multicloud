import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { S3Service } from './aws-s3.service';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { S3BucketResponseDto, S3SyncResponseDto } from './swagger.dto';

@ApiTags('AWS S3')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',

    description: 'UUID da organização ativa (contexto de tenant)',

    required: true,
})
@UseGuards(TenantGuard)
@Controller('aws/s3')
export class S3Controller {
    constructor(private readonly service: S3Service) {}

    // =========================================================================

    // Buckets S3 - Banco de Dados

    // =========================================================================

    @Get('accounts/:cloudAccountId/buckets')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'Listar buckets S3 do banco de dados',

        description: 'Retorna os buckets S3 sincronizados e armazenados no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Lista de buckets S3 do banco de dados',

        type: [S3BucketResponseDto],
    })
    @ApiResponse({ status: 400, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    listBuckets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listBucketsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/buckets/:bucketId')
    @ApiOperation({
        summary: 'Buscar bucket S3 por ID',

        description: 'Retorna os detalhes de um bucket S3 específico pelo ID.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'bucketId', type: 'string', format: 'uuid', description: 'UUID do bucket no banco de dados' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes do bucket S3',

        type: S3BucketResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Bucket não encontrado' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getBucket(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('bucketId', ParseUUIDPipe) bucketId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getBucketById(bucketId, cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/buckets/by-name/:bucketName')
    @ApiOperation({
        summary: 'Buscar bucket S3 por nome',

        description: 'Retorna os detalhes de um bucket S3 específico pelo nome.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'bucketName', type: 'string', description: 'Nome do bucket S3' })
    @ApiResponse({
        status: 200,

        description: 'Detalhes do bucket S3',

        type: S3BucketResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Bucket não encontrado' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    getBucketByName(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('bucketName') bucketName: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getBucketByName(bucketName, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/buckets/sync')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Sincronizar buckets S3 da AWS',

        description: 'Busca os buckets S3 da AWS e armazena/atualiza no banco de dados.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({
        status: 200,

        description: 'Buckets S3 sincronizados com sucesso',

        type: [S3SyncResponseDto],
    })
    @ApiResponse({ status: 400, description: 'Erro ao sincronizar com AWS' })
    @ApiResponse({ status: 401, description: 'Token inválido ou expirado' })
    @ApiResponse({ status: 403, description: 'Sem acesso a esta organização' })
    syncBuckets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncBucketsFromAws(cloudAccountId, org.id);
    }
}
