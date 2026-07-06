import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../db/entites/organization.entity';
import { OrganizationMembership } from '../db/entites/organization-membership.entity';
import { Tenant } from '../db/entites/tenant.entity';
import { ErrorMessages } from '../common/messages/error-messages';
import type { CreateOrgDto, UpdateOrgDto } from './orgs.dto';

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

    async findAll(tenantId: string, userId: string): Promise<Organization[]> {
        return this.orgRepository
            .createQueryBuilder('organization')
            .innerJoin(OrganizationMembership, 'membership', 'membership.organization_id = organization.id AND membership.user_id = :userId', { userId })
            .where('organization.tenant_id = :tenantId', { tenantId })
            .orderBy('organization.created_at', 'ASC')
            .getMany();
    }

    async findOne(id: string, tenantId: string, userId: string): Promise<Organization> {
        const org = await this.orgRepository
            .createQueryBuilder('organization')
            .innerJoin(OrganizationMembership, 'membership', 'membership.organization_id = organization.id AND membership.user_id = :userId', { userId })
            .where('organization.id = :id', { id })
            .andWhere('organization.tenant_id = :tenantId', { tenantId })
            .getOne();

        if (!org) throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        return org;
    }

    async update(id: string, tenantId: string, userId: string, dto: UpdateOrgDto): Promise<Organization> {
        const org = await this.findOne(id, tenantId, userId);
        if (dto.name !== undefined) org.name = dto.name;
        return this.orgRepository.save(org);
    }

    async remove(id: string, tenantId: string, userId: string): Promise<{ id: string; deleted: true }> {
        const org = await this.findOne(id, tenantId, userId);
        await this.orgRepository.remove(org);
        return { id, deleted: true };
    }
}
