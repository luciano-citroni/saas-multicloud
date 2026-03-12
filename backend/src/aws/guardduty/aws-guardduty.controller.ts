import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AwsGuardDutyService } from './aws-guardduty.service';
import { GuardDutyDetectorResponseDto, GuardDutyDetectorSyncResponseDto } from './swagger.dto';

@ApiTags('AWS GuardDuty')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/guardduty')
export class AwsGuardDutyController {
    constructor(private readonly service: AwsGuardDutyService) {}

    @Get('accounts/:cloudAccountId/detectors')
    @ApiOperation({ summary: 'Listar detectores GuardDuty do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GuardDutyDetectorResponseDto] })
    listDetectors(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listDetectorsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/detectors/:detectorId')
    @ApiOperation({ summary: 'Buscar detector GuardDuty por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'detectorId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: GuardDutyDetectorResponseDto })
    @ApiResponse({ status: 400, description: 'Detector não encontrado' })
    getDetector(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('detectorId', ParseUUIDPipe) detectorId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getDetectorById(detectorId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/detectors/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar detectores GuardDuty da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [GuardDutyDetectorSyncResponseDto] })
    syncDetectors(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncDetectorsFromAws(cloudAccountId, org.id);
    }
}
