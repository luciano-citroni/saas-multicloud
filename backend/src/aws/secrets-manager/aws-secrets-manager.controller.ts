import { RolesGuard } from '../../rbac/roles.guard';
import { CloudAccountAccessGuard } from '../../cloud/cloud-account-access.guard';
import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Tenant } from '../../db/entites/tenant.entity';

import { Roles } from '../../rbac/roles.decorator';

import { OrgRole } from '../../rbac/roles.enum';

import { AwsSecretsManagerService } from './aws-secrets-manager.service';

import { SecretsManagerSecretResponseDto, SecretsManagerSecretSyncResponseDto } from './swagger.dto';

@ApiTags('AWS Secrets Manager')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard, CloudAccountAccessGuard, RolesGuard)
@Controller('aws/secrets-manager')
export class AwsSecretsManagerController {
    constructor(private readonly service: AwsSecretsManagerService) {}

    @Get('accounts/:cloudAccountId/secrets')
    @Roles(OrgRole.ADMIN)
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar secrets do Secrets Manager do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [SecretsManagerSecretResponseDto] })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    listSecrets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.listSecretsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/secrets/:secretId')
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Buscar secret por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'secretId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: SecretsManagerSecretResponseDto })
    @ApiResponse({ status: 400, description: 'Secret não encontrado' })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    getSecret(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('secretId', ParseUUIDPipe) secretId: string,

        @CurrentOrganization() org: Tenant
    ) {
        return this.service.getSecretById(secretId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/secrets/sync')
    @HttpCode(200)
    @Roles(OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sincronizar secrets do Secrets Manager da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [SecretsManagerSecretSyncResponseDto] })
    @ApiResponse({ status: 403, description: 'Acesso negado – apenas ADMIN ou OWNER' })
    syncSecrets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncSecretsFromAws(cloudAccountId, org.id);
    }
}
