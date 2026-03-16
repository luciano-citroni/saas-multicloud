import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    ConflictException,
    BadRequestException,
    Logger,
    Inject,
    forwardRef,
    InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Organization, OrganizationMember, OrganizationInvite, InviteStatus, User } from '../db/entites';
import { CreateOrganizationDto, UpdateOrganizationDto, InviteMemberDto, UpdateMemberRoleDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';
import { OrgRole, ROLE_HIERARCHY } from '../rbac/roles.enum';
import { MailerService } from '../mailer/mailer.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class OrganizationService {
    private readonly logger = new Logger(OrganizationService.name);

    constructor(
        @InjectRepository(Organization)
        private readonly organizationRepository: Repository<Organization>,
        @InjectRepository(OrganizationMember)
        private readonly memberRepository: Repository<OrganizationMember>,
        @InjectRepository(OrganizationInvite)
        private readonly inviteRepository: Repository<OrganizationInvite>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly mailerService: MailerService,
        @Inject(forwardRef(() => BillingService))
        private readonly billingService: BillingService
    ) {}

    async create(payload: CreateOrganizationDto, creatorId?: string): Promise<Organization> {
        const organization = this.organizationRepository.create(payload);

        const saved = await this.organizationRepository.save(organization);

        if (!creatorId) {
            return saved;
        }

        try {
            await this.memberRepository.save({
                organizationId: saved.id,
                userId: creatorId,
                role: OrgRole.OWNER,
            } as Partial<OrganizationMember>);

            const owner = await this.userRepository.findOne({ where: { id: creatorId } });
            if (!owner) {
                throw new InternalServerErrorException('Organization owner not found during Stripe initialization');
            }

            await this.billingService.initializeSubscription(saved, owner);
        } catch (error) {
            await this.organizationRepository.delete(saved.id).catch((cleanupError) => {
                this.logger.error(`Failed to rollback organization ${saved.id} after Stripe initialization error`, cleanupError);
            });
            throw error;
        }

        return saved;
    }

    async findAll(userId: string): Promise<Array<Organization & { currentRole: string | null }>> {
        const query = this.organizationRepository
            .createQueryBuilder('organization')
            .innerJoin('organization.members', 'member', 'member.user_id = :userId', { userId })
            .addSelect('member.role', 'member_role');

        const { entities, raw } = await query.getRawAndEntities();

        return entities.map((organization, index) => ({
            ...organization,
            currentRole: typeof raw[index]?.member_role === 'string' ? raw[index].member_role : null,
        }));
    }

    async findOne(id: string, userId: string): Promise<Organization> {
        const organization = await this.getOrganizationIfUserHasAccess(id, userId);

        if (!organization) {
            throw new NotFoundException(ErrorMessages.TENANT.NO_ACCESS);
        }

        return organization;
    }

    async update(id: string, payload: UpdateOrganizationDto, userId: string): Promise<Organization> {
        const hasAccess = await this.getOrganizationIfUserHasAccess(id, userId);

        if (!hasAccess) {
            throw new NotFoundException(ErrorMessages.TENANT.NO_ACCESS);
        }

        await this.ensureUserIsOwner(id, userId);

        const organization = await this.organizationRepository.preload({ id, ...payload });

        if (!organization) {
            throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        }

        return this.organizationRepository.save(organization);
    }

    async remove(id: string, userId: string): Promise<{ id: string; deleted: true }> {
        const organization = await this.findOne(id, userId);

        await this.ensureUserIsOwner(id, userId);

        await this.organizationRepository.remove(organization);

        return { id, deleted: true };
    }

    // ─── Member Management ────────────────────────────────────────────────────

    /**
     * Busca um convite por token com validações centralizadas
     * Valida se o convite existe, não foi aceito, e não expirou
     */
    async getInviteByToken(token: string): Promise<OrganizationInvite> {
        const invite = await this.inviteRepository.findOne({ where: { token } });

        if (!invite || invite.status === InviteStatus.ACCEPTED) {
            throw new NotFoundException(ErrorMessages.INVITES.NOT_FOUND);
        }

        if (invite.status === InviteStatus.EXPIRED || invite.expiresAt < new Date()) {
            if (invite.status !== InviteStatus.EXPIRED) {
                invite.status = InviteStatus.EXPIRED;
                await this.inviteRepository.save(invite);
            }
            throw new BadRequestException(ErrorMessages.INVITES.EXPIRED);
        }

        return invite;
    }

    async inviteMember(organizationId: string, inviterUserId: string, dto: InviteMemberDto): Promise<OrganizationInvite> {
        const organization = await this.organizationRepository.findOne({ where: { id: organizationId } });
        if (!organization) {
            throw new NotFoundException(ErrorMessages.ORGANIZATIONS.NOT_FOUND);
        }

        await this.ensureCanAddUserToOrganization(organizationId, true);

        const inviter = await this.userRepository.findOne({ where: { id: inviterUserId } });

        // If the invited email belongs to an existing user, check they're not already a member
        const existingUser = await this.userRepository.findOne({ where: { email: dto.email.toLowerCase() } });
        if (existingUser) {
            const alreadyMember = await this.memberRepository.findOne({
                where: { organizationId, userId: existingUser.id },
            });
            if (alreadyMember) {
                throw new ConflictException(ErrorMessages.INVITES.USER_ALREADY_MEMBER);
            }
        }

        // Remove any existing pending invites for this email in this organization
        await this.inviteRepository.delete({
            organizationId,
            email: dto.email.toLowerCase(),
            status: InviteStatus.PENDING,
        });

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 8);

        const invite = this.inviteRepository.create({
            organizationId,
            email: dto.email.toLowerCase(),
            role: dto.role,
            token: uuidv4(),
            status: InviteStatus.PENDING,
            invitedByUserId: inviterUserId,
            expiresAt,
        });

        const saved = await this.inviteRepository.save(invite);

        // Send invite email — log error but don't block the response
        this.mailerService
            .sendOrganizationInvite({
                to: dto.email,
                organizationName: organization.name,
                inviterName: inviter?.name ?? 'Um administrador',
                role: dto.role,
                token: saved.token,
            })
            .catch((err) => this.logger.error(`Failed to send invite email for invite ${saved.id}`, err));

        return saved;
    }

    async acceptInvite(token: string): Promise<
        | {
              status: 'accepted';
              message: string;
              organizationId: string;
              role: string;
          }
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

        // Buscar a organização para obter o nome
        const organization = await this.organizationRepository.findOne({ where: { id: invite.organizationId } });

        const user = await this.userRepository.findOne({ where: { email: invite.email } });

        // Se o usuário não tem conta, retornar dados para pré-registro
        if (!user) {
            return {
                status: 'needs_registration',
                message: 'No account found with this email. Please register to accept this invite.',
                email: invite.email,
                organizationId: invite.organizationId,
                organizationName: organization?.name ?? 'Unknown Organization',
                role: invite.role,
                inviteToken: token,
            };
        }

        const alreadyMember = await this.memberRepository.findOne({
            where: { organizationId: invite.organizationId, userId: user.id },
        });
        if (alreadyMember) {
            invite.status = InviteStatus.ACCEPTED;
            await this.inviteRepository.save(invite);
            throw new ConflictException(ErrorMessages.INVITES.USER_ALREADY_MEMBER);
        }

        await this.ensureCanAddUserToOrganization(invite.organizationId, false);

        await this.memberRepository.save({
            organizationId: invite.organizationId,
            userId: user.id,
            role: invite.role,
        } as Partial<OrganizationMember>);

        invite.status = InviteStatus.ACCEPTED;
        await this.inviteRepository.save(invite);

        return {
            status: 'accepted',
            message: 'Invite accepted successfully. You are now a member of the organization.',
            organizationId: invite.organizationId,
            role: invite.role,
        };
    }

    async acceptInviteWithUserId(inviteToken: string, userId: string): Promise<{ message: string; organizationId: string; role: string }> {
        const invite = await this.getInviteByToken(inviteToken);

        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        }

        // Verificar se o email do convite corresponde ao email do usuário
        if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
            throw new BadRequestException('The invite email does not match your account email.');
        }

        const alreadyMember = await this.memberRepository.findOne({
            where: { organizationId: invite.organizationId, userId: user.id },
        });
        if (alreadyMember) {
            invite.status = InviteStatus.ACCEPTED;
            await this.inviteRepository.save(invite);
            throw new ConflictException(ErrorMessages.INVITES.USER_ALREADY_MEMBER);
        }

        await this.ensureCanAddUserToOrganization(invite.organizationId, false);

        await this.memberRepository.save({
            organizationId: invite.organizationId,
            userId: user.id,
            role: invite.role,
        } as Partial<OrganizationMember>);

        invite.status = InviteStatus.ACCEPTED;
        await this.inviteRepository.save(invite);

        return {
            message: 'Invite accepted successfully. You are now a member of the organization.',
            organizationId: invite.organizationId,
            role: invite.role,
        };
    }

    async removeMember(organizationId: string, targetUserId: string, requesterMembership: OrganizationMember): Promise<{ userId: string; removed: true }> {
        if (targetUserId === requesterMembership.userId) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.CANNOT_REMOVE_SELF);
        }

        const target = await this.memberRepository.findOne({ where: { organizationId, userId: targetUserId } });
        if (!target) {
            throw new NotFoundException(ErrorMessages.MEMBERS.NOT_FOUND);
        }

        if (target.role === OrgRole.OWNER) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.CANNOT_REMOVE_OWNER);
        }

        const requesterLevel = ROLE_HIERARCHY[requesterMembership.role as OrgRole] ?? 0;
        const targetLevel = ROLE_HIERARCHY[target.role as OrgRole] ?? 0;

        if (requesterLevel <= targetLevel) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.INSUFFICIENT_ROLE_TO_MODIFY);
        }

        await this.memberRepository.remove(target);

        return { userId: targetUserId, removed: true };
    }

    async updateMemberRole(
        organizationId: string,
        targetUserId: string,
        dto: UpdateMemberRoleDto,
        requesterMembership: OrganizationMember
    ): Promise<OrganizationMember> {
        const target = await this.memberRepository.findOne({ where: { organizationId, userId: targetUserId } });
        if (!target) {
            throw new NotFoundException(ErrorMessages.MEMBERS.NOT_FOUND);
        }

        if (target.role === OrgRole.OWNER) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.CANNOT_CHANGE_OWNER_ROLE);
        }

        const requesterLevel = ROLE_HIERARCHY[requesterMembership.role as OrgRole] ?? 0;
        const targetLevel = ROLE_HIERARCHY[target.role as OrgRole] ?? 0;
        const newRoleLevel = ROLE_HIERARCHY[dto.role as OrgRole] ?? 0;

        if (requesterLevel <= targetLevel) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.INSUFFICIENT_ROLE_TO_MODIFY);
        }

        if (newRoleLevel >= requesterLevel) {
            throw new ForbiddenException(ErrorMessages.MEMBERS.INSUFFICIENT_ROLE_TO_MODIFY);
        }

        target.role = dto.role;
        return this.memberRepository.save(target);
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    private getOrganizationIfUserHasAccess(id: string, userId: string): Promise<Organization | null> {
        return this.organizationRepository
            .createQueryBuilder('organization')
            .innerJoin('organization.members', 'member', 'member.user_id = :userId', { userId })
            .where('organization.id = :id', { id })
            .getOne();
    }

    // ─── Cleanup Tasks ───────────────────────────────────────────────────────

    /**
     * Remove convites expirados da base de dados.
     * Executa todos os dias à meia-noite.
     */
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async cleanupExpiredInvites(): Promise<void> {
        try {
            const result = await this.inviteRepository.delete({
                status: InviteStatus.EXPIRED,
                expiresAt: LessThan(new Date()),
            });
            if (result.affected && result.affected > 0) {
                this.logger.log(`Cleaned up ${result.affected} expired invites`);
            }
        } catch (error) {
            this.logger.error('Failed to cleanup expired invites', error);
        }
    }

    private async ensureUserIsOwner(organizationId: string, userId: string): Promise<void> {
        const membership = await this.memberRepository.findOne({
            where: {
                organizationId,
                userId,
            },
        });

        if (!membership || membership.role !== OrgRole.OWNER) {
            throw new ForbiddenException(ErrorMessages.RBAC.INSUFFICIENT_PERMISSIONS);
        }
    }

    private async ensureCanAddUserToOrganization(organizationId: string, includePendingInvites: boolean): Promise<void> {
        const plan = await this.billingService.getActivePlanForOrganization(organizationId);
        const maxUsers = plan.metadata.maxUsers;

        if (maxUsers <= 0) {
            return;
        }

        const currentMembers = await this.memberRepository.count({ where: { organizationId } });

        if (!includePendingInvites) {
            if (currentMembers >= maxUsers) {
                throw new ForbiddenException(ErrorMessages.PLANS.USER_LIMIT_REACHED);
            }
            return;
        }

        const pendingInvites = await this.inviteRepository.count({
            where: { organizationId, status: InviteStatus.PENDING },
        });

        if (currentMembers + pendingInvites >= maxUsers) {
            throw new ForbiddenException(ErrorMessages.PLANS.USER_LIMIT_REACHED);
        }
    }
}
