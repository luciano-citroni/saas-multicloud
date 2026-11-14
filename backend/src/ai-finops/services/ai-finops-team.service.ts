import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiFinopsTeam } from '../../db/entites/ai-finops-team.entity';
import { AiFinopsTeamMember } from '../../db/entites/ai-finops-team-member.entity';
import { User } from '../../db/entites/user.entity';
import { ErrorMessages } from '../../common/messages/error-messages';
import type { AddTeamMemberDto, CreateTeamDto, UpdateTeamDto } from '../dto';
import { AiFinopsAuditService } from './ai-finops-audit.service';
import { AiFinopsConnectionService } from './ai-finops-connection.service';

@Injectable()
export class AiFinopsTeamService {
    constructor(
        @InjectRepository(AiFinopsTeam)
        private readonly teamRepository: Repository<AiFinopsTeam>,
        @InjectRepository(AiFinopsTeamMember)
        private readonly memberRepository: Repository<AiFinopsTeamMember>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly connections: AiFinopsConnectionService,
        private readonly audit: AiFinopsAuditService,
    ) {}

    async list(tenantId: string, organizationId?: string) {
        const where: { tenantId: string; organizationId?: string } = { tenantId };
        if (organizationId) {
            await this.connections.assertOrganizationBelongsToTenant(tenantId, organizationId);
            where.organizationId = organizationId;
        }
        return this.teamRepository.find({
            where,
            relations: ['members', 'members.user'],
            order: { name: 'ASC' },
        });
    }

    async findOrFail(tenantId: string, teamId: string): Promise<AiFinopsTeam> {
        const team = await this.teamRepository.findOne({
            where: { id: teamId, tenantId },
            relations: ['members', 'members.user'],
        });
        if (!team) throw new NotFoundException(ErrorMessages.AI_FINOPS.TEAM_NOT_FOUND);
        return team;
    }

    async create(tenantId: string, userId: string | null, dto: CreateTeamDto) {
        await this.connections.assertOrganizationBelongsToTenant(tenantId, dto.organizationId);
        const team = await this.teamRepository.save(
            this.teamRepository.create({
                tenantId,
                organizationId: dto.organizationId,
                name: dto.name,
                description: dto.description ?? null,
                status: 'active',
            }),
        );
        await this.audit.log({
            tenantId,
            userId,
            action: 'team.created',
            entityType: 'ai_finops_team',
            entityId: team.id,
        });
        return this.findOrFail(tenantId, team.id);
    }

    async update(tenantId: string, userId: string | null, teamId: string, dto: UpdateTeamDto) {
        const team = await this.findOrFail(tenantId, teamId);
        if (dto.name !== undefined) team.name = dto.name;
        if (dto.description !== undefined) team.description = dto.description;
        if (dto.status !== undefined) team.status = dto.status;
        await this.teamRepository.save(team);
        await this.audit.log({
            tenantId,
            userId,
            action: 'team.updated',
            entityType: 'ai_finops_team',
            entityId: teamId,
        });
        return this.findOrFail(tenantId, teamId);
    }

    async remove(tenantId: string, userId: string | null, teamId: string): Promise<void> {
        const team = await this.findOrFail(tenantId, teamId);
        await this.teamRepository.remove(team);
        await this.audit.log({
            tenantId,
            userId,
            action: 'team.deleted',
            entityType: 'ai_finops_team',
            entityId: teamId,
        });
    }

    async addMember(tenantId: string, actorUserId: string | null, teamId: string, dto: AddTeamMemberDto) {
        const team = await this.findOrFail(tenantId, teamId);
        const user = await this.userRepository.findOne({ where: { id: dto.userId } });
        if (!user) throw new NotFoundException(ErrorMessages.AI_FINOPS.TEAM_MEMBER_NOT_FOUND);

        const existing = await this.memberRepository.findOne({
            where: { teamId: team.id, userId: dto.userId },
        });
        if (existing) return this.findOrFail(tenantId, teamId);

        await this.memberRepository.save(
            this.memberRepository.create({
                teamId: team.id,
                userId: dto.userId,
                roleInTeam: dto.roleInTeam,
            }),
        );
        await this.audit.log({
            tenantId,
            userId: actorUserId,
            action: 'team.member_added',
            entityType: 'ai_finops_team',
            entityId: teamId,
            metadata: { memberUserId: dto.userId },
        });
        return this.findOrFail(tenantId, teamId);
    }

    async removeMember(tenantId: string, actorUserId: string | null, teamId: string, memberUserId: string) {
        await this.findOrFail(tenantId, teamId);
        const member = await this.memberRepository.findOne({
            where: { teamId, userId: memberUserId },
        });
        if (!member) throw new NotFoundException(ErrorMessages.AI_FINOPS.TEAM_MEMBER_NOT_FOUND);
        await this.memberRepository.remove(member);
        await this.audit.log({
            tenantId,
            userId: actorUserId,
            action: 'team.member_removed',
            entityType: 'ai_finops_team',
            entityId: teamId,
            metadata: { memberUserId },
        });
        return this.findOrFail(tenantId, teamId);
    }
}
