import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Organization } from '../../db/entites/organization.entity';
import { AwsWafService } from './aws-waf.service';
import { WafWebAclResponseDto, WafWebAclSyncResponseDto } from './swagger.dto';

@ApiTags('AWS WAF')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard)
@Controller('aws/waf')
export class AwsWafController {
    constructor(private readonly service: AwsWafService) {}

    @Get('accounts/:cloudAccountId/web-acls')
    @ApiOperation({ summary: 'Listar Web ACLs WAF do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [WafWebAclResponseDto] })
    listWebAcls(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.listWebAclsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/web-acls/:webAclId')
    @ApiOperation({ summary: 'Buscar Web ACL WAF por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'webAclId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: WafWebAclResponseDto })
    @ApiResponse({ status: 400, description: 'Web ACL não encontrada' })
    getWebAcl(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('webAclId', ParseUUIDPipe) webAclId: string,
        @CurrentOrganization() org: Organization
    ) {
        return this.service.getWebAclById(webAclId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/web-acls/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar Web ACLs WAF da AWS (REGIONAL e CLOUDFRONT)' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [WafWebAclSyncResponseDto] })
    syncWebAcls(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Organization) {
        return this.service.syncWebAclsFromAws(cloudAccountId, org.id);
    }
}
