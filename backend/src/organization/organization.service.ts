import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronExpression } from '@nestjs/schedule';

import { Tenant } from '../db/entites/tenant.entity';
import { TenantMember } from '../db/entites/tenant-member.entity';
import { TenantInvite, TenantInviteStatus } from '../db/entites/tenant-invite.entity';
import { User } from '../db/entites/user.entity';
import { Organization } from '../db/entites/organization.entity';
import { OrganizationMembership } from '../db/entites/organization-membership.entity';

import { CreateOrganizationDto, UpdateOrganizationDto, InviteMemberDto, UpdateMemberRoleDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';
import { OrgRole, ROLE_HIERARCHY } from '../rbac/roles.enum';
import { MailerService } from '../mailer/mailer.service';
import { BillingService } from '../billing/billing.service';
import { normalizePlanModules } from '../common/modules/system-modules';

export type UserOrganization = Tenant & { currentRole: string | null };

@Injectable()
export class OrganizationService {
    private readonly logger = new Logger(OrganizationService.name);

    constructor(
        @InjectRepository(Tenant)
        private readonly tenantRepository: Repository<Tenant>,

        @InjectRepository(TenantMember)
        private readonly memberRepository: Repository<TenantMember>,

        @InjectRepository(TenantInvite)
        private readonly inviteRepository: Repository<TenantInvite>,

        @InjectRepository(User)
        private readonly userRepository: Repository<User>,

        @InjectRepository(Organization)
        private readonly organizationRepository: Repository<Organization>,

        @InjectRepository(OrganizationMembership)
        private readonly organizationMembershipRepository: Repository<OrganizationMembership>,

        private readonly mailerService: MailerService,

        @Inject(forwardRef(() => BillingService))
        private readonly billingService: BillingService
    ) {}

    async create(payload: CreateOrganizationDto, creatorId?: string): Promise<Tenant> {
        if (creatorId) {
            await this.ensureCanCreateOrganization(creatorId);
        }

        const tenant = this.tenantRepository.create(payload);
        const saved = await this.tenantRepository.save(tenant);

        // Every tenant needs a default mid-level organization
        const defaultOrganization = await this.organizationRepository.save(this.organizationRepository.create({ name: saved.name, tenantId: saved.id }));

        if (creatorId) {
            await this.memberRepository.save({
                tenantId: saved.id,
                userId: creatorId,
                role: OrgRole.OWNER,
            } as Partial<TenantMember>);

            await this.organizationMembershipRepository.save({
                organizationId: defaultOrganization.id,
                userId: creatorId,
                role: OrgRole.OWNER,
            } as Partial<OrganizationMembership>);
        }

        // Initialize Stripe subscription for the new tenant (fire-and-forget)
        this.billingService.initializeTenantSubscription(saved).catch((err: unknown) => {
            this.logger.error(`Failed to initialize billing subscription for tenant ${saved.id}: ${err instanceof Error ? err.message : String(err)}`);
        });

        return saved;
    }

    async findAll(userId: string): Promise<UserOrganization[]> {
        const query = this.tenantRepository
            .createQueryBuilder('tenant')
            .innerJoin('tenant.members', 'member', 'member.user_id = :userId', { userId })
            .addSelect('member.role', 'member_role')
            .orderBy('tenant.createdAt', 'DESC');

        const { entities, raw } = await query.getRawAndEntities();

        await Promise.all(
            entities.map(async (tenant) => {
                const currentModules = normalizePlanModules(tenant.plans ?? []);
                const hasSnapshot = currentModules.length > 0 || tenant.maxCloudAccounts > 0 || tenant.maxUsers > 0;

                if (hasSnapshot) {
                    return;
                }

                try {
                    const plan = await this.billingService.getActivePlanForOrganization(tenant.id);
                    tenant.plans = normalizePlanModules(plan.metadata.modules);
                    tenant.maxCloudAccounts = Number.isFinite(plan.metadata.maxCloudAccounts) ? plan.metadata.maxCloudAccounts : 0;
                    tenant.maxUsers = Number.isFinite(plan.metadata.maxUsers) ? plan.metadata.maxUsers : 0;
                } catch {
                    // Keep graceful fallback for tenants without active paid plan.
                }
            })
        );

        return entities.map((tenant, index) => ({
            ...tenant,
            currentRole: typeof raw[index]?.member_role === 'string' ? raw[index].member_role : null,
        }));
    }

    async findOne(id: string, userId: string): Promise<Tenant> {
        const tenant = await this.getTenantIfUserHasAccess(id, userId);
        if (!tenant) throw new NotFoundException(ErrorMessages.TENANT.NO_ACCESS);
        return tenant;
    }

    async update(id: string, payload: UpdateOrganizationDto, userId: string): Promise<Tenant> {
        const hasAccess = await this.getTenantIfUserHasAccess(id, userId);
        if (!hasAccess) throw new NotFoundException(ErrorMessages.TENANT.NO_ACCESS);

        if (payload.name !== undefined) {
            await this.ensureUserIsOwner(id, userId);
        } else {
            await this.ensureUserCanManage(id, userId);
        }

        const tenant = await this.tenantRepository.preload({ id, ...payload });
        if (!tenant) throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);

        return this.tenantRepository.save(tenant);
    }

    async remove(id: string, userId: string): Promise<{ id: string; deleted: true }> {
        const tenant = await this.findOne(id, userId);
        await this.ensureUserIsOwner(id, userId);
        await this.tenantRepository.remove(tenant);
        return { id, deleted: true };
    }

    async leave(tenantId: string, userId: string): Promise<{ organizationId: string; left: true }> {
        const membership = await this.memberRepository.findOne({ where: { tenantId, userId } });

        if (!membership) throw new NotFoundException(ErrorMessages.MEMBERS.NOT_FOUND);
        if (membership.role === OrgRole.OWNER) throw new ForbiddenException(ErrorMessages.ORGANIZATIONS.OWNER_CANNOT_LEAVE);

        await this.memberRepository.remove(membership);
        return { organizationId: tenantId, left: true };
    }

    // ─── Invite Management ────────────────────────────────────────────────────

    async getInviteByToken(token: string): Promise<TenantInvite> {
        const invite = await this.inviteRepository.findOne({ where: { token } });

        if (!invite || invite.status === TenantInviteStatus.ACCEPTED) {
            throw new NotFoundException(ErrorMessages.INVITES.NOT_FOUND);
        }

        if (invite.status === TenantInviteStatus.EXPIRED || invite.expiresAt < new Date()) {
            if (invite.status !== TenantInviteStatus.EXPIRED) {
                invite.status = TenantInviteStatus.EXPIRED;
                await this.inviteRepository.save(invite);
            }
            throw new BadRequestException(ErrorMessages.INVITES.EXPIRED);
        }

        return invite;
    }

    async inviteMember(tenantId: string, inviterUserId: string, dto: InviteMemberDto): Promise<TenantInvite> {
        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        if (!tenant) throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);

        await this.ensureCanAddUserToTenant(tenantId, true);

        const inviter = await this.userRepository.findOne({ where: { id: inviterUserId } });
        const existingUser = await this.userRepository.findOne({ where: { email: dto.email.toLowerCase() } });

        if (existingUser) {
            const alreadyMember = await this.memberRepository.findOne({ where: { tenantId, userId: existingUser.id } });
            if (alreadyMember) throw new ConflictException(ErrorMessages.INVITES.USER_ALREADY_MEMBER);
        }

        await this.inviteRepository.delete({ tenantId, email: dto.email.toLowerCase(), status: TenantInviteStatus.PENDING });

        const organizationIds = await this.resolveInviteOrganizationIds(tenantId, dto.organizationIds);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 8);

        const invite = this.inviteRepository.create({
            tenantId,
            email: dto.email.toLowerCase(),
            role: dto.role,
            organizationIds,
            token: uuidv4(),
            status: TenantInviteStatus.PENDING,
            invitedByUserId: inviterUserId,
            expiresAt,
        });

        const saved = await this.inviteRepository.save(invite);

        this.mailerService
            .sendOrganizationInvite({
                to: dto.email,
                organizationName: tenant.name,
                inviterName: inviter?.name ?? 'Um administrador',
                role: dto.role,
                token: saved.token,
            })
            .catch((err) => this.logger.error(`Failed to send invite email for invite ${saved.id}`, err));

        return saved;
    }

    async acceptInvite(
        token: string
    ): Promise<
        | { status: 'accepted'; message: string; organizationId: string; role: string }
        | {
              status: 'needs_registration';
              message: string;
              email: string;
              organizationId: string;
              organizationName: string;
              role: string;
              inviteToken: string;
          }
    > {
        const invite = await this.getInviteByToken(token);
        const tenant = await this.tenantRepository.findOne({ where: { id: invite.tenantId } });
        const user = await this.userRepository.findOne({ where: { email: invite.email } });

        if (!user) {
            return {
                status: 'needs_registration',
                message: 'No account found with this email. Please register to accept this invite.',
                email: invite.email,
                organizationId: invite.tenantId,
                organizationName: tenant?.name ?? 'Unknown Tenant',
                role: invite.role,
                inviteToken: token,
            };
        }

        const alreadyMember = await this.memberRepository.findOne({ where: { tenantId: invite.tenantId, userId: user.id } });
        if (alreadyMember) {
            invite.status = TenantInviteStatus.ACCEPTED;
            await this.inviteRepository.save(invite);
            throw new ConflictException(ErrorMessages.INVITES.USER_ALREADY_MEMBER);
        }

        await this.ensureCanAddUserToTenant(invite.tenantId, false);

        await this.memberRepository.save({
            tenantId: invite.tenantId,
            userId: user.id,
            role: invite.role,
        } as Partial<TenantMember>);

        await this.addUserToInviteOrganizations(invite.tenantId, user.id, invite.role as OrgRole, invite.organizationIds);

        invite.status = TenantInviteStatus.ACCEPTED;
        await this.inviteRepository.save(invite);

        return {
            status: 'accepted',
            message: 'Invite accepted successfully. You are now a member of the tenant.',
            organizationId: invite.tenantId,
            role: invite.role,
        };
    }

    async acceptInviteWithUserId(inviteToken: string, userId: string): Promise<{ message: string; organizationId: string; role: string }> {
        const invite = await this.getInviteByToken(inviteToken);
        const user = await this.userRepository.findOne({ where: { id: userId } });

        if (!user) throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
            throw new BadRequestException('The invite email does not match your account email.');
        }

        const alreadyMember = await this.memberRepository.findOne({ where: { tenantId: invite.tenantId, userId: user.id } });
        if (alreadyMember) {
            invite.status = TenantInviteStatus.ACCEPTED;
            await this.inviteRepository.save(invite);
            throw new ConflictException(ErrorMessages.INVITES.USER_ALREADY_MEMBER);
        }

        await this.ensureCanAddUserToTenant(invite.tenantId, false);

        await this.memberRepository.save({
            tenantId: invite.tenantId,
            userId: user.id,
            role: invite.role,
        } as Partial<TenantMember>);

        await this.addUserToInviteOrganizations(invite.tenantId, user.id, invite.role as OrgRole, invite.organizationIds);

        invite.status = TenantInviteStatus.ACCEPTED;
        await this.inviteRepository.save(invite);

        return {
            message: 'Invite accepted successfully. You are now a member of the tenant.',
            organizationId: invite.tenantId,
            role: invite.role,
        };
    }

    async getUserCrossOrgAccess(targetUserId: string, requesterUserId: string): Promise<Array<{ id: string; name: string; memberRole: string | null }>> {
        const requesterMemberships = await this.memberRepository.find({
            where: { userId: requesterUserId },
            relations: ['tenant'],
        });

        const managedTenants = requesterMemberships.filter((m) => (ROLE_HIERARCHY[m.role as OrgRole] ?? 0) >= ROLE_HIERARCHY[OrgRole.ADMIN]);

        const managedTenantIds = managedTenants.map((membership) => membership.tenantId);

        if (managedTenantIds.length === 0) {
            return [];
        }

        const organizations = await this.organizationRepository.find({
            where: { tenantId: In(managedTenantIds) },
            order: { createdAt: 'ASC' },
        });

        if (organizations.length === 0) {
            return [];
        }

        const targetMemberships = await this.organizationMembershipRepository.find({
            where: {
                userId: targetUserId,
                organizationId: In(organizations.map((organization) => organization.id)),
            },
        });

        const membershipByOrganizationId = new Map(targetMemberships.map((membership) => [membership.organizationId, membership.role]));

        return organizations.map((organization) => ({
            id: organization.id,
            name: organization.name,
            memberRole: membershipByOrganizationId.get(organization.id) ?? null,
        }));
    }

    async addMemberToOrg(targetUserId: string, dto: { organizationId: string; role: OrgRole }, requesterUserId: string): Promise<OrganizationMembership> {
        const organization = await this.organizationRepository.findOne({ where: { id: dto.organizationId } });

        if (!organization) {
            throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        }

        const requesterMembership = await this.memberRepository.findOne({
            where: { tenantId: organization.tenantId, userId: requesterUserId },
        });

        if (!requesterMembership || (ROLE_HIERARCHY[requesterMembership.role as OrgRole] ?? 0) < ROLE_HIERARCHY[OrgRole.ADMIN]) {
            throw new ForbiddenException(ErrorMessages.RBAC.INSUFFICIENT_PERMISSIONS);
        }

        const targetUser = await this.userRepository.findOne({ where: { id: targetUserId } });
        if (!targetUser) throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);

        const targetTenantMembership = await this.memberRepository.findOne({
            where: { tenantId: organization.tenantId, userId: targetUserId },
        });

        if (!targetTenantMembership) {
            throw new NotFoundException(ErrorMessages.MEMBERS.NOT_FOUND);
        }

        const existing = await this.organizationMembershipRepository.findOne({
            where: { organizationId: dto.organizationId, userId: targetUserId },
        });

        if (existing) throw new ConflictException(ErrorMessages.INVITES.USER_ALREADY_MEMBER);

        return this.organizationMembershipRepository.save({
            organizationId: dto.organizationId,
            userId: targetUserId,
            role: dto.role,
        } as Partial<OrganizationMembership>);
    }

    async removeMemberFromOrg(targetUserId: string, organizationId: string, requesterUserId: string): Promise<{ userId: string; removed: true }> {
        if (targetUserId === requesterUserId) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.CANNOT_REMOVE_SELF);
        }

        const organization = await this.organizationRepository.findOne({ where: { id: organizationId } });
        if (!organization) {
            throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        }

        const requesterMembership = await this.memberRepository.findOne({
            where: { tenantId: organization.tenantId, userId: requesterUserId },
        });

        if (!requesterMembership || (ROLE_HIERARCHY[requesterMembership.role as OrgRole] ?? 0) < ROLE_HIERARCHY[OrgRole.ADMIN]) {
            throw new ForbiddenException(ErrorMessages.RBAC.INSUFFICIENT_PERMISSIONS);
        }

        const targetTenantMembership = await this.memberRepository.findOne({
            where: { tenantId: organization.tenantId, userId: targetUserId },
        });

        if (!targetTenantMembership) {
            throw new NotFoundException(ErrorMessages.MEMBERS.NOT_FOUND);
        }

        const targetOrgMembership = await this.organizationMembershipRepository.findOne({
            where: { organizationId, userId: targetUserId },
        });

        if (!targetOrgMembership) {
            throw new NotFoundException(ErrorMessages.MEMBERS.NOT_FOUND);
        }

        if (targetOrgMembership.role === OrgRole.OWNER) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.CANNOT_REMOVE_OWNER);
        }

        const requesterLevel = ROLE_HIERARCHY[requesterMembership.role as OrgRole] ?? 0;
        const targetLevel = ROLE_HIERARCHY[targetOrgMembership.role as OrgRole] ?? 0;

        if (requesterLevel <= targetLevel) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.INSUFFICIENT_ROLE_TO_MODIFY);
        }

        await this.organizationMembershipRepository.remove(targetOrgMembership);
        return { userId: targetUserId, removed: true };
    }

    async listMembers(tenantId: string): Promise<TenantMember[]> {
        return this.memberRepository.find({
            where: { tenantId },
            relations: ['user'],
            order: { joinedAt: 'ASC' },
        });
    }

    async listPendingInvites(tenantId: string): Promise<TenantInvite[]> {
        return this.inviteRepository.find({
            where: { tenantId, status: TenantInviteStatus.PENDING },
            order: { createdAt: 'DESC' },
        });
    }

    async resendInvite(inviteId: string, tenantId: string, requesterId: string): Promise<TenantInvite> {
        const invite = await this.inviteRepository.findOne({ where: { id: inviteId, tenantId } });
        if (!invite) throw new NotFoundException(ErrorMessages.INVITES.NOT_FOUND);

        const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
        const inviter = await this.userRepository.findOne({ where: { id: requesterId } });

        invite.token = uuidv4();
        invite.status = TenantInviteStatus.PENDING;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 8);
        invite.expiresAt = expiresAt;
        invite.invitedByUserId = requesterId;

        const saved = await this.inviteRepository.save(invite);

        this.mailerService
            .sendOrganizationInvite({
                to: saved.email,
                organizationName: tenant?.name ?? '',
                inviterName: inviter?.name ?? 'Um administrador',
                role: saved.role,
                token: saved.token,
            })
            .catch((err) => this.logger.error(`Failed to resend invite email for invite ${saved.id}`, err));

        return saved;
    }

    async cancelInvite(inviteId: string, tenantId: string): Promise<{ inviteId: string; cancelled: true }> {
        const invite = await this.inviteRepository.findOne({ where: { id: inviteId, tenantId } });
        if (!invite) throw new NotFoundException(ErrorMessages.INVITES.NOT_FOUND);
        await this.inviteRepository.remove(invite);
        return { inviteId, cancelled: true };
    }

    async removeMember(tenantId: string, targetUserId: string, requesterMembership: TenantMember): Promise<{ userId: string; removed: true }> {
        if (targetUserId === requesterMembership.userId) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.CANNOT_REMOVE_SELF);
        }

        const target = await this.memberRepository.findOne({ where: { tenantId, userId: targetUserId } });
        if (!target) throw new NotFoundException(ErrorMessages.MEMBERS.NOT_FOUND);
        if (target.role === OrgRole.OWNER) throw new ForbiddenException(ErrorMessages.MEMBERS.CANNOT_REMOVE_OWNER);

        const requesterLevel = ROLE_HIERARCHY[requesterMembership.role as OrgRole] ?? 0;
        const targetLevel = ROLE_HIERARCHY[target.role as OrgRole] ?? 0;

        if (requesterLevel <= targetLevel) throw new ForbiddenException(ErrorMessages.MEMBERS.INSUFFICIENT_ROLE_TO_MODIFY);

        await this.memberRepository.remove(target);
        return { userId: targetUserId, removed: true };
    }

    async updateMemberRole(tenantId: string, targetUserId: string, dto: UpdateMemberRoleDto, requesterMembership: TenantMember): Promise<TenantMember> {
        const target = await this.memberRepository.findOne({ where: { tenantId, userId: targetUserId } });
        if (!target) throw new NotFoundException(ErrorMessages.MEMBERS.NOT_FOUND);
        if (target.role === OrgRole.OWNER) throw new ForbiddenException(ErrorMessages.MEMBERS.CANNOT_CHANGE_OWNER_ROLE);

        const requesterLevel = ROLE_HIERARCHY[requesterMembership.role as OrgRole] ?? 0;
        const targetLevel = ROLE_HIERARCHY[target.role as OrgRole] ?? 0;
        const newRoleLevel = ROLE_HIERARCHY[dto.role as OrgRole] ?? 0;

        if (requesterLevel <= targetLevel) throw new ForbiddenException(ErrorMessages.MEMBERS.INSUFFICIENT_ROLE_TO_MODIFY);
        if (newRoleLevel >= requesterLevel) throw new ForbiddenException(ErrorMessages.MEMBERS.INSUFFICIENT_ROLE_TO_MODIFY);

        target.role = dto.role;
        return this.memberRepository.save(target);
    }

    // ─── Cleanup ──────────────────────────────────────────────────────────────

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async cleanupExpiredInvites(): Promise<void> {
        try {
            const result = await this.inviteRepository.delete({
                status: TenantInviteStatus.EXPIRED,
                expiresAt: LessThan(new Date()),
            });
            if (result.affected && result.affected > 0) {
                this.logger.log(`Cleaned up ${result.affected} expired invites`);
            }
        } catch (error) {
            this.logger.error('Failed to cleanup expired invites', error);
        }
    }

    // ─── Private Helpers ──────────────────────────────────────────────────────

    private getTenantIfUserHasAccess(id: string, userId: string): Promise<Tenant | null> {
        return this.tenantRepository
            .createQueryBuilder('tenant')
            .innerJoin('tenant.members', 'member', 'member.user_id = :userId', { userId })
            .where('tenant.id = :id', { id })
            .getOne();
    }

    private async ensureUserIsOwner(tenantId: string, userId: string): Promise<void> {
        const membership = await this.memberRepository.findOne({ where: { tenantId, userId } });
        if (!membership || membership.role !== OrgRole.OWNER) {
            throw new ForbiddenException(ErrorMessages.RBAC.INSUFFICIENT_PERMISSIONS);
        }
    }

    private async ensureUserCanManage(tenantId: string, userId: string): Promise<void> {
        const membership = await this.memberRepository.findOne({ where: { tenantId, userId } });
        const role = membership?.role as OrgRole | undefined;
        if (!role || (ROLE_HIERARCHY[role] ?? 0) < ROLE_HIERARCHY[OrgRole.ADMIN]) {
            throw new ForbiddenException(ErrorMessages.RBAC.INSUFFICIENT_PERMISSIONS);
        }
    }

    private async ensureCanCreateOrganization(_userId: string): Promise<void> {
        // Tenant creation is unrestricted at the billing level.
        // Plan limits (cloud accounts, users) are enforced after the tenant has a subscription.
    }

    private async ensureCanAddUserToTenant(tenantId: string, includePendingInvites: boolean): Promise<void> {
        let plan;
        try {
            plan = await this.billingService.getActivePlanForOrganization(tenantId);
        } catch {
            return;
        }

        const maxUsers = plan.metadata.maxUsers;
        if (maxUsers <= 0) return;

        const currentMembers = await this.memberRepository.count({ where: { tenantId } });

        if (!includePendingInvites) {
            if (currentMembers >= maxUsers) throw new ForbiddenException(ErrorMessages.PLANS.USER_LIMIT_REACHED);
            return;
        }

        const pendingInvites = await this.inviteRepository.count({ where: { tenantId, status: TenantInviteStatus.PENDING } });
        if (currentMembers + pendingInvites >= maxUsers) {
            throw new ForbiddenException(ErrorMessages.PLANS.USER_LIMIT_REACHED);
        }
    }

    private async addUserToDefaultOrganization(tenantId: string, userId: string, role: OrgRole): Promise<void> {
        const defaultOrganization = await this.organizationRepository.findOne({
            where: { tenantId },
            order: { createdAt: 'ASC' },
        });

        if (!defaultOrganization) {
            return;
        }

        const existingMembership = await this.organizationMembershipRepository.findOne({
            where: {
                organizationId: defaultOrganization.id,
                userId,
            },
        });

        if (existingMembership) {
            return;
        }

        await this.organizationMembershipRepository.save({
            organizationId: defaultOrganization.id,
            userId,
            role,
        } as Partial<OrganizationMembership>);
    }

    private async resolveInviteOrganizationIds(tenantId: string, organizationIds?: string[]): Promise<string[]> {
        if (!organizationIds || organizationIds.length === 0) {
            return [];
        }

        const uniqueIds = [...new Set(organizationIds)];
        const organizations = await this.organizationRepository.find({
            where: { tenantId, id: In(uniqueIds) },
        });

        if (organizations.length !== uniqueIds.length) {
            throw new BadRequestException('Uma ou mais organizações selecionadas são inválidas para este tenant.');
        }

        return uniqueIds;
    }

    private async addUserToInviteOrganizations(tenantId: string, userId: string, role: OrgRole, invitedOrganizationIds?: string[]): Promise<void> {
        const selectedOrganizationIds = invitedOrganizationIds?.filter(Boolean) ?? [];

        if (selectedOrganizationIds.length === 0) {
            await this.addUserToDefaultOrganization(tenantId, userId, role);
            return;
        }

        const organizations = await this.organizationRepository.find({
            where: { tenantId, id: In(selectedOrganizationIds) },
        });

        if (organizations.length === 0) {
            await this.addUserToDefaultOrganization(tenantId, userId, role);
            return;
        }

        const existingMemberships = await this.organizationMembershipRepository.find({
            where: {
                userId,
                organizationId: In(organizations.map((organization) => organization.id)),
            },
            select: ['organizationId'],
        });

        const existingOrgIds = new Set(existingMemberships.map((membership) => membership.organizationId));
        const membershipsToCreate = organizations
            .filter((organization) => !existingOrgIds.has(organization.id))
            .map((organization) =>
                this.organizationMembershipRepository.create({
                    organizationId: organization.id,
                    userId,
                    role,
                })
            );

        if (membershipsToCreate.length > 0) {
            await this.organizationMembershipRepository.save(membershipsToCreate);
        }
    }
}
