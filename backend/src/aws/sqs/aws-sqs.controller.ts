import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { AwsSqsService } from './aws-sqs.service';

import { SqsQueueResponseDto, SqsQueueSyncResponseDto } from './swagger.dto';

@ApiTags('AWS SQS')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/sqs')
export class AwsSqsController {
    constructor(private readonly service: AwsSqsService) {}

    @Get('accounts/:cloudAccountId/queues')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar filas SQS do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [SqsQueueResponseDto] })
    listQueues(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listQueuesFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/queues/:queueId')
    @ApiOperation({ summary: 'Buscar fila SQS por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'queueId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: SqsQueueResponseDto })
    @ApiResponse({ status: 400, description: 'Fila não encontrada' })
    getQueue(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('queueId', ParseUUIDPipe) queueId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getQueueById(queueId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/queues/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar filas SQS da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [SqsQueueSyncResponseDto] })
    syncQueues(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncQueuesFromAws(cloudAccountId, org.id);
    }
}
