import { RolesGuard } from '../../rbac/roles.guard';
import { CloudAccountAccessGuard } from '../../cloud/cloud-account-access.guard';
import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQuery } from '../../common/swagger/pagination-query.swagger';
import { TenantGuard } from '../../tenant/tenant.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { Tenant } from '../../db/entites/tenant.entity';
import { AwsWafService } from './aws-waf.service';
import {
    WafWebAclResponseDto,
    WafWebAclSyncResponseDto,
    WafIpSetResponseDto,
    WafIpSetSyncResponseDto,
} from './swagger.dto';

@ApiTags('AWS WAF')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', description: 'UUID da organização ativa (contexto de tenant)', required: true })
@UseGuards(TenantGuard, CloudAccountAccessGuard, RolesGuard)
@Controller('aws/waf')
export class AwsWafController {
    constructor(private readonly service: AwsWafService) {}

    @Get('accounts/:cloudAccountId/web-acls')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar Web ACLs WAF do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [WafWebAclResponseDto] })
    listWebAcls(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() _org: Tenant) {
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
        @CurrentOrganization() _org: Tenant,
    ) {
        return this.service.getWebAclById(webAclId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/web-acls/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar Web ACLs WAF da AWS (REGIONAL e CLOUDFRONT)' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [WafWebAclSyncResponseDto] })
    syncWebAcls(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncWebAclsFromAws(cloudAccountId, org.id);
    }

    @Get('accounts/:cloudAccountId/ip-sets')
    @ApiPaginationQuery()
    @ApiOperation({ summary: 'Listar IP Sets WAF do banco de dados' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [WafIpSetResponseDto] })
    listIpSets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() _org: Tenant) {
        return this.service.listIpSetsFromDatabase(cloudAccountId);
    }

    @Get('accounts/:cloudAccountId/ip-sets/:ipSetId')
    @ApiOperation({ summary: 'Buscar IP Set WAF por ID' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiParam({ name: 'ipSetId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: WafIpSetResponseDto })
    @ApiResponse({ status: 400, description: 'IP Set não encontrado' })
    getIpSet(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @Param('ipSetId', ParseUUIDPipe) ipSetId: string,
        @CurrentOrganization() _org: Tenant,
    ) {
        return this.service.getIpSetById(ipSetId, cloudAccountId);
    }

    @Post('accounts/:cloudAccountId/ip-sets/sync')
    @HttpCode(200)
    @ApiOperation({ summary: 'Sincronizar IP Sets WAF da AWS (REGIONAL e CLOUDFRONT)' })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiResponse({ status: 200, type: [WafIpSetSyncResponseDto] })
    syncIpSets(@Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string, @CurrentOrganization() org: Tenant) {
        return this.service.syncIpSetsFromAws(cloudAccountId, org.id);
    }
}
