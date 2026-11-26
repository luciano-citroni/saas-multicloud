import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Organization } from '../db/entites/organization.entity';
import { OrganizationMembership } from '../db/entites/organization-membership.entity';
import { ErrorMessages } from '../common/messages/error-messages';
import { OrgRole, ROLE_HIERARCHY } from '../rbac/roles.enum';
import type { CreateOrgDto, UpdateOrgDto } from './orgs.dto';

type OrganizationWithRole = Organization & { currentRole: string | null };

@Injectable()
export class OrgsService {
    private readonly logger = new Logger(OrgsService.name);

    constructor(
        @InjectRepository(Organization)
        private readonly orgRepository: Repository<Organization>,
        @InjectRepository(OrganizationMembership)
        private readonly organizationMembershipRepository: Repository<OrganizationMembership>
    ) {}

    async create(tenantId: string, userId: string, userRole: string, dto: CreateOrgDto): Promise<Organization> {
        const org = this.orgRepository.create({ name: dto.name, tenantId });
        const saved = await this.orgRepository.save(org);

        await this.organizationMembershipRepository.save({
            organizationId: saved.id,
            userId,
            role: userRole,
        } as Partial<OrganizationMembership>);

        return saved;
    }

    async findAll(tenantId: string, userId: string, tenantRole: string): Promise<OrganizationWithRole[]> {
        const qb = this.buildListQuery(tenantId, userId, tenantRole);
        const rows = await qb.getRawAndEntities();
        return this.mapWithRole(rows);
    }

    async findAllPaginated(
        tenantId: string,
        userId: string,
        tenantRole: string,
        page: number,
        limit: number
    ): Promise<{
        items: OrganizationWithRole[];
        pagination: {
            page: number;
            limit: number;
            totalItems: number;
            totalPages: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }> {
        const safePage = Math.max(1, page);
        const safeLimit = Math.min(100, Math.max(1, limit));

        const qb = this.buildListQuery(tenantId, userId, tenantRole);
        const totalItems = await qb.getCount();
        const rows = await qb
            .skip((safePage - 1) * safeLimit)
            .take(safeLimit)
            .getRawAndEntities();
        const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / safeLimit);

        return {
            items: this.mapWithRole(rows),
            pagination: {
                page: safePage,
                limit: safeLimit,
                totalItems,
                totalPages,
                hasNextPage: safePage < totalPages,
                hasPreviousPage: safePage > 1,
            },
        };
    }

    async findOne(id: string, tenantId: string, userId: string, tenantRole: string): Promise<Organization> {
        if (this.canSeeAllOrganizations(tenantRole)) {
            const org = await this.orgRepository.findOne({ where: { id, tenantId } });
            if (!org) throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
            return org;
        }

        const org = await this.orgRepository
            .createQueryBuilder('organization')
            .innerJoin(
                OrganizationMembership,
                'membership',
                'membership.organization_id = organization.id AND membership.user_id = :userId',
                { userId }
            )
            .where('organization.id = :id', { id })
            .andWhere('organization.tenantId = :tenantId', { tenantId })
            .getOne();

        if (!org) throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        return org;
    }

    async update(id: string, tenantId: string, userId: string, tenantRole: string, dto: UpdateOrgDto): Promise<Organization> {
        const org = await this.findOne(id, tenantId, userId, tenantRole);
        if (dto.name !== undefined) org.name = dto.name;
        return this.orgRepository.save(org);
    }

    async remove(id: string, tenantId: string, userId: string, tenantRole: string): Promise<{ id: string; deleted: true }> {
        const org = await this.findOne(id, tenantId, userId, tenantRole);
        await this.orgRepository.remove(org);
        return { id, deleted: true };
    }

    /** Tenant OWNER/ADMIN can list and manage every mid-org in the tenant. */
    private canSeeAllOrganizations(tenantRole: string): boolean {
        return (ROLE_HIERARCHY[tenantRole as OrgRole] ?? 0) >= ROLE_HIERARCHY[OrgRole.ADMIN];
    }

    private buildListQuery(tenantId: string, userId: string, tenantRole: string): SelectQueryBuilder<Organization> {
        const qb = this.orgRepository
            .createQueryBuilder('organization')
            .addSelect('membership.role', 'membership_role')
            .where('organization.tenantId = :tenantId', { tenantId })
            .orderBy('organization.createdAt', 'ASC');

        if (this.canSeeAllOrganizations(tenantRole)) {
            qb.leftJoin(
                OrganizationMembership,
                'membership',
                'membership.organization_id = organization.id AND membership.user_id = :userId',
                { userId }
            );
        } else {
            qb.innerJoin(
                OrganizationMembership,
                'membership',
                'membership.organization_id = organization.id AND membership.user_id = :userId',
                { userId }
            );
        }

        return qb;
    }

    private mapWithRole(rows: { entities: Organization[]; raw: Array<{ membership_role?: string }> }): OrganizationWithRole[] {
        return rows.entities.map((organization, index) => ({
            ...organization,
            currentRole: typeof rows.raw[index]?.membership_role === 'string' ? rows.raw[index].membership_role : null,
        }));
    }
}
