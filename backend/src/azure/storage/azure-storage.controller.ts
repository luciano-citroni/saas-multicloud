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
import { AzureStorageService } from './azure-storage.service';

@ApiTags('Azure - Storage')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', required: true, description: 'UUID da organização ativa' })
@UseGuards(TenantGuard, RolesGuard)
@Controller('azure/accounts/:cloudAccountId')
export class AzureStorageController {
    constructor(private readonly storageService: AzureStorageService) {}

    @Get('storage-accounts')
    @ApiOperation({ summary: 'Listar Storage Accounts Azure sincronizadas' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Storage Accounts' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listStorageAccounts(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.storageService.listStorageAccounts(cloudAccountId, org.id);
    }

    @Get('storage-accounts/:resourceId')
    @ApiOperation({ summary: 'Detalhe de uma Storage Account Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno da Storage Account' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe da Storage Account' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getStorageAccount(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.storageService.getStorageAccount(resourceId, cloudAccountId, org.id);
    }
}
