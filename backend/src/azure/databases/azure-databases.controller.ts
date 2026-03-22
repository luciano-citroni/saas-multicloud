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
import { AzureDatabasesService } from './azure-databases.service';

@ApiTags('Azure - Databases')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', required: true, description: 'UUID da organização ativa' })
@UseGuards(TenantGuard, RolesGuard)
@Controller('azure/accounts/:cloudAccountId')
export class AzureDatabasesController {
    constructor(private readonly databasesService: AzureDatabasesService) {}

    @Get('sql-servers')
    @ApiOperation({ summary: 'Listar SQL Servers Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de SQL Servers' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listSqlServers(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.databasesService.listSqlServers(cloudAccountId, org.id);
    }

    @Get('sql-servers/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um SQL Server Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do SQL Server' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do SQL Server' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getSqlServer(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.databasesService.getSqlServer(resourceId, cloudAccountId, org.id);
    }

    @Get('sql-databases')
    @ApiOperation({ summary: 'Listar SQL Databases Azure sincronizadas' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de SQL Databases' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listSqlDatabases(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.databasesService.listSqlDatabases(cloudAccountId, org.id);
    }

    @Get('sql-databases/:resourceId')
    @ApiOperation({ summary: 'Detalhe de uma SQL Database Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno da SQL Database' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe da SQL Database' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getSqlDatabase(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.databasesService.getSqlDatabase(resourceId, cloudAccountId, org.id);
    }

    @Get('postgres-servers')
    @ApiOperation({ summary: 'Listar PostgreSQL Flexible Servers Azure sincronizados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de PostgreSQL Flexible Servers' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listPostgresServers(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.databasesService.listPostgresServers(cloudAccountId, org.id);
    }

    @Get('postgres-servers/:resourceId')
    @ApiOperation({ summary: 'Detalhe de um PostgreSQL Flexible Server Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno do PostgreSQL Server' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe do PostgreSQL Flexible Server' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getPostgresServer(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.databasesService.getPostgresServer(resourceId, cloudAccountId, org.id);
    }

    @Get('cosmos-db-accounts')
    @ApiOperation({ summary: 'Listar Cosmos DB Accounts Azure sincronizadas' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Lista de Cosmos DB Accounts' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'CloudAccount não encontrada' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async listCosmosDbAccounts(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
    ) {
        return this.databasesService.listCosmosDbAccounts(cloudAccountId, org.id);
    }

    @Get('cosmos-db-accounts/:resourceId')
    @ApiOperation({ summary: 'Detalhe de uma Cosmos DB Account Azure' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid', description: 'UUID da CloudAccount Azure' })
    @ApiParam({ name: 'resourceId', type: 'string', format: 'uuid', description: 'UUID interno da Cosmos DB Account' })
    @ApiResponse({ status: HttpStatus.OK, description: 'Detalhe da Cosmos DB Account' })
    @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Recurso não encontrado' })
    @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Token JWT inválido ou expirado' })
    @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Sem acesso a esta organização' })
    async getCosmosDbAccount(
        @CurrentOrganization() org: Organization,
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('resourceId', ParseUUIDPipe) resourceId: string,
    ) {
        return this.databasesService.getCosmosDbAccount(resourceId, cloudAccountId, org.id);
    }
}
