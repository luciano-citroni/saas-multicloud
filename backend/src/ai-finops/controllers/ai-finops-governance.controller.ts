import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiHeader,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlanModuleGuard, RequirePlanModule } from '../../common/guards/plan-module.guard';
import { SystemModule } from '../../common/modules/system-modules';
import { Roles } from '../../rbac/roles.decorator';
import { OrgRole } from '../../rbac/roles.enum';
import { RolesGuard } from '../../rbac/roles.guard';
import { CurrentOrganization } from '../../tenant/tenant.decorators';
import { TenantGuard } from '../../tenant/tenant.guard';
import { Tenant } from '../../db/entites/tenant.entity';
import {
    addTeamMemberSchema,
    createApiKeySchema,
    createApplicationSchema,
    createConnectionSchema,
    createLicenseSchema,
    createPolicySchema,
    createTeamSchema,
    syncConnectionSchema,
    updateConnectionSchema,
    updateLicenseSchema,
    updatePolicySchema,
    updateTeamSchema,
    type AddTeamMemberDto,
    type CreateApiKeyDto,
    type CreateApplicationDto,
    type CreateConnectionDto,
    type CreateLicenseDto,
    type CreatePolicyDto,
    type CreateTeamDto,
    type SyncConnectionDto,
    type UpdateConnectionDto,
    type UpdateLicenseDto,
    type UpdatePolicyDto,
    type UpdateTeamDto,
} from '../dto';
import { AiFinopsConnectionService } from '../services/ai-finops-connection.service';
import { AiFinopsTeamService } from '../services/ai-finops-team.service';
import { AiFinopsApplicationService } from '../services/ai-finops-application.service';
import { AiFinopsPolicyService } from '../services/ai-finops-policy.service';
import { AiFinopsProviderCatalogService } from '../services/ai-finops-provider-catalog.service';
import { AiFinopsLicenseService } from '../services/ai-finops-license.service';

type AuthUser = { id: string };

@ApiTags('AI FinOps Governance')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'x-organization-id', required: true })
@RequirePlanModule(SystemModule.AI_FINOPS)
@UseGuards(TenantGuard, RolesGuard, PlanModuleGuard)
@Controller('ai-finops')
export class AiFinopsGovernanceController {
    constructor(
        private readonly providers: AiFinopsProviderCatalogService,
        private readonly connections: AiFinopsConnectionService,
        private readonly teams: AiFinopsTeamService,
        private readonly applications: AiFinopsApplicationService,
        private readonly policies: AiFinopsPolicyService,
        private readonly licenses: AiFinopsLicenseService,
    ) {}

    @Get('providers')
    @ApiOperation({ summary: 'List AI providers and capabilities' })
    @ApiResponse({ status: 200 })
    listProviders() {
        return this.providers.list();
    }

    @Get('connections')
    @ApiOperation({ summary: 'List AI provider connections' })
    listConnections(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.connections.list(org.id, midOrganizationId);
    }

