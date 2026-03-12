import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AwsSnsService } from './aws-sns.service';
import { SnsTopicResponseDto, SnsTopicSyncResponseDto } from './swagger.dto';

@ApiTags('AWS SNS')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/sns')
export class AwsSnsController {
    constructor(private readonly service: AwsSnsService) {}

    @Get('accounts/:cloudAccountId/topics')
    @ApiOperation({ summary: 'Listar tópicos SNS do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [SnsTopicResponseDto] })
    listTopics(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listTopicsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/topics/:topicId')
    @ApiOperation({ summary: 'Buscar tópico SNS por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'topicId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: SnsTopicResponseDto })
    @ApiResponse({ status: 400, description: 'Tópico não encontrado' })
    getTopic(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('topicId', ParseUUIDPipe) topicId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getTopicById(topicId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/topics/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar tópicos SNS da AWS' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [SnsTopicSyncResponseDto] })
    syncTopics(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncTopicsFromAws(cloudAccountId, org.id);
    }
}
