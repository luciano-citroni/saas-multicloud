import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentOrganization } from '../tenant/tenant.decorators';
import { Tenant } from '../db/entites/tenant.entity';
import { RolesGuard } from '../rbac/roles.guard';
import { PlanModuleGuard, RequirePlanModule } from '../common/guards/plan-module.guard';
import { SystemModule } from '../common/modules/system-modules';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiPaginationQuery } from '../common/swagger/pagination-query.swagger';

import { CloudInventoryService } from './cloud-inventory.service';
import {
    inventoryOverviewQuerySchema,
    inventoryResourcesQuerySchema,
    type InventoryOverviewQueryDto,
    type InventoryResourcesQueryDto,
} from './dto';
import { InventoryOverviewResponseDto, InventoryResourcesResponseDto } from './swagger.dto';

@ApiTags('Cloud Inventory')
@ApiBearerAuth('access-token')
@ApiHeader({
    name: 'x-organization-id',
    description: 'Organization UUID',
    required: true,
})
@RequirePlanModule(SystemModule.CLOUD_INVENTORY)
@UseGuards(TenantGuard, RolesGuard, PlanModuleGuard)
@Controller('cloud/inventory')
export class CloudInventoryController {
    constructor(private readonly cloudInventoryService: CloudInventoryService) {}

    @Get('accounts/:cloudAccountId/overview')
    @ApiOperation({
        summary: 'Inventory overview for a cloud account',
        description:
            'Returns KPIs, resource-type breakdown, available filter options, and a monthly series of newly discovered/created resources for the active cloud account.',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({
        name: 'period',
        required: false,
        enum: ['last6months', 'last12months', 'ytd', 'all'],
        description: 'Window used for the monthly new-resources chart (default: all → chart uses last 12 months)',
    })
    @ApiResponse({ status: 200, type: InventoryOverviewResponseDto })
    @ApiResponse({ status: 404, description: 'Cloud account not found' })
    getOverview(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(inventoryOverviewQuerySchema)) query: InventoryOverviewQueryDto,
    ) {
        return this.cloudInventoryService.getOverview(cloudAccountId, org.id, query);
    }

    @Get('accounts/:cloudAccountId/resources')
    @ApiPaginationQuery()
    @ApiOperation({
        summary: 'List inventory resources for a cloud account',
        description:
            'Unified, filtered, paginated resource inventory for the active cloud account. "New" date uses provider birth date when available, otherwise first-seen (created_at).',
    })
    @ApiParam({ name: 'cloudAccountId', type: 'string', format: 'uuid' })
    @ApiQuery({ name: 'q', required: false, description: 'Search by name (also matches type/region/tags)' })
    @ApiQuery({ name: 'resourceType', required: false })
    @ApiQuery({ name: 'region', required: false })
    @ApiQuery({
        name: 'tag',
        required: false,
        description: 'Filter by tag/label: key, key:value, or free text over tag pairs',
    })
    @ApiQuery({
        name: 'period',
        required: false,
        enum: ['last6months', 'last12months', 'ytd', 'all'],
        description: 'Only include resources created/first-seen within the period (default: all)',
    })
    @ApiResponse({ status: 200, type: InventoryResourcesResponseDto })
    @ApiResponse({ status: 404, description: 'Cloud account not found' })
    listResources(
        @Param('cloudAccountId', ParseUUIDPipe) cloudAccountId: string,
        @CurrentOrganization() org: Tenant,
        @Query(new ZodValidationPipe(inventoryResourcesQuerySchema)) query: InventoryResourcesQueryDto,
    ) {
        return this.cloudInventoryService.listResources(cloudAccountId, org.id, query);
    }
}
