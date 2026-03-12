import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AwsSecretsManagerService } from './aws-secrets-manager.service';
import { SecretsManagerSecretResponseDto, SecretsManagerSecretSyncResponseDto } from './swagger.dto';

@ApiTags('AWS Secrets Manager')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/secrets-manager')
export class AwsSecretsManagerController {
    constructor(private readonly service: AwsSecretsManagerService) {}

    @Get('accounts/:cloudAccountId/secrets')
    @ApiOperation({ summary: 'Listar secrets do Secrets Manager do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [SecretsManagerSecretResponseDto] })
    listSecrets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listSecretsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/secrets/:secretId')
    @ApiOperation({ summary: 'Buscar secret por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'secretId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: SecretsManagerSecretResponseDto })
    @ApiResponse({ status: 400, description: 'Secret não encontrado' })
    getSecret(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('secretId', ParseUUIDPipe) secretId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getSecretById(secretId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/secrets/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar secrets do Secrets Manager da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [SecretsManagerSecretSyncResponseDto] })
    syncSecrets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncSecretsFromAws(cloudAccountId, org.id);
    }
}
