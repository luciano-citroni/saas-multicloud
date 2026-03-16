import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';

import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';

import { TenantGuard } from '../../tenant/tenant.guard';

import { CurrentOrganization } from '../../tenant/tenant.decorators';

import { Organization } from '../../db/entites/organization.entity';

import { AwsCloudWatchService } from './aws-cloudwatch.service';

import { CloudWatchAlarmResponseDto, CloudWatchAlarmSyncResponseDto } from './swagger.dto';

@ApiTags('AWS CloudWatch')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/cloudwatch')
export class AwsCloudWatchController {
    constructor(private readonly service: AwsCloudWatchService) {}

    @Get('accounts/:cloudAccountId/alarms')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar alarmes CloudWatch do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [CloudWatchAlarmResponseDto] })
    listAlarms(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listAlarmsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/alarms/:alarmId')
    @ApiOperation({ summary: 'Buscar alarme CloudWatch por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'alarmId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: CloudWatchAlarmResponseDto })
    @ApiResponse({ status: 400, description: 'Alarme não encontrado' })
    getAlarm(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,

        @Param('alarmId', ParseUUIDPipe) alarmId: string,

        @CurrentOrganization() org: Organization
    ) {
        return this.service.getAlarmById(alarmId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/alarms/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar alarmes CloudWatch da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [CloudWatchAlarmSyncResponseDto] })
    syncAlarms(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncAlarmsFromAws(cloudAccountId, org.id);
    }
}
