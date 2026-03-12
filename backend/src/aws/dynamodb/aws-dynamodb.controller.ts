import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AwsDynamoDbService } from './aws-dynamodb.service';
import { DynamoDbTableResponseDto, DynamoDbTableSyncResponseDto } from './swagger.dto';

@ApiTags('AWS DynamoDB')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/dynamodb')
export class AwsDynamoDbController {
    constructor(private readonly service: AwsDynamoDbService) {}

    @Get('accounts/:cloudAccountId/tables')
    @ApiOperation({ summary: 'Listar tabelas DynamoDB do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [DynamoDbTableResponseDto] })
    listTables(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listTablesFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/tables/:tableId')
    @ApiOperation({ summary: 'Buscar tabela DynamoDB por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'tableId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: DynamoDbTableResponseDto })
    @ApiResponse({ status: 400, description: 'Tabela não encontrada' })
    getTable(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('tableId', ParseUUIDPipe) tableId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getTableById(tableId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/tables/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar tabelas DynamoDB da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [DynamoDbTableSyncResponseDto] })
    syncTables(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncTablesFromAws(cloudAccountId, org.id);
    }
}