    @Post('connections')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(201)
    @ApiOperation({ summary: 'Create AI provider connection (BYOK)' })
    createConnection(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createConnectionSchema)) dto: CreateConnectionDto,
    ) {
        return this.connections.create(org.id, user.id, dto);
    }

    @Patch('connections/:connectionId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    updateConnection(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('connectionId', ParseUUIDPipe) connectionId: string,
        @Body(new ZodValidationPipe(updateConnectionSchema)) dto: UpdateConnectionDto,
    ) {
        return this.connections.update(org.id, user.id, connectionId, dto);
    }

    @Delete('connections/:connectionId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(204)
    async deleteConnection(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('connectionId', ParseUUIDPipe) connectionId: string,
    ) {
        await this.connections.remove(org.id, user.id, connectionId);
    }

    @Post('connections/:connectionId/test')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    testConnection(
        @CurrentOrganization() org: Tenant,
        @Param('connectionId', ParseUUIDPipe) connectionId: string,
    ) {
        return this.connections.test(org.id, connectionId);
    }

    @Post('connections/:connectionId/sync')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    syncConnection(
        @CurrentOrganization() org: Tenant,
        @Param('connectionId', ParseUUIDPipe) connectionId: string,
        @Body(new ZodValidationPipe(syncConnectionSchema)) dto: SyncConnectionDto,
    ) {
        return this.connections.enqueueSync(org.id, connectionId, dto);
    }

    @Get('connections/:connectionId/syncs')
    listSyncs(
        @CurrentOrganization() org: Tenant,
        @Param('connectionId', ParseUUIDPipe) connectionId: string,
    ) {
        return this.connections.listSyncs(org.id, connectionId);
    }

    @Get('teams')
    listTeams(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.teams.list(org.id, midOrganizationId);
    }

    @Post('teams')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(201)
    createTeam(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createTeamSchema)) dto: CreateTeamDto,
    ) {
        return this.teams.create(org.id, user.id, dto);
    }

    @Patch('teams/:teamId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    updateTeam(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('teamId', ParseUUIDPipe) teamId: string,
        @Body(new ZodValidationPipe(updateTeamSchema)) dto: UpdateTeamDto,
    ) {
        return this.teams.update(org.id, user.id, teamId, dto);
    }

    @Delete('teams/:teamId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(204)
    async deleteTeam(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('teamId', ParseUUIDPipe) teamId: string,
    ) {
        await this.teams.remove(org.id, user.id, teamId);
    }

    @Post('teams/:teamId/members')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    addTeamMember(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('teamId', ParseUUIDPipe) teamId: string,
        @Body(new ZodValidationPipe(addTeamMemberSchema)) dto: AddTeamMemberDto,
    ) {
        return this.teams.addMember(org.id, user.id, teamId, dto);
    }

    @Delete('teams/:teamId/members/:memberUserId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    removeTeamMember(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('teamId', ParseUUIDPipe) teamId: string,
        @Param('memberUserId', ParseUUIDPipe) memberUserId: string,
    ) {
        return this.teams.removeMember(org.id, user.id, teamId, memberUserId);
    }

    @Get('applications')
    listApplications(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.applications.list(org.id, midOrganizationId);
    }

    @Post('applications')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(201)
    createApplication(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createApplicationSchema)) dto: CreateApplicationDto,
    ) {
        return this.applications.create(org.id, user.id, dto);
    }

    @Delete('applications/:applicationId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(204)
    async deleteApplication(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('applicationId', ParseUUIDPipe) applicationId: string,
    ) {
        await this.applications.remove(org.id, user.id, applicationId);
    }

    @Get('applications/:applicationId/api-keys')
    listApiKeys(
        @CurrentOrganization() org: Tenant,
        @Param('applicationId', ParseUUIDPipe) applicationId: string,
    ) {
        return this.applications.listKeys(org.id, applicationId);
    }

    @Post('applications/:applicationId/api-keys')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(201)
    createApiKey(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('applicationId', ParseUUIDPipe) applicationId: string,
        @Body(new ZodValidationPipe(createApiKeySchema)) dto: CreateApiKeyDto,
    ) {
        return this.applications.createKey(org.id, user.id, applicationId, dto);
    }

    @Post('applications/:applicationId/api-keys/:keyId/revoke')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    revokeApiKey(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('applicationId', ParseUUIDPipe) applicationId: string,
        @Param('keyId', ParseUUIDPipe) keyId: string,
    ) {
        return this.applications.revokeKey(org.id, user.id, applicationId, keyId);
    }

    @Get('policies')
    listPolicies(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.policies.list(org.id, midOrganizationId);
    }

    @Post('policies')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(201)
    createPolicy(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createPolicySchema)) dto: CreatePolicyDto,
    ) {
        return this.policies.create(org.id, user.id, dto);
    }

    @Patch('policies/:policyId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    updatePolicy(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('policyId', ParseUUIDPipe) policyId: string,
        @Body(new ZodValidationPipe(updatePolicySchema)) dto: UpdatePolicyDto,
    ) {
        return this.policies.update(org.id, user.id, policyId, dto);
    }

    @Delete('policies/:policyId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(204)
    async deletePolicy(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('policyId', ParseUUIDPipe) policyId: string,
    ) {
        await this.policies.remove(org.id, user.id, policyId);
    }

    @Get('licenses')
    @ApiOperation({ summary: 'List AI licenses and credit packs' })
    listLicenses(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.licenses.list(org.id, midOrganizationId);
    }

    @Get('licenses/summary')
    @ApiOperation({ summary: 'Aggregate seats and credits (never mixed with token costs)' })
    licensesSummary(
        @CurrentOrganization() org: Tenant,
        @Query('midOrganizationId') midOrganizationId?: string,
    ) {
        return this.licenses.summary(org.id, midOrganizationId);
    }

    @Post('licenses')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(201)
    @ApiOperation({ summary: 'Create AI license / credit pack' })
    createLicense(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Body(new ZodValidationPipe(createLicenseSchema)) dto: CreateLicenseDto,
    ) {
        return this.licenses.create(org.id, user.id, dto);
    }

    @Patch('licenses/:licenseId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    updateLicense(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('licenseId', ParseUUIDPipe) licenseId: string,
        @Body(new ZodValidationPipe(updateLicenseSchema)) dto: UpdateLicenseDto,
    ) {
        return this.licenses.update(org.id, user.id, licenseId, dto);
    }

    @Delete('licenses/:licenseId')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @HttpCode(204)
    async deleteLicense(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('licenseId', ParseUUIDPipe) licenseId: string,
    ) {
        await this.licenses.remove(org.id, user.id, licenseId);
    }

    @Post('licenses/azure-credits')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Upsert Azure AI credits/commitments into license model' })
    upsertAzureCredits(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Body()
        body: {
            organizationId: string;
            entries: Array<{
                name: string;
                quantity: number;
                remainingQuantity?: number;
                unitCost?: number;
                currency?: string;
                startsAt?: string | null;
                endsAt?: string | null;
                metadata?: Record<string, unknown>;
            }>;
        },
    ) {
        return this.licenses.upsertAzureCredits(org.id, body.organizationId, body.entries ?? [], user.id);
    }

    @Post('connections/:connectionId/sync-copilot-seats')
    @Roles(OrgRole.OWNER, OrgRole.ADMIN)
    @ApiOperation({ summary: 'Sync Microsoft Copilot seats from Graph into licenses' })
    syncCopilotSeats(
        @CurrentOrganization() org: Tenant,
        @CurrentUser() user: AuthUser,
        @Param('connectionId', ParseUUIDPipe) connectionId: string,
    ) {
        return this.licenses.syncCopilotSeats(org.id, connectionId, user.id);
    }
}
