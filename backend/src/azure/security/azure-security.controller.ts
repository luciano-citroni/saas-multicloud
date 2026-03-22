import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiHeader,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { RolesGuard } from '../../rbac/roles.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AzureSecurityService } from './azure-security.service';

@ApiTags('Azure - Security')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', required: true, description: 'UUID da organização ativa' })
@UseGuards(TenantGuard, RolesGuard)
@Controller('azure/accounts/:cloudAccountId')
export class AzureSecurityController {
    constructor(private readonly securityService: AzureSecurityService) {}

    @Get('key-vaults')
    @ApiOperation({ summary: 'Listar Key Vaults Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Key Vaults' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listKeyVaults(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.securityService.listKeyVaults(cloudAccountId, org.id);
    }

    @Get('key-vaults/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um Key Vault Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do Key Vault' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do Key Vault' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getKeyVault(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.securityService.getKeyVault(resourceId, cloudAccountId, org.id);
    }

    @Get('recovery-vaults')
    @ApiOperation({ summary: 'Listar Recovery Vaults Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Recovery Vaults' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listRecoveryVaults(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.securityService.listRecoveryVaults(cloudAccountId, org.id);
    }

    @Get('recovery-vaults/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um Recovery Vault Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do Recovery Vault' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do Recovery Vault' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getRecoveryVault(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.securityService.getRecoveryVault(resourceId, cloudAccountId, org.id);
    }
}
