import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../db/entites/user.entity';
import { OrganizationMembership } from '../db/entites/organization-membership.entity';
import { Organization } from '../db/entites/organization.entity';
import type { CreateUserDto, UpdateUserDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';
import { OrgRole } from '../rbac/roles.enum';

interface UserScopeContext {
    requesterUserId: string;
    requesterRole: string;
    tenantId: string;
}

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(OrganizationMembership)
        private readonly organizationMembershipRepository: Repository<OrganizationMembership>
    ) {}

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository
            .createQueryBuilder('user')
            .addSelect('user.password')
            .where('user.email = :email', { email: email.toLowerCase() })
            .getOne();
    }

    private sanitizeUser(
        user: User,
    ): Omit<
        User,
        | 'password'
        | 'sessions'
        | 'organizationMemberships'
        | 'googleId'
        | 'failedLoginAttempts'
        | 'lockedUntil'
    > & { hasGoogleLinked: boolean } {
        const {
            password: _password,
            sessions: _sessions,
            organizationMemberships: _members,
            googleId,
            failedLoginAttempts: _failedLoginAttempts,
            lockedUntil: _lockedUntil,
            ...sanitized
        } = user;
        return {
            ...sanitized,
            hasGoogleLinked: Boolean(googleId),
        };
    }

    async recordFailedLogin(userId: string, maxAttempts: number, lockDurationMs: number): Promise<void> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) return;

        const attempts = (user.failedLoginAttempts ?? 0) + 1;
        const patch: Partial<User> = { failedLoginAttempts: attempts };
        if (attempts >= maxAttempts) {
            patch.lockedUntil = new Date(Date.now() + lockDurationMs);
            patch.failedLoginAttempts = 0;
        }
        await this.userRepository.update({ id: userId }, patch);
    }

    async clearLoginFailures(userId: string): Promise<void> {
        await this.userRepository.update(
            { id: userId },
            { failedLoginAttempts: 0, lockedUntil: null },
        );
    }

    private canManageOtherUsers(role: string): boolean {
        return role === OrgRole.ADMIN || role === OrgRole.OWNER;
    }

    private async findInOrganization(userId: string, tenantId: string): Promise<User | null> {
        return this.userRepository
            .createQueryBuilder('user')
            .innerJoin(OrganizationMembership, 'membership', 'membership.user_id = user.id')
            .innerJoin(Organization, 'organization', 'organization.id = membership.organization_id')
            .where('user.id = :userId', { userId })
            .andWhere('organization.tenant_id = :tenantId', { tenantId })
            .getOne();
    }

    private async ensureScopedAccess(targetUserId: string, context: UserScopeContext): Promise<User> {
        if (targetUserId === context.requesterUserId) {
            const ownUser = await this.userRepository.findOne({ where: { id: targetUserId } });
            if (!ownUser) throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
            return ownUser;
        }

        if (!this.canManageOtherUsers(context.requesterRole)) {
            throw new ForbiddenException(ErrorMessages.RBAC.INSUFFICIENT_PERMISSIONS);
        }

        const userInOrg = await this.findInOrganization(targetUserId, context.tenantId);
        if (!userInOrg) {
            throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        }

        return userInOrg;
    }

    async findById(id: string) {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        return this.sanitizeUser(user);
    }

    async findByIdInScope(id: string, context: UserScopeContext) {
        const user = await this.ensureScopedAccess(id, context);
        return this.sanitizeUser(user);
    }

    async create(dto: CreateUserDto) {
        const hashedPassword = await bcrypt.hash(dto.password, 12);
        const user = this.userRepository.create({
            ...dto,
            email: dto.email.toLowerCase(),
            password: hashedPassword,
            isActive: true,
            emailVerified: false,
        });
        const savedUser = await this.userRepository.save(user);
        return this.sanitizeUser(savedUser);
    }

    async findAll(tenantId: string) {
        const users = await this.userRepository
            .createQueryBuilder('user')
            .innerJoin(OrganizationMembership, 'membership', 'membership.user_id = user.id')
            .innerJoin(Organization, 'organization', 'organization.id = membership.organization_id')
            .where('organization.tenant_id = :tenantId', { tenantId })
            .orderBy('user.created_at', 'DESC')
            .distinct(true)
            .getMany();

        return users.map((user) => this.sanitizeUser(user));
    }

    async update(id: string, payload: UpdateUserDto) {
        const updateData = { ...payload };
        if (updateData.email) {
            updateData.email = updateData.email.toLowerCase();
        }
        const user = await this.userRepository.preload({ id, ...updateData });

        if (!user) {
            throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        }

        const savedUser = await this.userRepository.save(user);
        return this.sanitizeUser(savedUser);
    }

    async updateInScope(id: string, payload: UpdateUserDto, context: UserScopeContext) {
        await this.ensureScopedAccess(id, context);
        return this.update(id, payload);
    }

    async remove(id: string): Promise<{ id: string; deleted: true }> {
        const user = await this.findById(id);

        await this.userRepository.delete({ id });

        return { id, deleted: true };
    }

    async removeInScope(id: string, context: UserScopeContext): Promise<{ id: string; deleted: true }> {
        if (id !== context.requesterUserId) {
            throw new ForbiddenException(ErrorMessages.RBAC.INSUFFICIENT_PERMISSIONS);
        }

        const membershipCount = await this.organizationMembershipRepository.count({
            where: { userId: id },
        });

        if (membershipCount > 0) {
            throw new ForbiddenException(ErrorMessages.USERS.CANNOT_DELETE_WHILE_IN_ORGANIZATION);
        }

        await this.findById(id);
        await this.userRepository.delete({ id });
        return { id, deleted: true };
    }

    async findByGoogleId(googleId: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { googleId } });
    }

    async findEntityById(id: string): Promise<User> {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        return user;
    }

    async findEntityByIdWithPassword(id: string): Promise<User> {
        const user = await this.userRepository
            .createQueryBuilder('user')
            .addSelect('user.password')
            .where('user.id = :id', { id })
            .getOne();
        if (!user) throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        return user;
    }

    async validatePassword(userId: string, password: string): Promise<boolean> {
        const user = await this.findEntityByIdWithPassword(userId);
        if (!user.password) {
            return false;
        }

        return bcrypt.compare(password, user.password);
    }

    async updatePassword(userId: string, newPassword: string): Promise<void> {
        await this.findEntityById(userId);
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        await this.userRepository.update(
            { id: userId },
            {
                password: hashedPassword,
                failedLoginAttempts: 0,
                lockedUntil: null,
            },
        );
    }

    async createWithGoogle(dto: {
        email: string;
        name: string;
        googleId: string;
        emailVerified?: boolean;
    }): Promise<User> {
        const user = this.userRepository.create({
            email: dto.email.toLowerCase(),
            name: dto.name,
            googleId: dto.googleId,
            password: null,
            isActive: true,
            // Google already verified the mailbox when emailVerified !== false.
            emailVerified: dto.emailVerified !== false,
            failedLoginAttempts: 0,
            lockedUntil: null,
        });
        return this.userRepository.save(user);
    }

    async markEmailVerified(userId: string): Promise<void> {
        await this.userRepository.update({ id: userId }, { emailVerified: true });
    }

    async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
        await this.userRepository.update({ id: userId }, { googleId });
    }
}
