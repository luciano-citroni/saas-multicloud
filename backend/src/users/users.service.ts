import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../db/entites/user.entity';
import { OrganizationMember } from '../db/entites/organization-member.entity';
import type { CreateUserDto, UpdateUserDto } from './dto';
import { ErrorMessages } from '../common/messages/error-messages';
import { OrgRole } from '../rbac/roles.enum';

interface UserScopeContext {
    requesterUserId: string;
    requesterRole: string;
    organizationId: string;
}

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(OrganizationMember)
        private readonly organizationMemberRepository: Repository<OrganizationMember>
    ) {}

    async findByEmail(email: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { email: email.toLowerCase() } });
    }

    async findByCpf(cpf: string): Promise<User | null> {
        return this.userRepository.findOne({ where: { cpf } });
    }

    private sanitizeUser(user: User): Omit<User, 'password' | 'sessions' | 'organizationMemberships'> {
        const { password: _password, sessions: _sessions, organizationMemberships: _members, ...sanitized } = user;
        return sanitized as any;
    }

    private canManageOtherUsers(role: string): boolean {
        return role === OrgRole.ADMIN || role === OrgRole.OWNER;
    }

    private async findInOrganization(userId: string, organizationId: string): Promise<User | null> {
        return this.userRepository.findOne({
            where: {
                id: userId,
                organizationMemberships: {
                    organizationId,
                },
            },
        });
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

        const userInOrg = await this.findInOrganization(targetUserId, context.organizationId);
        if (!userInOrg) {
            throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        }

        return userInOrg;
    }

    async findById(id: string): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>> {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) throw new NotFoundException(ErrorMessages.USERS.NOT_FOUND);
        return this.sanitizeUser(user);
    }

    async findByIdInScope(id: string, context: UserScopeContext): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>> {
        const user = await this.ensureScopedAccess(id, context);
        return this.sanitizeUser(user);
    }

    async create(dto: CreateUserDto): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>> {
        const hashedPassword = await bcrypt.hash(dto.password, 12);
        const user = this.userRepository.create({
            ...dto,
            email: dto.email.toLowerCase(),
            password: hashedPassword,
            isActive: true,
        });
        const savedUser = await this.userRepository.save(user);
        return this.sanitizeUser(savedUser);
    }

    async findAll(organizationId: string): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>[]> {
        const users = await this.userRepository.find({
            where: {
                organizationMemberships: {
                    organizationId: organizationId,
                },
            },
        });
        return users.map((user) => this.sanitizeUser(user));
    }

    async update(id: string, payload: UpdateUserDto): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>> {
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

    async updateInScope(
        id: string,
        payload: UpdateUserDto,
        context: UserScopeContext
    ): Promise<Omit<User, 'password' | 'sessions' | 'organizationMemberships'>> {
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

        const membershipCount = await this.organizationMemberRepository.count({
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

    async createWithGoogle(dto: { email: string; name: string; googleId: string }): Promise<User> {
        const user = this.userRepository.create({
            email: dto.email.toLowerCase(),
            name: dto.name,
            googleId: dto.googleId,
            password: null,
            cpf: null,
            isActive: true,
        });
        return this.userRepository.save(user);
    }

    async linkGoogleAccount(userId: string, googleId: string): Promise<void> {
        await this.userRepository.update({ id: userId }, { googleId });
    }
}
